/**
 * What's coming out, picked for relevance: the Calendar page and Home's "Airing this week".
 *
 * Sources: Trakt's episode calendar (every show, every network), Trakt's streaming release
 * calendar, and TMDB's theatrical releases (Trakt has few votes on films before they open).
 *
 * Every entry passes the same gate as Home (lib/recommend: languages you watch, no talk shows /
 * soaps / reality unless you watch them, no obscure titles). Then it's ranked:
 * - your shows (watchlist, history, Trakt) always make it, first;
 * - others need a real audience (Trakt votes), get a boost for premieres and finales, plus genre
 *   match and quality;
 * - each day keeps its best few, so a day isn't flooded by one network's lineup.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tmdb, type MediaItem, type MediaType, type Page } from './tmdb';
import { trakt, traktSend, useTraktUser } from './trakt';
import { tImg, type TEpisode, type TMedia } from './traktData';
import { affinity, fromTrakt, quality, relevant, useTaste, type Taste } from './recommend';
import { useStore } from './store';

export const DAY = 86_400_000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** What makes a release special: shown as a frame around the card's image with this label. */
export type Label = 'Premiere' | 'New season' | 'Finale' | 'Series finale' | 'Full season' | 'Special' | 'New to streaming' | 'In theaters';

export interface AiringEpisode {
  season: number;
  number: number;
  /** Empty when the listed name is a placeholder ("Episode 5", "TBA", a time). */
  name: string;
  runtime?: number;
  overview?: string;
  image?: string;
  /** This episode's own tag (only the last of a batch is the finale). */
  label?: Label;
}

export interface Airing {
  key: string;
  kind: 'episode' | 'movie';
  type: MediaType;
  id: number;
  title: string;
  /** Line 2: "S2 E5", "S5 E1–8", "Special 12" (films: year · rating). */
  se?: string;
  /** The episode's name when there's just one (and it's a real name). */
  epName?: string;
  season?: number;
  episode?: number;
  at: number;
  allDay?: boolean;
  image?: string;
  poster?: string;
  network?: string;
  /** Minutes; for several episodes, their total. */
  runtime?: number;
  label?: Label;
  /** Every episode out that day (shows). */
  episodes?: AiringEpisode[];
  yours: boolean;
  score: number;
}

type EpRow = { first_aired: string; episode: TEpisode & { episode_type?: string; runtime?: number; overview?: string | null }; show: TMedia };
type MovieRow = { released: string; movie: TMedia & { runtime?: number } };

const epLabel = (t?: string): Label | undefined =>
  t === 'series_premiere' ? 'Premiere' : t === 'season_premiere' ? 'New season' : t === 'series_finale' ? 'Series finale' : t === 'season_finale' || t === 'mid_season_finale' ? 'Finale' : undefined;
/** Trakt lists placeholders as names: "Episode 5", "TBA", even air times. */
export const realName = (n?: string | null) => (n && !/^(episode \d+|tba|tbd)$/i.test(n.trim()) && !/^\d{1,2}:\d\d/.test(n) ? n : '');

interface Raw {
  eps: EpRow[];
  mine: EpRow[];
  streaming: MovieRow[];
  theaters: MediaItem[];
}

async function fetchRaw(start: Date, days: number, langs: string[], signed: boolean, signal: AbortSignal): Promise<Raw> {
  const d = ymd(start);
  const ext = 'extended=full,images';
  const lang = `&languages=${langs.join(',')}`;
  const end = ymd(new Date(start.getTime() + (days - 1) * DAY));
  const [eps, mine, streaming, theaters] = await Promise.all([
    trakt<EpRow[]>(`/calendars/all/shows/${d}/${days}?${ext}${lang}`, signal)
      .then((r) => r.data)
      .catch(() => [] as EpRow[]),
    signed ? traktSend<EpRow[]>('GET', `/calendars/my/shows/${d}/${days}?${ext}`).catch(() => [] as EpRow[]) : Promise.resolve([] as EpRow[]),
    trakt<MovieRow[]>(`/calendars/all/streaming/${d}/${days}?${ext}${lang}`, signal)
      .then((r) => r.data)
      .catch(() => [] as MovieRow[]),
    tmdb<Page<MediaItem>>(
      '/discover/movie',
      { 'primary_release_date.gte': d, 'primary_release_date.lte': end, with_release_type: '3|2', region: 'US', sort_by: 'popularity.desc', include_adult: 'false' },
      signal,
    )
      .then((p) => p.results)
      .catch(() => [] as MediaItem[]),
  ]);
  return { eps: eps ?? [], mine: mine ?? [], streaming: streaming ?? [], theaters };
}

/** Pick and rank a week (or any span) of releases for you. */
function pick(raw: Raw, taste: Taste, perDay: number, library: Set<string>): Airing[] {
  const out: Airing[] = [];
  const mineShows = new Set(raw.mine.map((r) => r.show.ids.tmdb));
  // Yours: your library (and, connected to Trakt, the shows Trakt lists as yours).
  const isYours = (type: MediaType, id: number) => library.has(`${type}-${id}`) || (type === 'tv' && mineShows.has(id));

  // Episodes: one entry per show per day (a whole season dropped at once becomes "E1–8").
  const groups = new Map<string, EpRow[]>();
  for (const r of [...raw.mine, ...raw.eps]) {
    const id = r.show.ids.tmdb;
    if (!id || !r.first_aired) continue;
    const k = `${id}-${ymd(new Date(r.first_aired))}`;
    const g = groups.get(k) ?? [];
    if (!g.some((x) => x.episode.ids.trakt === r.episode.ids.trakt)) g.push(r);
    groups.set(k, g);
  }
  const maxVotes = Math.max(1, ...raw.eps.map((r) => r.show.votes ?? 0));
  for (const g of groups.values()) {
    g.sort((a, b) => a.episode.season - b.episode.season || a.episode.number - b.episode.number);
    const first = g[0];
    const show = first.show;
    const id = show.ids.tmdb!;
    const yours = isYours('tv', id);
    const item = fromTrakt('tv', show);
    const last = g[g.length - 1];
    const special = first.episode.season === 0;
    const label: Label | undefined = special ? 'Special' : g.length >= 3 && first.episode.number === 1 ? 'Full season' : (epLabel(last.episode.episode_type) ?? epLabel(first.episode.episode_type));
    const votes = show.votes ?? 0;
    if (!yours) {
      if (!item || !relevant(item, taste)) continue;
      // A real audience; premieres of newer shows get a lower bar.
      if (votes < (label === 'Premiere' || label === 'New season' || label === 'Full season' ? 150 : 700)) continue;
    }
    const episodes: AiringEpisode[] = g.map((r) => ({
      season: r.episode.season,
      number: r.episode.number,
      name: realName(r.episode.title),
      runtime: r.episode.runtime ?? undefined,
      overview: r.episode.overview ?? undefined,
      image: tImg(r.episode.images?.screenshot, true) ?? tImg(show.images?.fanart, true),
      label: special ? 'Special' : epLabel(r.episode.episode_type),
    }));
    const runtime = episodes.reduce((n, e) => n + (e.runtime ?? 0), 0) || undefined;
    const se = special
      ? `Special ${first.episode.number}${g.length > 1 ? `–${last.episode.number}` : ''}`
      : g.length > 1
        ? `S${first.episode.season} E${first.episode.number}–${last.episode.number}`
        : `S${first.episode.season} E${first.episode.number}`;
    const score =
      (yours ? 1 : 0) +
      0.5 * (Math.log1p(votes) / Math.log1p(maxVotes)) +
      (item ? 0.2 * affinity(item, taste) + 0.15 * quality(item) : 0) +
      (label === 'Premiere' || label === 'New season' || label === 'Full season' ? 0.15 : label === 'Finale' || label === 'Series finale' ? 0.08 : 0);
    out.push({
      key: `tv-${id}-${first.episode.season}-${first.episode.number}`,
      kind: 'episode',
      type: 'tv',
      id,
      title: show.title,
      se,
      epName: g.length === 1 ? episodes[0].name : '',
      season: first.episode.season,
      episode: first.episode.number,
      at: startOfDay(new Date(first.first_aired)).getTime(),
      allDay: true,
      image: tImg(first.episode.images?.screenshot, true) ?? tImg(show.images?.fanart, true) ?? tImg(show.images?.thumb),
      poster: tImg(show.images?.poster),
      network: show.network ?? undefined,
      runtime,
      label,
      episodes,
      yours,
      score,
    });
  }

  // Movies: streaming (Trakt votes say how known it is) and theatrical (TMDB popularity).
  const maxMv = Math.max(1, ...raw.streaming.map((r) => r.movie.votes ?? 0));
  for (const r of raw.streaming) {
    const m = r.movie;
    const id = m.ids.tmdb;
    if (!id) continue;
    const yours = isYours('movie', id);
    const item = fromTrakt('movie', m);
    // Old catalog films newly added to a service aren't news: only recent ones (or yours).
    const recent = (m.year ?? 0) >= new Date().getFullYear() - 1;
    if (!yours && (!item || !recent || !relevant(item, taste) || (m.votes ?? 0) < 400)) continue;
    out.push({
      key: `movie-${id}-stream`,
      kind: 'movie',
      type: 'movie',
      id,
      title: m.title,
      at: new Date(`${r.released}T00:00:00`).getTime(),
      allDay: true,
      image: tImg(m.images?.fanart, true) ?? tImg(m.images?.thumb),
      poster: tImg(m.images?.poster),
      runtime: m.runtime ?? undefined,
      se: [m.year, m.rating ? `★ ${m.rating.toFixed(1)}` : ''].filter(Boolean).join(' · '),
      label: 'New to streaming',
      yours,
      score: (yours ? 1 : 0) + 0.5 * (Math.log1p(m.votes ?? 0) / Math.log1p(maxMv)) + (item ? 0.2 * affinity(item, taste) + 0.15 * quality(item) : 0),
    });
  }
  const maxPop = Math.max(1, ...raw.theaters.map((m) => m.popularity ?? 0));
  for (const m of raw.theaters) {
    const yours = isYours('movie', m.id);
    if (!m.release_date || !m.backdrop_path) continue;
    // Unreleased films have no votes yet: judge them by how much attention they're getting.
    if (!yours && (!relevant({ ...m, vote_count: Math.max(m.vote_count ?? 0, 100) }, taste) || (m.popularity ?? 0) < 8)) continue;
    out.push({
      key: `movie-${m.id}-theaters`,
      kind: 'movie',
      type: 'movie',
      id: m.id,
      title: m.title ?? '',
      at: new Date(`${m.release_date}T00:00:00`).getTime(),
      allDay: true,
      image: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : undefined,
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : undefined,
      se: [(m.release_date ?? '').slice(0, 4), m.vote_average && (m.vote_count ?? 0) > 20 ? `★ ${m.vote_average.toFixed(1)}` : ''].filter(Boolean).join(' · '),
      label: 'In theaters',
      yours,
      score: (yours ? 1 : 0) + 0.55 * (Math.log1p(m.popularity ?? 0) / Math.log1p(maxPop)) + 0.2 * affinity(m, taste),
    });
  }

  // Keep each day's best few (all of yours).
  const byDay = new Map<number, Airing[]>();
  for (const a of out) {
    const d = startOfDay(new Date(a.at)).getTime();
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  return [...byDay.values()]
    .flatMap((list) => {
      list.sort((a, b) => b.score - a.score);
      const yours = list.filter((a) => a.yours);
      return [...yours, ...list.filter((a) => !a.yours).slice(0, Math.max(0, perDay - Math.min(yours.length, 3)))];
    })
    .sort((a, b) => a.at - b.at || b.score - a.score);
}

/** Releases from `start` for `days` days, picked for you. */
export function useSchedule(start: Date, days = 7, perDay = 8, enabled = true) {
  const taste = useTaste();
  const user = useTraktUser();
  const langs = [...taste.langs].sort();
  const raw = useQuery({
    queryKey: ['schedule', ymd(start), days, langs.join(','), user?.username],
    queryFn: ({ signal }) => fetchRaw(start, days, langs, !!user, signal),
    staleTime: 30 * 60_000,
    enabled,
  });
  // "Yours" = your library.
  const library = useStore((st) => st.watchlist);
  const items = useMemo(() => (raw.data ? pick(raw.data, taste, perDay, new Set(library.map((w) => `${w.mediaType}-${w.id}`))) : []), [raw.data, taste, perDay, library]);
  return { items, isPending: raw.isPending, isError: raw.isError, refetch: raw.refetch };
}
