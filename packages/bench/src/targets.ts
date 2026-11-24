/**
 * What a benchmark can be pointed at. Each target answers the same question ("what does every
 * provider say for this title?") so runs against different builds and from different networks
 * can be compared:
 *
 *   engine  the provider pack in this process, on this machine's own network
 *   v2      a Charcoal server's /v2/sources (progressive results, typed failures)
 *   v1      a server that only has the older OMSS endpoints (the build before the platform)
 */
import { describeRuntime, Engine, fetchTransport, HealthStore, type Fetcher, type LoadedProvider, type Media, type RuntimeDescriptor, type StreamType } from '@charcoal/provider-sdk';

export interface FoundStream {
  provider: string;
  /** Same for the same upstream file from any provider. */
  dedupKey: string;
  url: string;
  /** A relay address on the target server, when the stream can only be tried through it. */
  relay?: string;
  type: StreamType;
  quality: string;
  headers: Record<string, string>;
  ipBound?: boolean;
  expiresAt?: number;
  languages: string[];
  captions?: number;
}

export interface ProviderRun {
  id: string;
  name: string;
  outcome: 'ok' | 'empty' | 'error' | 'skipped';
  /** Failure code (typed targets) or 'LEGACY' when the target only gave a message. */
  code?: string;
  message?: string;
  host?: string;
  ms: number;
  requests?: number;
  streams: FoundStream[];
  captions: number;
}

export interface TargetInfo {
  kind: 'engine' | 'v2' | 'v1';
  label: string;
  /** Whose network the providers' requests leave from. */
  egress: 'datacenter' | 'user' | 'unknown';
  providers: { id: string; name: string; stage?: string; kinds?: string[]; runtimes?: string[] }[];
}

export interface Target {
  info(): Promise<TargetInfo>;
  /** Runs every provider for one query. `onRun` is called as each finishes. */
  resolve(media: Media, onRun: (run: ProviderRun, atMs: number) => void, signal?: AbortSignal): Promise<void>;
  /** Where discovered streams are tried from (the bench's own machine). */
  close?(): Promise<void>;
}

// ---------- engine ----------

export interface EngineTargetOptions {
  providers: LoadedProvider[];
  label?: string;
  runtime?: RuntimeDescriptor;
  transport?: Fetcher;
  settings?: Record<string, unknown>;
  providerTimeoutMs?: number;
  /** Extra engine options (a browser worker, for instance). */
  engine?: Partial<ConstructorParameters<typeof Engine>[0]>;
}

export function engineTarget(o: EngineTargetOptions): Target {
  const runtime = o.runtime ?? describeRuntime('server');
  return {
    async info() {
      return {
        kind: 'engine',
        label: o.label ?? 'provider pack in this process',
        egress: runtime.egress,
        providers: o.providers.filter((p) => p.stage !== 'disabled').map((p) => ({ id: p.module.manifest.id, name: p.module.manifest.name, stage: p.stage, kinds: p.module.manifest.kinds, runtimes: p.module.manifest.runtimes })),
      };
    },
    async resolve(media, onRun, signal) {
      // A fresh health store per query: the benchmark wants every provider's own answer for every
      // title, not the circuit breaker's memory of the previous one.
      const engine = new Engine({
        providers: o.providers,
        runtime,
        transport: o.transport ?? fetchTransport,
        health: new HealthStore(),
        settings: o.settings,
        includeCanary: true,
        cacheTtlMs: 0,
        negativeCacheTtlMs: 0,
        providerTimeoutMs: o.providerTimeoutMs,
        ...o.engine,
      });
      const started = Date.now();
      for await (const e of engine.resolve({ media, signal })) {
        if (e.t === 'plan') {
          for (const s of e.skipped) onRun({ id: s.id, name: s.name, outcome: 'skipped', message: s.reason, ms: 0, streams: [], captions: 0 }, Date.now() - started);
        } else if (e.t === 'result') {
          onRun(
            {
              id: e.provider.id,
              name: e.provider.name,
              outcome: e.outcome,
              code: e.code,
              message: e.message,
              host: e.host,
              ms: e.ms,
              requests: e.requests,
              captions: e.captions.length,
              streams: e.streams.map((s) => ({ provider: e.provider.id, dedupKey: s.dedupKey, url: s.url, type: s.type, quality: s.quality, headers: s.headers, ipBound: s.ipBound, expiresAt: s.expiresAt, languages: s.audio.map((a) => a.lang), captions: e.captions.length })),
            },
            Date.now() - started,
          );
        }
      }
    },
  };
}

// ---------- /v2 ----------

const query = (media: Media): string => {
  const q = new URLSearchParams({ kind: media.kind, title: media.title });
  for (const [k, v] of Object.entries(media.ids)) if (v) q.set(k, v);
  if (media.year) q.set('year', String(media.year));
  if (media.originalLanguage) q.set('olang', media.originalLanguage);
  if (media.altTitles?.length) q.set('alt', media.altTitles.join(','));
  if (media.kind === 'tv') (q.set('s', String(media.season)), q.set('e', String(media.episode)));
  if (media.kind === 'anime') {
    q.set('e', String(media.episode));
    if (media.season) q.set('s', String(media.season));
    if (media.seasonEpisode) q.set('se', String(media.seasonEpisode));
    if (media.audio) q.set('audio', media.audio);
  }
  return q.toString();
};

interface WireEvent {
  t: 'plan' | 'result' | 'done';
  providers?: { id: string; name: string }[];
  skipped?: { id: string; name: string; reason: string }[];
  provider?: { id: string; name: string };
  outcome?: 'ok' | 'empty' | 'error';
  code?: string;
  message?: string;
  host?: string;
  ms?: number;
  requests?: number;
  streams?: { dedupKey: string; url: string; relay?: string; type: StreamType; quality: string; headers: Record<string, string>; ipBound?: boolean; expiresAt?: number; audio: { lang: string }[] }[];
  captions?: unknown[];
}

export function v2Target(base: string, o: { label?: string; adminToken?: string; includeCanary?: boolean } = {}): Target {
  const root = base.replace(/\/$/, '');
  let ids: string[] = [];
  const auth = o.adminToken ? { Authorization: `Bearer ${o.adminToken}` } : undefined;
  return {
    async info() {
      const reg = (await (await fetch(`${root}/v2/registry`)).json()) as { document?: { providers?: { manifest: { id: string; name: string; kinds: string[]; runtimes: string[] }; stage: string }[] }; providers?: { manifest: { id: string; name: string; kinds: string[]; runtimes: string[] }; stage: string }[] };
      const list = reg.document?.providers ?? reg.providers ?? [];
      const providers = list.filter((p) => p.stage !== 'disabled').map((p) => ({ id: p.manifest.id, name: p.manifest.name, stage: p.stage, kinds: p.manifest.kinds, runtimes: p.manifest.runtimes }));
      ids = providers.filter((p) => o.includeCanary !== false || p.stage === 'stable').map((p) => p.id);
      return { kind: 'v2', label: o.label ?? root, egress: 'unknown', providers };
    },
    async resolve(media, onRun, signal) {
      // With an admin token the circuit breaker is reset first, so every provider answers for itself.
      if (auth) await Promise.all(ids.map((id) => fetch(`${root}/v2/admin/providers/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined)));
      const started = Date.now();
      const only = o.includeCanary !== false && ids.length ? `&only=${ids.join(',')}` : '';
      const res = await fetch(`${root}/v2/sources?${query(media)}${only}`, { signal });
      if (!res.ok || !res.body) throw new Error(`${root}/v2/sources answered ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      const handle = (line: string) => {
        if (!line.trim()) return;
        const e = JSON.parse(line) as WireEvent;
        if (e.t === 'plan') for (const s of e.skipped ?? []) onRun({ id: s.id, name: s.name, outcome: 'skipped', message: s.reason, ms: 0, streams: [], captions: 0 }, Date.now() - started);
        if (e.t === 'result' && e.provider && e.outcome)
          onRun(
            {
              id: e.provider.id,
              name: e.provider.name,
              outcome: e.outcome,
              code: e.code,
              message: e.message,
              host: e.host,
              ms: e.ms ?? 0,
              requests: e.requests,
              captions: e.captions?.length ?? 0,
              streams: (e.streams ?? []).map((s) => ({ provider: e.provider!.id, dedupKey: s.dedupKey, url: s.url, relay: s.relay, type: s.type, quality: s.quality, headers: s.headers ?? {}, ipBound: s.ipBound, expiresAt: s.expiresAt, languages: (s.audio ?? []).map((a) => a.lang) })),
            },
            Date.now() - started,
          );
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          handle(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      handle(buffer);
    },
  };
}

// ---------- /v1 (OMSS) ----------

interface OmssResponse {
  sources?: { url: string; type: string; quality?: string; provider?: { id: string; name: string }; audioTracks?: { language?: string }[] }[];
  subtitles?: unknown[];
  diagnostics?: { code?: string; message?: string }[];
  error?: { code?: string; message?: string };
}

/**
 * The older API answers once, with every provider's sources in one list and failures as free-text
 * messages. Provider-level timing isn't available; each provider is given the whole request's time.
 */
export function v1Target(base: string, o: { label?: string } = {}): Target {
  const root = base.replace(/\/$/, '');
  let known: { id: string; name: string }[] = [];
  return {
    async info() {
      try {
        const h = (await (await fetch(`${root}/v1/providers/health`)).json()) as { providers?: { id: string; name: string }[] };
        known = (h.providers ?? []).map((p) => ({ id: p.id, name: p.name }));
      } catch {
        known = [];
      }
      return { kind: 'v1', label: o.label ?? root, egress: 'unknown', providers: known };
    },
    async resolve(media, onRun, signal) {
      if (media.kind !== 'movie' && media.kind !== 'tv') return;
      const started = Date.now();
      const path = media.kind === 'movie' ? `/v1/movies/${media.ids.tmdb}` : `/v1/tv/${media.ids.tmdb}/seasons/${media.season}/episodes/${media.episode}`;
      const res = await fetch(`${root}${path}`, { signal });
      const ms = Date.now() - started;
      const body = (await res.json().catch(() => ({}))) as OmssResponse;
      const byProvider = new Map<string, ProviderRun>();
      const run = (id: string, name: string): ProviderRun => {
        let r = byProvider.get(id);
        if (!r) byProvider.set(id, (r = { id, name, outcome: 'empty', ms, streams: [], captions: 0 }));
        return r;
      };
      for (const s of body.sources ?? []) {
        const id = s.provider?.id ?? 'unknown';
        const r = run(id, s.provider?.name ?? id);
        r.outcome = 'ok';
        const type = (['hls', 'dash', 'mp4', 'mkv', 'webm'].includes(s.type) ? s.type : 'hls') as StreamType;
        // The server hands out its own relay links; what is behind them is in the `data` parameter.
        let upstream = s.url;
        try {
          const data = new URL(s.url, root).searchParams.get('data');
          if (data) upstream = (JSON.parse(decodeURIComponent(data)) as { url?: string }).url ?? s.url;
        } catch {
          /* keep the relay URL as the key */
        }
        r.streams.push({ provider: id, dedupKey: upstream.split('?')[0], url: new URL(s.url, root).href, type, quality: s.quality ?? 'auto', headers: {}, languages: (s.audioTracks ?? []).map((a) => a.language ?? 'und') });
      }
      // One diagnostic per provider that failed, as "Name: message".
      for (const d of body.diagnostics ?? []) {
        const name = d.message?.split(':')[0]?.trim() || 'unknown';
        const match = known.find((p) => p.name.toLowerCase() === name.toLowerCase() || p.id.toLowerCase() === name.toLowerCase());
        const r = run(match?.id ?? name.toLowerCase(), match?.name ?? name);
        if (r.outcome !== 'ok') {
          r.outcome = 'error';
          r.code = 'LEGACY';
          r.message = d.message;
        }
      }
      for (const p of known) run(p.id, p.name);
      for (const r of byProvider.values()) onRun(r, ms);
    },
  };
}
