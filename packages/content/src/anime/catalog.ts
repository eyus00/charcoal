/**
 * The anime catalogue, from AniList's public GraphQL API: what to list, search and show.
 *
 * TMDB lists anime as television and misses a good part of it (specials, OVAs, web series, much
 * of what is airing this season); AniList lists every entry the way anime sites do, one per
 * season or film, and it is the id those sites are searched by. It answers any web page
 * (`Access-Control-Allow-Origin: *`) and allows 30 requests a minute, so a page of several rows is
 * asked for in one request (see fetchAnimeRows).
 *
 * A row of the response, checked 2026-11-25: id 21, idMal 21, format "TV", status "RELEASING",
 * episodes null (still airing), seasonYear 1999, averageScore 87 (of 100), genres [...],
 * title { romaji, english, native }, coverImage { large, color }, bannerImage,
 * nextAiringEpisode { episode 1181, airingAt (seconds) }. Adult entries are never asked for.
 */

import type { Fetcher } from '@charcoal/provider-sdk';
import { finite, isRecord, parseJson, positiveInteger, text } from '../internal/json.js';
import { ANILIST_ENDPOINT } from './anilist.js';

export type AnimeSort = 'trending' | 'popular' | 'rating' | 'newest';
/** Series are everything told in episodes; films are films. */
export type AnimeKind = 'series' | 'film';

export interface AnimeCard {
  /** AniList id. */
  id: number;
  mal?: number;
  /** The English name when AniList has one, else the romanised one. */
  title: string;
  romaji?: string;
  native?: string;
  /** TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA. */
  format?: string;
  kind: AnimeKind;
  status?: string;
  /** Total episodes; missing while a series is still airing. */
  episodes?: number;
  /** Episodes out so far, for an airing series. */
  aired?: number;
  year?: number;
  /** 0–10, one decimal. */
  score?: number;
  genres: string[];
  cover?: string;
  banner?: string;
}

export interface AnimeDetails extends AnimeCard {
  /** Plain text. */
  description?: string;
  synonyms: string[];
  /** Minutes per episode. */
  duration?: number;
  studio?: string;
}

export interface AnimeListQuery {
  kind?: AnimeKind;
  sort?: AnimeSort;
  /** A name to search for; results are then ordered by how well they match. */
  search?: string;
  /** Only entries airing now. */
  airing?: boolean;
  page?: number;
  perPage?: number;
}

const CARD =
  'id idMal format status episodes seasonYear averageScore genres title { romaji english native } coverImage { large } bannerImage startDate { year } nextAiringEpisode { episode }';
const FORMATS: Record<AnimeKind, string> = { series: '[TV, TV_SHORT, ONA, OVA, SPECIAL]', film: '[MOVIE]' };
const SORTS: Record<AnimeSort, string> = { trending: 'TRENDING_DESC', popular: 'POPULARITY_DESC', rating: 'SCORE_DESC', newest: 'START_DATE_DESC' };

/** The arguments of one `media(...)` selection. `$search` is the only variable (free text is never put in the query). */
function mediaArgs(q: AnimeListQuery, searchVar: string | undefined): string {
  const args = ['type: ANIME', 'isAdult: false'];
  if (q.kind) args.push(`format_in: ${FORMATS[q.kind]}`);
  if (searchVar) args.push(`search: $${searchVar}`, 'sort: SEARCH_MATCH');
  else {
    args.push(`sort: ${SORTS[q.sort ?? 'popular']}`);
    // "Newest" means out now: entries announced for a later year sort first otherwise.
    if (q.sort === 'newest') args.push('status_in: [RELEASING, FINISHED]');
    // A top-rated list of entries three people scored is no use.
    if (q.sort === 'rating') args.push('popularity_greater: 5000');
  }
  if (q.airing) args.push('status: RELEASING');
  return args.join(', ');
}

const httpsUrl = (value: unknown) => {
  const raw = text(value);
  return raw && /^https:\/\//i.test(raw) ? raw : undefined;
};

function readCard(row: unknown): AnimeCard | undefined {
  if (!isRecord(row)) return undefined;
  const id = positiveInteger(row.id);
  const names = isRecord(row.title) ? row.title : {};
  const romaji = text(names.romaji);
  const title = text(names.english) ?? romaji ?? text(names.native);
  if (!id || !title) return undefined;
  const format = text(row.format);
  const next = isRecord(row.nextAiringEpisode) ? positiveInteger(row.nextAiringEpisode.episode) : undefined;
  const score = finite(row.averageScore);
  return {
    id,
    mal: positiveInteger(row.idMal),
    title,
    romaji,
    native: text(names.native),
    format,
    kind: format === 'MOVIE' ? 'film' : 'series',
    status: text(row.status),
    episodes: positiveInteger(row.episodes),
    aired: next !== undefined && next > 1 ? next - 1 : undefined,
    year: positiveInteger(row.seasonYear) ?? (isRecord(row.startDate) ? positiveInteger(row.startDate.year) : undefined),
    score: score !== undefined && score > 0 ? Math.round(score) / 10 : undefined,
    genres: Array.isArray(row.genres) ? row.genres.map((g) => text(g)).filter((g): g is string => !!g) : [],
    cover: isRecord(row.coverImage) ? httpsUrl(row.coverImage.large) : undefined,
    banner: httpsUrl(row.bannerImage),
  };
}

/** AniList descriptions carry a little HTML (<br>, <i>) and "(Source: …)" notes. */
export function plainDescription(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain || undefined;
}

async function ask(fetcher: Fetcher, query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetcher(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (res.status === 429) throw new Error('AniList is asking for a pause (too many requests); try again in a minute');
  if (res.status !== 200) throw new Error(`AniList answered ${res.status}`);
  const payload = parseJson(res.body, 'AniList');
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error('AniList: the response has no data');
  return payload.data;
}

function readPage(page: unknown): { items: AnimeCard[]; hasNext: boolean } {
  if (!isRecord(page)) return { items: [], hasNext: false };
  const seen = new Set<number>();
  const items = (Array.isArray(page.media) ? page.media : []).map(readCard).filter((c): c is AnimeCard => !!c && !seen.has(c.id) && !!seen.add(c.id));
  return { items, hasNext: isRecord(page.pageInfo) && page.pageInfo.hasNextPage === true };
}

/** One page of the catalogue. */
export async function fetchAnimeList(fetcher: Fetcher, q: AnimeListQuery = {}, signal?: AbortSignal): Promise<{ items: AnimeCard[]; hasNext: boolean; page: number }> {
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const perPage = Math.min(50, Math.max(1, Math.floor(q.perPage ?? 30)));
  const search = q.search?.trim().slice(0, 100);
  const query = `query (${search ? '$s: String, ' : ''}$page: Int, $perPage: Int) { Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(${mediaArgs(q, search ? 's' : undefined)}) { ${CARD} } } }`;
  const data = await ask(fetcher, query, { ...(search ? { s: search } : {}), page, perPage }, signal);
  return { ...readPage(data.Page), page };
}

/**
 * Several lists in one request (a home page's rows): `rows` maps a name to its query, and the
 * answer has the same names. A row AniList could not fill comes back empty.
 */
export async function fetchAnimeRows<K extends string>(fetcher: Fetcher, rows: Record<K, AnimeListQuery>, perPage = 20, signal?: AbortSignal): Promise<Record<K, AnimeCard[]>> {
  const names = Object.keys(rows) as K[];
  for (const name of names) if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`AniList: "${name}" is not a usable row name`);
  const query = `query ($perPage: Int) { ${names.map((name) => `${name}: Page(perPage: $perPage) { media(${mediaArgs(rows[name], undefined)}) { ${CARD} } }`).join(' ')} }`;
  const data = await ask(fetcher, query, { perPage }, signal);
  return Object.fromEntries(names.map((name) => [name, readPage(data[name]).items])) as Record<K, AnimeCard[]>;
}

/** One entry in full; undefined when AniList has no such (non-adult) anime. */
export async function fetchAnimeDetails(fetcher: Fetcher, id: number, signal?: AbortSignal): Promise<AnimeDetails | undefined> {
  const query = `query ($id: Int) { Media(id: $id, type: ANIME, isAdult: false) { ${CARD} description(asHtml: false) synonyms duration studios(isMain: true) { nodes { name } } } }`;
  let data: Record<string, unknown>;
  try {
    data = await ask(fetcher, query, { id }, signal);
  } catch (e) {
    if (e instanceof Error && /answered 404/.test(e.message)) return undefined;
    throw e;
  }
  const row = data.Media;
  const card = readCard(row);
  if (!card || !isRecord(row)) return undefined;
  const studios = isRecord(row.studios) && Array.isArray(row.studios.nodes) ? row.studios.nodes : [];
  return {
    ...card,
    description: plainDescription(text(row.description)),
    synonyms: Array.isArray(row.synonyms) ? row.synonyms.map((s) => text(s)).filter((s): s is string => !!s) : [],
    duration: positiveInteger(row.duration),
    studio: studios.map((s) => (isRecord(s) ? text(s.name) : undefined)).find(Boolean),
  };
}

/** How many episodes can be watched now: all of a finished entry, those aired of a running one. */
export function watchableEpisodes(a: Pick<AnimeCard, 'episodes' | 'aired' | 'kind' | 'status'>): number {
  if (a.kind === 'film') return 1;
  if (a.status === 'NOT_YET_RELEASED') return 0;
  return a.aired ?? a.episodes ?? 1;
}
