/**
 * Castle: adapted from nuvio-providers (GPL-3.0; see apps/server/vendor/nuvio-providers/LICENSE).
 *
 * Talks to the Castle app's film API: fetch a per-session key, search by title, read the movie or
 * season details, then ask for the video. Responses are AES-128-CBC encrypted with that key (plus
 * a fixed suffix) and decrypted here.
 */
import { aesCbcDecrypt, base64ToBytes } from '../crypto.js';
import { NotFoundError, type Caption, type Fetcher, type Media, type Provider, type Stream } from '../types.js';

const API = 'https://api.hlowb.com';
const PKG = 'com.external.castle';
const QUERY = 'channel=IndiaA&clientType=1&lang=en-US';
const KEY_SUFFIX = 'T!BgJB';

const API_HEADERS = {
  'User-Agent': 'okhttp/4.9.3',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: API,
};
const PLAYBACK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept: '*/*',
};
const VIDEO_BODY = {
  mode: '1',
  appMarket: 'GuanWang',
  clientType: '1',
  woolUser: 'false',
  apkSignKey: 'ED0955EB04E67A1D9F3305B95454FED485261475',
  androidVersion: '13',
  isNewUser: 'true',
  resolution: '2',
  packageName: PKG,
};

type Row = { id?: number | string; redirectId?: number | string; title?: string; name?: string };
type Track = { languageId?: number | string; languageName?: string; abbreviate?: string; isDefault?: boolean; existIndividualVideo?: boolean };
type Episode = { id: number | string; number: number; tracks?: Track[] };
type Details = { seasons?: { number: number; movieId?: number | string }[]; episodes?: Episode[] };
type Video = {
  videoUrl?: string;
  videos?: { url?: string; resolutionDescription?: string; resolution?: string | number }[];
  subtitles?: { url?: string; title?: string; abbreviate?: string }[];
};

const dataOf = <T>(o: unknown): T => {
  const d = (o as { data?: unknown })?.data;
  return (d && typeof d === 'object' ? d : o) as T;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** AES-128-CBC; key = base64(securityKey) + suffix, zero-padded / cut to 16 bytes; IV = key. */
async function decrypt(cipherB64: string, securityKey: string): Promise<string> {
  const material = [...base64ToBytes(securityKey), ...new TextEncoder().encode(KEY_SUFFIX)];
  const key = new Uint8Array(16);
  key.set(material.slice(0, 16));
  return aesCbcDecrypt(base64ToBytes(cipherB64), key, key);
}

function client(fetcher: Fetcher, signal?: AbortSignal) {
  const call = async (key: string, path: string, init: { method?: 'POST'; body?: string } = {}): Promise<unknown> => {
    const res = await fetcher(API + path, {
      method: init.method ?? 'GET',
      headers: { ...API_HEADERS, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body,
      signal,
    });
    if (!res.ok) throw new Error(`Castle API returned ${res.status}`);
    let cipher = res.body.trim();
    try {
      const json = JSON.parse(cipher) as { data?: unknown };
      if (typeof json.data === 'string') cipher = json.data.trim();
    } catch {
      /* raw cipher text */
    }
    return JSON.parse(await decrypt(cipher, key));
  };

  return {
    async securityKey(): Promise<string> {
      const res = await fetcher(`${API}/v0.1/system/getSecurityKey/1?${QUERY}`, { headers: API_HEADERS, signal });
      const json = JSON.parse(res.body) as { code?: number; data?: string };
      if (json.code !== 200 || !json.data) throw new Error('Castle: no security key');
      return json.data;
    },
    /** Match on the title; never fall back to an unrelated first result. */
    async findId(key: string, media: Media): Promise<string | null> {
      const keyword = media.year ? `${media.title} ${media.year}` : media.title;
      const params = new URLSearchParams({ channel: 'IndiaA', clientType: '1', keyword, lang: 'en-US', mode: '1', packageName: PKG, page: '1', size: '30' });
      const rows = dataOf<{ rows?: Row[] }>(await call(key, `/film-api/v1.1.0/movie/searchByKeyword?${params}`)).rows ?? [];
      const want = norm(media.title);
      const hit =
        rows.find((r) => norm(r.title || r.name || '') === want) ??
        rows.find((r) => {
          const t = norm(r.title || r.name || '');
          return t && (t.includes(want) || want.includes(t));
        });
      const id = hit?.id ?? hit?.redirectId;
      return id ? String(id) : null;
    },
    details: (key: string, movieId: string) => call(key, `/film-api/v1.9.9/movie?${QUERY}&movieId=${movieId}&packageName=${PKG}`).then(dataOf<Details>),
    video: (key: string, movieId: string, episodeId: number | string, languageId?: number | string) =>
      call(key, `/film-api/v2.0.1/movie/getVideo2?clientType=1&packageName=${PKG}&channel=IndiaA&lang=en-US`, {
        method: 'POST',
        body: JSON.stringify({ ...VIDEO_BODY, movieId, episodeId: String(episodeId), ...(languageId ? { languageId: String(languageId) } : {}) }),
      }).then(dataOf<Video>),
  };
}

export const castle: Provider = {
  id: 'castle',
  name: 'Castle',
  rank: 200,
  supports: ['movie', 'tv'],
  async scrape(media, { fetch, signal }) {
    const api = client(fetch, signal);
    const key = await api.securityKey();
    let movieId = await api.findId(key, media);
    if (!movieId) throw new NotFoundError('Castle: no match for this title');

    let details = await api.details(key, movieId);
    if (media.type === 'tv') {
      // Each season is its own "movie" on Castle.
      const season = details.seasons?.find((s) => s.number === media.season);
      if (season?.movieId && String(season.movieId) !== movieId) {
        movieId = String(season.movieId);
        details = await api.details(key, movieId);
      }
    }
    const episodes = details.episodes ?? [];
    const episode = media.type === 'tv' ? episodes.find((e) => e.number === media.episode) : episodes[0];
    if (!episode) throw new NotFoundError('Castle: episode not found');

    const streams: Stream[] = [];
    const captions: Caption[] = [];
    const add = (video: Video, language: string, languageCode?: string) => {
      for (const entry of video.videos?.length ? video.videos : [{}]) {
        // Each quality may carry its own URL; otherwise they share the top-level one.
        const url = entry.url || video.videoUrl;
        if (!url || streams.some((s) => s.url === url)) continue; // same stream under another label
        // The URL's own resolution folder (".../720/index.m3u8") beats the label, which can be wrong
        // when several labels share one URL.
        const quality = url.match(/\/(2160|1440|1080|720|480|360)\//)?.[1] ??
          String(entry.resolutionDescription ?? entry.resolution ?? '720').replace(/^(SD|HD|FHD|UHD)\s+/i, '').replace(/p$/i, '');
        streams.push({ url, type: url.includes('.mp4') ? 'mp4' : 'hls', quality, headers: PLAYBACK_HEADERS, language, languageCode });
      }
      for (const s of video.subtitles ?? []) {
        if (!s.url || captions.some((c) => c.url === s.url)) continue;
        captions.push({ url: s.url, label: s.title || s.abbreviate || 'Unknown', format: /\.srt(\?|$)/i.test(s.url) ? 'srt' : 'vtt', headers: PLAYBACK_HEADERS });
      }
    };

    // Ask for every audio language Castle lists: some titles default to a dub (often Hindi), and a
    // language may come as its own stream even when Castle says it doesn't.
    const tracks = (episode.tracks ?? []).filter((t) => t.languageId);
    const name = (t: Track) => (/^ost$/i.test(t.languageName ?? '') ? 'Original' : t.languageName || 'Unknown');
    const byLanguage = await Promise.all(tracks.map((t) => api.video(key, movieId, episode.id, t.languageId).catch(() => null)));
    byLanguage.forEach((video, i) => video && add(video, name(tracks[i]), /^ost$/i.test(tracks[i].languageName ?? '') ? undefined : tracks[i].abbreviate?.toLowerCase()));
    if (!streams.length) {
      const fallback = tracks.find((t) => t.isDefault);
      add(await api.video(key, movieId, episode.id), fallback ? name(fallback) : 'Original', fallback?.abbreviate?.toLowerCase());
    }
    if (!streams.length) throw new NotFoundError('Castle: no video');

    streams.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    return { streams, captions };
  },
};
