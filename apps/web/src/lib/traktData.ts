/**
 * Trakt data beyond a single title: discovery lists (trending with live watcher counts,
 * anticipated, most watched, box office), personal recommendations, your own activity, friends
 * and calendars. Public lists only need the client ID; personal ones use your sign-in.
 */
import { trakt, traktSend, type TraktComment } from "./trakt";
import { tmdb, type MediaItem, type MediaType } from "./tmdb";
import { actions, getState, type HistoryItem } from "./store";

export interface TIds {
  trakt: number;
  slug?: string | null;
  tmdb?: number | null;
  imdb?: string | null;
}
export interface TMedia {
  title: string;
  year?: number | null;
  ids: TIds;
  overview?: string | null;
  rating?: number;
  released?: string | null;
  first_aired?: string | null;
  network?: string | null;
  images?: {
    poster?: string[];
    fanart?: string[];
    thumb?: string[];
    screenshot?: string[];
  };
}
export interface TEpisode {
  season: number;
  number: number;
  title?: string | null;
  ids: TIds;
  first_aired?: string | null;
  images?: { screenshot?: string[] };
}
export interface TUser {
  username: string;
  name?: string | null;
  private?: boolean;
  vip?: boolean;
  ids: { slug: string };
  images?: { avatar?: { full?: string } };
}

export const tImg = (list?: string[] | null) =>
  list?.[0]
    ? list[0].startsWith("http")
      ? list[0]
      : `https://${list[0]}`
    : undefined;

/** A Trakt movie / show as one of our cards (posters come from Trakt). */
export function toItem(kind: MediaType, m: TMedia): MediaItem | null {
  if (!m.ids.tmdb) return null;
  const date = (
    m.released ??
    m.first_aired ??
    (m.year ? `${m.year}-01-01` : "")
  ).slice(0, 10);
  return {
    id: m.ids.tmdb,
    media_type: kind,
    ...(kind === "movie"
      ? { title: m.title, release_date: date }
      : { name: m.title, first_air_date: date }),
    poster_path: null,
    poster_url: tImg(m.images?.poster),
    backdrop_path: null,
    overview: m.overview ?? "",
    vote_average: m.rating ?? 0,
  };
}

// ---------- discovery ----------

export type TraktList =
  "trending" | "popular" | "anticipated" | "watched" | "boxoffice";
/** A card plus what makes it notable right now. */
export interface ListEntry {
  item: MediaItem;
  /** "3.4K watching", "61K anticipating", "$19M"… */
  stat?: {
    kind: "watching" | "anticipated" | "watched" | "revenue";
    value: number;
  };
}

const KIND = (t: MediaType) => (t === "movie" ? "movies" : "shows");
const EXT = "extended=full,images";

type Row = {
  watchers?: number;
  list_count?: number;
  watcher_count?: number;
  revenue?: number;
  movie?: TMedia;
  show?: TMedia;
} & Partial<TMedia>;

function entry(type: MediaType, r: Row, list: TraktList): ListEntry | null {
  const media =
    (type === "movie" ? r.movie : r.show) ??
    (r.ids ? (r as TMedia) : undefined);
  const item = media && toItem(type, media);
  if (!item) return null;
  const stat =
    list === "trending" && r.watchers
      ? { kind: "watching" as const, value: r.watchers }
      : list === "anticipated" && r.list_count
        ? { kind: "anticipated" as const, value: r.list_count }
        : list === "watched" && r.watcher_count
          ? { kind: "watched" as const, value: r.watcher_count }
          : list === "boxoffice" && r.revenue
            ? { kind: "revenue" as const, value: r.revenue }
            : undefined;
  return { item, stat };
}

/** One page of a Trakt list for movies, shows, or both (merged, busiest first). */
export async function fetchTraktList(
  type: MediaType | "all",
  list: TraktList,
  page: number,
  signal?: AbortSignal,
) {
  const one = async (t: MediaType) => {
    if (list === "boxoffice" && t === "tv")
      return { entries: [] as ListEntry[], pages: 0 };
    const path =
      list === "watched" ? `/${KIND(t)}/watched/weekly` : `/${KIND(t)}/${list}`;
    const { data, pages } = await trakt<Row[]>(
      `${path}?page=${page}&limit=24&${EXT}`,
      signal,
    );
    return {
      entries: data
        .map((r) => entry(t, r, list))
        .filter((e): e is ListEntry => !!e),
      pages: list === "boxoffice" ? 1 : pages,
    };
  };
  if (type !== "all") return one(type);
  const [m, s] = await Promise.all([one("movie"), one("tv")]);
  const merged = [...m.entries, ...s.entries].sort(
    (a, b) => (b.stat?.value ?? 0) - (a.stat?.value ?? 0),
  );
  // No stat to sort by (popular): interleave so both kinds show.
  const out = merged.some((e) => e.stat)
    ? merged
    : m.entries
        .flatMap((e, i) => [e, s.entries[i]])
        .concat(s.entries.slice(m.entries.length))
        .filter(Boolean);
  return { entries: out, pages: Math.max(m.pages, s.pages) };
}

/** Picks for you from your ratings and history (needs sign-in). */
export async function fetchRecommendations(
  type: MediaType | "all",
): Promise<ListEntry[]> {
  const one = async (t: MediaType) => {
    const rows = await traktSend<TMedia[]>(
      "GET",
      `/recommendations/${KIND(t)}?limit=30&ignore_collected=true&ignore_watchlisted=true&${EXT}`,
    );
    return (rows ?? [])
      .map((m) => toItem(t, m))
      .filter((x): x is MediaItem => !!x)
      .map((item) => ({ item }));
  };
  if (type !== "all") return one(type);
  const [m, s] = await Promise.all([one("movie"), one("tv")]);
  return m
    .flatMap((e, i) => [e, s[i]])
    .concat(s.slice(m.length))
    .filter(Boolean);
}

// ---------- you ----------

export interface MyStats {
  movies: {
    watched: number;
    minutes: number;
    ratings: number;
    comments: number;
  };
  episodes: { watched: number; minutes: number; comments: number };
  shows: { watched: number; ratings: number };
  network: { friends: number; followers: number; following: number };
  ratings: { total: number };
}
export const fetchMyStats = () => traktSend<MyStats>("GET", "/users/me/stats");

export interface MyComment {
  type: "movie" | "show" | "season" | "episode";
  comment: TraktComment;
  movie?: TMedia;
  show?: TMedia;
  episode?: TEpisode;
}
export const fetchMyComments = () =>
  traktSend<MyComment[]>(
    "GET",
    "/users/me/comments/all/all?limit=100&include_replies=true&extended=images",
  );

export interface MyRating {
  rated_at: string;
  rating: number;
  type: "movie" | "show" | "season" | "episode";
  movie?: TMedia;
  show?: TMedia;
}
export const fetchMyRatings = () =>
  traktSend<MyRating[]>("GET", "/users/me/ratings/all?extended=images");

export interface HistoryRow {
  id: number;
  watched_at: string;
  type: "movie" | "episode";
  movie?: TMedia;
  show?: TMedia;
  episode?: TEpisode;
}
export const fetchHistory = (user = "me", limit = 20) =>
  traktSend<HistoryRow[]>(
    "GET",
    `/users/${user}/history?limit=${limit}&extended=images`,
  );

/** Movies you've watched on Trakt (tmdb ids), for "Watched" badges. */
export async function fetchWatchedMovies(): Promise<Set<number>> {
  const rows = await traktSend<{ movie: TMedia }[]>(
    "GET",
    "/sync/watched/movies",
  );
  return new Set(
    (rows ?? []).map((r) => r.movie.ids.tmdb).filter((x): x is number => !!x),
  );
}

// ---------- friends ----------

export const fetchFollowing = () =>
  traktSend<{ followed_at: string; user: TUser }[]>(
    "GET",
    "/users/me/following?extended=images",
  );
export const searchUsers = (q: string) =>
  traktSend<{ user: TUser }[]>(
    "GET",
    `/search/user?query=${encodeURIComponent(q)}&limit=10&extended=images`,
  );
export const follow = (slug: string, on: boolean) =>
  traktSend(on ? "POST" : "DELETE", `/users/${slug}/follow`);

export interface WatchingNow {
  action: "watching" | "checkin";
  expires_at: string;
  type: "movie" | "episode";
  movie?: TMedia;
  show?: TMedia;
  episode?: TEpisode;
}
export const fetchWatchingNow = (slug: string) =>
  traktSend<WatchingNow | null>(
    "GET",
    `/users/${slug}/watching?extended=images`,
  );

/** Friends' recent plays and what they're watching right now, newest first. */
export async function fetchFriendsActivity(users: TUser[]) {
  const picked = users.filter((u) => !u.private).slice(0, 12);
  const per = await Promise.all(
    picked.map(async (u) => {
      const [now, history] = await Promise.all([
        fetchWatchingNow(u.ids.slug).catch(() => null),
        fetchHistory(u.ids.slug, 8).catch(() => [] as HistoryRow[]),
      ]);
      return { user: u, now, history: history ?? [] };
    }),
  );
  const feed = per
    .flatMap((p) =>
      p.history.map((h) => ({
        user: p.user,
        row: h,
        at: Date.parse(h.watched_at),
      })),
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);
  return {
    watchingNow: per
      .filter((p) => p.now)
      .map((p) => ({ user: p.user, now: p.now! })),
    feed,
  };
}

// ---------- calendars ----------

export interface CalendarEpisode {
  first_aired: string;
  episode: TEpisode;
  show: TMedia;
}
export interface CalendarMovie {
  released: string;
  movie: TMedia;
}
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Episodes of the shows you watch (needs sign-in). */
export const fetchMyCalendar = (start: Date, days: number) =>
  traktSend<CalendarEpisode[]>(
    "GET",
    `/calendars/my/shows/${day(start)}/${days}?extended=images`,
  ).then((r) => r ?? []);
/** New shows and new seasons starting. */
export const fetchPremieres = (start: Date, days: number) =>
  trakt<CalendarEpisode[]>(
    `/calendars/all/shows/premieres/${day(start)}/${days}?extended=full,images`,
  ).then((r) => r.data);

// ---------- import ----------

/**
 * Bring what you watched on Trakt into this browser's watch history: the latest play of each title
 * (up to 100), marked finished, so it shows in history and "watched" without filling Continue
 * watching. Titles already here are left alone. Returns the previous history for Undo.
 */
export async function importTraktHistory(): Promise<{
  added: number;
  before: HistoryItem[];
}> {
  const rows =
    (await traktSend<HistoryRow[]>("GET", "/sync/history?limit=500")) ?? [];
  const before = getState().history;
  const have = new Set(before.map((h) => h.mediaType + h.id));
  const latest = new Map<string, HistoryRow>();
  for (const r of rows) {
    const type = r.movie ? "movie" : "tv";
    const id = (r.movie ?? r.show)?.ids.tmdb;
    if (!id || have.has(type + id) || latest.has(type + id)) continue;
    latest.set(type + id, r);
  }
  const picked = [...latest.entries()].slice(0, 100);
  const items: HistoryItem[] = [];
  for (let i = 0; i < picked.length; i += 10) {
    const batch = await Promise.all(
      picked.slice(i, i + 10).map(async ([, r]) => {
        const type: MediaType = r.movie ? "movie" : "tv";
        const m = (r.movie ?? r.show)!;
        const d = await tmdb<{
          poster_path: string | null;
          backdrop_path: string | null;
        }>(`/${type}/${m.ids.tmdb}`).catch(() => null);
        const item: HistoryItem = {
          id: m.ids.tmdb!,
          mediaType: type,
          title: m.title,
          posterPath: d?.poster_path ?? null,
          backdropPath: d?.backdrop_path ?? null,
          ...(r.episode
            ? {
                season: r.episode.season,
                episode: r.episode.number,
                episodeTitle: r.episode.title ?? undefined,
              }
            : {}),
          isCompleted: true,
          nextEpisode: null,
          lastWatched: Date.parse(r.watched_at),
        };
        return item;
      }),
    );
    items.push(...batch);
  }
  if (items.length)
    actions.restore({
      history: [...getState().history, ...items].sort(
        (a, b) => b.lastWatched - a.lastWatched,
      ),
    });
  return { added: items.length, before };
}
