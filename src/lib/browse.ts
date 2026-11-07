import { useInfiniteQuery } from '@tanstack/react-query';
import { discoverParams, type Filters } from './filters';
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

