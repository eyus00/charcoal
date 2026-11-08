import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';
import { jellyProxyService } from './proxy.js';
import { BenchedError, checkBench, record, report } from './health.js';
import { sharedProviders } from './shared.js';

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

async function main() {
    if (!process.env.TMDB_API_KEY) console.warn('[Jelly] TMDB_API_KEY not set, using the default public key');
    if (!PUBLIC_URL) console.warn('[Jelly] PUBLIC_URL not set; stream URLs will point at localhost');

    const server = new OMSSServer({
        name: 'Jelly',
        version: '1.1.0',

        // Network
        host: process.env.HOST ?? '0.0.0.0',
        port: Number(process.env.PORT ?? 8080),
        publicUrl: PUBLIC_URL,

        // Cache (memory by default, Redis if CACHE_TYPE=redis)
        cache: {
            type: (process.env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
            ttl: {
                sources: 60 * 60,
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
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'ETag', 'X-Upstream-Status'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        }
    });

    const registry = server.getRegistry();
    await registry.discoverProviders(path.join(__dirname, './providers/'));
    // Providers shared with the website (packages/providers).
    for (const p of sharedProviders()) registry.register(p);

    for (const provider of registry.getProviders()) {
        const getMovie = provider.getMovieSources.bind(provider);
        const getTV = provider.getTVSources.bind(provider);
        const check = (r: SourceResult) => (VALIDATE_SEGMENTS ? dropBlocked(r, provider.name) : r);
        // Timeout, then health bookkeeping: a provider that keeps failing sits out for a while.
        const run = async (call: () => Promise<SourceResult>) => {
            checkBench(provider.id, provider.name);
            const started = Date.now();
            try {
                const r = await check(await withTimeout(call(), provider.name));
                record(provider.id, provider.name, r.sources.length ? 'success' : 'empty', Date.now() - started);
                return r;
            } catch (e) {
                if (!(e instanceof BenchedError)) record(provider.id, provider.name, 'failure', Date.now() - started, (e as Error)?.message);
                throw e;
            }
        };
        provider.getMovieSources = (media) => run(() => getMovie(media));
        provider.getTVSources = (media) => run(() => getTV(media));
    }

    // Our own stream proxy replaces the framework's (see proxy.ts). The framework's controller
    // decodes `data` a second time after Fastify already did, which breaks URLs containing "%";
    // encoding it once more first makes that second decode harmless.
    (server as unknown as { proxyController: { proxyService: unknown } }).proxyController.proxyService = jellyProxyService;
    const app = server.getInstance();
    app.addHook('onRequest', async (request) => {
        const q = request.query as Record<string, string> | undefined;
        if (request.url.startsWith('/v1/proxy') && typeof q?.data === 'string') q.data = encodeURIComponent(q.data);
    });
    app.get('/v1/providers/health', async () => report());

    await server.start();
}

main().catch((error) => {
    console.error('[Fatal] Server failed to start:');
    console.error(error);
    process.exit(1);
});
