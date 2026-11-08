/**
 * VidApi: one JSON call by TMDB id. Its video host refuses data-centre addresses (Railway,
 * Cloudflare), so its streams only play from a home connection: through the browser extension,
 * or a server running on your own computer.
 */
import { getJson } from '../fetch.js';
import { NotFoundError, type Caption, type Provider } from '../types.js';

const API = 'https://streamdata.vaplayer.ru/api.php';
const ORIGIN = 'https://brightpathsignals.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Referer: `${ORIGIN}/`,
  Origin: ORIGIN,
  Accept: '*/*',
};

interface Response {
  status_code: string;
  data?: { file_name?: string; stream_urls?: string[] };
  default_subs?: { lang: string; code: string; url: string }[];
}

const quality = (name = '') => (/2160|4k/i.test(name) ? '2160' : /1080/.test(name) ? '1080' : /720/.test(name) ? '720' : /480/.test(name) ? '480' : 'auto');
const FORMATS = ['vtt', 'srt', 'ass', 'ssa', 'ttml'] as const;

export const vidapi: Provider = {
  id: 'vidapi',
  name: 'VidApi',
  rank: 150,
  supports: ['movie', 'tv'],
  async scrape(media, { fetch, signal }) {
    const url = new URL(API);
    url.searchParams.set('tmdb', media.tmdbId);
    url.searchParams.set('type', media.type);
    if (media.type === 'tv') {
      url.searchParams.set('season', String(media.season));
      url.searchParams.set('episode', String(media.episode));
    }
    const json = await getJson<Response>(fetch, url.toString(), { headers: HEADERS, signal });
    const urls = json.data?.stream_urls ?? [];
    if (json.status_code !== '200' || !urls.length) throw new NotFoundError(`VidApi: status ${json.status_code}`);
    const captions: Caption[] = (json.default_subs ?? []).map((s) => {
      const ext = s.url.split('?')[0].split('.').pop()?.toLowerCase() as (typeof FORMATS)[number];
      return { url: s.url, label: s.lang, format: FORMATS.includes(ext) ? ext : 'srt' };
    });
    return {
      streams: urls.map((u) => ({
        url: u,
        type: /\.(mp4|mkv)(\?|$)/i.test(u) ? (/\.mkv/i.test(u) ? 'mkv' : 'mp4') : 'hls',
        quality: quality(json.data?.file_name),
        headers: HEADERS,
      })),
      captions,
    };
  },
};
