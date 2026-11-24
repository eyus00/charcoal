import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';
import { isPrivateAddress, jellyProxyService, proxyRequest } from './proxy.js';
import { BenchedError, lookupTitle, platformProviders } from './shared.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import { describeRuntime, diagnose, Engine, fetchTransport, HealthStore, summarize, type BrowserWorkerHealth, type BrowserWorkerLike, type CanaryTitles, type HealthRecord } from '@charcoal/provider-sdk';
import { Catalog } from './platform/catalog.js';
import { Overlay } from './platform/overlay.js';
import { legacyModule, platformId } from './platform/legacy.js';
import { registerApi } from './platform/api.js';
import { signRelayUrl } from './platform/relay.js';
import { registerRelay } from './platform/relay-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A single slow provider used to hold the whole response hostage (40s+).
// Every provider call is now capped; a provider that misses the deadline is
// reported in `diagnostics` like any other failure.
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 15000);

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${PROVIDER_TIMEOUT_MS}ms`)),
            PROVIDER_TIMEOUT_MS
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Railway injects RAILWAY_PUBLIC_DOMAIN; without a public URL every proxied
// stream link would point at http://localhost and fail in the browser.
const PUBLIC_URL =
    process.env.PUBLIC_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);

// Same public key the Charcoal frontend ships with; override with TMDB_API_KEY.
const TMDB_API_KEY = process.env.TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d';

// Opt-in: drop HLS sources whose video segments the host refuses (e.g. Cloudflare
// "you have been blocked" pages served to datacenter IPs). Checked from THIS
// server, so leave it off if playback goes through a separate proxy (Worker).
const VALIDATE_SEGMENTS = process.env.VALIDATE_SEGMENTS === 'true';

type ProxyTarget = { url: string; headers?: Record<string, string> };

function decodeTarget(proxyUrl: string): ProxyTarget | null {
    try {
        const data = new URL(proxyUrl).searchParams.get('data');
        return data ? (JSON.parse(data) as ProxyTarget) : null;
    } catch {
        return null;
    }
}

async function fetchText(t: ProxyTarget, url: string): Promise<string | null> {
    const res = await fetch(url, { headers: t.headers ?? {}, signal: AbortSignal.timeout(6000) });
    return res.ok ? res.text() : null;
}

const firstUri = (playlist: string, base: string) => {
    const line = playlist.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    return line ? new URL(line, base).toString() : null;
};

/** 'blocked' only when the host clearly refuses; network hiccups count as 'ok'. */
async function segmentStatus(t: ProxyTarget): Promise<'ok' | 'blocked'> {
    try {
        let url = t.url;
        let text = await fetchText(t, url);
        if (text === null) return 'blocked';
        if (text.includes('#EXT-X-STREAM-INF')) {
            const variant = firstUri(text, url);
            if (!variant) return 'ok';
            url = variant;
            text = await fetchText(t, url);
            if (text === null) return 'blocked';
        }
        const seg = firstUri(text, url);
        if (!seg) return 'ok';
        const res = await fetch(seg, { headers: { ...(t.headers ?? {}), Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(6000) });
        const type = res.headers.get('content-type') ?? '';
        res.body?.cancel().catch(() => {});
        return res.status === 401 || res.status === 403 || type.includes('text/html') ? 'blocked' : 'ok';
    } catch {
        return 'ok';
    }
}

type SourceResult = Awaited<ReturnType<OMSSServerProvider['getMovieSources']>>;
type OMSSServerProvider = ReturnType<ReturnType<OMSSServer['getRegistry']>['getProviders']>[number];

async function dropBlocked(result: SourceResult, label: string): Promise<SourceResult> {
    const byHost = new Map<string, Promise<'ok' | 'blocked'>>();
    const keep = await Promise.all(
        result.sources.map(async (src) => {
            if (src.type !== 'hls') return true;
            const t = decodeTarget(src.url);
            if (!t) return true;
            const host = new URL(t.url).hostname;
            if (!byHost.has(host)) byHost.set(host, segmentStatus(t)); // one check per host
            return (await byHost.get(host)) === 'ok';
        })
    );
    const sources = result.sources.filter((_, i) => keep[i]);
    if (sources.length < result.sources.length) {
        console.warn(`[Jelly] ${label}: dropped ${result.sources.length - sources.length} source(s) whose host blocks this server`);
    }
    return { ...result, sources };
}

/** Where the platform keeps its small state files (health snapshot, control-plane overrides). Unset = memory only. */
const DATA_DIR = process.env.DATA_DIR || undefined;

/** Settings for providers that need them, from this server's own environment (never from a client). */
const SERVER_SETTINGS: Record<string, unknown> | undefined = process.env.FEBBOX_TOKEN?.trim()
    ? { febboxToken: process.env.FEBBOX_TOKEN.trim().replace(/^ui=/, ''), febboxMaxHeight: Number(process.env.FEBBOX_MAX_HEIGHT) || undefined }
    : undefined;

/** Known titles the monitor checks providers with. */
const CANARIES: CanaryTitles = {
    movie: [{ kind: 'movie', ids: { tmdb: '27205', imdb: 'tt1375666' }, title: 'Inception', year: 2010, runtime: 148 }],
    tv: [{ kind: 'tv', ids: { tmdb: '1396', imdb: 'tt0903747' }, title: 'Breaking Bad', year: 2008, season: 2, episode: 3 }]
};

const dnsCache = new Map<string, { ok: boolean; until: number }>();
/** False when a host name resolves to a private or internal address (a provider must never reach one). */
async function resolvesPublic(hostname: string): Promise<boolean> {
    if (process.env.PROXY_ALLOW_PRIVATE === 'true') return true;
    const hit = dnsCache.get(hostname);
    if (hit && hit.until > Date.now()) return hit.ok;
    let ok = true;
    try {
        const addrs = await dnsLookup(hostname, { all: true });
        ok = addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
    } catch {
        // Not resolving isn't a policy matter; the request itself will report the DNS failure.
        ok = true;
    }
    dnsCache.set(hostname, { ok, until: Date.now() + 60_000 });
    if (dnsCache.size > 5000) dnsCache.clear();
    return ok;
}

async function main() {
    if (!process.env.TMDB_API_KEY) console.warn('[Jelly] TMDB_API_KEY not set, using the default public key');
    if (!PUBLIC_URL) console.warn('[Jelly] PUBLIC_URL not set; stream URLs will point at localhost');

    const server = new OMSSServer({
        name: 'Jelly',
        version: '2.0.0',

        // Network
        host: process.env.HOST ?? '0.0.0.0',
        port: Number(process.env.PORT ?? 8080),
        publicUrl: PUBLIC_URL,

        // Cache (memory by default, Redis if CACHE_TYPE=redis)
        cache: {
            type: (process.env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
            ttl: {
                // Stream links carry tokens that expire (VixSrc's within minutes); a long cache
                // handed out dead links on replays.
                sources: 3 * 60,
                subtitles: 60 * 60 * 24
            },
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD
            }
        },

        // TMDB
        tmdb: {
            apiKey: TMDB_API_KEY,
            cacheTTL: 24 * 60 * 60
        },

        // Third-party proxy removal + which upstream URLs must be streamed
        // (not buffered in memory). Without streamPatterns, video from hosts
        // whose URLs have no file extension (pixeldrain, workers.dev, ...) was
        // fully downloaded into memory and failed on the 30s timeout.
        proxyConfig: {
            knownThirdPartyProxies,
            streamPatterns
        },

        cors: {
            origin: process.env.CORS_ORIGIN ?? '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'ETag', 'X-Upstream-Status'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        }
    });

    // ---------- the provider platform ----------

    // Health: per provider and runtime, kept across restarts when DATA_DIR is set.
    const health = new HealthStore({
        failuresToOpen: Number(process.env.HEALTH_FAILS_TO_BENCH ?? 3),
        baseCooldownMs: Number(process.env.HEALTH_COOLDOWN_MS ?? 5 * 60_000)
    });
    const healthFile = DATA_DIR ? path.join(DATA_DIR, 'health.json') : undefined;
    if (healthFile && existsSync(healthFile)) {
        try {
            health.load(JSON.parse(readFileSync(healthFile, 'utf8')) as HealthRecord[]);
        } catch (e) {
            console.warn(`[Jelly] couldn't read ${healthFile}: ${(e as Error).message}`);
        }
    }
    const overlay = new Overlay(DATA_DIR ? path.join(DATA_DIR, 'overlay.json') : undefined);

    // Legacy server-only classes: discovered by the framework as before, and also given to the
    // platform (with their ORIGINAL methods, before the /v1 wrapper below replaces them).
    const registry = server.getRegistry();
    await registry.discoverProviders(path.join(__dirname, './providers/'));
    const legacy = registry.getProviders().filter((p) => p.enabled);
    const legacyModules = legacy.map((p) => legacyModule(p, { getMovieSources: p.getMovieSources.bind(p), getTVSources: p.getTVSources.bind(p) }));

    const catalog = await Catalog.create({
        legacy: legacyModules,
        overlay,
        health,
        fallback: process.env.STREAMVIVA !== 'false',
        publicUrl: PUBLIC_URL,
        mirrors: (process.env.REGISTRY_MIRRORS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        signingKey: process.env.REGISTRY_PRIVATE_KEY ? { keyId: process.env.REGISTRY_KEY_ID ?? 'default', privateKey: process.env.REGISTRY_PRIVATE_KEY } : undefined
    });
    const problems = catalog.problems();
    if (problems.length) console.warn(`[Jelly] the provider registry has problems:\n  ${problems.join('\n  ')}`);

    // A server on a home connection says so (EGRESS=user): providers that only work from a
    // viewer's own network are then worth running here too.
    // A browser worker for providers that need page JavaScript, only where the operator asked for
    // one: BROWSER_WORKER=local launches Chromium in this container, BROWSER_WS_ENDPOINT uses a
    // browser running in its own. Without either, the runtime simply has no `js-render` feature.
    let browser: (BrowserWorkerLike & { close(): Promise<void>; probe(): Promise<{ ok: boolean; ms: number; detail?: string }> }) | undefined;
    if (process.env.BROWSER_WORKER === 'local' || process.env.BROWSER_WS_ENDPOINT) {
        try {
            const { createBrowserWorker, fileSessionStore } = await import('@charcoal/browser-runtime');
            browser = createBrowserWorker({
                connect: process.env.BROWSER_WS_ENDPOINT ? { wsEndpoint: process.env.BROWSER_WS_ENDPOINT, protocol: process.env.BROWSER_WS_PROTOCOL === 'cdp' ? 'cdp' : 'playwright' } : undefined,
                executablePath: process.env.BROWSER_EXECUTABLE || undefined,
                maxSessions: Number(process.env.BROWSER_MAX_SESSIONS ?? 2),
                sessions: DATA_DIR ? fileSessionStore(path.join(DATA_DIR, 'browser-sessions')) : undefined,
                resolveCheck: resolvesPublic
            });
            const probe = await browser.probe();
            if (!probe.ok) {
                console.warn(`[Jelly] the browser worker did not start (${probe.detail}); providers that need a browser will be skipped`);
                await browser.close();
                browser = undefined;
            }
        } catch (e) {
            console.warn(`[Jelly] no browser worker: ${(e as Error).message}`);
            browser = undefined;
        }
    }
    const base = describeRuntime('server', { egress: process.env.EGRESS === 'user' ? 'user' : 'datacenter', label: process.env.EGRESS === 'user' ? 'your own server' : 'Charcoal’s server' });
    const runtime = browser ? { ...base, features: [...base.features, 'js-render' as const] } : base;
    const engine = new Engine({
        providers: () => catalog.providers(),
        runtime,
        transport: fetchTransport,
        health,
        // Per-device settings exist on a server only when its owner put them in its environment.
        settings: SERVER_SETTINGS,
        resolveCheck: resolvesPublic,
        browser,
        strictNetwork: process.env.STRICT_PROVIDER_NETWORK === 'true',
        providerTimeoutMs: PROVIDER_TIMEOUT_MS,
        log: process.env.PLATFORM_LOG === 'true' ? (e) => console.log(JSON.stringify({ at: new Date(e.at).toISOString(), event: e.event, provider: e.provider, ...e.data })) : undefined
    });

    // Platform providers on /v1 too (older clients): everything that isn't a legacy class.
    const legacyIds = new Set(legacyModules.map((m) => m.manifest.id));
    const platformIds = catalog.providers().map((p) => p.module.manifest.id).filter((id) => !legacyIds.has(id));
    for (const p of platformProviders(platformIds, (id) => catalog.find(id), engine)) registry.register(p);

    for (const provider of registry.getProviders()) {
        const getMovie = provider.getMovieSources.bind(provider);
        const getTV = provider.getTVSources.bind(provider);
        const isLegacy = legacy.includes(provider);
        const id = platformId(provider.id);
        const sign = (r: SourceResult): SourceResult => ({ ...r, sources: r.sources.map((s) => ({ ...s, url: signRelayUrl(s.url) })), subtitles: r.subtitles.map((s) => ({ ...s, url: signRelayUrl(s.url) })) });
        const check = async (r: SourceResult) => sign(VALIDATE_SEGMENTS ? await dropBlocked(r, provider.name) : r);
        // Legacy classes get their timeout and health bookkeeping here; platform providers already
        // had both inside the engine.
        const run = async (call: () => Promise<SourceResult>) => {
            if (!isLegacy) return check(await call());
            const gate = health.allow(id, 'server');
            if (!gate.allowed) throw new BenchedError(`${provider.name} is resting for ${Math.ceil((gate.retryInMs ?? 0) / 1000)}s after repeated failures`);
            const started = Date.now();
            try {
                const r = await check(await withTimeout(call(), provider.name));
                health.record(id, 'server', { kind: r.sources.length ? 'ok' : 'empty' }, Date.now() - started);
                return r;
            } catch (e) {
                health.record(id, 'server', { kind: 'failure', diagnosis: diagnose(/timed out/.test((e as Error)?.message ?? '') ? Object.assign(new Error((e as Error).message), { name: 'TimeoutError' }) : e) }, Date.now() - started);
                throw e;
            }
        };
        provider.getMovieSources = (media) => run(() => getMovie(media));
        provider.getTVSources = (media) => run(() => getTV(media));
    }

    // Our own stream proxy replaces the framework's (see proxy.ts); the relay's signature check
    // and the /v2/relay route are in platform/relay-routes.ts.
    (server as unknown as { proxyController: { proxyService: unknown } }).proxyController.proxyService = jellyProxyService;
    const app = server.getInstance();
    registerRelay(app, { proxy: proxyRequest });

    // The old health table, in its old shape, from the new store (the website's settings page reads it).
    app.get('/v1/providers/health', async () => ({
        generatedAt: new Date().toISOString(),
        providers: summarize(health)
            .filter((h) => h.runtime === 'server')
            .map((h) => ({
                id: h.provider,
                name: catalog.find(h.provider)?.module.manifest.name ?? h.provider,
                status: h.status === 'benched' ? 'benched' : h.status === 'degraded' || h.status === 'needs-update' ? 'failing' : h.ok ? 'ok' : 'unknown',
                success: h.ok,
                empty: h.empty,
                failure: h.failed,
                failuresInARow: 0,
                benchedForSeconds: h.benchedForSeconds,
                averageMs: h.averageMs,
                lastError: h.lastFailure?.message,
                lastOutcomeAt: h.lastFailureAt ?? h.lastSuccessAt
            }))
    }));

    const platform = registerApi({
        app,
        engine,
        catalog,
        overlay,
        health,
        transport: fetchTransport,
        lookup: lookupTitle,
        publicUrl: PUBLIC_URL ?? `http://localhost:${Number(process.env.PORT ?? 8080)}`,
        canaries: CANARIES,
        adminToken: process.env.ADMIN_TOKEN || undefined,
        browserHealth: browser ? (): BrowserWorkerHealth => browser!.health() : undefined,
        autoFailoverTtlMs: Number(process.env.AUTO_DOMAIN_FAILOVER_MINUTES ?? 0) * 60_000,
        limits: { sourcesPerMinute: Number(process.env.RATE_LIMIT_SOURCES_PER_MINUTE ?? 60), sourcesBurst: Number(process.env.RATE_LIMIT_SOURCES_BURST ?? 20) }
    });

    // Chrome asks before an https site may reach a server on the viewer's own computer or network
    // (Private Network Access); answering yes lets a locally run server be used from Charcoal.
    app.addHook('onSend', async (request, reply, payload) => {
        if (request.headers['access-control-request-private-network'] === 'true') reply.header('Access-Control-Allow-Private-Network', 'true');
        return payload;
    });

    await server.start();

    // ---------- monitoring ----------

    if (healthFile) {
        const save = () => {
            try {
                mkdirSync(path.dirname(healthFile), { recursive: true });
                writeFileSync(`${healthFile}.tmp`, JSON.stringify(health.snapshot()));
                renameSync(`${healthFile}.tmp`, healthFile);
            } catch (e) {
                console.warn(`[Jelly] couldn't save health: ${(e as Error).message}`);
            }
        };
        setInterval(save, 60_000).unref();
        process.once('SIGTERM', () => (save(), void browser?.close().finally(() => process.exit(0))));
    } else if (browser) process.once('SIGTERM', () => void browser!.close().finally(() => process.exit(0)));
    // Scheduled canary + recovery: checks every provider with known titles, classifies what is
    // wrong, and restores what works again. 0 turns it off.
    const monitorMinutes = Number(process.env.MONITOR_INTERVAL_MINUTES ?? 30);
    if (monitorMinutes > 0) {
        const tick = () =>
            platform
                .recover('monitor')
                .then((actions) => {
                    const notable = actions.filter((a) => a.action !== 'healthy');
                    if (notable.length) console.log(`[Jelly] monitor: ${notable.map((a) => `${a.provider}=${a.action}`).join(', ')}`);
                })
                .catch((e) => console.warn(`[Jelly] monitor failed: ${(e as Error).message}`));
        setTimeout(tick, 60_000).unref();
        setInterval(tick, monitorMinutes * 60_000).unref();
    }
}

main().catch((error) => {
    console.error('[Fatal] Server failed to start:');
    console.error(error);
    process.exit(1);
});
