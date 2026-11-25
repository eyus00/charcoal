/**
 * CineJoy: one API (api.wing.st) in front of several named servers, each answering with an HLS
 * playlist. Requests and answers are sealed with a cipher that changes; like Videasy and VidLink,
 * sealing and opening are done by a third-party service (enc-dec.app, closed source; flow from its
 * published sample). That service sees the title and ids of every lookup.
 *
 * Checked 2026-11-26 from a cloud address: four servers listed, three asked, each returned a
 * playlist for Inception. Two of the three playlist hosts answer only with the site's Referer.
 * The sealed request is binary, so this runs where the transport can send bytes (a server).
 */
import { defineProvider, getJson, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { base64ToBytes, base64Url, BROWSER_UA, captionFormat, gather } from './shared.js';

interface Opened {
  data?: { stream?: { type?: string; playlist?: string; captions?: { url?: string; language?: string; type?: string }[] }[] };
}
const binaryString = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const fromBase64Url = (s: string) => base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
/** At most this many servers are asked for one title. */
const MAX_SERVERS = 5;

export const cinejoy = defineProvider({
  manifest: {
    id: 'cinejoy',
    name: 'CineJoy',
    version: '1.0.0',
    description: 'Several named servers behind one API; requests are sealed and opened by a third-party service (enc-dec.app).',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb', 'title'],
    runtimes: ['server', 'edge'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['api', 'site', 'decoder'],
    followDiscovered: true,
    output: { types: ['hls'] },
    limits: { timeoutMs: 15_000, maxRequests: 20 },
    rank: 105,
    origin: 'flow from smy778/EncDecEndpoints samples (MIT)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('CineJoy: needs a TMDB id');
    const site = domain('site');
    const H = { Accept: '*/*', Origin: site, Referer: `${site}/`, 'User-Agent': BROWSER_UA };

    const listed = await getJson<{ servers?: { name?: string; status?: string }[] }>(fetch, url('api', '/servers'), { headers: H, signal }, 'CineJoy servers');
    const servers = (listed.servers ?? []).filter((s) => s?.name && s.status === 'ok').map((s) => s.name!).slice(0, MAX_SERVERS);
    if (!servers.length) throw new ProviderError('STRUCTURE_CHANGED', 'CineJoy: no server is listed as working', { step: 'servers' });

    const q = new URLSearchParams({ title: media.title, type: media.kind === 'movie' ? 'movie' : 'series', year: String(media.year ?? ''), imdb: media.ids.imdb ?? '', tmdb: media.ids.tmdb });
    const found = await gather<{ server: string; opened: Opened }>(
      servers.map((server) => async () => {
        const target = `${domain('api')}/?${q}&server=${encodeURIComponent(server)}${media.kind === 'tv' ? `&season=${media.season}&episode=${media.episode}` : ''}`;
        const sealed = await getJson<{ status?: number; result?: { data?: string; state?: string }; error?: string }>(fetch, url('decoder', `/api/enc-cinejoy?url=${encodeURIComponent(target)}`), { signal }, 'CineJoy seal');
        if (sealed.status !== 200 || !sealed.result?.data) throw new ProviderError('STRUCTURE_CHANGED', `CineJoy: the sealing service refused (${sealed.error ?? sealed.status})`, { step: 'seal' });
        const res = await fetch(url('api', '/g'), { method: 'POST', headers: H, body: binaryString(fromBase64Url(sealed.result.data)), binaryBody: true, binary: true, signal });
        if (res.status === 404) return null;
        if (!res.ok) throw new ProviderError(res.status === 403 ? 'ACCESS_DENIED' : 'HTTP', `CineJoy ${server} answered ${res.status}`, { step: 'api', status: res.status });
        const text = base64Url(Uint8Array.from(res.body, (c) => c.charCodeAt(0)));
        const opened = await getJson<{ status?: number; result?: Opened; error?: string }>(fetch, url('decoder', '/api/dec-cinejoy'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, state: sealed.result.state }), signal }, 'CineJoy open');
        // A server without the title answers with something the service cannot open: not a failure of the provider.
        return opened.status === 200 && opened.result ? { server, opened: opened.result } : null;
      }),
      signal,
    );
    const streams: RawStream[] = [];
    const captions: Caption[] = [];
    for (const { server, opened } of found) {
      for (const s of opened.data?.stream ?? []) {
        if (s?.playlist) streams.push({ url: s.playlist, type: 'hls', headers: H, note: server });
        for (const c of s?.captions ?? []) if (c?.url) captions.push({ url: c.url, label: c.language ?? 'Subtitles', lang: /^[a-z]{2}$/.test(c.language ?? '') ? c.language : undefined, format: captionFormat(c.url), headers: H });
      }
    }
    if (!streams.length) throw new NotFoundError('CineJoy: no server has this title');
    return { streams, captions };
  },
});
