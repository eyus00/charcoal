/**
 * Unified source discovery for a client. One call, whatever is behind it:
 *
 *   - providers that can run here (through a bridge, on the viewer's own connection) run here;
 *   - everything else is asked of the resolver API, which streams results as they arrive;
 *   - both feed one list: normalised, de-duplicated, ranked for this device, growing as it goes.
 *
 * The page never needs to know which provider or which runtime produced a source. With no bridge
 * the remote resolver does all the work; with no reachable resolver the local runtime does; with
 * neither, the answer is an honest "nothing playable here" and the page falls back to a frame.
 */
import {
  checkCompatibility,
  decideDelivery,
  defineRuleProvider,
  Engine,
  FAILURES,
  HealthStore,
  mergeCaptions,
  planExecution,
  rankStreams,
  type Caption,
  type Delivery,
  type DomainConfig,
  type EngineEvent,
  type VerifyEvent,
  type FailureCode,
  type LoadedProvider,
  type Media,
  type PlaybackCapabilities,
  type ProviderOutcome,
  type RankWeights,
  type RegistryDocument,
  type RuntimeKind,
  type Stream,
  type StreamType,
} from '@charcoal/provider-sdk';
import { bridgeRuntime, type Bridge } from './bridge.js';

/** A stream ready for a player: where to load it from and how. */
export interface PlayableSource extends Stream {
  delivery: Exclude<Delivery, 'unplayable'>;
  /** What the player loads: the origin URL, or the relay URL when delivery is 'relay'. */
  playUrl: string;
  /** Resolved on this device (true) or by the resolver API (false). */
  local: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  /** Where it ran. */
  where: 'local' | 'remote';
  runtime?: RuntimeKind;
  state: 'pending' | 'ok' | 'empty' | 'error' | 'skipped';
  code?: FailureCode;
  /** For people. */
  reason?: string;
  ms?: number;
  streams?: number;
}

export interface ResolveState {
  /** Best first. Only sources this device can actually play. */
  sources: PlayableSource[];
  captions: (Caption & { local: boolean })[];
  providers: ProviderStatus[];
  /** Found, but not playable on this device (wrong format, or needs a bridge). */
  unplayable: { provider: string; reason: string }[];
  pending: { local: boolean; remote: boolean };
  done: boolean;
  /** How this client is resolving right now. */
  mode: { bridge: 'extension' | 'app' | null; server: string | null };
  /** Why the remote side contributed nothing, when it didn't. */
  remoteError?: string;
}

/** One line of /v2/sources: an engine event whose streams may carry a relay link. */
export type RemoteEvent = EngineEvent | VerifyEvent | (Omit<Extract<EngineEvent, { t: 'result' }>, 'streams'> & { streams: (Stream & { relay?: string })[] });

export interface ResolverDeps {
  /** Providers built into this client, with their shipped stages and domains. */
  pack(): Promise<LoadedProvider[]>;
  /** The bridge, if one is installed and usable. */
  bridge(): Promise<Bridge | null>;
  /** The registry in use, if any (not awaited: discovery must not delay playback). */
  registry(): RegistryDocument | undefined;
  /** Resolver API bases to try, in order (the viewer's own server first, then the hosted one). */
  servers(): string[];
  /**
   * Opens /v2/sources on a server and yields its events. Rejects (or yields nothing and throws)
   * when the server is unreachable or doesn't speak /v2.
   */
  remote(base: string, query: URLSearchParams, signal: AbortSignal): AsyncIterable<RemoteEvent>;
  /** Per-device provider settings (personal tokens). They stay on this device. */
  settings(): Record<string, unknown>;
  /** What this device can play. `bridge`/`relay` are filled in by the resolver. */
  device(): Omit<PlaybackCapabilities, 'bridge' | 'relay'>;
  preferences(): { language?: string; lastProvider?: string | null };
  /** Local health, kept by the caller so it can persist it. */
  health: HealthStore;
  /** Sends outcome beacons (provider, runtime, outcome, ms). Optional; never contains titles. */
  report?(reports: { provider: string; runtime: RuntimeKind; version: string; outcome: string; ms: number }[]): void;
  now?: () => number;
}

export interface ResolveOptions {
  signal?: AbortSignal;
  /** Called every time the picture changes. */
  onUpdate?(state: ResolveState): void;
  /** Stream types to ask for (default: whatever the device says it can play). */
  accept?: StreamType[];
}

function queryFor(media: Media, accept: StreamType[], skip: string[]): URLSearchParams {
  const q = new URLSearchParams({ kind: media.kind, title: media.title });
  for (const [k, v] of Object.entries(media.ids)) if (v) q.set(k, v);
  if (media.year) q.set('year', String(media.year));
  if (media.runtime) q.set('runtime', String(media.runtime));
  if (media.originalLanguage) q.set('olang', media.originalLanguage);
  if (media.altTitles?.length) q.set('alt', media.altTitles.slice(0, 8).join(','));
  if (media.kind === 'tv') {
    q.set('s', String(media.season));
    q.set('e', String(media.episode));
  } else if (media.kind === 'anime') {
    q.set('e', String(media.episode));
    if (media.season !== undefined) q.set('s', String(media.season));
    if (media.seasonEpisode !== undefined) q.set('se', String(media.seasonEpisode));
    if (media.audio) q.set('audio', media.audio);
  } else if (media.kind === 'live' && media.startsAt) q.set('at', String(media.startsAt));
  if (accept.length) q.set('accept', accept.join(','));
  if (skip.length) q.set('skip', skip.join(','));
  return q;
}

/**
 * The providers this client can run, with the registry applied on top of what it was built with:
 * stages, ranks and domains come from the registry when it is newer, and providers the registry
 * describes as data (rule packs) exist here even if this build has never heard of them.
 */
export function applyRegistry(pack: LoadedProvider[], registry: RegistryDocument | undefined): LoadedProvider[] {
  if (!registry) return pack;
  const entries = new Map(registry.providers.map((p) => [p.manifest.id, p]));
  const out: LoadedProvider[] = pack.map((p) => {
    const e = entries.get(p.module.manifest.id);
    if (!e) return p;
    const domains: DomainConfig | undefined = e.domains && (!p.domains || e.domains.version >= p.domains.version) ? e.domains : p.domains;
    // A stage only applies to the version it was decided for; a rank and a domain apply regardless.
    const stage = e.manifest.version === p.module.manifest.version ? e.stage : e.stage === 'disabled' ? 'disabled' : p.stage;
    return { ...p, stage, rank: e.rank ?? p.rank, domains, config: { ...p.config, ...e.config } };
  });
  const have = new Set(pack.map((p) => p.module.manifest.id));
  for (const e of registry.providers) {
    if (have.has(e.manifest.id) || !e.rules) continue;
    try {
      out.push({ module: defineRuleProvider(e.manifest, e.rules), stage: e.stage, rank: e.rank, domains: e.domains, config: e.config });
    } catch {
      /* a rule pack this SDK can't run is simply not available here */
    }
  }
  return out;
}

const status = (o: ProviderOutcome, where: 'local' | 'remote', runtime: RuntimeKind | undefined): ProviderStatus => ({
  id: o.provider.id,
  name: o.provider.name,
  where,
  runtime,
  state: o.outcome,
  code: o.code,
  reason: o.outcome === 'ok' ? undefined : o.outcome === 'empty' ? FAILURES.NOT_FOUND.label : (o.code ? FAILURES[o.code].label : o.message),
  ms: o.ms,
  streams: o.streams.length,
});

export async function resolveSources(media: Media, deps: ResolverDeps, opts: ResolveOptions = {}): Promise<ResolveState> {
  const signal = opts.signal ?? new AbortController().signal;
  const now = deps.now ?? Date.now;
  const [bridge, pack] = await Promise.all([deps.bridge().catch(() => null), deps.pack()]);
  const usable = bridge?.info.usable ? bridge : null;
  const registry = deps.registry();
  const servers = deps.servers().filter(Boolean);
  const device = deps.device();
  const caps: PlaybackCapabilities = { ...device, bridge: !!usable, relay: servers.length > 0 };
  const accept = opts.accept ?? (['hls', 'dash', 'mp4', 'mkv', 'webm'] as StreamType[]).filter((t) => caps[t as 'hls' | 'dash' | 'mp4' | 'mkv' | 'webm']);
  const settings = deps.settings();
  const prefs = deps.preferences();

  // ---------- who runs where ----------
  const available = applyRegistry(pack, registry).filter((p) => p.module.manifest.kinds.includes(media.kind));
  const runtime = usable ? bridgeRuntime(usable.info) : null;
  // A provider resting here after repeated failures is left to the resolver API for now. (Read
  // straight from the record: asking the breaker itself would use up its one trial.)
  const resting = (id: string, kind: RuntimeKind) => {
    const r = deps.health.get(id, kind);
    return !!r && r.circuit === 'open' && now() < r.openUntil;
  };
  const plan = planExecution(
    available.filter((p) => p.stage === 'stable').map((p) => p.module.manifest),
    { local: runtime ? [runtime] : [], health: { allowed: (p, r) => !resting(p, r), reliability: (p, r) => deps.health.reliability(p, r) }, settings },
  );
  const localIds = plan.filter((p) => p.where === 'local').map((p) => p.provider);

  const state: ResolveState = {
    sources: [],
    captions: [],
    providers: [],
    unplayable: [],
    pending: { local: localIds.length > 0, remote: servers.length > 0 },
    done: false,
    mode: { bridge: usable ? usable.info.kind : null, server: null },
  };
  const found: { stream: Stream & { relay?: string }; local: boolean }[] = [];
  const remoteHealth = new Map<string, { reliability: number; averageMs: number }>();
  for (const e of registry?.providers ?? []) for (const h of e.health ?? []) if (h.runtime === 'server') remoteHealth.set(e.manifest.id, { reliability: h.reliability, averageMs: h.averageMs });
  const ranks = new Map(available.map((p) => [p.module.manifest.id, Math.min(1, (p.rank ?? p.module.manifest.rank ?? 100) / 300)]));
  const dubRisks = new Map(available.map((p) => [p.module.manifest.id, Number(p.config?.dubRisk ?? p.module.manifest.dubRisk ?? 0)]));
  const weights: Partial<RankWeights> | undefined = registry?.ranking;

  const publish = () => {
    // The same upstream file found here and by the server: keep the one resolved here (it plays directly).
    const byKey = new Map<string, { stream: Stream & { relay?: string }; local: boolean }>();
    for (const f of found) {
      const had = byKey.get(f.stream.dedupKey);
      if (!had || (f.local && !had.local)) byKey.set(f.stream.dedupKey, f);
    }
    const locality = new Map([...byKey.values()].map((f) => [f.stream.id, f]));
    const delivery = (s: Stream) => {
      const f = locality.get(s.id)!;
      const d = decideDelivery(s, caps, f.local);
      // A relay delivery needs a relay link from the server that resolved it.
      return d === 'relay' && !f.stream.relay ? 'unplayable' : d;
    };
    const ranked = rankStreams(
      [...byKey.values()].map((f) => f.stream),
      {
        preferredLanguage: prefs.language,
        maxHeight: caps.maxHeight,
        compatibility: (s) => checkCompatibility(s, caps),
        delivery,
        reliability: (s) => (locality.get(s.id)!.local ? deps.health.reliability(s.provider.id, s.runtime) : (remoteHealth.get(s.provider.id)?.reliability ?? 0.5)),
        averageMs: (s) => (locality.get(s.id)!.local ? deps.health.get(s.provider.id, s.runtime)?.avgMs : remoteHealth.get(s.provider.id)?.averageMs),
        providerRank: (id) => ranks.get(id) ?? 0.33,
        dubRisk: (id) => dubRisks.get(id) ?? 0,
        lastProvider: prefs.lastProvider,
        weights,
      },
    );
    state.sources = [];
    state.unplayable = [];
    for (const s of ranked) {
      const f = locality.get(s.id)!;
      const d = delivery(s);
      if ((s.score ?? -1) < 0 || d === 'unplayable') {
        state.unplayable.push({ provider: s.provider.name, reason: s.reasons?.[0] ?? 'Not playable on this device' });
        continue;
      }
      state.sources.push({ ...s, delivery: d, playUrl: d === 'relay' ? f.stream.relay! : s.url, local: f.local });
      // The server found the same file and can relay it: kept as a second way to the same stream,
      // right behind the one resolved here. Some hosts refuse a viewer's own connection (or a
      // header the bridge could not set) and still serve the server.
      const relayed = f.local && d !== 'relay' ? found.find((o) => !o.local && o.stream.relay && o.stream.dedupKey === s.dedupKey) : undefined;
      if (relayed) state.sources.push({ ...s, id: `${s.id}~relay`, runtime: relayed.stream.runtime, delivery: 'relay', playUrl: relayed.stream.relay!, local: false });
    }
    opts.onUpdate?.({ ...state, sources: [...state.sources], providers: [...state.providers], captions: [...state.captions], pending: { ...state.pending } });
  };

  const take = (o: ProviderOutcome & { streams: (Stream & { relay?: string })[] }, where: 'local' | 'remote') => {
    const i = state.providers.findIndex((p) => p.id === o.provider.id);
    const s = status(o, where, where === 'local' ? runtime?.kind : 'server');
    if (i >= 0) state.providers[i] = s;
    else state.providers.push(s);
    for (const stream of o.streams) found.push({ stream, local: where === 'local' });
    state.captions = mergeCaptions(state.captions, o.captions.map((c) => ({ ...c, local: where === 'local' }))) as ResolveState['captions'];
    publish();
  };

  // ---------- local ----------
  const local = (async () => {
    if (!usable || !runtime || !localIds.length) return;
    const engine = new Engine({ providers: available, runtime, transport: usable.fetcher, health: deps.health, settings, providerTimeoutMs: 20_000, cacheTtlMs: 0, negativeCacheTtlMs: 0, now });
    const reports: Parameters<NonNullable<ResolverDeps['report']>>[0] = [];
    for await (const e of engine.resolve({ media, signal, only: localIds, accept })) {
      if (e.t === 'plan') {
        for (const p of e.providers) state.providers.push({ id: p.id, name: p.name, where: 'local', runtime: runtime.kind, state: 'pending' });
        for (const s of e.skipped) state.providers.push({ id: s.id, name: s.name, where: 'local', runtime: runtime.kind, state: 'skipped', reason: s.reason });
        publish();
      } else if (e.t === 'result') {
        take(e, 'local');
        if (e.code !== 'CANCELLED') reports.push({ provider: e.provider.id, runtime: runtime.kind, version: e.provider.version, outcome: e.outcome === 'error' ? (e.code ?? 'INTERNAL') : e.outcome, ms: e.ms });
      }
    }
    if (reports.length) deps.report?.(reports);
  })()
    .catch(() => {})
    .finally(() => {
      state.pending.local = false;
    });

  // ---------- remote ----------
  const askRemote = async (skip: string[], only?: string[]) => {
    let lastError = 'no resolver configured';
    for (const base of servers) {
      if (signal.aborted) return;
      const q = queryFor(media, accept, skip);
      if (only) q.set('only', only.join(','));
      let got = false;
      try {
        for await (const e of deps.remote(base, q, signal)) {
          got = true;
          state.mode.server = base;
          if (e.t === 'plan') {
            for (const p of e.providers) if (!state.providers.some((x) => x.id === p.id)) state.providers.push({ id: p.id, name: p.name, where: 'remote', runtime: 'server', state: 'pending' });
            for (const s of e.skipped) if (!state.providers.some((x) => x.id === s.id)) state.providers.push({ id: s.id, name: s.name, where: 'remote', runtime: 'server', state: 'skipped', reason: s.reason });
            publish();
          } else if (e.t === 'result') take(e as ProviderOutcome & { streams: (Stream & { relay?: string })[] }, 'remote');
          else if (e.t === 'verify') {
            // The resolver has now tried a stream it sent a moment ago: discovered becomes verified (or not).
            const f = found.find((x) => !x.local && x.stream.id === e.stream);
            if (f) {
              f.stream = { ...f.stream, verification: e.verification };
              publish();
            }
          }
        }
        if (got) {
          state.remoteError = undefined;
          return;
        }
        lastError = `${base} sent nothing`;
      } catch (e) {
        if (signal.aborted) return;
        lastError = (e as Error).message || `${base} is unreachable`;
        // Anything it did send stays; the next server fills in.
      }
    }
    state.remoteError = lastError;
  };
  const remote = (async () => {
    if (!servers.length) return;
    await askRemote(localIds);
  })().finally(() => {
    state.pending.remote = false;
  });

  await Promise.all([local, remote]);

  // The bridge went away mid-run: whatever it was running is asked of the resolver instead.
  if (usable?.lost && servers.length && !signal.aborted) {
    const stranded = state.providers.filter((p) => p.where === 'local' && (p.state === 'pending' || p.code === 'CANCELLED')).map((p) => p.id);
    if (stranded.length) {
      state.pending.remote = true;
      state.mode.bridge = null;
      caps.bridge = false;
      state.providers = state.providers.filter((p) => !stranded.includes(p.id));
      publish();
      await askRemote([], stranded);
      state.pending.remote = false;
    }
  }

  state.done = true;
  publish();
  return state;
}
