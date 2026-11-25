/**
 * Anime's catalogue in this browser: AniList lists and searches it (see @charcoal/content's
 * anime/catalog), asked straight from the page. An entry that TMDB also has opens as that TMDB
 * title, with everything a title page offers; one it lacks has a page and a player of its own,
 * found by its AniList / MAL id.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails, fetchAnimeList, fetchAnimeRows, type AnimeListQuery } from '@charcoal/content';
import { loadAnimeIndex } from './anime';
import { webFetcher, within } from './content';

/** The home page's anime lists, one per pill. Asked for in one request (AniList allows 30 a minute). */
export const HOME_ROWS = {
  trending: { title: 'Trending', query: { sort: 'trending' } },
  airing: { title: 'Airing', query: { kind: 'series', sort: 'trending', airing: true } },
  popular: { title: 'Popular', query: { kind: 'series', sort: 'popular' } },
  top: { title: 'Top rated', query: { kind: 'series', sort: 'rating' } },
  films: { title: 'Films', query: { kind: 'film', sort: 'popular' } },
} satisfies Record<string, { title: string; query: AnimeListQuery }>;
export type HomeRow = keyof typeof HOME_ROWS;

const HOUR = 3_600_000;

export function useAnimeHome(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['anilist', 'home'],
    queryFn: ({ signal }) => fetchAnimeRows(webFetcher, Object.fromEntries(Object.entries(HOME_ROWS).map(([k, r]) => [k, r.query])) as Record<HomeRow, AnimeListQuery>, 20, signal),
    staleTime: HOUR,
    retry: 1,
  });
}

/** AniList's matches for a name (the entries a title search may be missing). */
export function useAnimeSearch(search: string) {
  return useQuery({
    queryKey: ['anilist', 'search', search],
    queryFn: async ({ signal }) => (await fetchAnimeList(webFetcher, { search, perPage: 24 }, signal)).items,
    enabled: search.length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
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

export const FORMAT_LABEL: Record<string, string> = { TV: 'Series', TV_SHORT: 'Short series', MOVIE: 'Film', SPECIAL: 'Special', OVA: 'OVA', ONA: 'Web series', MUSIC: 'Music video' };
