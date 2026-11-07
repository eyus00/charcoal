import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Film, Tv, X, type LucideIcon } from 'lucide-react';
import { AdvancedFilters, FilterBar, useUrlFilters } from '../components/Filters';
import Grid from '../components/Grid';
import SearchInput from '../components/SearchInput';
import { useDiscover, useTextSearch } from '../lib/browse';
import { hasActiveFilters, matchesFilters, parseFilters } from '../lib/filters';
import { cleanList, type MediaType } from '../lib/tmdb';
import { useTitle } from '../lib/util';

/** Page title with result count, plus a clear-filters action. */
export function PageHeader({ label, title, count, onClear }: { icon?: LucideIcon; label?: string; title: ReactNode; count?: number; onClear?: () => void }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {label && <div className="mb-1 text-sm text-muted">{label}</div>}
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {count !== undefined && <span className="shrink-0 text-sm text-muted">{count.toLocaleString()} titles</span>}
        </div>
      </div>
      {onClear && (
        <button onClick={onClear} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm text-muted transition hover:bg-surface hover:text-white">
          <X className="size-4" /> Clear filters
        </button>
      )}
    </div>
  );
}

export default function Catalog({ type }: { type: MediaType }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params, type), [params, type]);
  const query = (params.get('q') ?? '').trim();
  const set = useUrlFilters();
  const [open, setOpen] = useState(false);

  // Searching here only looks in this catalog (movies OR tv), not everything.
  const text = useTextSearch(query, filters);
  const browse = useDiscover(filters, !query);
  const active = query ? text : browse;
  const items = useMemo(() => {
    const all = cleanList(active.data?.pages.flatMap((p) => p.results) ?? [], type);
    return query ? all.filter((m) => matchesFilters(m, filters)) : all;
  }, [active.data, query, filters, type]);

  // Filters can hide whole pages of text results; keep loading until something shows.
  const filteredEmpty = !!query && hasActiveFilters(filters) && items.length === 0 && !!active.hasNextPage && (active.data?.pages.length ?? 0) < 5;
  const { isFetchingNextPage, fetchNextPage } = active;
  useEffect(() => {
    if (filteredEmpty && !isFetchingNextPage) fetchNextPage();
  }, [filteredEmpty, isFetchingNextPage, fetchNextPage]);

  const total = query ? undefined : browse.data?.pages[0]?.total;
  const label = type === 'movie' ? 'Movies' : 'TV Shows';
  const clear = () => set({ genres: [], from: undefined, to: undefined, rating: 0 });
  useTitle(query ? `${label}: ${query}` : label);

  return (
    <div className="pb-10">
      <PageHeader title={label} count={total} onClear={hasActiveFilters(filters) ? clear : undefined} />
      <SearchInput
        key={type}
        value={query}
        placeholder={type === 'movie' ? 'Search movies' : 'Search TV shows'}
        onChange={(v) => {
          const next = new URLSearchParams(params);
          if (v) next.set('q', v);
          else next.delete('q');
          setParams(next, { replace: true, preventScrollReset: true });
        }}
      />
      <FilterBar filters={filters} set={set} onOpen={() => setOpen(true)} />
      <Grid
        items={items}
        type={type}
        loading={active.isPending || filteredEmpty}
        error={active.error}
        onRetry={() => active.refetch()}
        hasMore={active.hasNextPage}
        loadingMore={active.isFetchingNextPage}
        onLoadMore={() => !active.isFetchingNextPage && active.fetchNextPage()}
        empty={
          <Empty
            icon={type === 'movie' ? Film : Tv}
            title={query ? `No ${label.toLowerCase()} match “${query}”` : `No ${label.toLowerCase()} found`}
            body={hasActiveFilters(filters) ? 'Try removing some filters.' : 'Try a different search.'}
          />
        }
      />
      <AdvancedFilters open={open} onClose={() => setOpen(false)} filters={filters} set={set} total={total} />
    </div>
  );
}

export function Empty({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface px-6 py-20 text-center">
      <Icon className="size-8 text-faint" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{body}</p>
    </div>
  );
}
