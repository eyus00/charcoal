import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import FilterBar from '../components/FilterBar';
import Grid from '../components/Grid';
import { SearchBox } from '../components/Layout';
import { hasActiveFilters, matchesFilters, parseFilters, type Filters } from '../lib/filters';
import { cleanList, tmdb, type MediaItem, type Page } from '../lib/tmdb';
import { useTitle } from '../lib/util';
import { useDiscover } from './Catalog';

/** Text search. TMDB search can only filter by year server-side; the rest is applied to the results. */
function useTextSearch(query: string, f: Filters) {
  return useInfiniteQuery({
    queryKey: ['search', query, f.type, f.from === f.to ? f.from : undefined],
    enabled: !!query,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const singleYear = f.from && f.from === f.to ? f.from : undefined;
      if (f.type === 'all') {
        const res = await tmdb<Page<MediaItem>>('/search/multi', { query, page: pageParam, include_adult: 'false' }, signal);
        return res;
      }
      const yearKey = f.type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
      const res = await tmdb<Page<MediaItem>>(
        `/search/${f.type}`,
        { query, page: pageParam, include_adult: 'false', [yearKey]: singleYear },
        signal,
      );
      return { ...res, results: res.results.map((m) => ({ ...m, media_type: f.type as 'movie' | 'tv' })) };
    },
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 50) ? last.page + 1 : undefined),
  });
}

export default function Search() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const filters = useMemo(() => parseFilters(params), [params]);
  const text = useTextSearch(query, filters);
  const browse = useDiscover(filters, !query);
  const active = query ? text : browse;
  useTitle(query ? `“${query}”` : 'Search');

  const items = useMemo(() => {
    const all = cleanList(active.data?.pages.flatMap((p) => p.results) ?? []);
    return query ? all.filter((m) => matchesFilters(m, filters)) : all;
  }, [active.data, query, filters]);

  // Filters can hide a whole page of text results; keep loading until something shows.
  const loadedPages = active.data?.pages.length ?? 0;
  const filteredEmpty = !!query && hasActiveFilters(filters) && items.length === 0 && active.hasNextPage && loadedPages < 5;
  const { isFetchingNextPage, fetchNextPage } = active;
  useEffect(() => {
    if (filteredEmpty && !isFetchingNextPage) fetchNextPage();
  }, [filteredEmpty, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-4 md:px-8 md:pt-8">
      <SearchBox className="mb-4 flex md:hidden" autoFocus={!query} />
      <h1 className="mb-5 truncate text-2xl font-semibold tracking-tight md:text-3xl">
        {query ? (
          <>
            Results for <span className="text-muted">“{query}”</span>
          </>
        ) : (
          'Browse'
        )}
      </h1>
      <FilterBar filters={filters} showType showSort={!query} />
      <div className="mt-6">
        <Grid
          items={items}
          loading={active.isPending || filteredEmpty}
          error={active.error}
          onRetry={() => active.refetch()}
          hasMore={active.hasNextPage}
          loadingMore={active.isFetchingNextPage}
          onLoadMore={() => !active.isFetchingNextPage && active.fetchNextPage()}
          empty={
            <p className="py-20 text-center text-muted">
              {query ? `No results for “${query}”${hasActiveFilters(filters) ? ' with these filters' : ''}.` : 'No titles match these filters.'}
            </p>
          }
        />
      </div>
    </div>
  );
}
