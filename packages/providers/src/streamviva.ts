/**
 * StreamViva's provider engine (packages/streamviva, vendored) as fallback providers.
 *
 * Each StreamViva source becomes one Provider: it runs the source, follows its embeds (file hosts)
 * with StreamViva's resolvers, and turns their streams into ours. Every request goes through the
 * Fetcher we're given, so in the website it leaves from the viewer's own browser through the
 * extension, and on a server it's plain fetch.
 *
 * PrimeSrc (a directory of file-host links per title) is ours, fed into StreamViva's file-host
 * resolvers.
 *
 * The engine is loaded lazily (it's large), only when the fallback runs.
 */
import type { Caption, Fetcher, Media, Provider, ScrapeResult, Stream } from './types.js';
import { NotFoundError } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Engine = typeof import('@charcoal/streamviva');

let enginePromise: Promise<Engine> | null = null;
const loadEngine = () => (enginePromise ??= import('@charcoal/streamviva'));

/** StreamViva sources that only show another site's player in a frame (we have embed servers for that). */
const IFRAME_ONLY = /-embed$|^vidsrc-embed$|^videasy-embed$/;
/** Sites in another language: their streams are labelled so they sort after the viewer's language. */
const SITE_LANGUAGE: Record<string, { name: string; code: string }> = {
  cuevana3: { name: 'Spanish', code: 'es' },
  pelisplushd: { name: 'Spanish', code: 'es' },
  cinehdplus: { name: 'Spanish', code: 'es' },
  wecima: { name: 'Arabic', code: 'ar' },
  hdrezka: { name: 'Russian', code: 'ru' },
};
const MAX_EMBEDS = 6;
const EMBED_TIMEOUT_MS = 15_000;

// ---------- fetch bridge ----------

/** StreamViva's FetchLike on top of our Fetcher (text bodies; that's all its scrapers read). */
function toFetchLike(f: Fetcher) {
  return async (url: string, ops?: { method?: string; headers?: Record<string, string>; body?: any; signal?: AbortSignal }) => {
    const headers: Record<string, string> = { ...(ops?.headers ?? {}) };
    let body: string | undefined;
    const b = ops?.body;
    if (typeof b === 'string') body = b;
    else if (b instanceof URLSearchParams) {
      body = b.toString();
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else if (b && typeof b.entries === 'function') {
      // FormData: send it as a plain form (our fetch path carries text only).
      body = new URLSearchParams([...b.entries()].map(([k, v]: [string, unknown]) => [k, String(v)] as [string, string])).toString();
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else if (b !== undefined && b !== null) body = JSON.stringify(b);
    const method = (ops?.method ?? 'GET').toUpperCase();
    const r = await f(url, { method: method === 'POST' || method === 'HEAD' ? method : 'GET', headers, body, signal: ops?.signal });
    const lower = Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status: r.status,
      url: r.url,
      headers: { get: (k: string) => lower[k.toLowerCase()] ?? null, set: () => {} },
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
      arrayBuffer: async () => new TextEncoder().encode(r.body).buffer,
    };
  };
}

const controls = new WeakMap<Fetcher, any>();
async function engineFor(f: Fetcher) {
  const sv = await loadEngine();
  if (!controls.has(f)) {
    const fetcher = sv.makeStandardFetcher(toFetchLike(f) as any);
    controls.set(
      f,
      // native: no CORS limits (the extension / a server); same IP for scraping and playback.
      sv.makeProviders({ fetcher, proxiedFetcher: fetcher, target: sv.targets.NATIVE, consistentIpForRequests: true }),
    );
  }
  return { sv, ctl: controls.get(f) };
}

// ---------- conversions ----------

function toSvMedia(m: Media): any {
  const common = { title: m.title, releaseYear: m.year ?? 0, tmdbId: m.tmdbId, imdbId: m.imdbId };
  return m.type === 'movie'
    ? { type: 'movie', ...common }
    : {
        type: 'show',
        ...common,
        season: { number: m.season ?? 1, tmdbId: m.seasonTmdbId ?? '' },
        episode: { number: m.episode ?? 1, tmdbId: m.episodeTmdbId ?? '' },
      };
}

const QUALITY: Record<string, string> = { '4k': '2160', unknown: 'auto' };

function toCaptions(list: any[] | undefined): Caption[] {
  return (list ?? [])
    .filter((c) => c?.url && (c.type === 'srt' || c.type === 'vtt'))
    .map((c) => ({ url: c.url, label: c.display || c.language || 'Unknown', format: c.type }));
}

function toStreams(svStream: any, language?: { name: string; code: string }): Stream[] {
  const headers = { ...(svStream.headers ?? {}), ...(svStream.preferredHeaders ?? {}) };
  const lang = language ? { language: language.name, languageCode: language.code } : {};
  if (svStream.type === 'hls' && svStream.playlist) return [{ url: svStream.playlist, type: 'hls', quality: 'auto', headers, ...lang }];
  if (svStream.type === 'file') {
    return Object.entries(svStream.qualities ?? {})
      .filter(([, q]: [string, any]) => q?.url)
      .map(([quality, q]: [string, any]) => ({
        url: q.url,
        type: q.type === 'mkv' || /\.mkv(\?|$)/i.test(q.url) ? ('mkv' as const) : ('mp4' as const),
        quality: QUALITY[quality] ?? quality,
        headers,
        ...lang,
      }));
  }
  return []; // iframe streams: not something our player can use
}

const within = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} took too long`)), ms))]);

/** Resolves embed links (file-host pages) to streams with StreamViva's resolvers, in parallel. */
async function resolveEmbeds(ctl: any, embeds: { embedId: string; url: string }[], language?: { name: string; code: string }) {
  const seen = new Set<string>();
  const unique = embeds.filter((e) => e?.embedId && e.url && !seen.has(e.embedId + e.url) && seen.add(e.embedId + e.url)).slice(0, MAX_EMBEDS);
  const results = await Promise.allSettled(
    unique.map((e) => within(ctl.runEmbedScraper({ id: e.embedId, url: e.url, disableOpensubtitles: true }), EMBED_TIMEOUT_MS, e.embedId)),
  );
  const out: ScrapeResult = { streams: [], captions: [] };
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') return void errors.push(`${unique[i].embedId}: ${(r.reason as Error)?.message ?? r.reason}`);
    for (const s of (r.value as any).stream ?? []) {
      out.streams.push(...toStreams(s, language).map((st) => ({ ...st, note: unique[i].embedId })));
      out.captions.push(...toCaptions(s.captions));
    }
  });
  return { out, errors };
}

// ---------- providers ----------

function fromSource(src: { id: string; name: string; rank: number; scrapeMovie?: unknown; scrapeShow?: unknown }): Provider {
  const language = SITE_LANGUAGE[src.id];
  return {
    id: `sv-${src.id}`,
    name: src.name,
    // Below all of ours, in StreamViva's own order.
    rank: Math.min(99, Math.round(src.rank / 10)),
    supports: [...(src.scrapeMovie ? (['movie'] as const) : []), ...(src.scrapeShow ? (['tv'] as const) : [])],
    fallback: 'streamviva',
    async scrape(media, ctx) {
      const { ctl } = await engineFor(ctx.fetch);
      let res: any;
      try {
        res = await ctl.runSourceScraper({ id: src.id, media: toSvMedia(media), disableOpensubtitles: true });
      } catch (e) {
        const m = (e as Error)?.message ?? String(e);
        // StreamViva wraps "not found" as "Couldn't find a stream: …".
        if (/couldn.t find|not found|no .*found/i.test(m)) throw new NotFoundError(`${src.name}: ${m.replace(/^Couldn't find a stream: /, '')}`);
        throw new Error(`${src.name}: ${m}`);
      }
      const direct: Stream[] = (res.stream ?? []).flatMap((s: any) => toStreams(s, language));
      const captions: Caption[] = (res.stream ?? []).flatMap((s: any) => toCaptions(s.captions));
      const { out, errors } = await resolveEmbeds(ctl, res.embeds ?? [], language);
      const streams = [...direct, ...out.streams];
      if (!streams.length) {
        throw errors.length ? new Error(`${src.name}: ${errors.slice(0, 2).join('; ')}`) : new NotFoundError(`${src.name}: no stream`);
      }
      return { streams, captions: [...captions, ...out.captions] };
    },
  };
}

/** PrimeSrc server names → StreamViva resolver ids. */
const PRIMESRC_HOSTS: Record<string, string> = {
  Voe: 'voe',
  Dood: 'dood',
  Streamtape: 'streamtape',
  Mixdrop: 'mixdrop',
  Filemoon: 'filemoon',
  Streamwish: 'streamwish-english',
  Filelions: 'filelions',
  Vidhide: 'vidhide-english',
  Dropload: 'dropload',
  Supervideo: 'supervideo',
};

/** PrimeSrc: lists which file hosts have the title; StreamViva's resolvers get the video out. */
export const primesrc: Provider = {
  id: 'primesrc',
  name: 'PrimeSrc',
  rank: 100,
  supports: ['movie', 'tv'],
  fallback: 'streamviva',
  async scrape(media, ctx) {
    const api = 'https://primesrc.me/api/v1';
    const q =
      media.type === 'movie'
        ? `tmdb=${media.tmdbId}&type=movie`
        : `tmdb=${media.tmdbId}&season=${media.season}&episode=${media.episode}&type=tv`;
    const res = await ctx.fetch(`${api}/s?${q}`, { headers: { Accept: 'application/json' }, signal: ctx.signal });
    if (!res.ok) throw new Error(`PrimeSrc: list returned ${res.status}`);
    const servers = ((JSON.parse(res.body) as { servers?: { name?: string; key?: string }[] }).servers ?? []).filter(
      (s) => s.name && s.key && PRIMESRC_HOSTS[s.name],
    );
    if (!servers.length) throw new NotFoundError('PrimeSrc: no supported file hosts for this title');
    // One link per host (the first of each).
    const perHost = [...new Map(servers.map((s) => [s.name!, s])).values()];
    const links = await Promise.allSettled(
      perHost.map(async (s) => {
        const l = await ctx.fetch(`${api}/l?key=${encodeURIComponent(s.key!)}`, { headers: { Accept: 'application/json' }, signal: ctx.signal });
        if (!l.ok || !l.body.trimStart().startsWith('{')) {
          throw new Error(/just a moment/i.test(l.body) ? 'link behind a bot check' : `link returned ${l.status}`);
        }
        const link = (JSON.parse(l.body) as { link?: string }).link;
        if (!link) throw new Error('no link');
        return { embedId: PRIMESRC_HOSTS[s.name!], url: link };
      }),
    );
    const embeds = links.flatMap((l) => (l.status === 'fulfilled' ? [l.value] : []));
    if (!embeds.length) {
      const why = links.find((l) => l.status === 'rejected') as PromiseRejectedResult | undefined;
      throw new Error(`PrimeSrc: ${why?.reason?.message ?? 'no links'}`);
    }
    const { ctl } = await engineFor(ctx.fetch);
    const { out, errors } = await resolveEmbeds(ctl, embeds);
    if (!out.streams.length) throw new Error(`PrimeSrc: ${errors.slice(0, 2).join('; ') || 'no stream'}`);
    return out;
  },
};

/** All fallback providers: every enabled StreamViva source (except frame-only ones) plus PrimeSrc. */
export async function loadFallbackProviders(): Promise<Provider[]> {
  const sv = await loadEngine();
  const sources = sv.getBuiltinSources().filter((s: any) => !IFRAME_ONLY.test(s.id));
  return [primesrc, ...sources.map((s: any) => fromSource(s))].sort((a, b) => b.rank - a.rank);
}
