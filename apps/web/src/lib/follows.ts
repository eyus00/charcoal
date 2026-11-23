/**
 * Your library: shows and films you follow. Following keeps you posted:
 * - a show: every new episode goes into your Calendar ("Your shows") with a reminder;
 * - a film: a reminder the day it can be streamed (its digital release).
 * Separate from the watchlist (To watch / Watched). Kept in this browser.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import { q, tmdb, type Details, type MediaType } from './tmdb';
import { ensureReminders, removeReminders, type Reminder } from './reminders';

export interface Follow {
  type: MediaType;
  id: number;
  title: string;
  at: number;
}

const KEY = 'charcoal:follows';
const read = (): Follow[] => {
  try {
    // Older entries were shows only and had no type.
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Follow[]).map((f) => ({ ...f, type: f.type ?? 'tv' }));
  } catch {
    return [];
  }
};
let list: Follow[] = typeof window !== 'undefined' ? read() : [];
const subs = new Set<() => void>();
function save(next: Follow[]) {
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: in memory only */
  }
  subs.forEach((f) => f());
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      list = read();
      subs.forEach((f) => f());
    }
  });

const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useFollows = () => useSyncExternalStore(subscribe, () => list);
export const isFollowing = (type: MediaType, id: number) => list.some((f) => f.type === type && f.id === id);
export const useIsFollowing = (type: MediaType, id: number) => useSyncExternalStore(subscribe, () => isFollowing(type, id));

export function toggleFollow(type: MediaType, id: number, title: string) {
  if (isFollowing(type, id)) {
    save(list.filter((f) => !(f.type === type && f.id === id)));
    removeReminders(`${type}-${id}-`);
    toast(`Unfollowed ${title}`);
    return false;
  }
  save([{ type, id, title, at: Date.now() }, ...list]);
  toast(type === 'tv' ? `Following ${title}. New episodes go to your Calendar.` : `Following ${title}. We’ll tell you when it can be streamed.`);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  return true;
}

type ReleaseDates = { results: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[] };
const today = () => new Date().toISOString().slice(0, 10);

/** The first day a film can be streamed (digital release, US first), if it's still ahead. */
async function streamingDate(id: number): Promise<string | null> {
  const r = await tmdb<ReleaseDates>(`/movie/${id}/release_dates`);
  const dates = (country?: string) =>
    r.results
      .filter((c) => !country || c.iso_3166_1 === country)
      .flatMap((c) => c.release_dates.filter((d) => d.type === 4).map((d) => d.release_date.slice(0, 10)))
      .sort();
  const all = dates('US').length ? dates('US') : dates();
  if (all.length && all[0] <= today()) return null; // already streamable
  return all.find((d) => d >= today()) ?? null;
}

/**
 * Keep a reminder for everything you follow: each show's next episode, each film's streaming day.
 * Uses small, long-cached requests. Run once in the app shell.
 */
export function useFollowReminders() {
  const follows = useFollows();
  const shows = follows.filter((f) => f.type === 'tv').slice(0, 40);
  const films = follows.filter((f) => f.type === 'movie').slice(0, 40);
  const showQs = useQueries({ queries: shows.map((f) => q.lite('tv', f.id)) });
  const filmQs = useQueries({
    queries: films.map((f) => ({ queryKey: ['streaming-date', f.id], queryFn: () => streamingDate(f.id), staleTime: 12 * 60 * 60_000 })),
  });
  const sig = [...showQs, ...filmQs].map((s) => s.dataUpdatedAt).join(',');
  useEffect(() => {
    const due: Reminder[] = [];
    for (const s of showQs) {
      const d = s.data as Details | undefined;
      const ep = d?.next_episode_to_air;
      if (!d || !ep?.air_date || ep.air_date < today()) continue;
      due.push({
        key: `tv-${d.id}-${ep.season_number}-${ep.episode_number}`,
        title: d.name ?? '',
        body: `S${ep.season_number} E${ep.episode_number}${ep.name && !/^episode \d+$/i.test(ep.name) ? ` · ${ep.name}` : ''}`,
        at: new Date(`${ep.air_date}T00:00:00`).getTime(),
        allDay: true,
        url: `/tv/${d.id}?episodes=${ep.season_number}&ep=${ep.episode_number}`,
      });
    }
    filmQs.forEach((r, i) => {
      if (!r.data) return;
      const f = films[i];
      due.push({ key: `movie-${f.id}-stream`, title: f.title, body: 'Now streaming', at: new Date(`${r.data}T00:00:00`).getTime(), allDay: true, url: `/movie/${f.id}` });
    });
    ensureReminders(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
