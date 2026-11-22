/**
 * "Watched" marks on cards: movies you finished here, titles you marked Watched, and (when
 * connected) movies Trakt has as watched.
 */
import { useQuery } from '@tanstack/react-query';
import { useStore } from './store';
import { useTraktUser } from './trakt';
import { fetchWatchedMovies } from './traktData';
import type { MediaType } from './tmdb';

export function useIsWatched(type: MediaType, id: number): boolean {
  const user = useTraktUser();
  const { data } = useQuery({
    queryKey: ['trakt', 'watched-movies', user?.username],
    queryFn: fetchWatchedMovies,
    enabled: !!user && type === 'movie',
    staleTime: 10 * 60_000,
  });
  const local = useStore(
    (s) =>
      s.watchlist.some((w) => w.id === id && w.mediaType === type && w.status === 'completed') || (type === 'movie' && s.history.some((h) => h.id === id && h.mediaType === 'movie' && h.isCompleted)),
  );
  return local || (type === 'movie' && !!data?.has(id));
}
