/**
 * VixSrc: an API call gives an embed page; the page holds a token, its expiry and the playlist URL.
 * Its API refuses data-centre addresses (Railway), so it finds streams only from a home connection:
 * a server on your own computer, or the browser extension. Its segments are AES-encrypted and
 * labelled text/html by the host.
 */
import { getJson } from '../fetch.js';
import { NotFoundError, type Provider } from '../types.js';

const BASE = 'https://vixsrc.to';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: BASE,
  Origin: BASE,
};

export const vixsrc: Provider = {
  id: 'vixsrc',
  name: 'VixSrc',
  rank: 160,
  supports: ['movie', 'tv'],
  async scrape(media, { fetch, signal }) {
    const pageUrl = media.type === 'movie' ? `${BASE}/api/movie/${media.tmdbId}` : `${BASE}/api/tv/${media.tmdbId}/${media.season}/${media.episode}`;
    let api: { src?: string };
    try {
      api = await getJson<{ src?: string }>(fetch, pageUrl, { headers: HEADERS, signal });
    } catch (e) {
      // 404 = they don't have it.
      if (/HTTP 404/.test((e as Error).message)) throw new NotFoundError('VixSrc: not available');
      throw e;
    }
    if (!api.src) throw new NotFoundError('VixSrc: not available');

    const page = await fetch(BASE + api.src, { headers: HEADERS, signal });
    if (!page.ok) throw new Error(`VixSrc: embed page returned ${page.status}`);
    const token = page.body.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
    const expires = page.body.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
    const playlist = page.body.match(/url\s*:\s*["']([^"']+)/)?.[1];
    if (!token || !expires || !playlist) throw new Error('VixSrc: no token in the embed page');
    if (Number(expires) * 1000 - 60_000 < Date.now()) throw new Error('VixSrc: token already expired');

    const master = `${playlist}${playlist.includes('?') ? '&' : '?'}token=${token}&expires=${expires}&h=1`;
    const headers = { ...HEADERS, Referer: pageUrl };
    // Read the playlist once for its best quality (and to make sure it's real).
    const res = await fetch(master, { headers, signal });
    if (!res.ok || !res.body.startsWith('#EXTM3U')) throw new Error(`VixSrc: playlist returned ${res.status}`);
    const heights = [...res.body.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1]));
    if (!heights.length) throw new NotFoundError('VixSrc: empty playlist');
    return { streams: [{ url: master, type: 'hls', quality: String(Math.max(...heights)), headers }], captions: [] };
  },
};
