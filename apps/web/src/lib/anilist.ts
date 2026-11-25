/**
 * Anime's catalogue in this browser: AniList lists and searches it (see @charcoal/content's
 * anime/catalog), asked straight from the page. An entry that TMDB also has opens as that TMDB
 * title, with everything a title page offers; one it lacks has a page and a player of its own,
 * found by its AniList / MAL id.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails, fetchAnimeList, fetchAnimeRows, type AnimeKind, type AnimeListQuery, type AnimeSort } from '@charcoal/content';
import { loadAnimeIndex } from './anime';
import { webFetcher, within } from './content';

export const ANIME_SORTS: { key: AnimeSort; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'trending', label: 'Trending' },
  { key: 'rating', label: 'Top rated' },
  { key: 'newest', label: 'Newest' },
];

/** The home page's rows, top to bottom. Asked for in one request (AniList allows 30 a minute). */
export const HOME_ROWS = {
  trending: { title: 'Trending now', query: { kind: 'series', sort: 'trending' } },
  airing: { title: 'Airing this season', query: { kind: 'series', sort: 'popular', airing: true } },
  popular: { title: 'Popular series', query: { kind: 'series', sort: 'popular' } },
  top: { title: 'Top rated series', query: { kind: 'series', sort: 'rating' } },
  films: { title: 'Popular films', query: { kind: 'film', sort: 'popular' } },
  topFilms: { title: 'Top rated films', query: { kind: 'film', sort: 'rating' } },
} satisfies Record<string, { title: string; query: AnimeListQuery }>;
export type HomeRow = keyof typeof HOME_ROWS;

const HOUR = 3_600_000;

export function useAnimeHome() {
  return useQuery({
    queryKey: ['anilist', 'home'],
    queryFn: ({ signal }) => fetchAnimeRows(webFetcher, Object.fromEntries(Object.entries(HOME_ROWS).map(([k, r]) => [k, r.query])) as Record<HomeRow, AnimeListQuery>, 20, signal),
    staleTime: HOUR,
    retry: 1,
  });
}

/** A list (or, with `search`, the matches for a name), paged. */
export function useAnimeList(q: { kind: AnimeKind; sort: AnimeSort; search: string }) {
  return useInfiniteQuery({
    queryKey: ['anilist', 'list', q.kind, q.search ? '' : q.sort, q.search],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchAnimeList(webFetcher, { kind: q.kind, sort: q.sort, search: q.search || undefined, page: pageParam }, signal),
    getNextPageParam: (last) => (last.hasNext && last.page < 40 ? last.page + 1 : undefined),
    staleTime: q.search ? 10 * 60_000 : HOUR,
    retry: 1,
  });
}

export function useAnimeEntry(id: number) {
  return useQuery({
    queryKey: ['anilist', 'entry', id],
    queryFn: async ({ signal }) => (await fetchAnimeDetails(webFetcher, id, signal)) ?? null,
    enabled: id > 0,
    staleTime: 6 * HOUR,
    retry: 1,
  });
}

/** Where on TMDB an AniList entry is, as an address in this app; null when TMDB (or the list) doesn't have it. */
export function useTmdbPage(anilistId: number) {
  return useQuery({
    queryKey: ['anime-tmdb-page', anilistId],
    // The list is a download the first time (kept afterwards): a title's page doesn't wait long for it.
    queryFn: async (): Promise<string | null> => {
      const entry = (await within(loadAnimeIndex(), 6000, 'The anime list')).byAnilist.get(anilistId);
      if (entry?.tmdbMovie) return `/movie/${entry.tmdbMovie}`;
      if (entry?.tmdbShow) return `/tv/${entry.tmdbShow}${entry.tmdbSeason && entry.tmdbSeason > 1 ? `?season=${entry.tmdbSeason}` : ''}`;
      return null;
    },
    enabled: anilistId > 0,
    staleTime: Infinity,
    retry: false,
  });
}

// ---------- where you were, for entries with no TMDB title (the library and history are keyed by TMDB) ----------

const LAST_KEY = 'charcoal:anime-last';

function readLast(): Record<string, number> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
    return kept && typeof kept === 'object' ? (kept as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The episode last opened of an entry, or undefined. */
export const lastEpisode = (anilistId: number): number | undefined => {
  const n = readLast()[anilistId];
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function rememberEpisode(anilistId: number, episode: number) {
  try {
    const all = readLast();
    delete all[anilistId];
    all[anilistId] = episode;
    // The newest two hundred are plenty.
    localStorage.setItem(LAST_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-200))));
  } catch {
    /* storage full or blocked: not remembered */
  }
}

export const FORMAT_LABEL: Record<string, string> = { TV: 'Series', TV_SHORT: 'Short series', MOVIE: 'Film', SPECIAL: 'Special', OVA: 'OVA', ONA: 'Web series', MUSIC: 'Music video' };
