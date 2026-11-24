/**
 * The aggregation engine: runs providers for one title in one runtime and reports each provider's
 * outcome the moment it is known.
 *
 * - Providers run concurrently, in waves, each inside its own budget, network policy and abort
 *   scope. One provider failing, hanging or misbehaving never affects another.
 * - Results are progressive: a consumer can start playback on the first good stream instead of
 *   waiting for the slowest provider.
 * - Identical requests made at the same time share one run; finished runs are reused briefly.
 * - Every outcome is classified and recorded in the health store, which in turn decides who runs.
 *
 * The same engine runs on a server, in an edge function, in a page through a bridge, or in tests.
 */
import { DomainResolver, hostsOf, type DomainConfig } from './domains.js';
import { diagnose, FAILURES, ProviderError, type Diagnosis, type FailureCode, type FailureScope, type RequestTrace } from './errors.js';
import type { HealthStore } from './health.js';
import { instrumentFetch } from './net.js';
import { normalizeResult } from './normalize.js';
import { DEFAULT_LIMITS, PolicyGuard } from './policy.js';
import { canRun } from './runtime.js';
import type { BrowserWorkerLike } from './browser.js';
import type { Caption, Fetcher, KeyValueStore, Media, ProviderModule, RuntimeDescriptor, Stream, StreamType } from './types.js';

export type Stage = 'stable' | 'canary' | 'disabled';

/** A provider as the engine runs it: its code plus everything configured around it. */
export interface LoadedProvider {
  module: ProviderModule;
  domains?: DomainConfig;
  stage: Stage;
  /** Registry override of the manifest's rank. */
  rank?: number;
  /** Values for the manifest's config fields. */
  config?: Record<string, unknown>;
}

export interface ProviderOutcome {
  provider: { id: string; name: string; version: string };
  outcome: 'ok' | 'empty' | 'error';
  ms: number;
  streams: Stream[];
  captions: Caption[];
  /** Present when outcome is 'empty' (NOT_FOUND) or 'error'. */
  code?: FailureCode;
  scope?: FailureScope;
  message?: string;
  host?: string;
  /** Requests made, and domain fail-overs that happened during the run. */
  requests: number;
  failovers?: { role: string; from: string; to: string; reason: FailureCode }[];
  /** Raw streams the normaliser refused, and why. */
  rejected?: string[];
  /** The address each domain role ended the run on, and whether it was one on trial. */
  origins?: { role: string; origin: string; candidate: boolean }[];
}

export type EngineEvent =
  | { t: 'plan'; runtime: string; providers: { id: string; name: string; wave: number }[]; skipped: { id: string; name: string; reason: string }[] }
  | ({ t: 'result' } & ProviderOutcome)
  | { t: 'done'; ms: number; ok: number; empty: number; failed: number };

export interface ResolveRequest {
  media: Media;
  signal?: AbortSignal;
  /** Run only these providers. */
  only?: string[];
  /** Don't run these (a client running them itself). */
  skip?: string[];
  /** Stream types the client can use; others are dropped. */
  accept?: StreamType[];
}

export interface EngineLogEntry {
  at: number;
  event: string;
  provider?: string;
  data?: Record<string, unknown>;
}

export interface EngineOptions {
  /** The providers, or a function returning the current set (so a registry update takes effect at once). */
  providers: LoadedProvider[] | (() => LoadedProvider[]);
  runtime: RuntimeDescriptor;
  transport: Fetcher;
  health: HealthStore;
  /** Per-device settings this runtime holds (never present on a shared server). */
  settings?: Record<string, unknown>;
  store?: (providerId: string) => KeyValueStore;
  /** DNS-level private-address check, where the runtime can do one. */
  resolveCheck?: (hostname: string) => Promise<boolean>;
  /** Origins known to be down right now, per provider and role (from domain health checks). */
  avoidOrigins?: (providerId: string) => Record<string, string[]>;
  /** A browser worker, for providers that need page JavaScript. Used only when the runtime has `js-render`. */
  browser?: BrowserWorkerLike;
  /** Run canary-stage providers too (canary clients and tests). */
  includeCanary?: boolean;
  /** Refuse providers whose network policy isn't 'declared'. */
  strictNetwork?: boolean;
  waveSize?: number;
  /** Start the next wave after this long even if the current one hasn't finished. */
  waveDelayMs?: number;
  providerTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** How long a finished run is reused. */
  cacheTtlMs?: number;
  /** How long a run that found nothing is reused. */
  negativeCacheTtlMs?: number;
  now?: () => number;
  /** 0…1 source for trial shares (injected in tests). */
  random?: () => number;
  /** Called with every recorded outcome (domain trials and watches are settled from it). */
  onOutcome?: (provider: LoadedProvider, outcome: ProviderOutcome) => void;
  log?: (entry: EngineLogEntry) => void;
}

/** One title → one key, for request de-duplication and caching. */
export function mediaKey(m: Media): string {
  const id = m.ids.tmdb ? `tmdb${m.ids.tmdb}` : m.ids.anilist ? `al${m.ids.anilist}` : m.ids.imdb ? `imdb${m.ids.imdb}` : m.ids.event ? `ev${m.ids.event}` : m.ids.channel ? `ch${m.ids.channel}` : `t${m.title.toLowerCase()}`;
  if (m.kind === 'tv') return `tv:${id}:${m.season}:${m.episode}`;
  if (m.kind === 'anime') return `anime:${id}:${m.episode}:${m.audio ?? ''}`;
  return `${m.kind}:${id}`;
}

function memoryStore(now: () => number): (id: string) => KeyValueStore {
  const data = new Map<string, { value: string; until: number }>();
  return (id) => ({
    async get(k) {
      const hit = data.get(`${id}:${k}`);
      if (!hit) return undefined;
      if (hit.until < now()) {
        data.delete(`${id}:${k}`);
        return undefined;
      }
      return hit.value;
    },
    async set(k, value, ttlSeconds) {
      if (data.size > 5000) data.clear();
      data.set(`${id}:${k}`, { value: String(value), until: now() + ttlSeconds * 1000 });
    },
  });
}

/** A run in progress (or just finished) that several callers can follow. */
class SharedRun {
  readonly events: EngineEvent[] = [];
  finished = false;
  finishedAt = 0;
  private waiters: (() => void)[] = [];
  private followers = 0;
  readonly abort = new AbortController();

  push(e: EngineEvent) {
    this.events.push(e);
    if (e.t === 'done') this.finished = true;
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }

  async *follow(signal?: AbortSignal): AsyncGenerator<EngineEvent> {
    this.followers++;
    let i = 0;
    try {
      for (;;) {
        while (i < this.events.length) {
          if (signal?.aborted) return;
          yield this.events[i++];
        }
        if (this.finished || signal?.aborted) return;
        await new Promise<void>((resolve) => {
          this.waiters.push(resolve);
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      }
    } finally {
      // Nobody is listening any more: stop the providers.
      if (--this.followers === 0 && !this.finished) this.abort.abort();
    }
  }
}

export class Engine {
  private readonly runs = new Map<string, SharedRun>();
  private readonly now: () => number;
  private readonly store: (id: string) => KeyValueStore;

  constructor(private readonly opts: EngineOptions) {
    this.now = opts.now ?? Date.now;
    this.store = opts.store ?? memoryStore(this.now);
  }

  get runtime(): RuntimeDescriptor {
    return this.opts.runtime;
  }

  providers(): LoadedProvider[] {
    return typeof this.opts.providers === 'function' ? this.opts.providers() : this.opts.providers;
  }

  private log(event: string, provider?: string, data?: Record<string, unknown>) {
    this.opts.log?.({ at: this.now(), event, provider, data });
  }

  /** Who would run for this request, in order, and who wouldn't and why. */
  plan(req: ResolveRequest): { run: LoadedProvider[]; skipped: { id: string; name: string; reason: string }[] } {
    const { health, runtime } = this.opts;
    const run: LoadedProvider[] = [];
    const skipped: { id: string; name: string; reason: string }[] = [];
    for (const p of this.providers()) {
      const m = p.module.manifest;
      const skip = (reason: string) => skipped.push({ id: m.id, name: m.name, reason });
      if (req.only && !req.only.includes(m.id)) continue;
      if (req.skip?.includes(m.id)) continue;
      if (!m.kinds.includes(req.media.kind)) continue;
      if (p.stage === 'disabled') {
        skip('disabled');
        continue;
      }
      if (p.stage === 'canary' && !this.opts.includeCanary && !req.only?.includes(m.id)) {
        skip('canary');
        continue;
      }
      if (req.accept && !m.output.types.some((t) => req.accept!.includes(t))) {
        skip('no accepted stream type');
        continue;
      }
      if (this.opts.strictNetwork && (m.network ?? 'declared') !== 'declared') {
        skip(`network policy "${m.network}" not allowed here`);
        continue;
      }
      const fit = canRun(m, runtime, runtime.features.includes('user-settings') || this.opts.settings ? { ...p.config, ...this.opts.settings } : undefined);
      if (!fit.ok) {
        skip(`needs ${fit.missing.join(', ')}`);
        continue;
      }
      const gate = health.allow(m.id, runtime.kind);
      if (!gate.allowed) {
        // Say what kind of rest it is: refused from here is not the same as broken.
        const where = health.placement(m.id, runtime.kind);
        const why = where === 'blocked' ? 'this network is refused by the site (it can still work from a viewer’s own connection)' : where === 'unreachable' ? 'its address does not answer from here' : where === 'broken' ? 'its extraction needs updating' : 'repeated failures';
        skip(`resting for ${Math.ceil((gate.retryInMs ?? 0) / 1000)}s: ${why}`);
        continue;
      }
      run.push(p);
    }
    // Best first: the registry's rank, tempered by how reliably the provider answers here and how often it has the title.
    const priority = (p: LoadedProvider) => {
      const id = p.module.manifest.id;
      const rank = (p.rank ?? p.module.manifest.rank ?? 100) / 100;
      return rank * (0.4 + health.reliability(id, runtime.kind)) * (0.6 + 0.4 * health.hitRate(id, runtime.kind));
    };
    run.sort((a, b) => priority(b) - priority(a) || a.module.manifest.id.localeCompare(b.module.manifest.id));
    return { run, skipped };
  }

  /**
   * Streams of events for one title: a plan, then one result per provider as each finishes, then
   * done. Callers asking for the same thing at the same time share one run.
   */
  resolve(req: ResolveRequest): AsyncGenerator<EngineEvent> {
    const key = [mediaKey(req.media), req.only?.join(',') ?? '', req.skip?.slice().sort().join(',') ?? '', req.accept?.slice().sort().join(',') ?? ''].join('|');
    const now = this.now();
    let run = this.runs.get(key);
    if (run && run.finished) {
      const found = run.events.some((e) => e.t === 'result' && e.outcome === 'ok');
      const ttl = found ? this.streamTtl(run) : (this.opts.negativeCacheTtlMs ?? 20_000);
      // >= so a TTL of 0 means "never reuse", even within the same millisecond.
      if (now - run.finishedAt >= ttl) run = undefined;
    }
    if (run && run.abort.signal.aborted) run = undefined;
    if (!run) {
      run = new SharedRun();
      this.runs.set(key, run);
      if (this.runs.size > 500) for (const [k, r] of this.runs) if (r.finished && now - r.finishedAt > 60_000) this.runs.delete(k);
      void this.execute(run, req);
    }
    return run.follow(req.signal);
  }

  /** A finished run is only reused while its soonest-expiring stream is still comfortably valid. */
  private streamTtl(run: SharedRun): number {
    const base = this.opts.cacheTtlMs ?? 120_000;
    let soonest = Infinity;
    for (const e of run.events) if (e.t === 'result') for (const s of e.streams) if (s.expiresAt !== undefined) soonest = Math.min(soonest, s.expiresAt - run.finishedAt - 60_000);
    return Math.max(0, Math.min(base, soonest));
  }

  private async execute(run: SharedRun, req: ResolveRequest) {
    const started = this.now();
    const { run: list, skipped } = this.plan(req);
    const waveSize = Math.max(1, this.opts.waveSize ?? 6);
    const waveOf = (i: number) => Math.floor(i / waveSize) + 1;
    run.push({ t: 'plan', runtime: this.opts.runtime.kind, providers: list.map((p, i) => ({ id: p.module.manifest.id, name: p.module.manifest.name, wave: waveOf(i) })), skipped });

    let ok = 0;
    let empty = 0;
    let failed = 0;
    const waves: LoadedProvider[][] = [];
    for (let i = 0; i < list.length; i += waveSize) waves.push(list.slice(i, i + waveSize));
    const delay = this.opts.waveDelayMs ?? 3000;
    const pending: Promise<void>[] = [];

    for (let w = 0; w < waves.length; w++) {
      if (run.abort.signal.aborted) break;
      const wave = waves[w].map((p) =>
        this.runProvider(p, req.media, run.abort.signal, req.accept).then((outcome) => {
          if (outcome.outcome === 'ok') ok++;
          else if (outcome.outcome === 'empty') empty++;
          else if (outcome.code !== 'CANCELLED') failed++;
          if (!run.abort.signal.aborted) run.push({ t: 'result', ...outcome });
        }),
      );
      pending.push(...wave);
      if (w < waves.length - 1) {
        // Next wave when this one is done, or after the delay, whichever is first.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([Promise.all(wave), new Promise<void>((r) => (timer = setTimeout(r, delay)))]);
        clearTimeout(timer);
      }
    }
    await Promise.all(pending);
    run.finishedAt = this.now();
    run.push({ t: 'done', ms: this.now() - started, ok, empty, failed });
  }

  /**
   * Runs one provider in isolation and returns its classified outcome. Never throws. Also used
   * directly by canaries and recovery (`record: false` keeps a probe out of the health numbers).
   */
  async runProvider(p: LoadedProvider, media: Media, outer?: AbortSignal, accept?: StreamType[], record = true, domainsOverride?: DomainConfig): Promise<ProviderOutcome> {
    const m = p.module.manifest;
    const info = { id: m.id, name: m.name, version: m.version };
    const runtime = this.opts.runtime;
    const started = this.now();
    const trace: RequestTrace[] = [];
    const domainConfig = domainsOverride ?? p.domains;
    // An address on trial takes its share of ordinary runs; a run with an explicit config (a canary, a validation) never does.
    const domains = new DomainResolver(domainConfig, this.opts.avoidOrigins?.(m.id), domainsOverride ? 1 : (this.opts.random ?? Math.random)());
    const network = m.network ?? 'declared';
    const guard = new PolicyGuard(
      {
        allow: [...hostsOf(domainConfig), ...(m.extraHosts ?? [])],
        open: network !== 'declared',
        followDiscovered: !!m.followDiscovered,
        maxRequests: m.limits?.maxRequests ?? DEFAULT_LIMITS.maxRequests,
        maxBodyChars: DEFAULT_LIMITS.maxBodyChars,
      },
      this.opts.resolveCheck,
    );

    const ctrl = new AbortController();
    const onOuter = () => ctrl.abort();
    if (outer?.aborted) ctrl.abort();
    outer?.addEventListener('abort', onOuter);
    let timedOut = false;
    const budget = m.limits?.timeoutMs ?? this.opts.providerTimeoutMs ?? 15_000;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, budget);

    const defaults = Object.fromEntries(Object.entries(m.config ?? {}).filter(([, f]) => f.default !== undefined).map(([k, f]) => [k, f.default]));
    const settings = { ...defaults, ...p.config, ...this.opts.settings };
    const browser =
      this.opts.browser && runtime.features.includes('js-render')
        ? this.opts.browser.session({ providerId: m.id, guard, domains, signal: ctrl.signal, trace, settings, auth: m.auth, budgetMs: budget, log: (event, data) => this.log(event, m.id, data) })
        : undefined;
    const ctx = {
      fetch: instrumentFetch(this.opts.transport, { guard, domains, signal: ctrl.signal, trace, timeoutMs: this.opts.requestTimeoutMs }),
      signal: ctrl.signal,
      runtime,
      settings,
      browser,
      domain: (role: string) => domains.origin(role),
      domainSetting: (role: string, key: string) => domains.setting(role, key),
      url: (role: string, path: string) => domains.url(role, path),
      store: this.store(m.id),
      log: (event: string, data?: Record<string, unknown>) => this.log(event, m.id, data),
      discovered: (text: string) => guard.noteDecoded(String(text)),
    };

    const finish = (o: Omit<ProviderOutcome, 'provider' | 'ms' | 'requests' | 'failovers'>, d?: Diagnosis): ProviderOutcome => {
      const ms = this.now() - started;
      if (record) {
        if (o.outcome === 'ok') this.opts.health.record(m.id, runtime.kind, { kind: 'ok' }, ms, m.version);
        else if (o.outcome === 'empty') this.opts.health.record(m.id, runtime.kind, { kind: 'empty' }, ms, m.version);
        else if (d) this.opts.health.record(m.id, runtime.kind, { kind: 'failure', diagnosis: d }, ms, m.version);
      }
      this.log('provider.result', m.id, { outcome: o.outcome, code: o.code, ms, requests: trace.length, streams: o.streams.length });
      const outcome: ProviderOutcome = { provider: info, ms, requests: trace.length, failovers: domains.failovers.length ? [...domains.failovers] : undefined, origins: domainConfig ? domains.used() : undefined, ...o };
      if (record && !domainsOverride) {
        try {
          this.opts.onOutcome?.(p, outcome);
        } catch {
          /* bookkeeping must never fail a run */
        }
      }
      return outcome;
    };

    try {
      const aborted = new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new ProviderError(timedOut ? 'TIMEOUT' : 'CANCELLED', timedOut ? `${m.name} took longer than ${Math.round(budget / 1000)}s` : undefined)), { once: true }));
      const result = await Promise.race([p.module.getSources(media, ctx), aborted]);
      const norm = normalizeResult(result, { provider: info, runtime: runtime.kind, now: this.now() });
      let streams = norm.streams;
      if (!streams.length && norm.rejected.length) {
        const expired = norm.rejected.every((r) => r === 'already expired');
        throw new ProviderError(expired ? 'EXPIRED' : 'INVALID_RESULT', `${m.name}: ${[...new Set(norm.rejected)].join(', ')}`);
      }
      if (accept && streams.length) {
        streams = streams.filter((s) => accept.includes(s.type));
        if (!streams.length) throw new ProviderError('UNSUPPORTED_FORMAT', `${m.name} only has ${[...new Set(norm.streams.map((s) => s.type))].join(', ')}`);
      }
      if (!streams.length) return finish({ outcome: 'empty', code: 'NOT_FOUND', scope: 'title', message: FAILURES.NOT_FOUND.label, streams: [], captions: [] });
      return finish({ outcome: 'ok', streams, captions: norm.captions, rejected: norm.rejected.length ? norm.rejected : undefined });
    } catch (e) {
      // A provider that ignores its signal and throws late is still reported as what really happened.
      const err = timedOut ? new ProviderError('TIMEOUT', `${m.name} took longer than ${Math.round(budget / 1000)}s`) : outer?.aborted ? new ProviderError('CANCELLED') : e;
      const d = diagnose(err, trace);
      if (d.code === 'NOT_FOUND') return finish({ outcome: 'empty', code: 'NOT_FOUND', scope: 'title', message: d.message, streams: [], captions: [] });
      return finish({ outcome: 'error', code: d.code, scope: d.scope, message: d.message, host: d.host, streams: [], captions: [] }, d);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
      ctrl.abort(); // stop anything the provider left running
      // Its browser pages go with it, whatever happened.
      if (browser) void browser.dispose().catch(() => undefined);
    }
  }
}

/** Collects a whole run (for callers that do want to wait, and for tests). */
export async function collect(events: AsyncIterable<EngineEvent>): Promise<{ results: ProviderOutcome[]; streams: Stream[]; captions: Caption[]; plan?: Extract<EngineEvent, { t: 'plan' }>; done?: Extract<EngineEvent, { t: 'done' }> }> {
  const out: Awaited<ReturnType<typeof collect>> = { results: [], streams: [], captions: [] };
  for await (const e of events) {
    if (e.t === 'plan') out.plan = e;
    else if (e.t === 'done') out.done = e;
    else {
      const { t: _t, ...outcome } = e;
      void _t;
      out.results.push(outcome);
      out.streams.push(...outcome.streams);
      out.captions.push(...outcome.captions);
    }
  }
  return out;
}
