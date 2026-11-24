/**
 * The /v2 API: one stable surface for clients, whatever provider or runtime answers.
 *
 *   GET  /v2/registry          the provider registry (signed when a key is configured)
 *   GET  /v2/sources           progressive results for one title, as newline-delimited JSON
 *   GET  /v2/health            health per provider and runtime, domain proposals, what clients report
 *   POST /v2/report            outcome beacons from clients (no titles, no identities)
 *   GET  /v2/relay             the stream relay (signed URLs only)
 *   …    /v2/admin/*           the control plane (bearer token; absent unless ADMIN_TOKEN is set)
 *
 * /v1 (the OMSS endpoints) is untouched and keeps working for older clients.
 */
import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import type { OMSSServer } from '@omss/framework';
import {
  FAILURES,
  HealthStore,
  diagnoseDomains,
  promoteDomain,
  recordDomainOutcome,
  runCanary,
  stageDomain,
  runRecovery,
  summarize,
  type CanaryTitles,
  type Engine,
  type EngineEvent,
  type BrowserWorkerHealth,
  type FailureCode,
  type Fetcher,
  type LoadedProvider,
  type Media,
  type ProviderOutcome,
  type RecoveryAction,
  type RuntimeKind,
  type Stage,
  type Stream,
  type StreamType,
} from '@charcoal/provider-sdk';
import type { Catalog } from './catalog.js';
import type { Overlay } from './overlay.js';
import { relayQuery } from './relay.js';

type App = ReturnType<OMSSServer['getInstance']>;

// ---------- rate limiting ----------

/** A token bucket per client address and route group. In memory: one instance, no shared store needed. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly perMinute: number,
    private readonly burst = perMinute,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the request may proceed. */
  take(key: string): boolean {
    const now = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size > 20_000) this.buckets.clear();
      b = { tokens: this.burst, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 60_000) * this.perMinute);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

// ---------- request parsing ----------

const TYPES: StreamType[] = ['hls', 'dash', 'mp4', 'mkv', 'webm', 'frame'];
const list = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 80) : undefined);
const int = (v: unknown) => (typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : undefined);
const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

export class BadRequest extends Error {}

export interface TitleLookup {
  (kind: 'movie' | 'tv', tmdbId: string): Promise<{ title: string; year?: number; imdb?: string } | null>;
}

/** Builds the Media a request asks about. The client may send the title; otherwise it is looked up. */
export async function mediaFromQuery(q: Record<string, unknown>, lookup: TitleLookup): Promise<Media> {
  const kind = text(q.kind) ?? 'movie';
  const tmdb = text(q.tmdb, 12);
  const ids = { tmdb, imdb: text(q.imdb, 12), anilist: text(q.anilist, 12), mal: text(q.mal, 12), event: text(q.event, 80), channel: text(q.channel, 80) };
  for (const k of Object.keys(ids) as (keyof typeof ids)[]) if (ids[k] === undefined) delete ids[k];
  if (ids.tmdb && !/^\d+$/.test(ids.tmdb)) throw new BadRequest('tmdb must be a number');
  let title = text(q.title);
  let year = int(q.year);
  if (kind === 'movie' || kind === 'tv') {
    if (!ids.tmdb) throw new BadRequest('tmdb is required for movies and shows');
    if (!title) {
      const found = await lookup(kind, ids.tmdb);
      if (!found) throw new BadRequest('Unknown title');
      title = found.title;
      year ??= found.year;
      if (found.imdb && !ids.imdb) ids.imdb = found.imdb;
    }
  }
  if (!title) throw new BadRequest('title is required');
  const common = { ids, title, year, altTitles: list(q.alt), originalLanguage: text(q.olang, 5), runtime: int(q.runtime) };
  switch (kind) {
    case 'movie':
      return { kind, ...common };
    case 'tv': {
      const season = int(q.s);
      const episode = int(q.e);
      if (season === undefined || episode === undefined) throw new BadRequest('s and e are required for an episode');
      return { kind, ...common, season, episode };
    }
    case 'anime': {
      const episode = int(q.e);
      if (episode === undefined || (!ids.anilist && !ids.mal)) throw new BadRequest('anime needs anilist or mal, and e');
      const audio = q.audio === 'dub' ? 'dub' : q.audio === 'sub' ? 'sub' : undefined;
      return { kind, ...common, episode, season: int(q.s), seasonEpisode: int(q.se), audio };
    }
    case 'live':
      if (!ids.event && !ids.channel) throw new BadRequest('live needs event or channel');
      return { kind, ...common, startsAt: int(q.at), channel: ids.channel };
    default:
      throw new BadRequest(`Unknown kind "${kind}"`);
  }
}

// ---------- wire format ----------

export type WireStream = Stream & {
  /** A signed URL on this server's relay, for clients that can't play the stream any other way. */
  relay?: string;
};

/** A playlist built in memory (a data: URL): its entries are pointed at the relay so a browser can load them. */
function relayDataPlaylist(dataUrl: string, headers: Record<string, string>, base: string): string {
  const body = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString('utf8');
  const wrap = (u: string) => `${base}/v2/relay?${relayQuery(u, headers)}`;
  const out = body
    .split('\n')
    .map((l) => (l.startsWith('#EXT-X-MEDIA:') ? l.replace(/URI="([^"]+)"/, (_m, u: string) => `URI="${wrap(u)}"`) : l.trim() && !l.startsWith('#') ? wrap(l.trim()) : l))
    .join('\n');
  return `data:application/vnd.apple.mpegurl;base64,${Buffer.from(out).toString('base64')}`;
}

export function toWire(stream: Stream, publicBase: string): WireStream {
  if (stream.type === 'frame') return stream;
  if (stream.url.startsWith('data:')) return { ...stream, relay: relayDataPlaylist(stream.url, stream.headers, publicBase) };
  return { ...stream, relay: `${publicBase}/v2/relay?${relayQuery(stream.url, stream.headers)}` };
}

// ---------- routes ----------

export interface ApiOptions {
  app: App;
  engine: Engine;
  catalog: Catalog;
  overlay: Overlay;
  health: HealthStore;
  transport: Fetcher;
  lookup: TitleLookup;
  /** This server's public base URL (for relay links). */
  publicUrl: string;
  /** Known titles for canaries and recovery. */
  canaries: CanaryTitles;
  adminToken?: string;
  /** State of the browser worker, when this server has one. */
  browserHealth?: () => BrowserWorkerHealth;
  /** Lets automatic recovery put a validated alternate domain in force for this long (0 = propose only). */
  autoFailoverTtlMs?: number;
  /** Per client address. `sourcesBurst` is how many may arrive at once before the per-minute rate applies. */
  limits?: { sourcesPerMinute?: number; sourcesBurst?: number; reportsPerMinute?: number };
}

const RUNTIME_KINDS = new Set<RuntimeKind>(['server', 'edge', 'extension', 'app', 'browser', 'frame', 'remote']);
const STAGES = new Set<Stage>(['stable', 'canary', 'disabled']);

/** Failures that say nothing about an address: the title is missing, the run was stopped, the viewer must act. */
const NOT_THE_ADDRESS = new Set(['NOT_FOUND', 'CANCELLED', 'AUTH_REQUIRED', 'UNSUPPORTED_RUNTIME', 'RATE_LIMITED']);

/**
 * Settles domain trials and watches from a run's outcome: a candidate address is promoted after
 * clean runs or dropped after failures, and a recently changed address is rolled back when runs
 * keep failing. Give it to the engine as `onOutcome`.
 */
export function domainFeedback(catalog: Catalog, overlay: Overlay, log: (line: string) => void = () => undefined) {
  return (p: LoadedProvider, outcome: ProviderOutcome) => {
    const id = p.module.manifest.id;
    if (outcome.outcome === 'error' && NOT_THE_ADDRESS.has(outcome.code ?? '')) return;
    for (const use of outcome.origins ?? []) {
      const current = catalog.domains(id);
      const role = current?.roles[use.role];
      if (!current || !role || (!role.candidate && !role.watch)) continue;
      const r = recordDomainOutcome(current, use, outcome.outcome === 'error' ? 'failed' : 'ok');
      if (r.audit) {
        overlay.setDomains(id, r.config, current, r.audit);
        log(`${id}: ${r.audit.action} ${r.audit.from} → ${r.audit.to} (${r.audit.reason})`);
      } else if (r.config !== current) overlay.touchDomains(id, r.config);
    }
  };
}

export interface Platform {
  /** Runs canaries then recovery once; applies or records proposals. Used by the monitor and the admin endpoint. */
  recover(by: string): Promise<RecoveryAction[]>;
  /** What clients have reported about their own runtimes. */
  fleet: HealthStore;
}

export function registerApi(o: ApiOptions): Platform {
  const { app, engine, catalog, overlay, health } = o;
  const sourcesLimit = new RateLimiter(o.limits?.sourcesPerMinute ?? 60, o.limits?.sourcesBurst ?? 20);
  const reportLimit = new RateLimiter(o.limits?.reportsPerMinute ?? 120, 60);
  // Reports from clients are kept apart: they inform, they never bench anything on the server.
  const fleet = new HealthStore({ failuresToOpen: Number.MAX_SAFE_INTEGER });

  const limited = (reply: { code(n: number): { send(body: unknown): unknown }; header(k: string, v: string): unknown }) => {
    reply.header('Retry-After', '20');
    return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests; slow down' } });
  };

  app.get('/v2/registry', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return catalog.published();
  });

  app.get('/v2/sources', async (request, reply) => {
    if (!sourcesLimit.take(request.ip)) return limited(reply);
    const q = request.query as Record<string, unknown>;
    let media: Media;
    try {
      media = await mediaFromQuery(q, o.lookup);
    } catch (e) {
      if (e instanceof BadRequest) return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: e.message } });
      throw e;
    }
    const accept = list(q.accept)?.filter((t): t is StreamType => TYPES.includes(t as StreamType));
    const abort = new AbortController();
    request.raw.on('close', () => abort.abort());
    const events = engine.resolve({ media, only: list(q.only), skip: list(q.skip), accept: accept?.length ? accept : undefined, signal: abort.signal });

    async function* lines() {
      for await (const e of events) {
        // Streams get a relay link; so do captions that need headers (a browser can't send those).
        const wire =
          e.t === 'result'
            ? { ...e, streams: e.streams.map((s) => toWire(s, o.publicUrl)), captions: e.captions.map((c) => (c.headers && Object.keys(c.headers).length ? { ...c, relay: `${o.publicUrl}/v2/relay?${relayQuery(c.url, c.headers)}` } : c)) }
            : e;
        yield `${JSON.stringify(wire)}\n`;
      }
    }
    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Accel-Buffering', 'no'); // let proxies pass each line on as it is written
    return reply.send(Readable.from(lines()));
  });

  app.get('/v2/health', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=15');
    return {
      generatedAt: new Date().toISOString(),
      runtime: engine.runtime.kind,
      egress: engine.runtime.egress,
      features: engine.runtime.features,
      browser: o.browserHealth?.(),
      providers: summarize(health),
      fleet: summarize(fleet),
      proposals: Object.entries(overlay.proposals()).map(([provider, p]) => ({ provider, role: p.role, from: p.from, to: p.to })),
    };
  });

  app.post('/v2/report', async (request, reply) => {
    if (!reportLimit.take(request.ip)) return limited(reply);
    const body = request.body as { reports?: unknown } | undefined;
    const reports = Array.isArray(body?.reports) ? body.reports.slice(0, 50) : [];
    let accepted = 0;
    for (const r of reports as Record<string, unknown>[]) {
      const provider = text(r?.provider, 48);
      const runtime = text(r?.runtime, 12) as RuntimeKind | undefined;
      const outcome = text(r?.outcome, 24);
      const ms = typeof r?.ms === 'number' && r.ms >= 0 && r.ms < 120_000 ? r.ms : 0;
      // Only for providers we know, and only about a client's own runtimes.
      if (!provider || !catalog.has(provider) || !runtime || !RUNTIME_KINDS.has(runtime) || runtime === 'server' || !outcome) continue;
      if (outcome === 'ok' || outcome === 'empty') fleet.record(provider, runtime, { kind: outcome }, ms, text(r.version, 16));
      else if (outcome in FAILURES) fleet.record(provider, runtime, { kind: 'failure', diagnosis: { code: outcome as FailureCode, ...FAILURES[outcome as FailureCode], message: FAILURES[outcome as FailureCode].label } }, ms, text(r.version, 16));
      else continue;
      accepted++;
    }
    return reply.code(202).send({ accepted });
  });

  // ---------- recovery ----------

  let recovering: Promise<RecoveryAction[]> | null = null;
  const recover = (by: string) => {
    recovering ??= (async () => {
      try {
        const observed = await runCanary(engine, o.canaries);
        const actions = await runRecovery({ engine, health, transport: o.transport, canaries: o.canaries, actor: by, observed });
        for (const a of actions) {
          if (a.action === 'switch-domain' && a.proposal) {
            // An automatic change is only ever a temporary, reversible override of an address that
            // was already configured as an alternate and has just passed a real extraction.
            if (o.autoFailoverTtlMs) overlay.setDomains(a.provider, a.proposal.config, catalog.domains(a.provider), a.proposal.audit, o.autoFailoverTtlMs);
            else overlay.propose(a.provider, a.proposal);
          } else if (a.action === 'restored') overlay.note({ by, provider: a.provider, action: 'restore', detail: { detail: a.detail } });
        }
        return actions;
      } finally {
        recovering = null;
      }
    })();
    return recovering;
  };

  // ---------- control plane ----------

  if (o.adminToken) {
    const expected = Buffer.from(o.adminToken);
    const authorised = (header: unknown) => {
      const given = Buffer.from(typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : '');
      return given.length === expected.length && timingSafeEqual(given, expected);
    };
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/v2/admin') && !authorised(request.headers.authorization)) {
        return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: { code: 'UNAUTHORIZED', message: 'Admin token required' } });
      }
    });
    const known = (id: string, reply: { code(n: number): { send(b: unknown): unknown } }) => (catalog.has(id) ? true : (reply.code(404).send({ error: { code: 'UNKNOWN_PROVIDER', message: `No provider "${id}"` } }), false));

    app.get('/v2/admin/providers', async () => ({
      registryVersion: catalog.registry().version,
      problems: catalog.problems(),
      providers: catalog.providers().map((p) => ({ id: p.module.manifest.id, name: p.module.manifest.name, version: p.module.manifest.version, stage: p.stage, rank: p.rank ?? p.module.manifest.rank, network: p.module.manifest.network ?? 'declared', runtimes: p.module.manifest.runtimes, domains: p.domains, override: overlay.get(p.module.manifest.id) })),
    }));

    app.get('/v2/admin/audit', async (request) => ({ audit: overlay.audit(int((request.query as Record<string, unknown>).limit) ?? 100) }));

    // Enable / disable / stage / rank.
    app.post('/v2/admin/providers/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!known(id, reply)) return;
      const b = (request.body ?? {}) as { stage?: unknown; rank?: unknown; reason?: unknown; by?: unknown };
      const by = text(b.by, 40) ?? 'admin';
      if (b.stage !== undefined) {
        if (b.stage !== null && !STAGES.has(b.stage as Stage)) return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: 'stage must be stable, canary, disabled or null' } });
        overlay.setStage(id, (b.stage as Stage | null) ?? undefined, by, text(b.reason));
      }
      if (b.rank !== undefined) {
        if (b.rank !== null && (typeof b.rank !== 'number' || b.rank < 0 || b.rank > 1000)) return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: 'rank must be 0..1000 or null' } });
        overlay.setRank(id, (b.rank as number | null) ?? undefined, by);
      }
      return { provider: id, override: overlay.get(id), registryVersion: catalog.registry().version };
    });

    // Promote a new address for a domain role: validated (endpoint + a real extraction) before it takes effect.
    app.post('/v2/admin/providers/:id/domains', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!known(id, reply)) return;
      const b = (request.body ?? {}) as { role?: unknown; origin?: unknown; reason?: unknown; by?: unknown };
      const current = catalog.domains(id);
      const role = text(b.role, 40);
      const origin = text(b.origin, 200);
      if (!current || !role || !origin) return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: 'role and origin are required, and the provider must use domain roles' } });
      const loaded = catalog.find(id)!;
      try {
        const result = await promoteDomain(current, { role, origin, by: text(b.by, 40) ?? 'admin', reason: text(b.reason) }, o.transport, async (candidate) => {
          const canary = await runCanary(engine, o.canaries, { only: [id], record: false, domains: () => candidate });
          // No known title for this provider's kinds: the endpoint check alone has to do.
          return { ok: canary.length === 0 || canary[0].passed };
        });
        void loaded;
        if (!result.accepted) return reply.code(422).send({ accepted: false, audit: result.audit });
        overlay.setDomains(id, result.config, current, result.audit);
        return { accepted: true, domains: result.config, audit: result.audit };
      } catch (e) {
        return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: (e as Error).message } });
      }
    });

    // Put a new address on trial: validated like a promotion, then given a share of real runs.
    // Clean runs promote it by themselves; failures drop it. The address in use does not change meanwhile.
    app.post('/v2/admin/providers/:id/domains/stage', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!known(id, reply)) return;
      const b = (request.body ?? {}) as { role?: unknown; origin?: unknown; reason?: unknown; by?: unknown; share?: unknown };
      const current = catalog.domains(id);
      const role = text(b.role, 40);
      const origin = text(b.origin, 200);
      if (!current || !role || !origin) return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: 'role and origin are required, and the provider must use domain roles' } });
      const share = typeof b.share === 'number' && b.share > 0 && b.share <= 1 ? b.share : undefined;
      try {
        const result = await stageDomain(current, { role, origin, by: text(b.by, 40) ?? 'admin', reason: text(b.reason), share }, o.transport, async (candidate) => {
          const canary = await runCanary(engine, o.canaries, { only: [id], record: false, domains: () => candidate });
          return { ok: canary.length === 0 || canary[0].passed };
        });
        if (!result.accepted) return reply.code(422).send({ accepted: false, audit: result.audit });
        overlay.setDomains(id, result.config, current, result.audit);
        return { accepted: true, domains: result.config, audit: result.audit };
      } catch (e) {
        return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: (e as Error).message } });
      }
    });

    // What is wrong with a provider's addresses, seen from this server: DNS (over HTTPS), the
    // answer, redirects, browser checks.
    app.get('/v2/admin/providers/:id/diagnose', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!known(id, reply)) return;
      const current = catalog.domains(id);
      if (!current) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'This provider has no domain config' } });
      return { provider: id, version: current.version, checkedFrom: engine.runtime.egress, addresses: await diagnoseDomains(current, o.transport) };
    });

    app.post('/v2/admin/providers/:id/domains/rollback', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!known(id, reply)) return;
      const current = catalog.domains(id);
      const b = (request.body ?? {}) as { reason?: unknown; by?: unknown };
      const back = current && overlay.rollbackDomains(id, current, text(b.by, 40) ?? 'admin', text(b.reason));
      if (!back) return reply.code(409).send({ error: { code: 'NO_HISTORY', message: 'Nothing to roll back to' } });
      return { domains: back };
    });

    // Apply or dismiss what recovery proposed.
    app.post('/v2/admin/providers/:id/proposal', async (request, reply) => {
      const { id } = request.params as { id: string };
      const proposal = overlay.proposals()[id];
      if (!proposal) return reply.code(404).send({ error: { code: 'NO_PROPOSAL', message: 'No pending proposal' } });
      const b = (request.body ?? {}) as { action?: unknown; by?: unknown };
      const by = text(b.by, 40) ?? 'admin';
      if (b.action === 'dismiss') {
        overlay.dismissProposal(id, by);
        return { dismissed: true };
      }
      overlay.setDomains(id, proposal.config, catalog.domains(id), { ...proposal.audit, by });
      return { applied: true, domains: proposal.config };
    });

    app.post('/v2/admin/providers/:id/restore', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!known(id, reply)) return;
      health.restore(id, engine.runtime.kind);
      overlay.note({ by: text((request.body as { by?: unknown } | undefined)?.by, 40) ?? 'admin', provider: id, action: 'restore', detail: { manual: true } });
      return { provider: id, status: health.status(id, engine.runtime.kind) };
    });

    app.post('/v2/admin/recover', async (request) => ({ actions: await recover(text((request.body as { by?: unknown } | undefined)?.by, 40) ?? 'admin') }));
  }

  return { recover, fleet };
}
