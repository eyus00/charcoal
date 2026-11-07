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

/** Header used by catalog + search pages (as in the original app). */
export function PageHeader({ icon: Icon, label, title, count, onClear }: { icon: LucideIcon; label: string; title: ReactNode; count?: number; onClear?: () => void }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 pt-2 md:mb-12 md:flex-row md:items-center md:gap-6 md:pt-8">
      <div className="min-w-0 space-y-3 md:space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-accent uppercase md:gap-3 md:text-xs">
          <Icon className="size-3.5 md:size-4" />
          <span>{label}</span>
        </div>
        <div className="flex min-w-0 items-baseline gap-3 md:gap-4">
          <h1 className="truncate text-3xl font-black tracking-tight md:text-5xl lg:text-6xl">{title}</h1>
          {count !== undefined && <span className="shrink-0 text-xl font-medium text-white/20 md:text-3xl">({count.toLocaleString()})</span>}
        </div>
      </div>
      {onClear && (
        <button
          onClick={onClear}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-accent px-4 py-2.5 text-xs font-bold shadow-lg shadow-accent/20 transition hover:bg-accent-hover active:scale-95 md:w-auto md:rounded-xl md:px-6 md:py-3.5 md:text-sm"
        >
          <X className="size-4" /> Clear All Filters
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
    <div className="mx-auto max-w-7xl pb-10">
      <PageHeader icon={type === 'movie' ? Film : Tv} label={`${label} Catalog`} title={label} count={total} onClear={hasActiveFilters(filters) ? clear : undefined} />
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
    <div className="flex flex-col items-center justify-center space-y-6 rounded-[2rem] border border-white/10 bg-white/5 py-24 text-center md:rounded-[3rem] md:py-32">
      <div className="grid size-24 place-items-center rounded-full border border-white/5 bg-white/5">
        <Icon className="size-10 text-white/20" />
      </div>
      <div className="space-y-2 px-6">
        <h3 className="text-2xl font-bold">{title}</h3>
        <p className="mx-auto max-w-md text-white/40">{body}</p>
      </div>
    </div>
  );
}
