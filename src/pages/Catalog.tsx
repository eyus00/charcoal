import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Film, Tv, X, type LucideIcon } from 'lucide-react';
import { AdvancedFilters, FilterBar, useUrlFilters } from '../components/Filters';
import Grid from '../components/Grid';
import { discoverParams, hasActiveFilters, parseFilters, type Filters } from '../lib/filters';
import { cleanList, tmdb, type MediaItem, type MediaType, type Page } from '../lib/tmdb';
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
      return { results, more: pages.some((p) => pageParam < Math.min(p.total_pages, 500)), total: pages.reduce((n, p) => n + p.total_results, 0) };
    },
    getNextPageParam: (last, _all, page) => (last.more ? page + 1 : undefined),
  });
}

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
  const [params] = useSearchParams();
  const filters = useMemo(() => parseFilters(params, type), [params, type]);
  const set = useUrlFilters();
  const [open, setOpen] = useState(false);
  const query = useDiscover(filters);
  const items = useMemo(() => cleanList(query.data?.pages.flatMap((p) => p.results) ?? [], type), [query.data, type]);
  const total = query.data?.pages[0]?.total;
  const label = type === 'movie' ? 'Movies' : 'TV Shows';
  const clear = () => set({ genres: [], from: undefined, to: undefined, rating: 0 });
  useTitle(label);

  return (
    <div className="pb-10">
      <PageHeader title={label} count={total} onClear={hasActiveFilters(filters) ? clear : undefined} />
      <FilterBar filters={filters} set={set} onOpen={() => setOpen(true)} />
      <Grid
        items={items}
        type={type}
        loading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        onLoadMore={() => !query.isFetchingNextPage && query.fetchNextPage()}
        empty={<Empty icon={type === 'movie' ? Film : Tv} title={`No ${label.toLowerCase()} found`} body={`We couldn't find any ${label.toLowerCase()} matching your filters. Try adjusting your selection.`} />}
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
