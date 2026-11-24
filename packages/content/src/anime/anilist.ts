/**
 * The names an anime goes by, from AniList's public GraphQL API. Providers that search by title
 * need them: a TMDB title ("Attack on Titan") is often not what an anime site lists ("Shingeki no Kyojin").
 */

import type { Fetcher } from '@charcoal/provider-sdk';
import { isRecord, parseJson, positiveInteger, text, unique } from '../internal/json.js';

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

const TITLES_QUERY =
  'query ($id: Int) { Media(id: $id, type: ANIME) { id idMal format episodes title { romaji english native } synonyms } }';

export interface AnimeTitles {
  romaji?: string;
  english?: string;
  native?: string;
  synonyms: string[];
  /** AniList's format: TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA, MUSIC. */
  format?: string;
  /** Missing while a series is still airing. */
  episodes?: number;
  idMal?: number;
}

/** The messages of a GraphQL `errors` array, if the body has one. */
function errorMessages(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return [];
  return payload.errors.map((error) => (isRecord(error) ? text(error.message) : undefined) ?? 'unknown error');
}

/**
 * One GraphQL POST. Throws an Error naming the HTTP status on anything but 200 (AniList answers
 * 404 for an unknown id and 429 when rate limited), and on a 200 that carries GraphQL errors.
 */
export async function fetchAnimeTitles(fetcher: Fetcher, anilistId: number, signal?: AbortSignal): Promise<AnimeTitles> {
  if (positiveInteger(anilistId) === undefined) throw new RangeError(`AniList id must be a positive integer, got ${anilistId}`);

  const response = await fetcher(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: TITLES_QUERY, variables: { id: anilistId } }),
    signal,
  });

  if (response.status !== 200) {
    let detail = '';
    try {
      detail = errorMessages(JSON.parse(response.body)).join('; ');
    } catch {
      // Not JSON (a gateway's HTML error page): the status alone has to do.
    }
    throw new Error(`AniList request failed with status ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  const payload = parseJson(response.body, 'AniList');
  const errors = errorMessages(payload);
  if (errors.length > 0) throw new Error(`AniList returned errors: ${errors.join('; ')}`);

  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined;
  const media = data && isRecord(data.Media) ? data.Media : undefined;
  if (!media) throw new Error(`AniList has no anime with id ${anilistId}`);

  const title = isRecord(media.title) ? media.title : {};
  const titles: AnimeTitles = {
    synonyms: Array.isArray(media.synonyms) ? media.synonyms.map(text).filter((name): name is string => name !== undefined) : [],
  };
  const romaji = text(title.romaji);
  const english = text(title.english);
  const native = text(title.native);
  const format = text(media.format);
  const episodes = positiveInteger(media.episodes);
  const idMal = positiveInteger(media.idMal);
  if (romaji !== undefined) titles.romaji = romaji;
  if (english !== undefined) titles.english = english;
  if (native !== undefined) titles.native = native;
  if (format !== undefined) titles.format = format;
  if (episodes !== undefined) titles.episodes = episodes;
  if (idMal !== undefined) titles.idMal = idMal;
  return titles;
}

/**
 * Every name, English first, then romaji, native and the synonyms. Empty names are dropped and
 * so are repeats that differ only in letter case or surrounding space (the first spelling is kept).
 */
export function allTitles(titles: AnimeTitles): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const candidate of unique([titles.english, titles.romaji, titles.native, ...titles.synonyms])) {
    const name = candidate?.trim();
    if (!name) continue;
    const key = name.normalize('NFC').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
