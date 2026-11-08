import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Compass, X } from 'lucide-react';
import { FilterBar, useUrlFilters } from '../components/Filters';
import Grid from '../components/Grid';
import { useDiscover, useTextSearch, useTrendingPages } from '../lib/browse';
import { genresFor, hasActiveFilters, matchesFilters, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { cleanList } from '../lib/tmdb';
import { cx, useTitle } from '../lib/util';
import { Empty } from '../components/PageHeader';
import { btn } from '../components/Button';

const TYPES: { key: Filters['type']; label: string; title: string }[] = [
  { key: 'all', label: 'All', title: 'Discover' },
  { key: 'movie', label: 'Movies', title: 'Movies' },
  { key: 'tv', label: 'TV shows', title: 'TV shows' },
];

/** Search + browse in one place: everything, or only movies / only TV. */
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const query = (params.get('q') ?? '').trim();
  const set = useUrlFilters();
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

  useTitle(query ? `“${query}”` : kind.title);

  const setType = (type: Filters['type']) => {
    // Drop genres that don't exist for the new type (e.g. Horror has no TV equivalent).
    const genres = filters.genres.filter((g) => genresFor(type).some((x) => x.slug === g));
    setParams(writeFilters(params, { type, genres }), { replace: true, preventScrollReset: true });
  };

  return (
    <div className="pb-10">
      {query && (
        <div className="mb-5">
          <p className="text-sm text-muted">{filters.type !== 'all' ? `${kind.label} matching` : 'Results for'}</p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight md:text-3xl">“{query}”</h1>
        </div>
      )}
      {/* Type switch + quick filters: two rows on phones, one row on desktop. */}
      <div className="mb-7 flex flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-4">
        <div className="inline-flex shrink-0 rounded-full bg-surface p-1" role="group" aria-label="Show">
          {TYPES.map((t) => (
            <button
              key={t.key}
              aria-pressed={filters.type === t.key}
              onClick={() => setType(t.key)}
              className={cx('h-10 rounded-full px-5 text-sm transition', filters.type === t.key ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
            >
              {t.label}
            </button>
          ))}
        </div>
        {hasActiveFilters(filters) && (
          <button
            onClick={() => set({ genres: [], from: undefined, to: undefined, rating: 0 })}
            aria-label="Clear filters"
            className={cx(btn(), 'ml-auto lg:ml-0')}
          >
            <X className="size-4" strokeWidth={1.5} /> Clear
          </button>
        )}
        <FilterBar filters={filters} set={set} className="order-last basis-full lg:order-none lg:basis-auto lg:flex-1" />
      </div>

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
    </div>
  );
}
