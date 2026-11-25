/**
 * VidLink through its own JSON API.
 *
 * The player page asks `/api/b/movie/<token>` (or `/api/b/tv/<token>/<season>/<episode>`), where
 * the token is the TMDB id put through the site's cipher. The cipher changes; like Videasy, the
 * token is made by a third-party service (enc-dec.app, closed source; flow from its published
 * sample). That service sees the TMDB id of every lookup, and when it is down this provider stops.
 *
 * The answer (checked 2026-11-26 from a cloud address) is plain JSON: either files by quality
 * (`stream.qualities["1080"] = { type "mp4", url, codecName "h264" | "hevc", size }`) or one HLS
 * `stream.playlist`, with captions. This replaces the earlier version that opened the player page
 * in a headless browser: it needs no browser worker and also finds the H.264 files.
 */
import { defineProvider, getJson, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { BROWSER_UA, captionFormat, qualityOf } from './shared.js';

interface Answer {
  sourceId?: string;
  stream?: {
    type?: string;
    playlist?: string;
    qualities?: Record<string, { type?: string; url?: string; codecName?: string; size?: string | number }>;
    captions?: { url?: string; language?: string; type?: string }[];
  };
}

/**
 * The file host (checked 2026-11-26) serves a plain client and refuses a browser: a browser's
 * User-Agent gets 428 and a Referer gets 429. So the files are fetched as what this is, with no
 * Referer, which also means they play through the relay (or the helper) and not straight from a page.
 */
const FILE_HEADERS = { 'User-Agent': 'Charcoal' };

export const vidlink = defineProvider({
  manifest: {
    id: 'vidlink',
    name: 'VidLink',
    version: '2.0.0',
    description: 'VidLink’s JSON API; the id token it expects is made by a third-party service (enc-dec.app).',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site', 'decoder'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 4 },
    rank: 115,
    origin: 'flow from smy778/EncDecEndpoints samples (MIT)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('VidLink: needs a TMDB id');
    const site = domain('site');
    const H = { 'User-Agent': BROWSER_UA, Referer: `${site}/`, Origin: site };

    const made = await getJson<{ status?: number; result?: string; error?: string }>(fetch, url('decoder', `/api/enc-vidlink?text=${encodeURIComponent(media.ids.tmdb)}`), { signal }, 'VidLink token');
    if (made.status !== 200 || !made.result) throw new ProviderError('STRUCTURE_CHANGED', `VidLink: the token service refused (${made.error ?? made.status})`, { step: 'token' });

    const path = media.kind === 'movie' ? `/api/b/movie/${made.result}` : `/api/b/tv/${made.result}/${media.season}/${media.episode}`;
    const res = await fetch(url('site', path), { headers: H, signal });
    if (res.status === 404) throw new NotFoundError('VidLink does not have this title');
    if (!res.ok) throw new ProviderError(res.status === 403 ? 'ACCESS_DENIED' : 'HTTP', `VidLink answered ${res.status}`, { step: 'api', status: res.status });
    let answer: Answer;
    try {
      answer = JSON.parse(res.body) as Answer;
    } catch {
      // An empty or encrypted body: the title is not there, or the API changed.
      if (res.body.trim().length < 4) throw new NotFoundError('VidLink does not have this title');
      throw new ProviderError('STRUCTURE_CHANGED', 'VidLink: the answer is not JSON any more', { step: 'api' });
    }
    // `null`: the API knows no such title.
    const stream = answer?.stream;
    const streams: RawStream[] = [];
    if (stream?.playlist) streams.push({ url: stream.playlist, type: 'hls', headers: H });
    for (const [quality, file] of Object.entries(stream?.qualities ?? {})) {
      if (!file?.url) continue;
      const hevc = /hevc|h265/i.test(file.codecName ?? '');
      streams.push({ url: file.url, type: 'mp4', quality: qualityOf(quality) ?? qualityOf(`${quality}p`), headers: FILE_HEADERS, size: Number(file.size) || undefined, note: hevc ? 'HEVC' : undefined });
    }
    if (!streams.length) throw new NotFoundError('VidLink has no stream for this title');
    const captions: Caption[] = (stream?.captions ?? []).filter((c) => c?.url).map((c) => ({ url: c.url!, label: c.language ?? 'Subtitles', format: captionFormat(c.type ? `x.${c.type}` : c.url!) }));
    return { streams, captions };
  },
});
