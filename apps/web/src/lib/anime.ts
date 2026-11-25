/**
 * Anime on top of TMDB. TMDB files a long anime as one show with seasons; anime sites file every
 * cour as its own entry with its own episode numbers. @charcoal/content bridges the two with the
 * Fribb anime-lists file; this module loads that list in the browser, works out which AniList /
 * MyAnimeList entry (and which episode of it) a TMDB episode is, and fetches the entry's names
 * (AniList) and skip times (AniSkip).
 *
 * Everything here is optional to playback: a title that merely looks like anime still plays as the
 * TMDB show it is when the list or AniList can't be reached.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  allTitles,
  buildAnimeIndex,
  deserializeAnimeIndex,
  fetchAnimeTitles,
  fetchSkipTimes,
  serializeAnimeIndex,
  tmdbToAnime,
  toAnimeMedia,
  type AnimeEntry,
  type AnimeIndex,
  type AnimeTitles,
  type SkipTime,
} from '@charcoal/content';
import type { AnimeMedia, EpisodeMedia, MovieMedia } from '@charcoal/provider-sdk';
import { cacheGet, cacheSet, webFetcher } from './content';
import { regularSeasons } from './episodes';
import { q, type Details, type MediaType } from './tmdb';

export type AnimeAudio = 'sub' | 'dub';

/** TMDB's Animation genre (the same id for movies and shows). */
export const ANIMATION_GENRE = 16;

/** Animation made in Japanese: what TMDB can say about a title being anime. The list confirms it. */
export function looksLikeAnime(m: { genres?: { id: number }[]; genre_ids?: number[]; original_language?: string } | undefined): boolean {
  if (!m || m.original_language !== 'ja') return false;
  return (m.genres?.map((g) => g.id) ?? m.genre_ids ?? []).includes(ANIMATION_GENRE);
}

// ---------- the list ----------

/**
 * The Fribb rows (the "mini" file is the full list without whitespace: 5.9 MB, 1.2 MB on the wire),
 * or an index already in @charcoal/content's published form if a deployment hosts one.
 */
const LIST_URL = (import.meta.env.VITE_ANIME_LIST_URL as string | undefined) || 'https://raw.githubusercontent.com/Fribb/anime-lists/HEAD/anime-list-mini.json';
const CACHE_KEY = 'anime-index:v1';
const FRESH_MS = 7 * 24 * 60 * 60_000;

async function download(): Promise<AnimeIndex> {
  const res = await webFetcher(LIST_URL, { headers: { Accept: 'application/json' } });
  if (res.status !== 200) throw new Error(`The anime list answered ${res.status}`);
  const data: unknown = JSON.parse(res.body);
  const index = Array.isArray(data) ? buildAnimeIndex(data) : deserializeAnimeIndex(data);
  // Kept compact (about 1 MB) so the next visit needs neither the download nor the 6 MB parse.
  void cacheSet(CACHE_KEY, serializeAnimeIndex(index));
  return index;
}

let index: Promise<AnimeIndex> | null = null;
/** The identity index: from this browser's copy when it has one, else downloaded once per visit. */
export function loadAnimeIndex(): Promise<AnimeIndex> {
  if (!index) {
    const attempt = (async () => {
      const kept = await cacheGet<unknown>(CACHE_KEY);
      if (kept) {
        try {
          const built = deserializeAnimeIndex(kept.value);
          // Old but usable: use it now, fetch a newer one for next time.
          if (Date.now() - kept.at > FRESH_MS) void download().catch(() => {});
          return built;
        } catch {
          /* a copy this build can't read: fetch again */
        }
      }
      return download();
    })();
    index = attempt;
    // A failed load is not remembered: the next title tries again.
    attempt.catch(() => index === attempt && (index = null));
  }
  return index;
}

// ---------- names and skip times, asked once each ----------

function once<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const made = new Map<K, Promise<V>>();
  return (key) => {
    let p = made.get(key);
    if (!p) {
      p = load(key);
      made.set(key, p);
      p.catch(() => made.get(key) === p && made.delete(key));
    }
    return p;
  };
}

/** AniList's names for an entry (30 requests a minute are allowed, so each entry is asked once). */
export const animeTitles = once((anilistId: number) => fetchAnimeTitles(webFetcher, anilistId));

const skipTimes = once((key: string) => {
  const [mal, episode] = key.split(':').map(Number);
  return fetchSkipTimes(webFetcher, mal, episode);
});

// ---------- identity ----------

export interface AnimeIdentity {
  entry: AnimeEntry;
  /** The episode number inside the entry (1 for a film). */
  episode: number;
}

const seasonCounts = (d: Details | undefined) => Object.fromEntries(regularSeasons(d).map((s) => [s.season_number, s.episode_count]));

/** Which entry a TMDB movie or episode is; null when the list doesn't know it (or is ambiguous). */
export async function identifyAnime(type: MediaType, id: number, d: Details | undefined, season?: number, episode?: number): Promise<AnimeIdentity | null> {
  const list = await loadAnimeIndex();
  if (type === 'movie') {
    const entry = list.byTmdbMovie.get(id);
    return entry ? { entry, episode: 1 } : null;
  }
  const first = regularSeasons(d)[0]?.season_number ?? 1;
  return tmdbToAnime(list, id, season ?? first, episode ?? 1, { seasonEpisodeCounts: seasonCounts(d) }) ?? null;
}

/**
 * The anime query that goes with a TMDB one: the same title as its AniList / MAL entry, with the
 * episode numbered inside that entry and the names anime sites list it under. Undefined when the
 * title isn't in the list. Never throws: a failure here must leave ordinary playback untouched.
 */
export async function animeMediaFor(media: EpisodeMedia | MovieMedia, d: Details, audio: AnimeAudio): Promise<AnimeMedia | undefined> {
  try {
    const list = await loadAnimeIndex();
    const options = { seasonEpisodeCounts: seasonCounts(d) };
    const found = toAnimeMedia(list, media, [], options);
    if (!found) return undefined;
    let names: string[] = [];
    let synonyms: string[] = [];
    const anilist = Number(found.ids.anilist);
    if (anilist > 0) {
      try {
        const titles = await animeTitles(anilist);
        names = allTitles({ ...titles, synonyms: [] });
        synonyms = allTitles(titles).filter((name) => !names.includes(name));
      } catch (e) {
        console.warn('[anime] AniList names unavailable:', (e as Error).message);
      }
    }
    // Only a few alternate titles fit in a query, so the best come first: the entry's own English,
    // romanised and Japanese names, then the show's names from TMDB, then AniList's synonyms.
    const anime = toAnimeMedia(list, { ...media, altTitles: [] }, [...names, ...(media.altTitles ?? []), ...synonyms], options) ?? found;
    return { ...anime, audio };
  } catch (e) {
    console.warn('[anime] no anime identity, searching as a TMDB title only:', (e as Error).message);
    return undefined;
  }
}

// ---------- hooks ----------

export interface AnimeState {
  /** Japanese animation by TMDB's account. */
  isAnime: boolean;
  /** The list knows it (undefined while loading, or when the list couldn't be loaded). */
  identity: AnimeIdentity | null | undefined;
  /** AniList's names for the entry, once known. */
  titles: AnimeTitles | undefined;
}

/** What is known about a title as anime. For a show without an episode, its first one. */
export function useAnime(type: MediaType, id: number, d: Details | undefined, season?: number, episode?: number): AnimeState {
  const isAnime = looksLikeAnime(d);
  const identity = useQuery({
    queryKey: ['anime-identity', type, id, season ?? null, episode ?? null],
    queryFn: () => identifyAnime(type, id, d, season, episode),
    enabled: isAnime && id > 0,
    staleTime: Infinity,
    retry: false,
  }).data;
  const anilist = identity?.entry.anilist;
  const titles = useQuery({
    queryKey: ['anilist-titles', anilist],
    queryFn: () => animeTitles(anilist!),
    enabled: anilist !== undefined,
    staleTime: Infinity,
    retry: false,
  }).data;
  return useMemo(() => ({ isAnime, identity, titles }), [isAnime, identity, titles]);
}

const NO_TIMES: SkipTime[] = [];

/**
 * Opening / ending / recap times from AniSkip for a TMDB episode that is anime ([] otherwise, and
 * while loading). Each carries the length of the video it was measured on.
 */
export function useAnimeSkipTimes(type: MediaType, id: number, season?: number, episode?: number, enabled = true): SkipTime[] {
  const on = enabled && id > 0;
  // The details are already in the cache wherever something is playing.
  const { data: d } = useQuery({ ...q.details(type, id), enabled: on });
  const { identity } = useAnime(type, on ? id : 0, on ? d : undefined, season, episode);
  const mal = identity?.entry.mal;
  const ep = identity?.episode;
  return (
    useQuery({
      queryKey: ['aniskip', mal, ep],
      queryFn: () => skipTimes(`${mal}:${ep}`),
      enabled: on && mal !== undefined && ep !== undefined,
      staleTime: 1000 * 60 * 60 * 6,
      retry: false,
    }).data ?? NO_TIMES
  );
}
