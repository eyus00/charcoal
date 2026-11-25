import { useInfiniteQuery } from '@tanstack/react-query';
import { discoverParams as languageDiscoverParams } from '@charcoal/content';
import { discoverParams, type Filters, type SortKey } from './filters';
import { tmdb, type MediaItem, type MediaType, type Page } from './tmdb';

/** /discover infinite query; for type "all" it merges a movie and a TV page per step. */
export function useDiscover(f: Filters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['discover', f],
    enabled,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const types: MediaType[] = f.type === 'all' ? ['movie', 'tv'] : [f.type];
      const pages = await Promise.all(
        types.map(async (t) => {
          const params = discoverParams(t, f, pageParam);
          if (!params) return { page: pageParam, results: [], total_pages: 0, total_results: 0 } as Page<MediaItem>;
          const res = await tmdb<Page<MediaItem>>(`/discover/${t}`, params, signal);
          return { ...res, results: res.results.map((m) => ({ ...m, media_type: t })) };
        }),
      );
      const results = pages.flatMap((p) => p.results);
      if (types.length > 1) results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      return { results, more: pages.some((p) => pageParam < Math.min(p.total_pages, 500)), total: pages.reduce((n, p) => n + p.total_results, 0) };
    },
    getNextPageParam: (last, _all, page) => (last.more ? page + 1 : undefined),
  });
}

/** Text search. TMDB search only filters by year server-side; genre/rating/year ranges are applied to results. */
export function useTextSearch(query: string, f: Filters) {
  return useInfiniteQuery({
    queryKey: ['search', query, f.type, f.from === f.to ? f.from : undefined],
    enabled: !!query,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      if (f.type === 'all') return tmdb<Page<MediaItem>>('/search/multi', { query, page: pageParam, include_adult: 'false' }, signal);
      const yearKey = f.type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
      const res = await tmdb<Page<MediaItem>>(
        `/search/${f.type}`,
        { query, page: pageParam, include_adult: 'false', [yearKey]: f.from && f.from === f.to ? f.from : undefined },
        signal,
      );
      return { ...res, results: res.results.map((m) => ({ ...m, media_type: f.type as 'movie' | 'tv' })) };
    },
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 50) ? last.page + 1 : undefined),
  });
}


/** Trending this week (all / movies / tv), paged — the default Discover view. */
export function useTrendingPages(type: MediaType | 'all', enabled = true) {
  return useInfiniteQuery({
    queryKey: ['trending-pages', type],
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => tmdb<Page<MediaItem>>(`/trending/${type}/week`, { page: pageParam }, signal),
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 20) ? last.page + 1 : undefined),
  });
}

// ---------- by original language (anime, regional cinema) ----------

export interface LanguageBrowse {
  /** ISO 639-1 code of the original language ("ta", "ja"). */
  language: string;
  type: MediaType;
  /** ISO 3166-1 country whose releases count (movies) or where it was made (shows), e.g. "IN". */
  region?: string;
  sort: SortKey;
  /** One TMDB genre id to narrow to (16 = Animation). */
  genre?: number;
  /** Shows only: with an episode on air in the week around today. */
  airing?: boolean;
  /** Only titles first released in the last this-many days. */
  recentDays?: number;
  /**
   * With sort 'popular': rank by how many people have rated a title instead of TMDB's daily
   * popularity, which for shows puts whatever airs every day first (for anime: decades-old
   * children's series ahead of everything viewers actually look for).
   */
  byVotes?: boolean;
}

/** /discover by original language, paged. The parameters come from @charcoal/content's discovery helpers. */
export function useLanguageDiscover(b: LanguageBrowse, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['discover-language', b.language, b.type, b.region ?? '', b.sort, b.genre ?? 0, !!b.airing, b.recentDays ?? 0, !!b.byVotes],
    enabled,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const dateKey = b.type === 'movie' ? 'primary_release_date' : 'first_air_date';
      const sortBy = b.sort === 'rating' ? 'vote_average.desc' : b.sort === 'newest' ? `${dateKey}.desc` : b.byVotes ? 'vote_count.desc' : 'popularity.desc';
      const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const params: Record<string, string | number> = { ...languageDiscoverParams({ language: b.language, type: b.type, region: b.region, sortBy, page: pageParam }), include_adult: 'false' };
      if (b.genre) params.with_genres = b.genre;
      if (b.airing && b.type === 'tv') {
        params['air_date.gte'] = day(-6);
        params['air_date.lte'] = day(1);
      }
      if (b.recentDays) {
        params[`${dateKey}.gte`] = day(-b.recentDays);
        params[`${dateKey}.lte`] = day(0);
        // New titles have few ratings yet; a handful is enough to leave out entries nobody has seen.
        params['vote_count.gte'] = 5;
      }
      // Regional titles collect far fewer votes than Hollywood ones, so the floors are lower than Discover's.
      if (b.sort === 'rating') params['vote_count.gte'] = b.type === 'movie' ? 80 : 40;
      if (b.sort === 'newest') {
        params[`${dateKey}.lte`] = new Date().toISOString().slice(0, 10);
        params['vote_count.gte'] = 3;
      }
      const res = await tmdb<Page<MediaItem>>(`/discover/${b.type}`, params, signal);
      return { ...res, results: res.results.map((m) => ({ ...m, media_type: b.type })) };
    },
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 500) ? last.page + 1 : undefined),
  });
}

/**
 * Text search kept to titles whose original language is one of `languages`. TMDB's search already
 * matches a title's alternative names and translations (so "Baahubali" finds बाहुबली and the
 * other way round); it has no language filter, so that part happens here.
 */
export function useLanguageSearch(query: string, type: MediaType, languages: string[]) {
  return useInfiniteQuery({
    queryKey: ['search-language', query, type, languages.join(',')],
    enabled: !!query,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const res = await tmdb<Page<MediaItem>>(`/search/${type}`, { query, page: pageParam, include_adult: 'false' }, signal);
      return { ...res, results: res.results.filter((m) => !!m.original_language && languages.includes(m.original_language)).map((m) => ({ ...m, media_type: type })) };
    },
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 20) ? last.page + 1 : undefined),
  });
}
