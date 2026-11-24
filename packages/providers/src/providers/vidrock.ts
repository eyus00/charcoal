/**
 * VidRock: the title id is AES-encrypted into the API path; the API answers with a table of named
 * servers, each a playlist or a second lookup that lists files by resolution.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, getJson, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { base64Url, gather, utf8, xhrHeaders } from './shared.js';

const PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';
const PLAYER_REFERER = 'https://lok-lok.cc/';

/** AES-CBC with the passphrase as key and its first 16 bytes as IV, URL-safe base64 without padding. */
export async function encryptItemId(itemId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(PASSPHRASE), { name: 'AES-CBC' }, false, ['encrypt']);
  return base64Url(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: utf8(PASSPHRASE.slice(0, 16)) }, key, utf8(itemId)));
}

interface Server {
  url?: string;
  language?: string;
}

export const vidrock = defineProvider({
  manifest: {
    id: 'vidrock',
    name: 'VidRock',
    version: '2.0.0',
    description: 'An encrypted title id gives a table of servers; each is a playlist or a list of files by resolution.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site', 'subs'],
    extraHosts: ['*.vdrk.site', 'proxy.vidrock.store'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 12_000, maxRequests: 24 },
    rank: 110,
    origin: 'apps/server/src/providers/vidrock (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('VidRock: needs a TMDB id');
    const site = domain('site');
    const H = xhrHeaders(site);
    const itemId = media.kind === 'tv' ? `${media.ids.tmdb}_${media.season}_${media.episode}` : media.ids.tmdb;
    const servers = await getJson<Record<string, Server>>(fetch, url('site', `/api/${media.kind}/${await encryptItemId(itemId)}`), { headers: H, signal }, 'VidRock');
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new ProviderError('STRUCTURE_CHANGED', 'VidRock: the API no longer returns a table of servers', { step: 'servers' });
    const live = Object.values(servers).filter((s): s is Required<Pick<Server, 'url'>> & Server => typeof s?.url === 'string' && s.url.startsWith('http'));
    if (!live.length) throw new NotFoundError('VidRock: every server came back empty');

    const lists = await gather<RawStream[]>(
      live.map((s) => async () => {
        // One CDN answers with a list of files per resolution instead of a playlist.
        if (s.url.includes('hls2.vdrk.site')) {
          const files = await getJson<{ url?: string; resolution?: number | string }[]>(fetch, s.url, { headers: H, signal }, 'VidRock files');
          if (!Array.isArray(files)) return null;
          return files
            .filter((f) => typeof f?.url === 'string')
            .map((f): RawStream => {
              // Their own relay prefix wraps the real address.
              const direct = f.url!.startsWith('https://proxy.vidrock.store/') ? decodeURIComponent(f.url!.slice('https://proxy.vidrock.store/'.length).replace(/^\//, '')) : f.url!;
              return { url: direct, type: direct.includes('.mp4') ? 'mp4' : 'hls', quality: f.resolution ? String(f.resolution) : undefined, language: s.language, headers: { ...H, Referer: PLAYER_REFERER, Origin: PLAYER_REFERER.replace(/\/$/, '') } };
            });
        }
        return [{ url: s.url, type: 'hls', quality: '1080', language: s.language, headers: s.url.includes('67streams') ? { Referer: `${site}/`, Origin: site } : H }];
      }),
      signal,
    );
    const streams = lists.flat();
    if (!streams.length) throw new NotFoundError('VidRock: no playable server');

    // Subtitles come from a separate host; their absence is not a failure.
    const captions: Caption[] = [];
    try {
      const subUrl = url('subs', media.kind === 'tv' ? `/v2/tv/${media.ids.tmdb}/${media.season}/${media.episode}` : `/v2/movie/${media.ids.tmdb}`);
      const res = await fetch(subUrl, { headers: H, signal });
      if (res.status === 200) for (const sub of JSON.parse(res.body) as { label?: string; file?: string }[]) if (sub?.file) captions.push({ url: sub.file, label: sub.label ?? 'Subtitles', format: 'vtt', headers: { Referer: subUrl } });
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'CANCELLED') throw e;
    }
    return { streams, captions };
  },
});
