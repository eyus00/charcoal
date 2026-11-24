/**
 * Videasy: several named back-ends answer with an encrypted blob. The site's cipher changes often;
 * like the class this was ported from, the blob is handed to a third-party decoding service
 * (enc-dec.app, closed source) rather than decoded here.
 *
 * That dependency matters: the service sees the title id of every lookup, and when it is down or
 * changes its interface this provider stops. The legacy class called api.videasy.net and posted
 * `{ text, id }`; since then the API moved (the "seed" flow below, as published in the service's own
 * sample) and the old hosts stopped answering. Both generations are kept behind the domain config:
 * the address in force decides which flow runs.
 */
import { defineProvider, expectOk, getJson, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { BROWSER_UA, captionFormat, gather, qualityOf, streamType } from './shared.js';

interface Backend {
  name: string;
  /** Audio language of what it carries (ISO 639-1); undefined = original. */
  lang?: string;
  query?: string;
}

/** Back-ends of the current API (from the decoding service's published sample). */
const BACKENDS: Backend[] = [
  { name: 'miami' },
  { name: 'boise' },
  { name: 'vegas' },
  { name: 'reno' },
  { name: 'oakland' },
  { name: 'seattle' },
  { name: 'munich', lang: 'de', query: 'language=german' },
  { name: 'paris', lang: 'fr' },
  { name: 'delhi', lang: 'hi' },
  { name: 'cancun', lang: 'es' },
];

interface Decoded {
  sources?: { url?: string; quality?: string; type?: string }[];
  subtitles?: { url?: string; lang?: string; language?: string }[];
}

export const videasy = defineProvider({
  manifest: {
    id: 'videasy',
    name: 'Videasy',
    version: '2.0.0',
    description: 'Named back-ends that answer with an encrypted blob, decoded by a third-party service (enc-dec.app).',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb', 'title'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['api', 'player', 'decoder'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 24 },
    rank: 95,
    origin: 'apps/server/src/providers/videasy (cinepro-org/core); current flow from smy778/EncDecEndpoints samples',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('Videasy: needs a TMDB id');
    const player = domain('player');
    const H = { 'User-Agent': BROWSER_UA, Accept: '*/*', Referer: `${player}/`, Origin: player };
    const tmdb = media.ids.tmdb;

    // The seed ties the blob to this lookup; the decoder needs it back.
    const seed = (await getJson<{ seed?: string }>(fetch, url('api', `/seed?mediaId=${tmdb}`), { headers: H, signal }, 'Videasy seed')).seed;
    if (!seed) throw new ProviderError('STRUCTURE_CHANGED', 'Videasy: no seed in the answer', { step: 'seed' });

    // The API expects the title URL-encoded twice.
    const q = new URLSearchParams({ mediaType: media.kind, tmdbId: tmdb, imdbId: media.ids.imdb ?? '', enc: '2', seed });
    if (media.year) q.set('year', String(media.year));
    if (media.kind === 'tv') (q.set('seasonId', String(media.season)), q.set('episodeId', String(media.episode)));
    const title = encodeURIComponent(encodeURIComponent(media.title));

    const found = await gather<{ backend: Backend; data: Decoded }>(
      BACKENDS.map((backend) => async () => {
        const res = await fetch(url('api', `/${backend.name}/sources?title=${title}&${q}${backend.query ? `&${backend.query}` : ''}`), { headers: H, signal });
        if (res.status === 404) return null;
        const blob = expectOk(res, `Videasy ${backend.name}`).body.trim();
        if (blob.length < 10) return null;
        const decoded = await getJson<{ status?: number; result?: Decoded; error?: string }>(fetch, url('decoder', '/api/dec-videasy'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: blob, id: tmdb, seed }), signal }, 'Videasy decoder');
        if (decoded.status !== 200 || !decoded.result) throw new ProviderError('STRUCTURE_CHANGED', `Videasy: the decoding service refused the blob (${decoded.error ?? decoded.status})`, { step: 'decode', host: new URL(domain('decoder')).hostname });
        return { backend, data: decoded.result };
      }),
      signal,
    );
    const streams: RawStream[] = [];
    const captions: Caption[] = [];
    for (const { backend, data } of found) {
      for (const s of data.sources ?? []) if (s?.url) streams.push({ url: s.url, type: streamType(s.url, s.type), quality: qualityOf(s.quality), languageCode: backend.lang, headers: H, note: backend.name });
      for (const s of data.subtitles ?? []) if (s?.url) captions.push({ url: s.url, label: s.lang ?? s.language ?? 'Subtitles', format: captionFormat(s.url) });
    }
    if (!streams.length) throw new NotFoundError('Videasy: no back-end has this title');
    return { streams, captions };
  },
});
