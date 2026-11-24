/**
 * Source discovery for the website: the browser side of @charcoal/client.
 *
 * One hook, `useSources`, whatever is behind it. Providers that can run in this browser (through
 * Charcoal Helper or an app shell) run here; the rest are asked of the viewer's own server or the
 * hosted one; results from both arrive progressively as one ranked list. Pages and the player
 * never see providers, runtimes or servers, only sources.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RegistryClient, resolveSources, type PlayableSource, type RemoteEvent, type ResolveState } from '@charcoal/client';
import { HealthStore, normalizeStream, type HealthRecord, type Media, type PlaybackCapabilities, type Stream } from '@charcoal/provider-sdk';
import { getBridge } from './extension';
import { HOSTED_SERVER, languageName, type JellyResult, type JellySource, type JellySubtitle, type ProviderReport, type Target } from './servers';
import { getState } from './store';
import type { Details } from './tmdb';

// ---------- servers ----------

/** Resolver APIs to try, in order: the viewer's own server (if set), then the hosted one. */
function servers(): string[] {
  return [...new Set([getState().settings.serverUrl, HOSTED_SERVER].filter(Boolean))];
}

const FIRST_BYTE_MS = 12_000;
const TOTAL_MS = 45_000;

/** /v2/sources as a stream of events (newline-delimited JSON). Falls back to /v1 on an older server. */
async function* remote(base: string, query: URLSearchParams, signal: AbortSignal): AsyncGenerator<RemoteEvent> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort);
  const first = setTimeout(() => ctrl.abort(), FIRST_BYTE_MS);
  const total = setTimeout(() => ctrl.abort(), TOTAL_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${base}/v2/sources?${query}`, { signal: ctrl.signal, headers: { Accept: 'application/x-ndjson' } });
    } catch {
      throw new Error(signal.aborted ? 'cancelled' : 'Couldn’t reach the server');
    }
    clearTimeout(first);
    // A server from before the provider platform: it only speaks /v1.
    if (res.status === 404) {
      yield* legacy(base, query, ctrl.signal);
      return;
    }
    if (res.status === 429) throw new Error('The server is busy; try again in a moment');
    if (!res.ok || !res.body) throw new Error(`The server returned ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (line) yield JSON.parse(line) as RemoteEvent;
      }
    }
    if (buffer.trim()) yield JSON.parse(buffer) as RemoteEvent;
  } finally {
    clearTimeout(first);
    clearTimeout(total);
    signal.removeEventListener('abort', onAbort);
  }
}

interface V1Response {
  sources?: { url: string; type: string; quality: string; audioTracks?: { language: string; label: string }[]; provider: { id: string; name: string } }[];
  subtitles?: { url: string; label: string; format: string }[];
  error?: { message?: string };
}

/** The old OMSS endpoint, presented as platform events (everything it returns is already relayed). */
async function* legacy(base: string, query: URLSearchParams, signal: AbortSignal): AsyncGenerator<RemoteEvent> {
  const kind = query.get('kind');
  const tmdb = query.get('tmdb');
  if ((kind !== 'movie' && kind !== 'tv') || !tmdb) return;
  const path = kind === 'movie' ? `/v1/movies/${tmdb}` : `/v1/tv/${tmdb}/seasons/${query.get('s')}/episodes/${query.get('e')}`;
  const started = Date.now();
  const res = await fetch(base + path, { signal });
  const body = (await res.json().catch(() => null)) as V1Response | null;
  if (!res.ok && res.status !== 404) throw new Error(body?.error?.message || `The server returned ${res.status}`);
  const skip = new Set(query.get('skip')?.split(',') ?? []);
  const byProvider = new Map<string, { name: string; streams: (Stream & { relay?: string })[] }>();
  for (const s of body?.sources ?? []) {
    if (skip.has(s.provider.id.toLowerCase())) continue;
    let upstream: { url: string; headers?: Record<string, string> } = { url: s.url };
    try {
      const data = new URL(s.url).searchParams.get('data');
      if (data) upstream = JSON.parse(data);
    } catch {
      /* not a relay URL: use it as it is */
    }
    const provider = { id: s.provider.id.toLowerCase(), name: s.provider.name, version: 'v1' };
    const a = s.audioTracks?.[0];
    const stream = normalizeStream({ url: upstream.url, type: s.type as Stream['type'], quality: s.quality, headers: upstream.headers, language: a?.label, languageCode: a?.language }, { provider, runtime: 'server' });
    if ('rejected' in stream) continue;
    const entry = byProvider.get(provider.id) ?? { name: provider.name, streams: [] };
    // Header-less or not, a v1 server only vouches for its own relay URL.
    entry.streams.push({ ...stream, ipBound: true, relay: s.url });
    byProvider.set(provider.id, entry);
  }
  yield { t: 'plan', runtime: 'server', providers: [...byProvider].map(([id, p]) => ({ id, name: p.name, wave: 1 })), skipped: [] };
  let first = true;
  for (const [id, p] of byProvider) {
    yield { t: 'result', provider: { id, name: p.name, version: 'v1' }, outcome: 'ok', ms: Date.now() - started, streams: p.streams, captions: first ? (body?.subtitles ?? []).map((c) => ({ url: c.url, label: c.label, format: (c.format === 'srt' ? 'srt' : 'vtt') as 'srt' | 'vtt' })) : [], requests: 0 };
    first = false;
  }
  yield { t: 'done', ms: Date.now() - started, ok: byProvider.size, empty: 0, failed: 0 };
}

// ---------- registry, health, device ----------

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode or full: fine */
    }
  },
};

/** Public keys this build trusts for registry signatures: `VITE_REGISTRY_KEYS="keyId=base64,keyId2=base64"`. */
function trustedKeys(): Record<string, string> | undefined {
  const raw = (import.meta.env.VITE_REGISTRY_KEYS as string | undefined) ?? '';
  const pairs = raw.split(',').map((p) => p.trim().split('=')).filter((p) => p.length >= 2 && p[0] && p[1]);
  return pairs.length ? Object.fromEntries(pairs.map(([id, ...rest]) => [id, rest.join('=')])) : undefined;
}

const registry = new RegistryClient({
  urls: () => servers().map((b) => `${b}/v2/registry`),
  fetchJson: async (url, signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  trustedKeys: trustedKeys(),
  storage,
});

const HEALTH_KEY = 'charcoal:health';
const health = new HealthStore();
try {
  health.load(JSON.parse(storage.get(HEALTH_KEY) ?? '[]') as HealthRecord[]);
} catch {
  /* start clean */
}

let caps: Omit<PlaybackCapabilities, 'bridge' | 'relay'> | undefined;
/** What this browser can play, measured once. */
export function deviceCapabilities(): Omit<PlaybackCapabilities, 'bridge' | 'relay'> {
  if (caps) return caps;
  const v = document.createElement('video');
  const can = (t: string) => v.canPlayType(t) !== '';
  const mse = 'MediaSource' in window || 'ManagedMediaSource' in window;
  const videoCodecs = ['avc'];
  if (can('video/mp4; codecs="hvc1.1.6.L93.B0"') || can('video/mp4; codecs="hev1.1.6.L93.B0"')) videoCodecs.push('hevc');
  if (can('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push('av1');
  if (can('video/webm; codecs="vp9"') || can('video/mp4; codecs="vp09.00.10.08"')) videoCodecs.push('vp9');
  const audioCodecs = ['aac', 'mp3'];
  if (can('audio/webm; codecs="opus"') || can('audio/mp4; codecs="opus"')) audioCodecs.push('opus');
  if (can('audio/mp4; codecs="ac-3"')) audioCodecs.push('ac3');
  if (can('audio/mp4; codecs="ec-3"')) audioCodecs.push('eac3');
  if (can('audio/flac') || can('audio/mp4; codecs="flac"')) audioCodecs.push('flac');
  caps = {
    hls: mse || can('application/vnd.apple.mpegurl'),
    // No DASH player is bundled; a DASH-only source is reported as not playable here.
    dash: false,
    mp4: true,
    // Browsers play some Matroska files and say they play none; they stay in the list, last.
    mkv: true,
    webm: can('video/webm'),
    videoCodecs,
    audioCodecs,
    frames: true,
  };
  return caps;
}

// ---------- to the player's shapes ----------

function mediaOf(t: Target, d: Details, episodeTmdbId?: number): Media {
  const date = d.release_date || d.first_air_date || '';
  const common = {
    ids: { tmdb: String(t.id), ...(d.imdb_id || d.external_ids?.imdb_id ? { imdb: (d.imdb_id || d.external_ids?.imdb_id) as string } : {}) },
    title: d.title || d.name || '',
    altTitles: [d.original_title, d.original_name].filter((x): x is string => !!x && x !== (d.title || d.name)),
    year: Number(date.slice(0, 4)) || undefined,
    originalLanguage: d.original_language,
    runtime: d.runtime || d.episode_run_time?.[0] || undefined,
  };
  if (t.type === 'tv') return { kind: 'tv', ...common, season: t.season ?? 1, episode: t.episode ?? 1, episodeTmdbId: episodeTmdbId ? String(episodeTmdbId) : undefined };
  return { kind: 'movie', ...common };
}

function toSource(s: PlayableSource): JellySource {
  const a = s.audio[0];
  const named = a && (a.lang !== 'und' || (a.label && !/^(original|unknown)$/i.test(a.label)));
  return {
    id: s.id,
    url: s.playUrl,
    type: s.type,
    quality: s.quality,
    audioTracks: named ? [{ language: a.lang, label: a.label ?? languageName(a.lang) }] : undefined,
    provider: { id: s.provider.id, name: s.provider.name },
    headers: s.delivery === 'headers' ? s.headers : undefined,
    bridged: s.delivery === 'headers',
    delivery: s.delivery,
    expiresAt: s.expiresAt,
    note: s.note,
    size: s.size,
    levels: s.levels,
  };
}

function toResult(state: ResolveState): JellyResult {
  // MKV last, as before: most browsers can't play most of them.
  const ordered = [...state.sources.filter((s) => s.type !== 'mkv' && s.type !== 'frame'), ...state.sources.filter((s) => s.type === 'mkv')];
  const subtitles: JellySubtitle[] = state.captions.map((c) => {
    const relay = (c as { relay?: string }).relay;
    const bridged = c.local && !!state.mode.bridge;
    return { url: !c.local && relay ? relay : c.url, label: c.label, format: c.format, headers: bridged ? c.headers : undefined, bridged };
  });
  const report: ProviderReport[] = state.providers
    .filter((p) => p.state !== 'pending')
    .map((p) => ({ name: p.name, ok: p.state === 'ok', reason: p.state === 'ok' ? undefined : p.reason, group: p.id.startsWith('sv-') ? 'StreamViva' : undefined, where: p.where, code: p.code }));
  for (const u of state.unplayable) if (!report.some((r) => r.name === u.provider && !r.ok)) report.push({ name: u.provider, ok: false, reason: u.reason });
  const own = getState().settings.serverUrl;
  const anyLocal = ordered.some((s) => s.local);
  return {
    responseId: 'platform',
    expiresAt: '',
    sources: ordered.map(toSource),
    subtitles,
    report,
    via: anyLocal ? 'extension' : state.mode.server && state.mode.server === own ? 'own' : 'hosted',
    ownError: own && state.mode.server && state.mode.server !== own ? 'it didn’t answer' : undefined,
  };
}

/** One discovery run for a title. Resolves when every provider has answered. */
export async function findSources(t: Target, d: Details, episodeTmdbId: number | undefined, signal: AbortSignal, onUpdate: (r: JellyResult, done: boolean) => void): Promise<JellyResult> {
  const settings = getState().settings;
  // Not awaited: a newer registry applies to the next search; discovery never delays playback.
  void registry.refresh();
  const final = await resolveSources(
    mediaOf(t, d, episodeTmdbId),
    {
      pack: async () => (await import('@charcoal/providers')).loadPack({ fallback: true }),
      bridge: async () => (settings.useExtension ? getBridge() : null),
      registry: () => registry.current(),
      servers,
      remote,
      settings: () => ({ febboxToken: settings.febboxToken || undefined, febboxMaxHeight: settings.febboxMaxHeight || undefined }),
      device: deviceCapabilities,
      preferences: () => ({ language: settings.audioLang, lastProvider: settings.lastProvider }),
      health,
      report: settings.shareHealth
        ? (reports) => {
            const base = servers()[servers().length - 1];
            if (base) fetch(`${base}/v2/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reports }), keepalive: true }).catch(() => {});
          }
        : undefined,
    },
    { signal, onUpdate: (s) => onUpdate(toResult(s), s.done) },
  );
  storage.set(HEALTH_KEY, JSON.stringify(health.snapshot()));
  return toResult(final);
}

// ---------- the hook ----------

export interface SourcesQuery {
  /** The current list (it grows while `searching`). Undefined until the first playable source. */
  data: JellyResult | undefined;
  /** Providers are still answering. */
  searching: boolean;
  /** A search started by `refetch` is running (the previous list stays on screen meanwhile). */
  refreshing: boolean;
  /** The search finished and found nothing playable. */
  error: Error | undefined;
  /** Changes when a NEW search replaces the list (not while one search is still adding to it). */
  generation: number;
  refetch(): void;
}

/** Sources for a title, progressively. Searches again only when asked to (`refetch`). */
export function useSources(target: Target, d: Details | undefined, episodeTmdbId: number | undefined, enabled: boolean): SourcesQuery {
  const settings = getState().settings;
  const key = [target.type, target.id, target.season, target.episode, settings.serverUrl, settings.useExtension, !!settings.febboxToken, settings.febboxMaxHeight].join('|');
  const [run, setRun] = useState(0);
  const [state, setState] = useState<{ key: string; data?: JellyResult; searching: boolean; error?: Error; generation: number }>({ key, searching: enabled, generation: 0 });
  const latest = useRef({ target, d, episodeTmdbId });
  latest.current = { target, d, episodeTmdbId };
  const ready = enabled && !!d;

  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    let adopted = false;
    setState((s) => (s.key === key ? { ...s, searching: true, error: undefined } : { key, searching: true, generation: s.generation }));
    const adopt = (r: JellyResult, done: boolean) => {
      if (ctrl.signal.aborted) return;
      if (!r.sources.length && !done) return; // keep whatever is on screen until there is something to show
      setState((s) => {
        const generation = adopted ? s.generation : s.generation + 1;
        adopted = true;
        if (!r.sources.length) return { key, data: undefined, searching: false, error: new Error(noSourcesMessage(r)), generation: s.generation };
        return { key, data: r, searching: !done, error: undefined, generation };
      });
    };
    const { target: t, d: details, episodeTmdbId: ep } = latest.current;
    findSources(t, details!, ep, ctrl.signal, adopt)
      .then((r) => adopt(r, true))
      .catch((e) => !ctrl.signal.aborted && setState((s) => ({ key, data: s.key === key ? s.data : undefined, searching: false, error: s.key === key && s.data ? undefined : (e as Error), generation: s.generation })));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run, ready]);

  const refetch = useCallback(() => setRun((n) => n + 1), []);
  const current = state.key === key ? state : { key, searching: ready, generation: state.generation, data: undefined, error: undefined };
  return { data: current.data, searching: current.searching, refreshing: current.searching && !!current.data && run > 0, error: current.error, generation: current.generation, refetch };
}

function noSourcesMessage(r: JellyResult): string {
  const why = (r.report ?? []).filter((p) => !p.ok && p.reason).slice(0, 3).map((p) => `${p.name}: ${p.reason}`);
  return why.length ? `No playable source (${why.join('; ')})` : 'No sources found for this title';
}
