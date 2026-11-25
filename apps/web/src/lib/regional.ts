/**
 * Regional cinema: the names a title goes by and the languages it is browsed in.
 *
 * A Tamil film is listed on one site in Tamil script, on another transliterated, on a third under
 * its Hindi dub's title. Providers that find a title by name need those names, so they are read
 * from TMDB (alternative titles and translations, which arrive with the details) and travel with
 * every search as `altTitles`, next to the original language.
 */
import { INDIAN_LANGUAGES, normalizeTitle } from '@charcoal/content';
import type { Details } from './tmdb';

export { INDIAN_LANGUAGES };

/** The Indian languages offered as tabs, the biggest industries first (all of INDIAN_LANGUAGES). */
export const INDIAN_CODES = INDIAN_LANGUAGES.map((l) => l.code);

/** Where a language's cinema is made, for titles whose TMDB record names no country. */
const HOME: Record<string, string> = { ...Object.fromEntries(INDIAN_CODES.map((c) => [c, 'IN'])), ja: 'JP', ko: 'KR', zh: 'CN', th: 'TH', tr: 'TR' };

/** The languages Indian films are most often dubbed into and listed under. */
const INDIAN_DUB_LANGUAGES = ['hi', 'ta', 'te', 'ml', 'kn'];

/**
 * Other names for a title, the most useful for finding it first: the original title, the names
 * used in its home country (transliterations are filed there), the title in its original language,
 * in English and in the viewer's language (an Indian title also in the big Indian languages, whose
 * dubs often carry their own title), then romanisations and what it is called in the US and UK.
 * Names that read the same once normalised (case, accents, punctuation) are listed once; the main
 * title is left out.
 */
export function altTitlesOf(d: Details, alsoLanguages: string[] = []): string[] {
  const main = d.title || d.name || '';
  const lang = d.original_language ?? '';
  const home = new Set([...(d.origin_country ?? []), ...(HOME[lang] ? [HOME[lang]] : [])]);
  const alts = (d.alternative_titles?.titles ?? d.alternative_titles?.results ?? []).filter((a) => a && typeof a.title === 'string');
  const translated = (d.translations?.translations ?? []).map((t) => ({ lang: t.iso_639_1, name: t.data?.title || t.data?.name || '' })).filter((t) => t.name);
  const wanted = ['en', ...alsoLanguages, ...(INDIAN_CODES.includes(lang) ? INDIAN_DUB_LANGUAGES : [])];

  const ordered = [
    d.original_title,
    d.original_name,
    ...alts.filter((a) => home.has(a.iso_3166_1)).map((a) => a.title),
    ...translated.filter((t) => t.lang === lang).map((t) => t.name),
    ...wanted.flatMap((w) => translated.filter((t) => t.lang === w).map((t) => t.name)),
    ...alts.filter((a) => /roma|translit/i.test(a.type ?? '')).map((a) => a.title),
    ...alts.filter((a) => a.iso_3166_1 === 'US' || a.iso_3166_1 === 'GB').map((a) => a.title),
  ];

  const seen = new Set([normalizeTitle(main)]);
  const out: string[] = [];
  for (const candidate of ordered) {
    const name = candidate?.trim();
    if (!name || name.length > 120) continue;
    const key = normalizeTitle(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
