/**
 * Castle: adapted from castle.js in github.com/yoruix/nuvio-providers (GPL-3.0).
 *
 * Talks to the Castle app's film API: fetch a per-session key, search by title, read the movie or
 * season details, then ask for the video. Responses are AES-128-CBC encrypted with that key (plus
 * a fixed suffix) and decrypted here.
 */
import {
  defineProvider,
  NotFoundError,
  type Caption,
  type Fetcher,
  type Media,
  type RawStream,
} from "@charcoal/provider-sdk";
import { aesCbcDecrypt, base64ToBytes } from "../crypto.js";

const PKG = "com.external.castle";
const QUERY = "channel=IndiaA&clientType=1&lang=en-US";
const KEY_SUFFIX = "T!BgJB";

const apiHeaders = (api: string) => ({
  "User-Agent": "okhttp/4.9.3",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: api,
});
const PLAYBACK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "*/*",
};
const VIDEO_BODY = {
  mode: "1",
  appMarket: "GuanWang",
  clientType: "1",
  woolUser: "false",
  apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
  androidVersion: "13",
  isNewUser: "true",
  resolution: "2",
  packageName: PKG,
};

/** A search result. movieType: 1 = a show, 2 = a film. publishTime: its release, epoch ms. */
type Row = {
  id?: number | string;
  redirectId?: number | string;
  title?: string;
  name?: string;
  movieType?: number;
  publishTime?: number;
};
type Track = {
  languageId?: number | string;
  languageName?: string;
  abbreviate?: string;
  isDefault?: boolean;
  existIndividualVideo?: boolean;
};
/** duration: seconds. */
type Episode = {
  id: number | string;
  number: number;
  duration?: number;
  tracks?: Track[];
};
type Details = {
  seasons?: { number: number; movieId?: number | string }[];
  episodes?: Episode[];
};
type Video = {
  videoUrl?: string;
  videos?: {
    url?: string;
    resolutionDescription?: string;
    resolution?: string | number;
  }[];
  subtitles?: { url?: string; title?: string; abbreviate?: string }[];
};

const dataOf = <T>(o: unknown): T => {
  const d = (o as { data?: unknown })?.data;
  return (d && typeof d === "object" ? d : o) as T;
};
const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Which search result is the title asked for, if any.
 *
 * Castle is searched by name, and a name alone picks wrong films ("Up" used to return "Up Up &
 * Up"; a sequel matched its first part). A result is accepted only when all of these hold:
 *   - its name is the title or one of its other names, word for word (never "contains");
 *   - it is the same kind of thing (a film for a film, a show for a show), where Castle says;
 *   - a film was released within a year of the one asked for; a show did not start after it.
 * Among several that pass, the one closest in year wins. The length is checked afterwards, once
 * the details are known (see sameLength).
 */
export function pickCastleRow(rows: Row[], media: Media): Row | undefined {
  const names = new Set(
    [media.title, ...(media.altTitles ?? [])].map(norm).filter(Boolean),
  );
  const wantType = media.kind === "movie" ? 2 : 1;
  const yearOf = (r: Row) =>
    r.publishTime ? new Date(r.publishTime).getUTCFullYear() : undefined;
  const passing = rows.filter((r) => {
    if (!names.has(norm(r.title || r.name || ""))) return false;
    if (r.movieType !== undefined && r.movieType !== wantType) return false;
    const year = yearOf(r);
    if (media.year && year)
      return media.kind === "movie"
        ? Math.abs(year - media.year) <= 1
        : year >= media.year - 1;
    return true;
  });
  const distance = (r: Row) =>
    media.year && yearOf(r) ? Math.abs(yearOf(r)! - media.year) : 0.5;
  return passing.sort((a, b) => distance(a) - distance(b))[0];
}

/**
 * Whether what Castle has is as long as the title should be. A film may differ by 12 % (cuts,
 * credits, frame-rate conversions); an episode by a third. Unknown on either side passes.
 */
export function sameLength(media: Media, seconds: number | undefined): boolean {
  if (!media.runtime || !seconds) return true;
  const ratio = seconds / 60 / media.runtime;
  return media.kind === "movie"
    ? ratio > 0.88 && ratio < 1.12
    : ratio > 0.67 && ratio < 1.5;
}

/** AES-128-CBC; key = base64(securityKey) + suffix, zero-padded / cut to 16 bytes; IV = key. */
async function decrypt(
  cipherB64: string,
  securityKey: string,
): Promise<string> {
  const material = [
    ...base64ToBytes(securityKey),
    ...new TextEncoder().encode(KEY_SUFFIX),
  ];
  const key = new Uint8Array(16);
  key.set(material.slice(0, 16));
  return aesCbcDecrypt(base64ToBytes(cipherB64), key, key);
}

/** `api` is the origin currently configured for the provider's "api" domain role. */
function client(fetcher: Fetcher, api: string, signal?: AbortSignal) {
  const API_HEADERS = apiHeaders(api);
  const call = async (
    key: string,
    path: string,
    init: { method?: "POST"; body?: string } = {},
  ): Promise<unknown> => {
    const res = await fetcher(api + path, {
      method: init.method ?? "GET",
      headers: {
        ...API_HEADERS,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
      signal,
    });
    if (!res.ok) throw new Error(`Castle API returned ${res.status}`);
    let cipher = res.body.trim();
    try {
      const json = JSON.parse(cipher) as { data?: unknown };
      if (typeof json.data === "string") cipher = json.data.trim();
    } catch {
      /* raw cipher text */
    }
    return JSON.parse(await decrypt(cipher, key));
  };

  return {
    async securityKey(): Promise<string> {
      const res = await fetcher(
        `${api}/v0.1/system/getSecurityKey/1?${QUERY}`,
        { headers: API_HEADERS, signal },
      );
      const json = JSON.parse(res.body) as { code?: number; data?: string };
      if (json.code !== 200 || !json.data)
        throw new Error("Castle: no security key");
      return json.data;
    },
    /** The result that is this title (see pickCastleRow); null rather than a near miss. */
    async findId(key: string, media: Media): Promise<string | null> {
      const keyword = media.year ? `${media.title} ${media.year}` : media.title;
      const params = new URLSearchParams({
        channel: "IndiaA",
        clientType: "1",
        keyword,
        lang: "en-US",
        mode: "1",
        packageName: PKG,
        page: "1",
        size: "30",
      });
      const rows =
        dataOf<{ rows?: Row[] }>(
          await call(key, `/film-api/v1.1.0/movie/searchByKeyword?${params}`),
        ).rows ?? [];
      const hit = pickCastleRow(rows, media);
      const id = hit?.id ?? hit?.redirectId;
      return id ? String(id) : null;
    },
    details: (key: string, movieId: string) =>
      call(
        key,
        `/film-api/v1.9.9/movie?${QUERY}&movieId=${movieId}&packageName=${PKG}`,
      ).then(dataOf<Details>),
    video: (
      key: string,
      movieId: string,
      episodeId: number | string,
      languageId?: number | string,
    ) =>
      call(
        key,
        `/film-api/v2.0.1/movie/getVideo2?clientType=1&packageName=${PKG}&channel=IndiaA&lang=en-US`,
        {
          method: "POST",
          body: JSON.stringify({
            ...VIDEO_BODY,
            movieId,
            episodeId: String(episodeId),
            ...(languageId ? { languageId: String(languageId) } : {}),
          }),
        },
      ).then(dataOf<Video>),
  };
}

export const castle = defineProvider({
  manifest: {
    id: "castle",
    name: "Castle",
    version: "1.2.0",
    description:
      "The Castle app’s film API: HLS up to 1080p, several audio languages.",
    kinds: ["movie", "tv"],
    languages: ["en", "hi", "ta", "te", "ml", "kn"],
    lookup: ["title"],
    runtimes: ["server", "edge", "extension", "app"],
    requires: { features: ["forbidden-headers"] },
    domainRoles: ["api"],
    output: { types: ["hls", "mp4"] },
    rank: 200,
    // Its default and "Original" tracks are a Hindi dub surprisingly often; a track it names English is.
    dubRisk: 0.45,
    license: "GPL-3.0",
    origin: "nuvio-providers (castle.js)",
  },
  async getSources(media, { fetch, signal, domain }) {
    const api = client(fetch, domain("api"), signal);
    const key = await api.securityKey();
    let movieId = await api.findId(key, media);
    if (!movieId) throw new NotFoundError("Castle: no match for this title");

    let details = await api.details(key, movieId);
    if (media.kind === "tv") {
      // Each season is its own "movie" on Castle.
      const season = details.seasons?.find((s) => s.number === media.season);
      if (season?.movieId && String(season.movieId) !== movieId) {
        movieId = String(season.movieId);
        details = await api.details(key, movieId);
      }
    }
    const episodes = details.episodes ?? [];
    const episode =
      media.kind === "tv"
        ? episodes.find((e) => e.number === media.episode)
        : episodes[0];
    if (!episode) throw new NotFoundError("Castle: episode not found");
    // The right name and year, but another cut or another film altogether: better nothing than the wrong one.
    if (!sameLength(media, episode.duration))
      throw new NotFoundError(
        `Castle: its match runs ${Math.round((episode.duration ?? 0) / 60)} min, the title ${media.runtime} min`,
      );

    const streams: RawStream[] = [];
    const captions: Caption[] = [];
    const add = (video: Video, language: string, languageCode?: string) => {
      for (const entry of video.videos?.length ? video.videos : [{}]) {
        // Each quality may carry its own URL; otherwise they share the top-level one.
        const url = entry.url || video.videoUrl;
        if (!url || streams.some((s) => s.url === url)) continue; // same stream under another label
        // The URL's own resolution folder (".../720/index.m3u8") beats the label, which can be wrong
        // when several labels share one URL.
        const quality =
          url.match(/\/(2160|1440|1080|720|480|360)\//)?.[1] ??
          String(entry.resolutionDescription ?? entry.resolution ?? "720")
            .replace(/^(SD|HD|FHD|UHD)\s+/i, "")
            .replace(/p$/i, "");
        streams.push({
          url,
          type: url.includes(".mp4") ? "mp4" : "hls",
          quality,
          headers: PLAYBACK_HEADERS,
          language,
          languageCode,
        });
      }
      for (const s of video.subtitles ?? []) {
        if (!s.url || captions.some((c) => c.url === s.url)) continue;
        captions.push({
          url: s.url,
          label: s.title || s.abbreviate || "Unknown",
          format: /\.srt(\?|$)/i.test(s.url) ? "srt" : "vtt",
          headers: PLAYBACK_HEADERS,
        });
      }
    };

    // Ask for every audio language Castle lists: some titles default to a dub (often Hindi), and a
    // language may come as its own stream even when Castle says it doesn't.
    const tracks = (episode.tracks ?? []).filter((t) => t.languageId);
    const name = (t: Track) =>
      /^ost$/i.test(t.languageName ?? "")
        ? "Original"
        : t.languageName || "Unknown";
    const byLanguage = await Promise.all(
      tracks.map((t) =>
        api.video(key, movieId, episode.id, t.languageId).catch(() => null),
      ),
    );
    byLanguage.forEach(
      (video, i) =>
        video &&
        add(
          video,
          name(tracks[i]),
          /^ost$/i.test(tracks[i].languageName ?? "")
            ? undefined
            : tracks[i].abbreviate?.toLowerCase(),
        ),
    );
    if (!streams.length) {
      const fallback = tracks.find((t) => t.isDefault);
      add(
        await api.video(key, movieId, episode.id),
        fallback ? name(fallback) : "Original",
        fallback?.abbreviate?.toLowerCase(),
      );
    }
    if (!streams.length) throw new NotFoundError("Castle: no video");

    streams.sort(
      (a, b) =>
        (parseInt(b.quality ?? "") || 0) - (parseInt(a.quality ?? "") || 0),
    );
    return { streams, captions };
  },
});
