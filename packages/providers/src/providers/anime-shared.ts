/**
 * What the anime providers share. They were adapted from Seanime-contributions/Seanime-Providers
 * (MIT, https://github.com/Seanime-contributions/Seanime-Providers); the helpers here replace what
 * that project's host application supplies (a jQuery-like document, a cookie jar, a sub/dub server
 * list) with the SDK's pieces.
 */
import { bestTitleMatch, extract, NotFoundError, ProviderError, type AnimeMedia, type Caption, type CaptionFormat, type Fetcher, type Media, type RawStream, type TitleCandidate } from '@charcoal/provider-sdk';
import { BROWSER_UA } from './shared.js';

export type Audio = 'sub' | 'dub';

/** Headers of a page navigation on `site`. */
export const pageHeaders = (site: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${site.replace(/\/$/, '')}/`,
  ...extra,
});

/** The anime request, or "not here" for anything else. */
export function animeOnly(media: Media, name: string): AnimeMedia {
  if (media.kind !== 'anime') throw new NotFoundError(`${name}: anime only`);
  if (!Number.isInteger(media.episode) || media.episode < 1) throw new NotFoundError(`${name}: no episode number`);
  return media;
}

/** The audio versions to look for: the one asked for, or both when the request does not say. */
export const wantedAudio = (media: AnimeMedia, supported: Audio[] = ['sub', 'dub']): Audio[] => (media.audio ? supported.filter((a) => a === media.audio) : supported);

/**
 * Language fields of a stream. A subbed episode is Japanese audio; when the site ships the
 * translation inside the picture, `hardsub` says so. A dub is English audio.
 */
export const audioFields = (audio: Audio, hardsub = false): Pick<RawStream, 'language' | 'languageCode' | 'hardsub' | 'audio'> =>
  audio === 'dub' ? { language: 'English', languageCode: 'en', audio: [{ lang: 'en', label: 'English', dub: true }] } : { language: 'Japanese', languageCode: 'ja', ...(hardsub ? { hardsub: 'en' } : {}) };

/** The names a title is searched by, most useful first, without duplicates. */
export const searchNames = (media: AnimeMedia, limit = 3): string[] => [...new Set([media.title, ...(media.altTitles ?? [])].map((t) => t?.trim()).filter((t): t is string => !!t))].slice(0, limit);

/**
 * Candidates in the order they are worth trying: the matcher's best first, then the others that
 * still pass it. A site that lists "Title", "Title Season 2" and "Title (Dub)" keeps its order.
 */
export function rankMatches<T extends TitleCandidate>(candidates: T[], media: AnimeMedia): T[] {
  const left = [...candidates];
  const ranked: T[] = [];
  for (;;) {
    const best = bestTitleMatch(left, media);
    if (!best) return ranked;
    ranked.push(best.item);
    left.splice(left.indexOf(best.item), 1);
  }
}

const FORMATS: CaptionFormat[] = ['vtt', 'srt', 'ass', 'ssa', 'ttml'];

/** A caption format the platform can show, from a declared format or the address; undefined for picture subtitles and the like. */
export function captionFormatOf(url: string, declared?: string): CaptionFormat | undefined {
  const d = (declared ?? '').toLowerCase().replace(/^.*\//, '');
  if (d) return FORMATS.find((f) => f === d);
  const path = url.toLowerCase().split(/[?#]/)[0];
  return FORMATS.find((f) => path.endsWith(`.${f}`)) ?? 'vtt';
}

/** Captions without repeats of the same address or of the same label (sites list one file under several mirrors). */
export function uniqueCaptions(captions: Caption[]): Caption[] {
  const urls = new Set<string>();
  const labels = new Set<string>();
  return captions.filter((c) => {
    if (urls.has(c.url) || labels.has(c.label)) return false;
    urls.add(c.url);
    labels.add(c.label);
    return true;
  });
}

const ISO3: Record<string, string> = { jpn: 'ja', jap: 'ja', eng: 'en', spa: 'es', por: 'pt', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it' };

/** What a master playlist says about a stream: its heights, best first, and its audio tracks, default first. */
export interface PlaylistInfo {
  heights: number[];
  audio: { lang: string; label?: string }[];
}
type Reader = { fetch: Fetcher; signal: AbortSignal; log(event: string, data?: Record<string, unknown>): void };

/**
 * Reads a stream's playlist (text, never media). Undefined when it could not be read or is not a
 * playlist: whether a stream plays is the validator's question, not a reason to withhold it. Only
 * a cancelled run stops here.
 */
export async function readPlaylist(stream: RawStream, ctx: Reader): Promise<PlaylistInfo | undefined> {
  if (stream.type !== 'hls') return undefined;
  try {
    const res = await ctx.fetch(stream.url, { headers: stream.headers, signal: ctx.signal, maxBytes: 262_144 });
    if (!res.ok) {
      ctx.log('playlist.unread', { status: res.status });
      return undefined;
    }
    const playlist = extract.parseHls(res.body, res.url || stream.url);
    const heights = [...new Set(playlist.variants.map((v) => v.height).filter((h): h is number => !!h))].sort((a, b) => b - a);
    const audio = playlist.renditions
      .filter((r) => r.type === 'AUDIO' && r.language)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((r) => ({ lang: ISO3[r.language!.toLowerCase()] ?? r.language!.toLowerCase().slice(0, 2), label: r.name }))
      .filter((a, i, all) => all.findIndex((b) => b.lang === a.lang) === i);
    return { heights, audio };
  } catch (e) {
    if (e instanceof ProviderError && e.code === 'CANCELLED') throw e;
    ctx.log('playlist.unread', { reason: e instanceof ProviderError ? e.code : 'not a playlist' });
    return undefined;
  }
}

/** A stream labelled with what its playlist says: top quality, the quality ladder, and its audio tracks when there are several. */
export function withPlaylistInfo(stream: RawStream, info: PlaylistInfo | undefined): RawStream {
  if (!info) return stream;
  const { language: _l, languageCode: _c, ...rest } = stream;
  void _l, void _c;
  return {
    ...(info.audio.length > 1 ? rest : stream),
    ...(info.heights.length ? { quality: String(info.heights[0]), video: { ...stream.video, height: info.heights[0] }, levels: info.heights.map((h) => ({ quality: String(h) })) } : {}),
    // Several audio tracks in one playlist: Japanese is the original, anything else a dub.
    ...(info.audio.length > 1 ? { audio: info.audio.map((a) => ({ lang: a.lang, label: a.label, dub: a.lang !== 'ja' })) } : {}),
  };
}

export const labelFromPlaylist = async (stream: RawStream, ctx: Reader): Promise<RawStream> => withPlaylistInfo(stream, await readPlaylist(stream, ctx));
