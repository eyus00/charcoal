/**
 * VixSrc: an API call gives an embed page; the page holds a token, its expiry and the playlist URL.
 * Its API refuses data-centre addresses (Railway), so it finds streams only from a home connection:
 * a server on your own computer, or the browser extension. Its segments are AES-encrypted and
 * labelled text/html by the host.
 */
import { defineProvider, expectOk, getJson, NotFoundError, ProviderError } from '@charcoal/provider-sdk';

const headersFor = (site: string) => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: site,
  Origin: site,
});

export const vixsrc = defineProvider({
  manifest: {
    id: 'vixsrc',
    name: 'VixSrc',
    version: '1.1.0',
    description: 'An API call gives an embed page; the page holds a token, its expiry and the playlist URL.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    // Its API refuses data-centre addresses, and its links are bound to the address that asked.
    requires: { features: ['forbidden-headers'], egress: 'user' },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls'] },
    rank: 160,
  },
  async getSources(media, { fetch, signal, url, domain }) {
    const HEADERS = headersFor(domain('site'));
    const pageUrl = media.kind === 'movie' ? url('site', `/api/movie/${media.ids.tmdb}`) : media.kind === 'tv' ? url('site', `/api/tv/${media.ids.tmdb}/${media.season}/${media.episode}`) : undefined;
    if (!pageUrl || !media.ids.tmdb) throw new NotFoundError('VixSrc: needs a TMDB id');
    // A 404 from the API means they don't have it (getJson reports it as NOT_FOUND).
    const api = await getJson<{ src?: string }>(fetch, pageUrl, { headers: HEADERS, signal }, 'VixSrc');
    if (!api.src) throw new NotFoundError('VixSrc: not available');

    const page = expectOk(await fetch(url('site', api.src), { headers: HEADERS, signal }), 'VixSrc embed page');
    const token = page.body.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
    const expires = page.body.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
    const playlist = page.body.match(/url\s*:\s*["']([^"']+)/)?.[1];
    if (!token || !expires || !playlist) throw new ProviderError('SELECTOR_MISSING', 'VixSrc: no token in the embed page', { step: 'token/expires/url' });
    const expiresAt = Number(expires) * 1000;
    if (expiresAt - 60_000 < Date.now()) throw new ProviderError('EXPIRED', 'VixSrc: token already expired');

    const master = `${playlist}${playlist.includes('?') ? '&' : '?'}token=${token}&expires=${expires}&h=1`;
    const headers = { ...HEADERS, Referer: pageUrl };
    // Read the playlist once for its best quality (and to make sure it's real).
    const res = expectOk(await fetch(master, { headers, signal }), 'VixSrc playlist');
    if (!res.body.startsWith('#EXTM3U')) throw new ProviderError('INVALID_RESULT', 'VixSrc: the playlist address did not return a playlist');
    const heights = [...res.body.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1]));
    if (!heights.length) throw new NotFoundError('VixSrc: empty playlist');
    return { streams: [{ url: master, type: 'hls', quality: String(Math.max(...heights)), headers, expiresAt, ipBound: true }], captions: [] };
  },
});
