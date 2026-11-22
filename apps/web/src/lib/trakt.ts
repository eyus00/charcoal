/**
 * Trakt: the shared community layer (ratings, comments and reviews written on Trakt and in every
 * app that uses it). Reading needs only the app's public client ID; posting will need the viewer
 * to sign in to their own Trakt account (the secret part of that lives on the Jelly server).
 *
 * Titles are matched by their TMDB id. API docs: https://trakt.docs.apiary.io
 */
import type { MediaType } from './tmdb';

export const TRAKT_CLIENT_ID = import.meta.env.VITE_TRAKT_CLIENT_ID || 'FniCvwJ7zJU0f1JucT6BJuDuV8EO-LrD8_4fZcSEpZw';
const API = 'https://api.trakt.tv';

async function trakt<T>(path: string, signal?: AbortSignal): Promise<{ data: T; pages: number; total: number }> {
  const res = await fetch(API + path, {
    signal,
    headers: { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': TRAKT_CLIENT_ID },
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
  user: { username: string; name?: string | null; vip?: boolean; images?: { avatar?: { full?: string } } };
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
      const { data } = await trakt<{ type: string; movie?: { ids: { slug: string; trakt: number } }; show?: { ids: { slug: string; trakt: number } } }[]>(
        `/search/tmdb/${tmdbId}?type=${type === 'movie' ? 'movie' : 'show'}`,
        signal,
      );
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
  comments: (t: TraktTitle | null | undefined, sort: CommentSort, page: number) => ({
    queryKey: ['trakt', 'comments', t?.kind, t?.slug, sort, page],
    enabled: !!t,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }: { signal: AbortSignal }) => trakt<TraktComment[]>(`/${t!.kind}/${t!.slug}/comments/${sort}?page=${page}&limit=10&extended=images`, signal),
  }),
};
