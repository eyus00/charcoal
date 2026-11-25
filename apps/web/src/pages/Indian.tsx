import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Clapperboard, Search, X } from 'lucide-react';
import Grid from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill, RowArrows, useRowScroll } from '../components/Row';
import Segmented from '../components/Segmented';
import { useLanguageDiscover, useLanguageSearch } from '../lib/browse';
import { SORTS, type SortKey } from '../lib/filters';
import { INDIAN_CODES, INDIAN_LANGUAGES } from '../lib/regional';
import { cleanList, type MediaType } from '../lib/tmdb';
import { useDebounced, useTitle } from '../lib/util';

const TYPES: { key: MediaType; label: string }[] = [
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV shows' },
];

/**
 * Indian cinema by language: Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Punjabi
 * and more. Each tab is TMDB's catalogue of titles made in that language (released or made in
 * India); the search box looks across all of them.
 */
export default function Indian() {
  const [params, setParams] = useSearchParams();
  const lang = INDIAN_CODES.includes(params.get('lang') ?? '') ? params.get('lang')! : INDIAN_CODES[0];
  const language = INDIAN_LANGUAGES.find((l) => l.code === lang)!;
  const type: MediaType = params.get('type') === 'tv' ? 'tv' : 'movie';
  const sort: SortKey = SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'popular';
  const query = (params.get('q') ?? '').trim();
  useTitle(query ? `“${query}” · Indian cinema` : `${language.name} · Indian cinema`);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  // The box keeps what is being typed; the URL (and the search) follow a moment later.
  const [text, setText] = useState(query);
  const typed = useDebounced(text.trim(), 350);
  useEffect(() => {
    if (typed !== query) set({ q: typed || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const browse = useLanguageDiscover({ language: lang, type, region: 'IN', sort }, !query);
  const found = useLanguageSearch(query, type, INDIAN_CODES);
  const active = query ? found : browse;
  const items = useMemo(() => cleanList(active.data?.pages.flatMap((p) => p.results) ?? [], type), [active.data, type]);

  // The language filter can empty whole pages of search results: keep going until something shows.
  const thin = !!query && items.length < 12 && !!found.hasNextPage && (found.data?.pages.length ?? 0) < 4;
  const { isFetchingNextPage, fetchNextPage } = found;
  useEffect(() => {
    if (thin && !isFetchingNextPage) fetchNextPage();
  }, [thin, isFetchingNextPage, fetchNextPage]);

  const { ref, scroll } = useRowScroll();

  return (
    <div className="pb-10">
      <PageTitle
        title="Indian cinema"
        body="Films and shows by the language they were made in. Their names in other scripts and spellings go along when sources are searched, so regional titles are found."
        action={
          <form role="search" onSubmit={(e) => e.preventDefault()} className="flex h-11 w-full items-center gap-2 rounded-full bg-surface pr-1.5 pl-4 ring-1 ring-white/[0.06] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent sm:w-72">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search Indian titles"
              aria-label="Search Indian titles"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {text && (
              <button type="button" aria-label="Clear search" onClick={() => setText('')} className="grid size-8 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white">
                <X className="size-4" />
              </button>
            )}
          </form>
        }
      />

      {/* Language tabs: hidden while searching, which covers every language at once. */}
      {!query && (
        <div className="mb-5 flex items-center gap-3">
          <div ref={ref} className="no-scrollbar scroll-row flex min-w-0 flex-1 gap-2.5 overflow-x-auto" role="group" aria-label="Language">
            {INDIAN_LANGUAGES.map((l) => (
              <Pill key={l.code} on={l.code === lang} onClick={() => set({ lang: l.code === INDIAN_CODES[0] ? null : l.code })}>
                {l.name}
              </Pill>
            ))}
          </div>
          <RowArrows onScroll={scroll} />
        </div>
      )}

      <div className="mb-7 flex flex-wrap items-center gap-3 lg:gap-4">
        <Segmented value={type} options={TYPES} onChange={(v) => set({ type: v === 'movie' ? null : v })} label="Show" />
        {query ? (
          <p className="text-sm text-muted">
            Results for “{query}” in any Indian language
          </p>
        ) : (
          <>
            <div className="flex gap-2.5" role="group" aria-label="Sort by">
              {SORTS.map((s) => (
                <Pill key={s.key} on={sort === s.key} onClick={() => set({ sort: s.key === 'popular' ? null : s.key })}>
                  {s.label}
                </Pill>
              ))}
            </div>
            <p className="ml-auto hidden text-sm text-faint md:block">
              {language.name} · {language.industry}
            </p>
          </>
        )}
      </div>

      <Grid
        items={items}
        type={type}
        loading={active.isPending || (thin && !items.length)}
        error={active.error}
        onRetry={() => active.refetch()}
        hasMore={active.hasNextPage}
        loadingMore={active.isFetchingNextPage}
        onLoadMore={() => !active.isFetchingNextPage && active.fetchNextPage()}
        empty={
          <Empty
            icon={Clapperboard}
            title={query ? `Nothing found for “${query}”` : `No ${language.name} ${type === 'movie' ? 'movies' : 'shows'} to show`}
            body={query ? 'Try another spelling: titles are matched in their own script and in English letters.' : 'Try another language, or switch between movies and TV shows.'}
          />
        }
      />
    </div>
  );
}
