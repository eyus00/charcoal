/**
 * Trakt data beyond a single title: discovery lists (trending with live watcher counts,
 * anticipated, most watched, box office), personal recommendations, your own activity, friends
 * and calendars. Public lists only need the client ID; personal ones use your sign-in.
 */
import { traktSend, type TraktComment } from './trakt';
import { tmdb, type MediaItem, type MediaType } from './tmdb';
import { actions, getState, type HistoryItem } from './store';

export interface TIds {
  trakt: number;
  slug?: string | null;
  tmdb?: number | null;
  imdb?: string | null;
}
export interface TMedia {
  title: string;
  language?: string | null;
  genres?: string[];
  votes?: number;
  country?: string | null;
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
  location?: string | null;
  joined_at?: string;
  name?: string | null;
  private?: boolean;
  vip?: boolean;
  ids: { slug: string };
  images?: { avatar?: { full?: string } };
}

/** A Trakt image URL. `small`: the thumb size (~3x smaller), plenty for cards. */
export const tImg = (list?: string[] | null, small = false) => {
  const u = list?.[0];
  if (!u) return undefined;
  const url = u.startsWith('http') ? u : `https://${u}`;
  return small ? url.replace('/medium/', '/thumb/') : url;
};

/** A Trakt movie / show as one of our cards (posters come from Trakt). */
export function toItem(kind: MediaType, m: TMedia): MediaItem | null {
  if (!m.ids.tmdb) return null;
  const date = (m.released ?? m.first_aired ?? (m.year ? `${m.year}-01-01` : '')).slice(0, 10);
  return {
    id: m.ids.tmdb,
    media_type: kind,
    ...(kind === 'movie' ? { title: m.title, release_date: date } : { name: m.title, first_air_date: date }),
    poster_path: null,
    poster_url: tImg(m.images?.poster),
    backdrop_path: null,
    overview: m.overview ?? '',
    vote_average: m.rating ?? 0,
  };
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
export const fetchMyStats = () => traktSend<MyStats>('GET', '/users/me/stats');

export interface MyComment {
  type: 'movie' | 'show' | 'season' | 'episode';
  comment: TraktComment;
  movie?: TMedia;
  show?: TMedia;
  episode?: TEpisode;
}
export const fetchMyComments = () => traktSend<MyComment[]>('GET', '/users/me/comments/all/all?limit=100&include_replies=true&extended=images');

export interface MyRating {
  rated_at: string;
  rating: number;
  type: 'movie' | 'show' | 'season' | 'episode';
  movie?: TMedia;
  show?: TMedia;
}
export const fetchMyRatings = () => traktSend<MyRating[]>('GET', '/users/me/ratings/all?extended=images');

export interface HistoryRow {
  id: number;
  watched_at: string;
  type: 'movie' | 'episode';
  movie?: TMedia;
  show?: TMedia;
  episode?: TEpisode;
}
export const fetchHistory = (user = 'me', limit = 20) => traktSend<HistoryRow[]>('GET', `/users/${user}/history?limit=${limit}&extended=images`);

/** Movies you've watched on Trakt (tmdb ids), for "Watched" badges. */
export async function fetchWatchedMovies(): Promise<Set<number>> {
  const rows = await traktSend<{ movie: TMedia }[]>('GET', '/sync/watched/movies');
  return new Set((rows ?? []).map((r) => r.movie.ids.tmdb).filter((x): x is number => !!x));
}

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
  const rows = (await traktSend<HistoryRow[]>('GET', '/sync/history?limit=500')) ?? [];
  const before = getState().history;
  const have = new Set(before.map((h) => h.mediaType + h.id));
  const latest = new Map<string, HistoryRow>();
  for (const r of rows) {
    const type = r.movie ? 'movie' : 'tv';
    const id = (r.movie ?? r.show)?.ids.tmdb;
    if (!id || have.has(type + id) || latest.has(type + id)) continue;
    latest.set(type + id, r);
  }
  const picked = [...latest.entries()].slice(0, 100);
  const items: HistoryItem[] = [];
  for (let i = 0; i < picked.length; i += 10) {
    const batch = await Promise.all(
      picked.slice(i, i + 10).map(async ([, r]) => {
        const type: MediaType = r.movie ? 'movie' : 'tv';
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
      history: [...getState().history, ...items].sort((a, b) => b.lastWatched - a.lastWatched),
    });
  return { added: items.length, before };
}
