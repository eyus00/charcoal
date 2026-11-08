import type { MediaType } from './tmdb';
import { getState } from './store';

/** Charcoal's own server (Jelly). People can run their own and set it in Settings. */
export const HOSTED_SERVER = (import.meta.env.VITE_JELLY_URL || 'https://jelly.up.railway.app').replace(/\/+$/, '');
/** The server in use: the viewer's own if set, else the hosted one. */
export const serverBase = () => getState().settings.serverUrl || HOSTED_SERVER;

// ---------- Jelly (our scraper backend, OMSS API) ----------

export interface JellySource {
  url: string;
  type: 'hls' | 'mp4' | 'mkv' | string;
  quality: string;
  audioTracks?: { language: string; label: string }[];
  provider: { id: string; name: string };
}
export interface JellySubtitle { url: string; format: 'vtt' | 'srt' | string; label: string }
export interface JellyResponse {
  responseId: string;
  expiresAt: string;
  sources: JellySource[];
  subtitles: JellySubtitle[];
}

export interface Target { type: MediaType; id: number; season?: number; episode?: number }

const JELLY_TIMEOUT_MS = 45_000;

/** Where a response came from: the viewer's own server, or the hosted one (also as a fallback). */
export type JellyResult = JellyResponse & { via: 'own' | 'hosted'; ownError?: string };

/** Sources for a title: from the viewer's own server if set, falling back to the hosted one. */
export async function fetchJelly(t: Target, signal: AbortSignal): Promise<JellyResult> {
  const own = getState().settings.serverUrl;
  let ownError: string | undefined;
  if (own) {
    try {
      return { ...(await fetchFrom(own, t, signal)), via: 'own' };
    } catch (e) {
      if (signal.aborted) throw e;
      ownError = (e as Error).message;
      console.warn('[server] own server failed, using the hosted one:', ownError);
    }
  }
  return { ...(await fetchFrom(HOSTED_SERVER, t, signal)), via: 'hosted', ownError };
}

async function fetchFrom(base: string, t: Target, signal: AbortSignal): Promise<JellyResponse> {
  const path =
    t.type === 'movie' ? `/v1/movies/${t.id}` : `/v1/tv/${t.id}/seasons/${t.season}/episodes/${t.episode}`;

  // Abort on unmount/episode change (signal) OR after the timeout.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), JELLY_TIMEOUT_MS);
  const onAbort = () => ctrl.abort(signal.reason);
  signal.addEventListener('abort', onAbort);
  try {
    const res = await fetch(base + path, { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message || `The server returned ${res.status}`);
    const data = body as JellyResponse;
    const sources = (data.sources ?? []).filter((s) => s?.url);
    if (!sources.length) throw new Error('No sources found for this title');
    return { ...data, sources: sortSources(sources), subtitles: data.subtitles ?? [] };
  } catch (e) {
    if (ctrl.signal.aborted && !signal.aborted) throw new Error('The server took too long to respond');
    if (e instanceof TypeError) throw new Error('Couldn’t reach the server');
    throw e;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

// ---------- the viewer's own server ----------

/** Cleans up a pasted server address: origin + path, no trailing slash or /v1…; '' if invalid. */
export function normalizeServer(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/v1(\/.*)?$/, '');
  } catch {
    return '';
  }
}

const isLocal = (u: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.localhost');

/** Checks that an address is a reachable Charcoal server (its /v1/health). */
export async function checkServer(base: string): Promise<{ ok: true; providers: string } | { ok: false; error: string }> {
  const u = new URL(base);
  // An https site may not load from a plain-http server, except one on this computer.
  if (location.protocol === 'https:' && u.protocol === 'http:' && !isLocal(u)) {
    return { ok: false, error: 'this site is https, so the server must be too (http only works for localhost). See the self-hosting guide for HTTPS on a VPS' };
  }
  try {
    const res = await fetch(`${base}/v1/health`, { signal: AbortSignal.timeout?.(8000) });
    if (!res.ok) return { ok: false, error: `it answered with error ${res.status}` };
    const body = await res.json().catch(() => null);
    if (body?.status !== 'operational' || !body?.endpoints?.proxy) return { ok: false, error: 'that address isn’t a Charcoal server' };
    const count = String(body.note ?? '').match(/(\d+) provider/)?.[1];
    return { ok: true, providers: count ? `${count} sources` : 'running' };
  } catch {
    return {
      ok: false,
      error: isLocal(u)
        ? 'couldn’t reach it. Is the server running? Your browser may also ask to allow access to devices on your network'
        : 'couldn’t reach it. Check the address and that the server is running',
    };
  }
}

export function qualityLabel(q: string): string {
  const s = (q || '').toLowerCase();
  if (/2160|4k/.test(s)) return '4K';
  if (/1440|2k/.test(s)) return '1440p';
  if (/1080/.test(s)) return '1080p';
  if (/720/.test(s)) return '720p';
  if (/480/.test(s)) return '480p';
  if (/360/.test(s)) return '360p';
  if (/hd|auto|adaptive/.test(s)) return 'Auto';
  const n = s.replace(/\D/g, '');
  return n ? `${n}p` : 'SD';
}

const RANK: Record<string, number> = { Auto: 0, '1080p': 1, '4K': 2, '1440p': 3, '720p': 4, '480p': 5, '360p': 6, SD: 7 };

/** Adaptive/1080p HLS first; MKV last (most browsers can't play it). */
function sortSources(list: JellySource[]): JellySource[] {
  const typeRank = (t: string) => (t === 'hls' ? 0 : t === 'mp4' ? 1 : 2);
  return [...list].sort(
    (a, b) =>
      typeRank(a.type) - typeRank(b.type) ||
      (RANK[qualityLabel(a.quality)] ?? 8) - (RANK[qualityLabel(b.quality)] ?? 8),
  );
}

export interface ProviderHealth {
  id: string;
  name: string;
  status: 'ok' | 'failing' | 'benched' | 'unknown';
  success: number;
  empty: number;
  failure: number;
  benchedForSeconds: number;
  averageMs: number;
  lastError?: string;
}

/** Jelly's provider health table (GET /v1/providers/health); null if Jelly is older or down. */
export async function fetchProviderHealth(signal?: AbortSignal): Promise<ProviderHealth[] | null> {
  const res = await fetch(`${serverBase()}/v1/providers/health`, { signal });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.providers) ? body.providers : null;
}

// ---------- embed servers (third-party iframe players) ----------

export interface EmbedServer {
  id: string;
  name: string;
  /** Reports playback progress via postMessage */
  tracksProgress?: boolean;
  url: (t: Target, resumeAt?: number) => string;
}

const ACCENT = 'ffffff';
const sec = (n?: number) => (n && n > 5 ? Math.floor(n) : 0);

// The first entry is the default embed (also the fallback when Jelly finds nothing).
export const EMBEDS: EmbedServer[] = [
  {
    id: 'vidlink.pro',
    name: 'VidLink',
    tracksProgress: true,
    url: (t, r) => {
      const q = `?primaryColor=${ACCENT}&poster=true&autoplay=true${sec(r) ? `&startAt=${sec(r)}` : ''}`;
      return t.type === 'movie'
        ? `https://vidlink.pro/movie/${t.id}${q}`
        : `https://vidlink.pro/tv/${t.id}/${t.season}/${t.episode}${q}`;
    },
  },
  {
    id: 'videasy.net',
    name: 'Videasy',
    tracksProgress: true,
    url: (t, r) =>
      t.type === 'movie'
        ? `https://player.videasy.net/movie/${t.id}?color=${ACCENT}&autoplay=true${sec(r) ? `&progress=${sec(r)}` : ''}`
        : `https://player.videasy.net/tv/${t.id}/${t.season}/${t.episode}?color=${ACCENT}&nextEpisode=true&episodeSelector=false&autoplayNextEpisode=false${sec(r) ? `&progress=${sec(r)}` : ''}`,
  },
  {
    id: 'vidsrc.pro',
    name: 'VidSrc Pro',
    url: (t) => (t.type === 'movie' ? `https://vidsrc.pro/embed/movie/${t.id}` : `https://vidsrc.pro/embed/tv/${t.id}/${t.season}/${t.episode}`),
  },
  {
    id: 'vidsrc.to',
    name: 'VidSrc.to',
    url: (t) => (t.type === 'movie' ? `https://vidsrc.to/embed/movie/${t.id}` : `https://vidsrc.to/embed/tv/${t.id}/${t.season}/${t.episode}`),
  },
  {
    id: 'moviesapi.club',
    name: 'Movies Club',
    url: (t) => (t.type === 'movie' ? `https://moviesapi.club/movie/${t.id}` : `https://moviesapi.club/tv/${t.id}-${t.season}-${t.episode}`),
  },
  {
    id: 'vidsrc.cc',
    name: 'VidSrc.cc',
    url: (t) => (t.type === 'movie' ? `https://vidsrc.cc/v2/embed/movie/${t.id}` : `https://vidsrc.cc/v2/embed/tv/${t.id}/${t.season}/${t.episode}`),
  },
  {
    id: 'superembed',
    name: 'SuperEmbed',
    url: (t) =>
      t.type === 'movie'
        ? `https://multiembed.mov/?tmdb=1&video_id=${t.id}`
        : `https://multiembed.mov/?tmdb=1&video_id=${t.id}&s=${t.season}&e=${t.episode}`,
  },
  {
    id: 'vidsrc.dev',
    name: 'VidBinge',
    url: (t) => (t.type === 'movie' ? `https://vidsrc.dev/embed/movie/${t.id}` : `https://vidsrc.dev/embed/tv/${t.id}/${t.season}/${t.episode}`),
  },
  {
    id: 'vidsrc.vip',
    name: 'VidSrc VIP',
    url: (t) => (t.type === 'movie' ? `https://vidsrc.vip/embed/movie/${t.id}` : `https://vidsrc.vip/embed/tv/${t.id}/${t.season}/${t.episode}`),
  },
];

export const embedById = (id: string) => EMBEDS.find((e) => e.id === id);
