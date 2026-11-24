/**
 * Your library (♥): the one list of titles you care about. It is the stored "watchlist", shown as:
 * - Unwatched / Watching / Watched, set automatically as you watch (never by hand);
 * - everything you watch is added on its own, so the library is your history too;
 * - only titles in it notify you: a show's new episodes, a film's streaming day (see below).
 * For a single release you don't want in your library, the bell on its card sets a one-off reminder.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import { actions, getState, historyByTitle, subscribeStore, type WatchStatus, type WatchlistItem } from './store';
import { q, tmdb, type Details, type MediaType } from './tmdb';
import { ensureReminders, removeReminders, type Reminder } from './reminders';

export const LIBRARY_LABEL: Record<WatchStatus, string> = { planned: 'Unwatched', watching: 'Watching', completed: 'Watched' };

export const inLibrary = (type: MediaType, id: number) => getState().watchlist.some((w) => w.mediaType === type && w.id === id);
export const useInLibrary = (type: MediaType, id: number) => useSyncExternalStore(subscribeStore, () => inLibrary(type, id));
export const useLibraryEntry = (type: MediaType, id: number) => useSyncExternalStore(subscribeStore, () => getState().watchlist.find((w) => w.mediaType === type && w.id === id));

export type LibraryItem = Omit<WatchlistItem, 'addedAt' | 'status'>;

/** Add to / remove from the library. A title you've watched comes in marked as such. */
export function toggleLibrary(item: LibraryItem) {
  const s = getState();
  const current = s.watchlist.find((w) => w.mediaType === item.mediaType && w.id === item.id);
  if (current) {
    const before = s.watchlist;
    actions.removeBookmark(item.mediaType, item.id);
    removeReminders(`${item.mediaType}-${item.id}-`);
    toast(`Removed “${item.title}” from your library`, { label: 'Undo', run: () => actions.restore({ watchlist: before }) });
    return false;
  }
  const seen = s.history.filter((h) => h.mediaType === item.mediaType && h.id === item.id);
  const status: WatchStatus = seen.some((h) => h.isCompleted && (h.mediaType === 'movie' || h.nextEpisode === null)) ? 'completed' : seen.length ? 'watching' : 'planned';
  actions.setBookmark({ ...item, status });
  toast(item.mediaType === 'tv' ? `Added “${item.title}” to your library. You’ll hear about new episodes.` : `Added “${item.title}” to your library`);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  return true;
}

const MIGRATED = 'charcoal:library-v1';

/**
 * Once: everything already watched joins the library (it reflects your history), and shows that were
 * "followed" in the previous version come along too.
 */
export function migrateLibrary() {
  try {
    if (localStorage.getItem(MIGRATED)) return;
    const s = getState();
    const have = new Set(s.watchlist.map((w) => w.mediaType + w.id));
    const adds: WatchlistItem[] = [];
    for (const h of historyByTitle(s.history)) {
      if (have.has(h.mediaType + h.id)) continue;
      have.add(h.mediaType + h.id);
      const done = h.isCompleted && (h.mediaType === 'movie' || h.nextEpisode === null);
      adds.push({ id: h.id, mediaType: h.mediaType, title: h.title, posterPath: h.posterPath, addedAt: h.lastWatched, status: done ? 'completed' : 'watching' });
    }
    const follows = JSON.parse(localStorage.getItem('charcoal:follows') ?? '[]') as { type?: MediaType; id: number; title: string; at: number }[];
    for (const f of follows) {
      const type = f.type ?? 'tv';
      if (have.has(type + f.id)) continue;
      have.add(type + f.id);
      adds.push({ id: f.id, mediaType: type, title: f.title, posterPath: null, addedAt: f.at, status: 'planned' });
    }
    if (adds.length) actions.restore({ watchlist: [...s.watchlist, ...adds] });
    localStorage.removeItem('charcoal:follows');
    localStorage.setItem(MIGRATED, '1');
  } catch {
    /* storage blocked: try again next visit */
  }
}

type ReleaseDates = { results: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[] };
const today = () => new Date().toISOString().slice(0, 10);

/** Release dates by kind (TMDB types: 3 theatrical, 4 digital, 5 physical), US first. */
export async function releaseDates(id: number) {
  const r = await tmdb<ReleaseDates>(`/movie/${id}/release_dates`);
  const pick = (type: number) => {
    const of = (country?: string) =>
      r.results
        .filter((c) => !country || c.iso_3166_1 === country)
        .flatMap((c) => c.release_dates.filter((d) => d.type === type).map((d) => d.release_date.slice(0, 10)))
        .sort();
    const us = of('US');
    return (us.length ? us : of())[0] ?? null;
  };
  return { theatrical: pick(3) ?? pick(2), digital: pick(4), physical: pick(5) };
}
export const releaseDatesQ = (id: number) => ({ queryKey: ['release-dates', id], queryFn: () => releaseDates(id), staleTime: 12 * 60 * 60_000 });

/**
 * Reminders for your library: each show's next episode, each film's streaming day. Small,
 * long-cached requests; run once in the app shell, a moment after load.
 */
export function useLibraryReminders() {
  const watchlist = useSyncExternalStore(subscribeStore, () => getState().watchlist);
  const shows = watchlist.filter((w) => w.mediaType === 'tv').slice(0, 60);
  const films = watchlist.filter((w) => w.mediaType === 'movie' && w.status !== 'completed').slice(0, 60);
  const showQs = useQueries({ queries: shows.map((w) => q.lite('tv', w.id)) });
  const filmQs = useQueries({ queries: films.map((w) => releaseDatesQ(w.id)) });
  const sig = [...showQs, ...filmQs].map((r) => r.dataUpdatedAt).join(',');
  useEffect(() => {
    const due: Reminder[] = [];
    for (const r of showQs) {
      const d = r.data as Details | undefined;
      const ep = d?.next_episode_to_air;
      if (!d || !ep?.air_date || ep.air_date < today()) continue;
      due.push({
        key: `tv-${d.id}-${ep.season_number}-${ep.episode_number}`,
        title: d.name ?? '',
        body: `S${ep.season_number} E${ep.episode_number}${ep.name && !/^episode \d+$/i.test(ep.name) ? ` ${ep.name}` : ''}`,
        at: new Date(`${ep.air_date}T00:00:00`).getTime(),
        allDay: true,
        url: `/tv/${d.id}?episodes=${ep.season_number}&ep=${ep.episode_number}`,
      });
    }
    filmQs.forEach((r, i) => {
      const digital = r.data?.digital;
      if (!digital || digital < today()) return;
      const f = films[i];
      due.push({ key: `movie-${f.id}-stream`, title: f.title, body: 'Now streaming', at: new Date(`${digital}T00:00:00`).getTime(), allDay: true, url: `/movie/${f.id}` });
    });
    ensureReminders(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
