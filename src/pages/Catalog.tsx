import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Film, Search, Tv, X, type LucideIcon } from 'lucide-react';
import { AdvancedFilters, FilterBar, useUrlFilters } from '../components/Filters';
import Grid from '../components/Grid';
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
      <CatalogSearch
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

/** Search box scoped to the catalog page; updates ?q= as you type (debounced). */
function CatalogSearch({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setText(value);
  }, [value]);
  useEffect(() => {
    if (!typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      if (text.trim() !== value) onChange(text.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <form role="search" className="mb-4 max-w-xl" onSubmit={(e) => (e.preventDefault(), (typing.current = false), onChange(text.trim()), (document.activeElement as HTMLElement)?.blur())}>
      <div className="flex h-12 items-center gap-3 rounded-full bg-surface pr-1.5 pl-4 ring-1 ring-white/5 transition focus-within:ring-white/25">
        <Search className="size-[18px] shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => {
            typing.current = true;
            setText(e.target.value);
          }}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button type="button" aria-label="Clear search" onClick={() => ((typing.current = false), setText(''), onChange(''))} className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        )}
      </div>
    </form>
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
