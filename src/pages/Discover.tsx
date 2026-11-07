import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Compass, X } from 'lucide-react';
import { AdvancedFilters, FilterBar, useUrlFilters } from '../components/Filters';
import Grid from '../components/Grid';
import { useDiscover, useTextSearch, useTrendingPages } from '../lib/browse';
import { genresFor, hasActiveFilters, matchesFilters, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { cleanList } from '../lib/tmdb';
import { cx, useTitle } from '../lib/util';
import { Empty } from '../components/PageHeader';

const TYPES: { key: Filters['type']; label: string; title: string }[] = [
  { key: 'all', label: 'All', title: 'Discover' },
  { key: 'movie', label: 'Movies', title: 'Movies' },
  { key: 'tv', label: 'TV Shows', title: 'TV Shows' },
];

/** Search + browse in one place: everything, or only movies / only TV. */
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const query = (params.get('q') ?? '').trim();
  const set = useUrlFilters();
  const [open, setOpen] = useState(false);
  const kind = TYPES.find((t) => t.key === filters.type)!;

  // No search and no filters: show what's trending; otherwise search or browse the full catalog.
  const plain = !query && !hasActiveFilters(filters);
  const text = useTextSearch(query, filters);
  const browse = useDiscover(filters, !query && !plain);
  const trending = useTrendingPages(filters.type, plain);
  const active = query ? text : plain ? trending : browse;
  const items = useMemo(() => {
    const all = cleanList(active.data?.pages.flatMap((p) => p.results) ?? []);
    return query ? all.filter((m) => matchesFilters(m, filters)) : all;
  }, [active.data, query, filters]);

  // Filters can hide whole pages of text results; keep loading until something shows.
  const filteredEmpty = !!query && hasActiveFilters(filters) && items.length === 0 && !!active.hasNextPage && (active.data?.pages.length ?? 0) < 5;
  const { isFetchingNextPage, fetchNextPage } = active;
  useEffect(() => {
    if (filteredEmpty && !isFetchingNextPage) fetchNextPage();
  }, [filteredEmpty, isFetchingNextPage, fetchNextPage]);

  const total = query || plain ? undefined : browse.data?.pages[0]?.total;
  useTitle(query ? `“${query}”` : kind.title);

  const setType = (type: Filters['type']) => {
    // Drop genres that don't exist for the new type (e.g. Horror has no TV equivalent).
    const genres = filters.genres.filter((g) => genresFor(type).some((x) => x.slug === g));
    setParams(writeFilters(params, { type, genres }), { replace: true, preventScrollReset: true });
  };

  return (
    <div className="pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
<div className="inline-flex rounded-full bg-surface p-1" role="radiogroup" aria-label="Show">
        {TYPES.map((t) => (
          <button
            key={t.key}
            role="radio"
            aria-checked={filters.type === t.key}
            onClick={() => setType(t.key)}
            className={cx('h-10 rounded-full px-5 text-sm transition', filters.type === t.key ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
          >
            {t.label}
          </button>
        ))}
      </div>
        {hasActiveFilters(filters) && (
          <button onClick={() => set({ genres: [], from: undefined, to: undefined, rating: 0 })} className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition hover:bg-surface hover:text-white">
            <X className="size-4" /> Clear filters
          </button>
        )}
      </div>

      <FilterBar filters={filters} set={set} onOpen={() => setOpen(true)} />
      <Grid
        items={items}
        type={filters.type === 'all' ? undefined : filters.type}
        loading={active.isPending || filteredEmpty}
        error={active.error}
        onRetry={() => active.refetch()}
        hasMore={active.hasNextPage}
        loadingMore={active.isFetchingNextPage}
        onLoadMore={() => !active.isFetchingNextPage && active.fetchNextPage()}
        empty={
          <Empty
            icon={Compass}
            title={query ? `Nothing found for “${query}”` : 'Nothing matches these filters'}
            body={hasActiveFilters(filters) ? 'Try removing some filters.' : 'Try a different search.'}
          />
        }
      />
      <AdvancedFilters open={open} onClose={() => setOpen(false)} filters={filters} set={set} total={total} />
    </div>
  );
}
