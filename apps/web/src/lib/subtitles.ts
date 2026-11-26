import { useQuery } from '@tanstack/react-query';
import { q, type MediaType } from './tmdb';
import { getState } from './store';
import { languageName } from './servers';

/**
 * Subtitles from OpenSubtitles for any title, whatever the source carries: through the public
 * OpenSubtitles addon Stremio runs (no key; UTF-8 SRT; open to any site). Looked up by IMDb id, a
 * show's id with the season and episode for an episode.
 */
export interface FoundSubtitle {
  url: string;
  /** ISO 639-1 where there is one ("pt-BR" for OpenSubtitles' "pob"). */
  lang: string;
  label: string;
  /** The release it was timed against, e.g. "Interstellar.2014.1080p.BluRay.x264-SPARKS". */
  release?: string;
  /** Captions for the deaf and hard of hearing (sound descriptions). */
  hearingImpaired: boolean;
}

const BASE = 'https://opensubtitles-v3.strem.io';
/** Per language, the few best: a long list of near-identical files helps nobody. */
const PER_LANGUAGE = 3;

/** OpenSubtitles' three-letter codes; most are ISO 639-2/B, a few its own. */
const CODES: Record<string, string> = {
  eng: 'en', spa: 'es', spn: 'es', pob: 'pt-BR', por: 'pt', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', dut: 'nl', nld: 'nl', pol: 'pl', rus: 'ru', tur: 'tr',
  ara: 'ar', heb: 'he', gre: 'el', ell: 'el', cze: 'cs', ces: 'cs', slo: 'sk', slk: 'sk', rum: 'ro', ron: 'ro', hun: 'hu', bul: 'bg', hrv: 'hr', scc: 'sr', srp: 'sr', slv: 'sl',
  swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', ice: 'is', isl: 'is', est: 'et', lav: 'lv', lit: 'lt', ukr: 'uk', per: 'fa', fas: 'fa', hin: 'hi', ben: 'bn', tam: 'ta', tel: 'te',
  mal: 'ml', kan: 'kn', urd: 'ur', ind: 'id', may: 'ms', msa: 'ms', tha: 'th', vie: 'vi', chi: 'zh', zho: 'zh', zht: 'zh-TW', jpn: 'ja', kor: 'ko', alb: 'sq', sqi: 'sq',
  mac: 'mk', mkd: 'mk', bos: 'bs', cat: 'ca', baq: 'eu', eus: 'eu', glg: 'gl', geo: 'ka', kat: 'ka', arm: 'hy', hye: 'hy', aze: 'az', kaz: 'kk', tgl: 'tl', fil: 'tl',
};

const nameOf = (lang: string) => {
  if (lang === 'pt-BR') return 'Portuguese (Brazil)';
  if (lang === 'zh-TW') return 'Chinese (Traditional)';
  return languageName(lang) || lang;
};

interface Answer {
  subtitles?: { id: string; url: string; lang: string; subtitleFileName?: string; movieReleaseName?: string; m?: string }[];
}

/** 1 for a retail release (Blu-ray, web), -1 for a cinema recording (CAM, telesync, screener), else 0. */
function releaseFit(name: string): number {
  if (/(^|[^a-z])(cam|camrip|hdcam|ts|hdts|telesync|tc|telecine|scr|screener|dvdscr|hc)([^a-z]|$)/i.test(name)) return -1;
  if (/blu-?ray|bdrip|brrip|web-?dl|webrip|[^a-z]web[^a-z]|amzn|nf[^a-z]|dsnp|hmax|atvp|remux|hdtv|dvdrip/i.test(name)) return 1;
  return 0;
}

export async function findSubtitles(imdb: string, episode: { season: number; episode: number } | undefined, signal?: AbortSignal): Promise<FoundSubtitle[]> {
  const path = episode ? `series/${imdb}:${episode.season}:${episode.episode}` : `movie/${imdb}`;
  const res = await fetch(`${BASE}/subtitles/${path}.json`, { signal });
  if (!res.ok) throw new Error(`OpenSubtitles answered ${res.status}`);
  const body = (await res.json()) as Answer;
  const out: FoundSubtitle[] = [];
  const count = new Map<string, number>();
  // The addon lists the most downloaded first. Within that, files timed to a retail release (which
  // the streams nearly always are) go ahead of ones timed to a cinema recording, which drift.
  const list = (body.subtitles ?? []).map((s, i) => ({ s, i, fit: releaseFit(`${s.movieReleaseName ?? ''} ${s.subtitleFileName ?? ''}`) }));
  list.sort((a, b) => b.fit - a.fit || a.i - b.i);
  for (const { s } of list) {
    const lang = CODES[s.lang] ?? s.lang;
    if (!s.url || !lang) continue;
    const n = count.get(lang) ?? 0;
    if (n >= PER_LANGUAGE) continue;
    count.set(lang, n + 1);
    const file = s.subtitleFileName ?? '';
    out.push({ url: s.url, lang, label: nameOf(lang), release: s.movieReleaseName || file.replace(/\.(srt|vtt|sub)$/i, '') || undefined, hearingImpaired: /[._ -](hi|sdh|cc)[._ -]/i.test(file) });
  }
  return out;
}

/** The title's IMDb id (from TMDB, usually already cached by the page), then its subtitles. */
export function useFoundSubtitles(media: { type: MediaType; id: number; season?: number; episode?: number }, enabled = true) {
  const details = useQuery({ ...q.details(media.type, media.id), enabled: enabled && media.id > 0 });
  const imdb = details.data?.imdb_id || details.data?.external_ids?.imdb_id || undefined;
  const ep = media.type === 'tv' ? { season: media.season ?? 1, episode: media.episode ?? 1 } : undefined;
  return useQuery({
    queryKey: ['opensubtitles', imdb, ep?.season, ep?.episode],
    enabled: enabled && !!imdb && getState().settings.findSubtitles !== false,
    queryFn: ({ signal }) => findSubtitles(imdb!, ep, signal),
    staleTime: 6 * 60 * 60_000,
    retry: 1,
  }).data;
}
