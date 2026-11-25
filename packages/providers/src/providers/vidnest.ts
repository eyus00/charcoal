/**
 * VidNest: ten named back-ends behind one API. Each answers `{ encrypted, data }`, where `data` is
 * JSON in base64 with a shuffled alphabet, and each back-end has its own response shape.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { captionFormat, gather, qualityOf, streamType, text, xhrHeaders } from './shared.js';

const ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';
const REVERSE: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

/** Base64 with VidNest's alphabet. */
export function decodeVidnest(input: string): string {
  let padded = input;
  if (padded.length % 4) padded += '='.repeat(4 - (padded.length % 4));
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = REVERSE[padded[i]] ?? 64;
    const c1 = REVERSE[padded[i + 1]] ?? 64;
    const c2 = padded[i + 2] === '=' ? 64 : (REVERSE[padded[i + 2]] ?? 64);
    const c3 = padded[i + 3] === '=' ? 64 : (REVERSE[padded[i + 3]] ?? 64);
    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 !== 64) bytes.push((((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff);
    if (c3 !== 64) bytes.push((((c2 & 0x03) << 6) | c3) & 0xff);
  }
  return text(new Uint8Array(bytes));
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Found {
  streams: RawStream[];
  captions: Caption[];
}
type Handler = (root: Json, pageHeaders: Record<string, string>) => Found;

const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const caption = (url: string, label: string, headers?: Record<string, string>): Caption => ({ url, label, format: captionFormat(url), headers });

/** One handler per back-end, keyed by its path. A back-end without a handler is reported, not guessed at. */
const HANDLERS: Record<string, Handler> = {
  klikxxi: (r) => ({ streams: list(r.sources).map((s) => ({ url: s.url, type: streamType(s.url, s.type), quality: qualityOf(s.quality), language: 'English' })), captions: [] }),
  allmovies: (r) => ({ streams: list(r.streams).map((s) => ({ url: s.url, type: streamType(s.url, s.type), language: s.language })), captions: [] }),
  onehd: (r) => ({ streams: r.url ? [{ url: r.url, type: streamType(r.url), language: 'English', headers: r.headers }] : [], captions: list(r.subtitles).map((s) => caption(s.url, s.lang ?? 'Subtitles', r.headers)) }),
  hollymoviehd: (r) => ({ streams: list(r.sources).map((s) => ({ url: s.file, type: streamType(s.file, s.type), quality: qualityOf(s.label), language: 'English' })), captions: [] }),
  vidlink: (r) => {
    const stream = r.data?.stream;
    return { streams: stream?.playlist ? [{ url: stream.playlist, type: streamType(stream.playlist, stream.type), language: 'English', headers: r.headers }] : [], captions: list(stream?.captions).map((c) => caption(c.url, c.language ?? 'Subtitles', r.headers)) };
  },
  delta: (r) => ({ streams: list(r.streams).map((s) => ({ url: s.url, type: streamType(s.url, s.type), language: s.language })), captions: [] }),
  purstream: (r) => ({ streams: list(r.sources).map((s) => ({ url: s.url, type: streamType(s.url, s.format), quality: qualityOf(s.name), language: 'French' })), captions: [] }),
  moviebox: (r, H) => ({ streams: list(r.url).map((u) => ({ url: u.link, type: streamType(u.link, u.type), language: u.lang, headers: H })), captions: [] }),
};

const SERVERS: { path: string; query: string }[] = [
  { path: 'moviebox', query: '' },
  { path: 'allmovies', query: '' },
  { path: 'catflix', query: '' },
  { path: 'purstream', query: '' },
  { path: 'hollymoviehd', query: '' },
  { path: 'lamda', query: '' },
  { path: 'flixhq', query: '' },
  { path: 'vidlink', query: '' },
  { path: 'onehd', query: '?server=upcloud' },
  { path: 'klikxxi', query: '' },
];

export const vidnest = defineProvider({
  manifest: {
    id: 'vidnest',
    name: 'VidNest',
    version: '2.1.0',
    description: 'Ten named back-ends behind one API. With a browser, the site’s own player page is opened and its stream taken; without one, the API is asked directly.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server'],
    // The site's API wants a per-request nonce only its own page produces, so this needs a browser.
    requires: { features: ['forbidden-headers', 'js-render'] },
    domainRoles: ['site', 'api'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4', 'mkv', 'dash', 'webm'] },
    // Opening the player page (and waiting for a free browser) takes longer than asking the API.
    limits: { timeoutMs: 25_000, maxRequests: 14 },
    rank: 100,
    origin: 'apps/server/src/providers/vidnest (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain, log, browser }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('VidNest: needs a TMDB id');
    const H = xhrHeaders(domain('site'));
    const path = media.kind === 'movie' ? `movie/${media.ids.tmdb}` : `tv/${media.ids.tmdb}/${media.season}/${media.episode}`;

    // Where a browser is available, open the site's own player page and take what it asks for.
    // The page makes its API calls itself (including the request nonce the API now wants), so
    // nothing about the API has to be reproduced here.
    if (browser) {
      const page = await browser.open(url('site', `/${path}`), { waitFor: 'domcontentloaded' });
      try {
        if (page.status === 404) throw new NotFoundError('VidNest: no page for this title');
        try {
          await page.waitFor({ media: true }, 12_000);
        } catch (e) {
          // The player page exists for every id; loading nothing means the site has no source for this one.
          if (e instanceof ProviderError && e.code === 'SELECTOR_MISSING') throw new NotFoundError('VidNest: the player loaded no stream for this title');
          throw e;
        }
        const seen = page.media();
        const streams = seen.filter((m) => m.type !== 'captions').map((m): RawStream => ({ url: m.url, type: m.type as RawStream['type'], headers: m.headers }));
        if (!streams.length) throw new NotFoundError('VidNest: the player loaded no stream for this title');
        log('via-browser', { streams: streams.length });
        return { streams, captions: seen.filter((m) => m.type === 'captions').map((m) => caption(m.url, 'Subtitles', m.headers)) };
      } finally {
        await page.close();
      }
    }

    const found = await gather<Found>(
      SERVERS.map((server) => async () => {
        const res = await fetch(url('api', `/${server.path}/${path}${server.query}`), { headers: H, signal });
        // The API has started asking for a per-request nonce that this integration does not produce.
        if ((res.status === 401 || res.status === 403) && /nonce/i.test(res.body)) throw new ProviderError('STRUCTURE_CHANGED', 'VidNest: the API now requires a request nonce', { step: 'nonce', status: res.status });
        if (res.status === 404) return null;
        const body = JSON.parse(expectOk(res, 'VidNest').body) as { data?: string };
        if (typeof body.data !== 'string') return null;
        const handler = HANDLERS[server.path];
        if (!handler) {
          log('unhandled-backend', { backend: server.path });
          return null;
        }
        let root: Json;
        try {
          root = JSON.parse(decodeVidnest(body.data)) as Json;
        } catch {
          throw new ProviderError('STRUCTURE_CHANGED', `VidNest: the ${server.path} answer could not be decoded`, { step: 'decode' });
        }
        return handler(root, H);
      }),
      signal,
    );
    const streams = found.flatMap((f) => f.streams).filter((s) => typeof s.url === 'string' && s.url.startsWith('http'));
    if (!streams.length) throw new NotFoundError('VidNest: no back-end has this title');
    return { streams, captions: found.flatMap((f) => f.captions).filter((c) => typeof c.url === 'string') };
  },
});
