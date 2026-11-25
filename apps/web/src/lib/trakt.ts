/**
 * Trakt: the shared community layer (ratings, comments and reviews written on Trakt and in every
 * app that uses it). Reading needs only the app's public client ID; posting, rating, scrobbling
 * and watchlist sync use the viewer's own Trakt account, signed in with PKCE (no client secret).
 *
 * Titles are matched by their TMDB id. API docs: https://trakt.docs.apiary.io
 */
import { useSyncExternalStore } from 'react';
import { actions, getState, subscribeStore, type WatchlistItem } from './store';
import { tmdb, type Details as TmdbDetails, type MediaType } from './tmdb';

export const TRAKT_CLIENT_ID = import.meta.env.VITE_TRAKT_CLIENT_ID || 'FniCvwJ7zJU0f1JucT6BJuDuV8EO-LrD8_4fZcSEpZw';
const API = 'https://api.trakt.tv';

export async function trakt<T>(path: string, signal?: AbortSignal): Promise<{ data: T; pages: number; total: number }> {
  const res = await fetch(API + path, {
    signal,
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID,
    },
  });
  if (!res.ok) throw new Error(`Trakt error ${res.status}`);
  return {
    data: (await res.json()) as T,
    pages: Number(res.headers.get('X-Pagination-Page-Count')) || 1,
    total: Number(res.headers.get('X-Pagination-Item-Count')) || 0,
  };
}

export interface TraktTitle {
  kind: 'movies' | 'shows';
  slug: string;
  traktId: number;
}

export interface TraktRatings {
  /** 0–10 */
  rating: number;
  votes: number;
  /** votes per score, "1".."10" */
  distribution: Record<string, number>;
}

export interface TraktComment {
  id: number;
  comment: string;
  spoiler: boolean;
  review: boolean;
  created_at: string;
  likes: number;
  replies: number;
  user_rating: number | null;
  /** set on replies */
  parent_id?: number;
  user: {
    username: string;
    name?: string | null;
    vip?: boolean;
    images?: { avatar?: { full?: string } };
  };
}

export type CommentSort = 'likes' | 'newest' | 'highest' | 'lowest';

const kindOf = (type: MediaType) => (type === 'movie' ? 'movies' : 'shows');

/** The Trakt page for a title (comments tab), for "View on Trakt" links. */
export const traktUrl = (t: TraktTitle, tab: '' | 'comments' = '') => `https://trakt.tv/${t.kind}/${t.slug}${tab ? `/${tab}` : ''}`;

export const traktQ = {
  /** TMDB id → Trakt slug (null when Trakt doesn't have the title). */
  title: (type: MediaType, tmdbId: number) => ({
    queryKey: ['trakt', 'title', type, tmdbId],
    staleTime: Infinity,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TraktTitle | null> => {
      const { data } = await trakt<
        {
          type: string;
          movie?: { ids: { slug: string; trakt: number } };
          show?: { ids: { slug: string; trakt: number } };
        }[]
      >(`/search/tmdb/${tmdbId}?type=${type === 'movie' ? 'movie' : 'show'}`, signal);
      const ids = (type === 'movie' ? data[0]?.movie : data[0]?.show)?.ids;
      return ids ? { kind: kindOf(type), slug: ids.slug, traktId: ids.trakt } : null;
    },
  }),
  ratings: (t: TraktTitle | null | undefined) => ({
    queryKey: ['trakt', 'ratings', t?.kind, t?.slug],
    enabled: !!t,
    staleTime: 30 * 60_000,
    queryFn: async ({ signal }: { signal: AbortSignal }) => (await trakt<TraktRatings>(`/${t!.kind}/${t!.slug}/ratings`, signal)).data,
  }),
  /** Replies to a comment (oldest first, like a conversation). */
  replies: (commentId: number) => ({
    queryKey: ['trakt', 'replies', commentId],
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }: { signal: AbortSignal }) => (await trakt<TraktComment[]>(`/comments/${commentId}/replies?limit=50&extended=images`, signal)).data,
  }),
  comments: (t: TraktTitle | null | undefined, sort: CommentSort, page: number) => ({
    queryKey: ['trakt', 'comments', t?.kind, t?.slug, sort, page],
    enabled: !!t,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }: { signal: AbortSignal }) => trakt<TraktComment[]>(`/${t!.kind}/${t!.slug}/comments/${sort}?page=${page}&limit=10&extended=images`, signal),
  }),
};

// ---------- the viewer's own Trakt account ----------
//
// Sign-in is OAuth with PKCE: the browser makes a one-time secret (the verifier), sends Trakt its
// hash, and later proves it has the original. No client secret is involved, so it all happens
// here; the tokens stay in this browser (not in backups) and are only sent to api.trakt.tv.

const AUTH_KEY = 'charcoal:trakt';
const PKCE_KEY = 'charcoal:trakt-pkce';

export interface TraktUser {
  username: string;
  name?: string | null;
  avatar?: string;
  vip?: boolean;
}
interface Auth {
  access: string;
  refresh: string;
  /** ms */
  expiresAt: number;
  user?: TraktUser;
}

const readAuth = (): Auth | null => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null');
  } catch {
    return null;
  }
};
let auth: Auth | null = typeof window !== 'undefined' ? readAuth() : null;
const authSubs = new Set<() => void>();
function setAuth(next: Auth | null) {
  auth = next;
  try {
    if (next) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* blocked storage: stays signed in for this tab only */
  }
  authSubs.forEach((f) => f());
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === AUTH_KEY) {
      auth = readAuth();
      authSubs.forEach((f) => f());
    }
  });

/** The signed-in Trakt user (null when not connected). */
export const useTraktUser = () =>
  useSyncExternalStore(
    (f) => (authSubs.add(f), () => void authSubs.delete(f)),
    () => (auth ? (auth.user ?? null) : null),
  );
export const traktConnected = () => !!auth;

const redirectUri = () => `${window.location.origin}/trakt/callback`;
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** Go to Trakt to sign in; it comes back to /trakt/callback, then to `returnTo`. */
export async function startTraktLogin(returnTo = window.location.pathname + window.location.search + window.location.hash) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo }));
  const url = new URL('https://trakt.tv/oauth/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: TRAKT_CLIENT_ID,
    redirect_uri: redirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(url.toString());
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: TRAKT_CLIENT_ID,
      redirect_uri: redirectUri(),
      ...body,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    created_at?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) throw new Error(data.error_description || `Trakt sign-in failed (${res.status})`);
  return {
    access: data.access_token,
    refresh: data.refresh_token ?? '',
    expiresAt: ((data.created_at ?? Date.now() / 1000) + (data.expires_in ?? 86400)) * 1000,
  };
}

/** Finish sign-in on /trakt/callback. Returns where to go next. */
export async function finishTraktLogin(params: URLSearchParams): Promise<{ returnTo: string; user?: TraktUser }> {
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as {
    verifier: string;
    state: string;
    returnTo: string;
  } | null;
  sessionStorage.removeItem(PKCE_KEY);
  if (params.get('error')) throw new Error(params.get('error_description') || 'Sign-in was cancelled.');
  const code = params.get('code');
  if (!saved || !code || params.get('state') !== saved.state) throw new Error('This sign-in link has expired. Try connecting again.');
  const tokens = await tokenRequest({
    code,
    grant_type: 'authorization_code',
    code_verifier: saved.verifier,
  });
  setAuth(tokens);
  const user = await loadTraktUser().catch(() => undefined);
  return { returnTo: saved.returnTo || '/profile#settings', user };
}

async function loadTraktUser(): Promise<TraktUser> {
  const s = await traktSend<{
    user: {
      username: string;
      name?: string;
      vip?: boolean;
      images?: { avatar?: { full?: string } };
    };
  }>('GET', '/users/settings');
  const user = {
    username: s.user.username,
    name: s.user.name,
    vip: s.user.vip,
    avatar: s.user.images?.avatar?.full,
  };
  if (auth) setAuth({ ...auth, user });
  return user;
}

let refreshing: Promise<string | null> | null = null;
/** A valid access token, refreshing it when it's about to expire (null when signed out). */
async function accessToken(): Promise<string | null> {
  if (!auth) return null;
  if (auth.expiresAt - Date.now() > 60_000) return auth.access;
  refreshing ??= tokenRequest({
    refresh_token: auth.refresh,
    grant_type: 'refresh_token',
  })
    .then((t) => {
      setAuth({ ...t, user: auth?.user });
      return t.access;
    })
    .catch(() => {
      setAuth(null);
      return null;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

export class TraktError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A signed-in request to Trakt. */
export async function traktSend<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  if (!token) throw new TraktError(401, 'Connect Trakt first.');
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    setAuth(null);
    throw new TraktError(401, 'Your Trakt sign-in expired. Connect again.');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string[]>;
      error?: string;
    } | null;
    const detail = data?.errors ? Object.values(data.errors).flat()[0] : data?.error;
    throw new TraktError(res.status, detail ? `Trakt: ${detail}` : `Trakt error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json().catch(() => null)) as T;
}

export function traktSignOut() {
  const token = auth?.access;
  setAuth(null);
  if (token)
    fetch(`${API}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, client_id: TRAKT_CLIENT_ID }),
    }).catch(() => {});
}

// ---------- comments, likes, ratings ----------

const target = (t: TraktTitle) => (t.kind === 'movies' ? { movie: { ids: { trakt: t.traktId } } } : { show: { ids: { trakt: t.traktId } } });

export const postComment = (t: TraktTitle, comment: string, spoiler: boolean) =>
  traktSend<TraktComment>('POST', '/comments', {
    ...target(t),
    comment,
    spoiler,
  });
export const postReply = (commentId: number, comment: string, spoiler: boolean) =>
  traktSend<TraktComment>('POST', `/comments/${commentId}/replies`, {
    comment,
    spoiler,
  });
export const deleteComment = (id: number) => traktSend('DELETE', `/comments/${id}`);
export const likeComment = (id: number, like: boolean) => traktSend(like ? 'POST' : 'DELETE', `/comments/${id}/like`);

/** Your own ratings for movies or shows: trakt id → 1–10. */
export const myRatingsQ = (kind: 'movies' | 'shows', enabled: boolean) => ({
  queryKey: ['trakt', 'my-ratings', kind],
  enabled,
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const rows = await traktSend<
      {
        rating: number;
        movie?: { ids: { trakt: number } };
        show?: { ids: { trakt: number } };
      }[]
    >('GET', `/sync/ratings/${kind}`);
    return new Map(rows.map((r) => [(r.movie ?? r.show)!.ids.trakt, r.rating]));
  },
});
export function rateTitle(t: TraktTitle, rating: number | null) {
  const item = { ids: { trakt: t.traktId }, ...(rating ? { rating } : {}) };
  return traktSend('POST', rating ? '/sync/ratings' : '/sync/ratings/remove', {
    [t.kind]: [item],
  });
}

// ---------- scrobbling (Jelly player) ----------

export interface ScrobbleMedia {
  type: MediaType;
  id: number;
  season?: number;
  episode?: number;
}
/** Tell Trakt what's playing. "stop" at 80 %+ marks it watched; below that Trakt keeps the spot. */
export function scrobble(action: 'start' | 'pause' | 'stop', m: ScrobbleMedia, progress: number) {
  if (!auth || !getState().settings.traktScrobble) return;
  // Something with no TMDB identity (a live channel) is nothing Trakt knows.
  if (!(m.id > 0)) return;
  const p = Math.max(0, Math.min(100, Math.round(progress * 100) / 100));
  const body =
    m.type === 'movie'
      ? { movie: { ids: { tmdb: m.id } }, progress: p }
      : {
          show: { ids: { tmdb: m.id } },
          episode: { season: m.season ?? 1, number: m.episode ?? 1 },
          progress: p,
        };
  traktSend('POST', `/scrobble/${action}`, body).catch(() => {
    /* 409 = already recorded just now; anything else isn't worth bothering the viewer about */
  });
}

// ---------- watchlist sync ----------
//
// Trakt's watchlist ⇄ Charcoal's "To watch". Adding / removing "To watch" here updates Trakt
// right away; "Sync now" (and once per visit) also pulls Trakt's watchlist in. Items removed on
// Trakt aren't removed here, so nothing disappears unexpectedly.

type TraktListRow = {
  movie?: { ids: { tmdb?: number } };
  show?: { ids: { tmdb?: number } };
};
let applyingRemote = false;

const ref = (w: Pick<WatchlistItem, 'mediaType' | 'id'>) => ({
  [w.mediaType === 'movie' ? 'movies' : 'shows']: [{ ids: { tmdb: w.id } }],
});

function watchSyncOn() {
  return !!auth && getState().settings.traktSyncWatchlist;
}

/** Push local "To watch" changes to Trakt as they happen. */
export function startWatchlistSync() {
  let prev = getState().watchlist;
  return subscribeStore(() => {
    const next = getState().watchlist;
    if (next === prev) return;
    const before = prev;
    prev = next;
    if (applyingRemote || !watchSyncOn()) return;
    const key = (w: WatchlistItem) => `${w.mediaType}-${w.id}`;
    const old = new Map(before.map((w) => [key(w), w]));
    const now = new Map(next.map((w) => [key(w), w]));
    for (const w of next) if (w.status === 'planned' && old.get(key(w))?.status !== 'planned') traktSend('POST', '/sync/watchlist', ref(w)).catch(() => {});
    for (const w of before) if (w.status === 'planned' && now.get(key(w))?.status !== 'planned') traktSend('POST', '/sync/watchlist/remove', ref(w)).catch(() => {});
  });
}

/** Two-way merge: Trakt's watchlist comes in as "To watch", local "To watch" goes up. */
export async function syncWatchlistNow(): Promise<{
  added: number;
  sent: number;
}> {
  const [movies, shows] = await Promise.all([traktSend<TraktListRow[]>('GET', '/sync/watchlist/movies'), traktSend<TraktListRow[]>('GET', '/sync/watchlist/shows')]);
  const remote = [
    ...movies.flatMap((r) => (r.movie?.ids.tmdb ? [{ mediaType: 'movie' as const, id: r.movie.ids.tmdb }] : [])),
    ...shows.flatMap((r) => (r.show?.ids.tmdb ? [{ mediaType: 'tv' as const, id: r.show.ids.tmdb }] : [])),
  ];
  const local = getState().watchlist;
  const has = (m: { mediaType: MediaType; id: number }) => local.some((w) => w.mediaType === m.mediaType && w.id === m.id);
  const missing = remote.filter((m) => !has(m));
  // Titles need a name and poster here: look them up on TMDB, a few at a time.
  const found: Omit<WatchlistItem, 'addedAt'>[] = [];
  for (let i = 0; i < missing.length; i += 6) {
    const batch = await Promise.all(
      missing.slice(i, i + 6).map((m) =>
        tmdb<TmdbDetails>(`/${m.mediaType}/${m.id}`)
          .then((d) => ({
            id: d.id,
            mediaType: m.mediaType,
            title: d.title ?? d.name ?? '',
            posterPath: d.poster_path,
            releaseDate: d.release_date || d.first_air_date,
            ratingScore: d.vote_average,
            status: 'planned' as const,
          }))
          .catch(() => null),
      ),
    );
    found.push(...batch.filter((x): x is NonNullable<typeof x> => !!x));
  }
  applyingRemote = true;
  try {
    for (const item of found) actions.setBookmark(item);
  } finally {
    applyingRemote = false;
  }
  const remoteKeys = new Set(remote.map((m) => `${m.mediaType}-${m.id}`));
  const toSend = getState().watchlist.filter((w) => w.status === 'planned' && !remoteKeys.has(`${w.mediaType}-${w.id}`));
  if (toSend.length)
    await traktSend('POST', '/sync/watchlist', {
      movies: toSend.filter((w) => w.mediaType === 'movie').map((w) => ({ ids: { tmdb: w.id } })),
      shows: toSend.filter((w) => w.mediaType === 'tv').map((w) => ({ ids: { tmdb: w.id } })),
    });
  try {
    sessionStorage.setItem('charcoal:trakt-synced', String(Date.now()));
  } catch {
    /* ignore */
  }
  return { added: found.length, sent: toSend.length };
}

/** Once per visit (when connected and sync is on), pull Trakt's watchlist in quietly. */
export function syncWatchlistOnStart() {
  if (!watchSyncOn()) return;
  try {
    if (sessionStorage.getItem('charcoal:trakt-synced')) return;
  } catch {
    /* ignore */
  }
  syncWatchlistNow().catch(() => {});
}
