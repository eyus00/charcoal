import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Pill } from "../components/Row";
import { StatTag, type Stat } from "../components/MediaCard";
import { useTraktUser } from "../lib/trakt";
import { fetchRecommendations, fetchTraktList } from "../lib/traktData";
import { useSearchParams } from "react-router";
import { Compass, X } from "lucide-react";
import { FilterBar, useUrlFilters } from "../components/Filters";
import Grid from "../components/Grid";
import { useDiscover, useTextSearch, useTrendingPages } from "../lib/browse";
import {
  genresFor,
  hasActiveFilters,
  matchesFilters,
  parseFilters,
  writeFilters,
  type Filters,
} from "../lib/filters";
import { cleanList } from "../lib/tmdb";
import { cx, useTitle } from "../lib/util";
import { Empty } from "../components/PageHeader";
import { btn } from "../components/Button";

type ListKey =
  "trending" | "popular" | "anticipated" | "watched" | "boxoffice" | "foryou";
const LISTS: { key: ListKey; label: string; hint: string }[] = [
  {
    key: "trending",
    label: "Trending now",
    hint: "What people are watching on Trakt right now.",
  },
  {
    key: "foryou",
    label: "For you",
    hint: "Picked from your Trakt ratings and history.",
  },
  {
    key: "popular",
    label: "Popular",
    hint: "The most popular titles on Trakt of all time.",
  },
  {
    key: "anticipated",
    label: "Most anticipated",
    hint: "What people are waiting for: on the most Trakt lists.",
  },
  {
    key: "watched",
    label: "Most watched this week",
    hint: "Watched by the most people on Trakt this week.",
  },
  {
    key: "boxoffice",
    label: "Box office",
    hint: "The top movies at the US box office this weekend.",
  },
];

const TYPES: { key: Filters["type"]; label: string; title: string }[] = [
  { key: "all", label: "All", title: "Discover" },
  { key: "movie", label: "Movies", title: "Movies" },
  { key: "tv", label: "TV shows", title: "TV shows" },
];

/** Search + browse in one place: everything, or only movies / only TV. */
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const query = (params.get("q") ?? "").trim();
  const set = useUrlFilters();
  const kind = TYPES.find((t) => t.key === filters.type)!;

  // No search and no filters: a Trakt list (what people are watching right now, by default).
  // Otherwise search or browse TMDB's full catalog. If Trakt can't be reached, TMDB's trending.
  const plain = !query && !hasActiveFilters(filters);
  const user = useTraktUser();
  const listParam = params.get("list") as ListKey | null;
  const list: ListKey =
    LISTS.some((l) => l.key === listParam) && (listParam !== "foryou" || user)
      ? listParam!
      : "trending";
  const text = useTextSearch(query, filters);
  const browse = useDiscover(filters, !query && !plain);
  const traktList = useInfiniteQuery({
    queryKey: ["trakt", "list", filters.type, list, user?.username],
    enabled: plain,
    staleTime: 5 * 60_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) =>
      list === "foryou"
        ? { entries: await fetchRecommendations(filters.type), pages: 1 }
        : fetchTraktList(filters.type, list, pageParam, signal),
    getNextPageParam: (last, all) =>
      all.length < Math.min(last.pages, 10) ? all.length + 1 : undefined,
  });
  const fallback = useTrendingPages(filters.type, plain && traktList.isError);
  const tmdbActive = query ? text : plain ? fallback : browse;
  const useTrakt = plain && !traktList.isError;
  const stats = useMemo(() => {
    const m = new Map<string, Stat>();
    for (const p of traktList.data?.pages ?? [])
      for (const e of p.entries)
        if (e.stat) m.set(`${e.item.media_type}-${e.item.id}`, e.stat);
    return m;
  }, [traktList.data]);
  const items = useMemo(() => {
    if (useTrakt) {
      const seen = new Set<string>();
      return (
        traktList.data?.pages.flatMap((p) => p.entries.map((e) => e.item)) ?? []
      ).filter((m) => {
        const k = `${m.media_type}-${m.id}`;
        return !seen.has(k) && !!seen.add(k);
      });
    }
    const all = cleanList(
      tmdbActive.data?.pages.flatMap((p) => p.results) ?? [],
    );
    return query ? all.filter((m) => matchesFilters(m, filters)) : all;
  }, [useTrakt, traktList.data, tmdbActive.data, query, filters]);
  const active = useTrakt ? traktList : tmdbActive;
  const setList = (key: ListKey) => {
    const next = new URLSearchParams(params);
    if (key === "trending") next.delete("list");
    else next.set("list", key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  // Filters can hide whole pages of text results; keep loading until something shows.
  const filteredEmpty =
    !!query &&
    hasActiveFilters(filters) &&
    items.length === 0 &&
    !!active.hasNextPage &&
    (active.data?.pages.length ?? 0) < 5;
  const { isFetchingNextPage, fetchNextPage } = active;
  useEffect(() => {
    if (filteredEmpty && !isFetchingNextPage) fetchNextPage();
  }, [filteredEmpty, isFetchingNextPage, fetchNextPage]);

  useTitle(query ? `“${query}”` : kind.title);

  const setType = (type: Filters["type"]) => {
    // Drop genres that don't exist for the new type (e.g. Horror has no TV equivalent).
    const genres = filters.genres.filter((g) =>
      genresFor(type).some((x) => x.slug === g),
    );
    setParams(writeFilters(params, { type, genres }), {
      replace: true,
      preventScrollReset: true,
    });
  };

  return (
    <div className="pb-10">
      {query && (
        <div className="mb-5">
          <p className="text-sm text-muted">
            {filters.type !== "all" ? `${kind.label} matching` : "Results for"}
          </p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight md:text-3xl">
            “{query}”
          </h1>
        </div>
      )}
      {/* Type switch + quick filters: two rows on phones, one row on desktop. */}
      <div className="mb-7 flex flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-4">
        <div
          className="inline-flex shrink-0 rounded-full bg-surface p-1"
          role="group"
          aria-label="Show"
        >
          {TYPES.map((t) => (
            <button
              key={t.key}
              aria-pressed={filters.type === t.key}
              onClick={() => setType(t.key)}
              className={cx(
                "h-10 rounded-full px-5 text-sm transition",
                filters.type === t.key
                  ? "bg-white font-medium text-black"
                  : "text-white/75 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {hasActiveFilters(filters) && (
          <button
            onClick={() =>
              set({ genres: [], from: undefined, to: undefined, rating: 0 })
            }
            aria-label="Clear filters"
            className={cx(btn(), "ml-auto lg:ml-0")}
          >
            <X className="size-4" strokeWidth={1.5} /> Clear
          </button>
        )}
        <FilterBar
          filters={filters}
          set={set}
          className="order-last basis-full lg:order-none lg:basis-auto lg:flex-1"
        />
      </div>

      {/* What to browse when not searching or filtering: Trakt's live lists. */}
      {plain && (
        <div
          className="no-scrollbar -mt-3 mb-6 flex gap-2 overflow-x-auto"
          role="group"
          aria-label="Lists"
        >
          {LISTS.filter(
            (l) =>
              (l.key !== "foryou" || user) &&
              (l.key !== "boxoffice" || filters.type !== "tv"),
          ).map((l) => (
            <Pill
              key={l.key}
              on={list === l.key}
              onClick={() => setList(l.key)}
            >
              {l.label}
            </Pill>
          ))}
          {!user && (
            <span className="flex shrink-0 items-center pl-2 text-xs text-faint">
              Connect Trakt in Settings for picks just for you
            </span>
          )}
        </div>
      )}
      {plain && useTrakt && (
        <p className="-mt-3 mb-5 text-sm text-muted">
          {LISTS.find((l) => l.key === list)?.hint}
        </p>
      )}

      <Grid
        badgeFor={
          useTrakt
            ? (m) => {
                const st = stats.get(`${m.media_type}-${m.id}`);
                return st ? <StatTag stat={st} /> : null;
              }
            : undefined
        }
        items={items}
        type={filters.type === "all" ? undefined : filters.type}
        loading={active.isPending || filteredEmpty}
        error={active.error}
        onRetry={() => active.refetch()}
        hasMore={active.hasNextPage}
        loadingMore={active.isFetchingNextPage}
        onLoadMore={() => !active.isFetchingNextPage && active.fetchNextPage()}
        empty={
          <Empty
            icon={Compass}
            title={
              query
                ? `Nothing found for “${query}”`
                : "Nothing matches these filters"
            }
            body={
              hasActiveFilters(filters)
                ? "Try removing some filters."
                : "Try a different search."
            }
          />
        }
      />
    </div>
  );
}
