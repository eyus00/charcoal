/**
 * MeowTV: named servers behind one API. Each request needs a single-use ticket from the API, and
 * each answer is sealed; opening it is done by a third-party service (enc-dec.app, closed source;
 * flow from its published sample), which sees what was answered for every lookup.
 *
 * Checked 2026-11-26 from a cloud address, for Inception: four of five servers answered with an
 * HLS playlist and the headers it needs (two of them the same file Castle finds; duplicates are
 * merged by the engine), plus a subtitle list.
 */
import { defineProvider, getJson, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { BROWSER_UA, captionFormat, gather, streamType } from './shared.js';

/** The servers the site lists. `lang` is said only where the server is for one language. */
const SERVERS: { id: string; lang?: string }[] = [{ id: 'english', lang: 'en' }, { id: 'acme' }, { id: 'dcloud' }, { id: 'tik' }, { id: 'hindi', lang: 'hi' }];
const LANGS: Record<string, string> = { english: 'en', hindi: 'hi', tamil: 'ta', telugu: 'te', spanish: 'es', french: 'fr', german: 'de' };

interface Opened {
  language?: string;
  url?: string;
  headers?: Record<string, string>;
}

export const meowtv = defineProvider({
  manifest: {
    id: 'meowtv',
    name: 'MeowTV',
    version: '1.0.0',
    description: 'Named servers behind one API with single-use tickets; answers are opened by a third-party service (enc-dec.app).',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['api', 'site', 'decoder'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 20 },
    rank: 100,
    origin: 'flow from smy778/EncDecEndpoints samples (MIT)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('MeowTV: needs a TMDB id');
    const site = domain('site');
    const H = { 'User-Agent': BROWSER_UA, Origin: site, Referer: `${site}/` };
    const path = media.kind === 'movie' ? `movie/${media.ids.tmdb}` : `tv/${media.ids.tmdb}/${media.season}/${media.episode}`;

    const found = await gather<{ server: (typeof SERVERS)[number]; opened: Opened }>(
      SERVERS.map((server) => async () => {
        // A ticket is good for one request.
        const { ticket } = await getJson<{ ticket?: string }>(fetch, url('api', '/streams/ticket'), { method: 'POST', headers: H, signal }, 'MeowTV ticket');
        if (!ticket) throw new ProviderError('STRUCTURE_CHANGED', 'MeowTV: no ticket in the answer', { step: 'ticket' });
        const res = await fetch(url('api', `/streams/${path}?s=${server.id}`), { headers: { ...H, 'X-Stream-Ticket': ticket }, signal });
        if (res.status === 404) return null;
        if (!res.ok) throw new ProviderError(res.status === 403 ? 'ACCESS_DENIED' : 'HTTP', `MeowTV ${server.id} answered ${res.status}`, { step: 'api', status: res.status });
        let data: unknown;
        try {
          data = JSON.parse(res.body);
        } catch {
          throw new ProviderError('STRUCTURE_CHANGED', 'MeowTV: the answer is not JSON any more', { step: 'api' });
        }
        const opened = await getJson<{ status?: number; result?: Opened; error?: string }>(fetch, url('decoder', '/api/dec-meowtv'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }), signal }, 'MeowTV open');
        if (opened.status !== 200 || !opened.result) throw new ProviderError('STRUCTURE_CHANGED', `MeowTV: the opening service refused (${opened.error ?? opened.status})`, { step: 'open' });
        return { server, opened: opened.result };
      }),
      signal,
    );
    const streams: RawStream[] = [];
    for (const { server, opened } of found) {
      if (!opened.url) continue;
      const said = LANGS[(opened.language ?? '').toLowerCase()];
      streams.push({ url: opened.url, type: streamType(opened.url), headers: opened.headers ?? {}, languageCode: said ?? server.lang, note: server.id });
    }
    if (!streams.length) throw new NotFoundError('MeowTV: no server has this title');

    // Subtitles are a courtesy: their absence never fails the lookup.
    const captions: Caption[] = [];
    try {
      const subs = await getJson<{ label?: string; file?: string }[]>(fetch, url('api', `/subs/${path}`), { headers: H, signal }, 'MeowTV subtitles');
      for (const s of Array.isArray(subs) ? subs.slice(0, 40) : []) if (s?.file) captions.push({ url: s.file, label: s.label ?? 'Subtitles', format: captionFormat(s.file) });
    } catch {
      /* none */
    }
    return { streams, captions };
  },
});
