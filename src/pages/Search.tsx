import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { AdvancedFilters, FilterBar, useUrlFilters } from '../components/Filters';
import Grid from '../components/Grid';
import { hasActiveFilters, matchesFilters, parseFilters, type Filters } from '../lib/filters';
import { cleanList, q, tmdb, type MediaItem, type Page } from '../lib/tmdb';
import { useTitle } from '../lib/util';
import { Empty, PageHeader, useDiscover } from './Catalog';

/** Text search. TMDB search only filters by year server-side; genre/rating/year ranges are applied to results. */
function useTextSearch(query: string, f: Filters) {
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

export default function Search() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const filters = useMemo(() => parseFilters(params), [params]);
  const set = useUrlFilters();
  const [open, setOpen] = useState(false);
  const filtering = hasActiveFilters(filters) || filters.type !== 'all';

  const text = useTextSearch(query, filters);
  const browse = useDiscover(filters, !query && filtering);
  // No query and no filters: show what's popular, like the old "Explore" page.
  const popular = useQuery({ ...q.trending('all', 'week'), enabled: !query && !filtering });

  const active = query ? text : browse;
  const items = useMemo(() => {
    if (!query && !filtering) return cleanList(popular.data?.results ?? []);
    const all = cleanList(active.data?.pages.flatMap((p) => p.results) ?? []);
    return query ? all.filter((m) => matchesFilters(m, filters)) : all;
  }, [active.data, popular.data, query, filtering, filters]);
  useTitle(query ? `“${query}”` : 'Search');

  // Filters can hide a whole page of text results; keep loading until something shows.
  const loaded = active.data?.pages.length ?? 0;
  const filteredEmpty = !!query && filtering && items.length === 0 && !!active.hasNextPage && loaded < 5;
  const { isFetchingNextPage, fetchNextPage } = active;
  useEffect(() => {
    if (filteredEmpty && !isFetchingNextPage) fetchNextPage();
  }, [filteredEmpty, isFetchingNextPage, fetchNextPage]);

  const usingPopular = !query && !filtering;
  const total = query ? items.length : usingPopular ? undefined : browse.data?.pages[0]?.total;
  const clear = () => set({ type: 'all', genres: [], from: undefined, to: undefined, rating: 0 });

  return (
    <div className="mx-auto max-w-7xl pb-10">
      <PageHeader icon={SearchIcon} label={query ? 'Search Results' : 'Explore'} title={query || 'Explore'} count={total} onClear={filtering ? clear : undefined} />
      <FilterBar filters={filters} set={set} onOpen={() => setOpen(true)} withType />
      <Grid
        items={items}
        loading={usingPopular ? popular.isPending : active.isPending || filteredEmpty}
        error={usingPopular ? popular.error : active.error}
        onRetry={() => (usingPopular ? popular.refetch() : active.refetch())}
        hasMore={!usingPopular && active.hasNextPage}
        loadingMore={active.isFetchingNextPage}
        onLoadMore={() => !active.isFetchingNextPage && active.fetchNextPage()}
        empty={<Empty icon={SearchIcon} title="No results found" body="We couldn't find anything matching your search. Try adjusting your filters or search for something else." />}
      />
      <AdvancedFilters open={open} onClose={() => setOpen(false)} filters={filters} set={set} withType total={total} />
    </div>
  );
}
