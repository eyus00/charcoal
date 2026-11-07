import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import FilterBar from '../components/FilterBar';
import Grid from '../components/Grid';
import { discoverParams, hasActiveFilters, parseFilters, type Filters } from '../lib/filters';
import { cleanList, tmdb, type MediaType, type Page, type MediaItem } from '../lib/tmdb';
import { useTitle } from '../lib/util';

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
      return { results, more: pages.some((p) => pageParam < Math.min(p.total_pages, 500)) };
    },
    getNextPageParam: (last, _all, page) => (last.more ? page + 1 : undefined),
  });
}

export default function Catalog({ type }: { type: MediaType }) {
  const [params] = useSearchParams();
  const filters = useMemo(() => parseFilters(params, type), [params, type]);
  const query = useDiscover(filters);
  const items = useMemo(() => cleanList(query.data?.pages.flatMap((p) => p.results) ?? [], type), [query.data, type]);
  const label = type === 'movie' ? 'Movies' : 'TV Shows';
  useTitle(label);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-8 md:pt-8">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight md:text-3xl">{label}</h1>
      <FilterBar filters={filters} />
      <div className="mt-6">
        <Grid
          items={items}
          type={type}
          loading={query.isPending}
          error={query.error}
          onRetry={() => query.refetch()}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          onLoadMore={() => !query.isFetchingNextPage && query.fetchNextPage()}
          empty={
            <p className="py-20 text-center text-muted">
              {hasActiveFilters(filters) ? 'No titles match these filters.' : 'Nothing to show right now.'}
            </p>
          }
        />
      </div>
    </div>
  );
}
