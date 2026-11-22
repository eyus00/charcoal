/**
 * Home recommendations, from TMDB and Trakt together.
 *
 * TMDB's lists alone are noisy: they rank by raw page views worldwide, so regional soaps, talk
 * shows and titles almost nobody here has heard of float up. Trakt counts how many people are
 * watching right now, which tracks what's actually being watched. We combine them and then:
 *
 * 1. Gate: drop titles unlikely to matter to you. A title must be in a language you watch, or be a
 *    global hit (lots of votes). No talk shows, news, soaps, reality or kids' TV, unless you watch
 *    those. Established titles need enough votes and a fair rating.
 * 2. Score: live Trakt watchers + TMDB trending rank + a quality score (a rating weighed by its
 *    number of votes) + how well the genres match what you watch.
 *
 * Your taste comes from this browser's history and watchlist (and Trakt when connected). It needs
 * no account: with no history it falls back to sensible defaults.
 */
import { useMemo } from 'react';
import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { q, tmdb, typeOf, type Details, type MediaItem, type MediaType, type Page } from './tmdb';
import { trakt, traktSend, useTraktUser } from './trakt';
import { toItem, type TMedia } from './traktData';
import { useStore } from './store';

const key = (type: MediaType, id: number) => `${type}-${id}`;
export const itemKey = (m: MediaItem, type?: MediaType) => key(typeOf(m, type), m.id);

// ---------- genres ----------

// TV genres folded into their movie equivalents, so taste carries across movies and shows.
const FOLD: Record<number, number[]> = { 10759: [28, 12], 10765: [878, 14], 10768: [10752] };
/** TV genres that are rarely what people come here for. */
const NICHE = new Set([10763, 10764, 10766, 10767, 10762]); // news, reality, soap, talk, kids
const TRAKT_GENRES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  anime: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  musical: 10402,
  mystery: 9648,
  romance: 10749,
  'science-fiction': 878,
  thriller: 53,
  suspense: 53,
  war: 10752,
  western: 37,
  reality: 10764,
  'game-show': 10764,
  soap: 10766,
  'talk-show': 10767,
  news: 10763,
  children: 10762,
};
const genresOf = (m: MediaItem) => (m.genre_ids ?? []).flatMap((g) => FOLD[g] ?? [g]);

/** A Trakt title as a card, carrying what the gate and score need. */
export function fromTrakt(type: MediaType, t: TMedia): MediaItem | null {
  const item = toItem(type, t);
  if (!item) return null;
  return {
    ...item,
    original_language: t.language ?? undefined,
    vote_count: t.votes,
    vote_average: t.rating ?? 0,
    genre_ids: (t.genres ?? []).map((g) => TRAKT_GENRES[g]).filter(Boolean),
  };
}

// ---------- your taste ----------

export interface Taste {
  /** Languages you watch (always includes English and the browser's language). */
  langs: Set<string>;
  /** Genre → 0…1, how much of what you watch is this genre. */
  genres: Map<number, number>;
  /** Titles you've finished. */
  seen: Set<string>;
  /** Titles you've started or saved. */
  known: Set<string>;
  /** Your most recent titles, for "because you watched". */
  seeds: { type: MediaType; id: number }[];
  /** No history yet: scores lean on popularity and quality. */
  cold: boolean;
}

/** Your taste, from history + watchlist (and the details of your most recent titles). */
/** The light query, starting from the full details if they're already loaded (no second request). */
const liteOrFull = (qc: QueryClient, type: MediaType, id: number) => {
  const full = qc.getQueryState<Details>(q.details(type, id).queryKey);
  return { ...q.lite(type, id), initialData: full?.data, initialDataUpdatedAt: full?.dataUpdatedAt };
};

export function useTaste(): Taste {
  const qc = useQueryClient();
  const history = useStore((s) => s.history);
  const watchlist = useStore((s) => s.watchlist);
  const seeds = useMemo(() => {
    const out: { type: MediaType; id: number; w: number }[] = [];
    const seen = new Set<string>();
    const add = (type: MediaType, id: number, w: number) => {
      const k = key(type, id);
      if (seen.has(k) || out.length >= 12) return;
      seen.add(k);
      out.push({ type, id, w });
    };
    history.forEach((h, i) => add(h.mediaType, h.id, 1 / (1 + i * 0.15)));
    watchlist.forEach((w) => add(w.mediaType, w.id, 0.5));
    return out;
  }, [history, watchlist]);
  const details = useQueries({ queries: seeds.map((s) => liteOrFull(qc, s.type, s.id)) });
  const ready = details.map((d) => d.data?.id ?? 0).join(',');

  return useMemo(() => {
    const langCount = new Map<string, number>();
    const genres = new Map<number, number>();
    let total = 0;
    details.forEach((d, i) => {
      const data = d.data as Details | undefined;
      if (!data) return;
      const w = seeds[i].w;
      total += w;
      if (data.original_language) langCount.set(data.original_language, (langCount.get(data.original_language) ?? 0) + 1);
      for (const g of data.genres.flatMap((x) => FOLD[x.id] ?? [x.id])) genres.set(g, (genres.get(g) ?? 0) + w);
    });
    const max = Math.max(0, ...genres.values());
    if (max) for (const [g, v] of genres) genres.set(g, v / max);
    const browser = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2);
    const langs = new Set(['en', browser]);
    const n = [...langCount.values()].reduce((a, b) => a + b, 0);
    for (const [l, c] of langCount) if (c >= 2 || c / n >= 0.25) langs.add(l);
    const seenSet = new Set<string>();
    const known = new Set<string>();
    for (const h of history) {
      known.add(key(h.mediaType, h.id));
      if (h.mediaType === 'movie' && h.isCompleted) seenSet.add(key(h.mediaType, h.id));
    }
    for (const w of watchlist) {
      known.add(key(w.mediaType, w.id));
      if (w.status === 'completed') seenSet.add(key(w.mediaType, w.id));
    }
    return { langs, genres, seen: seenSet, known, seeds, cold: total === 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, history, watchlist, seeds]);
}

// ---------- gate + score ----------

const today = () => new Date().toISOString().slice(0, 10);

/** Is this worth showing to you at all? */
export function relevant(m: MediaItem, taste: Taste): boolean {
  if (!m.poster_path && !m.poster_url) return false;
  const votes = m.vote_count ?? 0;
  const g = genresOf(m);
  // Talk shows, news, soaps, reality and kids' TV only if you watch them.
  if (g.some((x) => NICHE.has(x) && !(taste.genres.get(x) ?? 0))) return false;
  // Another language: only global hits (Squid Game, Parasite…), or languages you watch.
  const lang = m.original_language;
  if (lang && !taste.langs.has(lang) && votes < 1500) return false;
  // Anime only if you watch animation.
  if (lang === 'ja' && g.includes(16) && !(taste.genres.get(16) ?? 0) && votes < 4000) return false;
  const date = m.release_date || m.first_air_date || '';
  const released = !!date && date <= today();
  // Out for a while but barely anyone has rated it: obscure.
  if (released && votes < 25 && (m.popularity ?? 0) < 60) return false;
  // Plenty of ratings and they're poor.
  if (votes >= 80 && m.vote_average > 0 && m.vote_average < 5.4) return false;
  return true;
}

/** A rating weighed by how many people gave it (few votes pull toward the average), as 0…1. */
export function quality(m: MediaItem) {
  const v = m.vote_count ?? 0;
  const k = 300;
  const r = (v / (v + k)) * (m.vote_average || 6.5) + (k / (v + k)) * 6.5;
  return Math.max(0, Math.min(1, (r - 5.5) / 3));
}

/** How well a title's genres match what you watch, 0…1 (0.5 with no history). */
export function affinity(m: MediaItem, taste: Taste) {
  if (taste.cold) return 0.5;
  const g = genresOf(m);
  if (!g.length) return 0.3;
  const top = g.map((x) => taste.genres.get(x) ?? 0).sort((a, b) => b - a);
  return (top[0] ?? 0) * 0.6 + (top[1] ?? 0) * 0.4;
}

// ---------- trending: Trakt watchers + TMDB trending ----------

export interface Ranked {
  item: MediaItem;
  /** People watching right now on Trakt. */
  watchers?: number;
  score: number;
}

interface Candidate {
  item: MediaItem;
  watchers: number;
  day?: number;
  week?: number;
}

const tmdbBasic = async (type: MediaType, id: number): Promise<MediaItem | null> => {
  const d = await tmdb<Details & { popularity?: number; vote_count?: number }>(`/${type}/${id}`).catch(() => null);
  if (!d) return null;
  return {
    id: d.id,
    media_type: type,
    title: d.title,
    name: d.name,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    overview: d.overview,
    vote_average: d.vote_average,
    vote_count: d.vote_count,
    release_date: d.release_date,
    first_air_date: d.first_air_date,
    genre_ids: d.genres.map((g) => g.id),
    popularity: d.popularity,
    original_language: d.original_language,
  };
};

/** Everything trending now, from both sources, merged by title. Cached for 15 minutes. */
async function fetchTrendingPool(signal: AbortSignal): Promise<Candidate[]> {
  const ext = 'extended=full,images';
  type TRow = { watchers: number; movie?: TMedia; show?: TMedia };
  const [day, week, week2, tm, ts] = await Promise.all([
    tmdb<Page<MediaItem>>('/trending/all/day', {}, signal),
    tmdb<Page<MediaItem>>('/trending/all/week', {}, signal),
    tmdb<Page<MediaItem>>('/trending/all/week', { page: 2 }, signal).catch(() => null),
    trakt<TRow[]>(`/movies/trending?limit=40&${ext}`, signal).catch(() => null),
    trakt<TRow[]>(`/shows/trending?limit=40&${ext}`, signal).catch(() => null),
  ]);
  const pool = new Map<string, Candidate>();
  const addTmdb = (list: MediaItem[], field: 'day' | 'week', offset = 0) =>
    list.forEach((m, i) => {
      if (m.media_type !== 'movie' && m.media_type !== 'tv') return;
      const k = itemKey(m);
      const c = pool.get(k) ?? { item: m, watchers: 0 };
      if (c[field] === undefined) c[field] = i + offset;
      pool.set(k, c);
    });
  addTmdb(day.results, 'day');
  addTmdb(week.results, 'week');
  if (week2) addTmdb(week2.results, 'week', week.results.length);
  const missing: { type: MediaType; id: number; watchers: number; t: TMedia }[] = [];
  for (const [type, rows] of [
    ['movie', tm?.data ?? []],
    ['tv', ts?.data ?? []],
  ] as const) {
    for (const r of rows) {
      const t = (r.movie ?? r.show)!;
      const id = t.ids.tmdb;
      if (!id) continue;
      const c = pool.get(key(type, id));
      if (c) c.watchers = r.watchers;
      else missing.push({ type, id, watchers: r.watchers, t });
    }
  }
  // Big on Trakt but not in TMDB's lists: fetch their TMDB basics (images, genres) for the top ones.
  const top = missing.sort((a, b) => b.watchers - a.watchers).slice(0, 14);
  const filled = await Promise.all(top.map((x) => tmdbBasic(x.type, x.id)));
  filled.forEach((item, i) => item && pool.set(key(top[i].type, item.id), { item, watchers: top[i].watchers }));
  return [...pool.values()];
}

export const trendingPoolQ = {
  queryKey: ['hybrid', 'trending'],
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchTrendingPool(signal),
  staleTime: 15 * 60_000,
};

/** Trending now, filtered to what's relevant to you and ranked. */
export function useTrending() {
  const taste = useTaste();
  const { data, isPending, isError } = useQuery(trendingPoolQ);
  const ranked = useMemo<Ranked[]>(() => {
    if (!data) return [];
    const maxW = Math.max(1, ...data.map((c) => c.watchers));
    return data
      .filter((c) => relevant(c.item, taste))
      .map((c) => {
        const w = c.watchers ? Math.log1p(c.watchers) / Math.log1p(maxW) : 0;
        const d = c.day !== undefined ? 1 - c.day / 20 : 0;
        const wk = c.week !== undefined ? 1 - c.week / 40 : 0;
        const both = c.watchers && (c.day !== undefined || c.week !== undefined) ? 0.05 : 0;
        const score = 0.38 * w + 0.24 * d + 0.1 * wk + 0.16 * quality(c.item) + 0.12 * affinity(c.item, taste) + both;
        return { item: c.item, watchers: c.watchers || undefined, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [data, taste]);
  return { items: ranked, isPending, isError };
}

/** The keys of the 3 titles with the most people watching, mapped to their rank (1–3). */
export function topWatched(list: Ranked[]) {
  return new Map(
    [...list]
      .filter((r) => r.watchers)
      .sort((a, b) => b.watchers! - a.watchers!)
      .slice(0, 3)
      .map((r, i) => [itemKey(r.item), { rank: i + 1, watchers: r.watchers! }] as const),
  );
}

/** Filter + rank any TMDB list (genre rows, airing, in theaters…) for you. */
export function refine(items: MediaItem[], taste: Taste, type?: MediaType, opts: { popularity?: number } = {}) {
  const maxP = Math.max(1, ...items.map((m) => m.popularity ?? 0));
  const pw = opts.popularity ?? 0.35;
  return items
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => relevant(m, taste))
    .map(({ m, i }) => {
      const known = taste.known.has(itemKey(m, type)) ? 0.25 : 0;
      const pop = Math.log1p(m.popularity ?? 0) / Math.log1p(maxP);
      const order = 1 - i / items.length;
      return { m, s: pw * pop + 0.15 * order + 0.25 * quality(m) + 0.25 * affinity(m, taste) + known };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

// ---------- for you ----------

/**
 * Picks for you: titles recommended by several of your recent titles (TMDB), plus Trakt's own
 * recommendations when connected, scored by agreement, genre match and quality. Leaves out
 * things you've started, saved or finished.
 */
export function useForYou() {
  const qc = useQueryClient();
  const taste = useTaste();
  const user = useTraktUser();
  const recs = useQueries({ queries: taste.seeds.slice(0, 8).map((s) => liteOrFull(qc, s.type, s.id)) });
  const traktRecs = useQuery({
    queryKey: ['hybrid', 'trakt-recs', user?.username],
    enabled: !!user,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const get = (k: 'movies' | 'shows') =>
        traktSend<TMedia[]>('GET', `/recommendations/${k}?limit=40&ignore_collected=true&ignore_watchlisted=true&extended=full,images`).catch(() => [] as TMedia[]);
      const [m, s] = await Promise.all([get('movies'), get('shows')]);
      return [...(m ?? []).map((t) => fromTrakt('movie', t)), ...(s ?? []).map((t) => fromTrakt('tv', t))].filter((x): x is MediaItem => !!x);
    },
  });
  const sig = recs.map((r) => r.dataUpdatedAt).join(',') + traktRecs.dataUpdatedAt;
  const items = useMemo(() => {
    const votes = new Map<string, { item: MediaItem; n: number; trakt: boolean }>();
    recs.forEach((r, i) => {
      const d = r.data as Details | undefined;
      if (!d) return;
      const type = taste.seeds[i].type;
      for (const m of (d.recommendations?.results ?? []).slice(0, 20)) {
        const k = itemKey(m, type);
        const e = votes.get(k) ?? { item: { ...m, media_type: m.media_type ?? type }, n: 0, trakt: false };
        e.n += 1;
        votes.set(k, e);
      }
    });
    for (const m of traktRecs.data ?? []) {
      const k = itemKey(m);
      const e = votes.get(k);
      if (e) e.trakt = true;
      else votes.set(k, { item: m, n: 0, trakt: true });
    }
    const maxN = Math.max(1, ...[...votes.values()].map((v) => v.n));
    return [...votes.entries()]
      .filter(([k, v]) => !taste.known.has(k) && !taste.seen.has(k) && relevant(v.item, taste))
      .map(([, v]) => ({
        item: v.item,
        s: 0.34 * (v.n / maxN) + (v.trakt ? 0.22 : 0) + 0.24 * affinity(v.item, taste) + 0.15 * quality(v.item) + 0.05 * Math.min(1, Math.log1p(v.item.popularity ?? 0) / 6),
      }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.item)
      .slice(0, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, taste]);
  const loading = recs.some((r) => r.isPending) || (!!user && traktRecs.isPending);
  return { items, loading, hasSeeds: taste.seeds.length > 0 || !!user };
}
