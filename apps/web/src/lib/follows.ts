/**
 * Shows you follow (from the Calendar's Explore): they join "Your shows", and their new episodes
 * get reminders automatically (see useFollowReminders). Kept in this browser.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import { q, type Details } from './tmdb';
import { useStore } from './store';
import { ensureReminders, removeReminders } from './reminders';

export interface Follow {
  id: number;
  title: string;
  at: number;
}

const KEY = 'charcoal:follows';
const read = (): Follow[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
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

export const useFollows = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => list,
  );

export function toggleFollow(id: number, title: string) {
  if (list.some((f) => f.id === id)) {
    save(list.filter((f) => f.id !== id));
    removeReminders(`tv-${id}-`);
    toast(`Unfollowed ${title}`);
  } else {
    save([{ id, title, at: Date.now() }, ...list]);
    toast(`Following ${title}. You’ll get reminders for new episodes.`);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }
}

/**
 * Keep a reminder for the next episode of every followed show (and show on your watchlist),
 * using each show's basic TMDB info (cached for hours, so this is cheap). Run once in the shell.
 */
export function useFollowReminders() {
  const follows = useFollows();
  const watchlist = useStore((s) => s.watchlist);
  const ids = [...new Set([...follows.map((f) => f.id), ...watchlist.filter((w) => w.mediaType === 'tv' && w.status !== 'completed').map((w) => w.id)])].slice(0, 40);
  const shows = useQueries({ queries: ids.map((id) => q.lite('tv', id)) });
  const sig = shows.map((s) => s.dataUpdatedAt).join(',');
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const due = shows
      .map((s) => s.data as Details | undefined)
      .filter((d): d is Details => !!d?.next_episode_to_air?.air_date && d.next_episode_to_air.air_date >= today)
      .map((d) => {
        const ep = d.next_episode_to_air!;
        return {
          key: `tv-${d.id}-${ep.season_number}-${ep.episode_number}`,
          title: d.name ?? '',
          body: `S${ep.season_number} E${ep.episode_number}${ep.name && !/^episode \d+$/i.test(ep.name) ? ` · ${ep.name}` : ''}`,
          at: new Date(`${ep.air_date}T00:00:00`).getTime(),
          allDay: true,
          url: `/tv/${d.id}?episodes=${ep.season_number}&ep=${ep.episode_number}`,
        };
      });
    ensureReminders(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
