/**
 * Your library and history for anime that TMDB doesn't list.
 *
 * The main library and history are keyed by TMDB id, and so is everything built on them (Trakt
 * sync, the calendar, reminders, recommendations). An AniList-only entry has no such id, so it is
 * kept here beside them, by AniList id, in this browser: whether it is in your library, the
 * episode you are on and where in it, and when you last watched.
 */
import { useSyncExternalStore } from 'react';

export interface ShelfEntry {
  /** AniList id. */
  id: number;
  title: string;
  cover?: string;
  film: boolean;
  /** Episodes that can be watched, when last seen. */
  episodes: number;
  /** In your library (♥). Watching adds it, as it does for titles. */
  inLibrary: boolean;
  addedAt: number;
  /** The episode last played, and how far (seconds). Absent until something is played. */
  episode?: number;
  watched?: number;
  duration?: number;
  /** That episode was finished. */
  done?: boolean;
  lastWatched?: number;
}

const KEY = 'charcoal:anime-shelf';
const MAX = 500;
const COMPLETE_AT = 0.9;

function read(): ShelfEntry[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter((e): e is ShelfEntry => !!e && Number.isInteger((e as ShelfEntry).id) && typeof (e as ShelfEntry).title === 'string') : [];
  } catch {
    return [];
  }
}

let shelf = read();
const listeners = new Set<() => void>();
function write(next: ShelfEntry[]) {
  shelf = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(shelf));
  } catch {
    /* storage full or blocked: kept for this visit only */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
// Another tab changed it.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => e.key === KEY && ((shelf = read()), listeners.forEach((l) => l())));

export const getShelf = () => shelf;
export const useShelf = () => useSyncExternalStore(subscribe, getShelf);
export const useShelfEntry = (id: number) => useSyncExternalStore(subscribe, () => shelf.find((e) => e.id === id));

type About = Pick<ShelfEntry, 'id' | 'title' | 'cover' | 'film' | 'episodes'>;

function upsert(about: About, patch: Partial<ShelfEntry>) {
  const prev = shelf.find((e) => e.id === about.id);
  const next: ShelfEntry = { inLibrary: false, addedAt: Date.now(), ...prev, ...about, ...patch };
  write([next, ...shelf.filter((e) => e.id !== about.id)]);
}

/** ♥: in or out of the library. Taking it out keeps where you were. */
export function toggleShelf(about: About) {
  const prev = shelf.find((e) => e.id === about.id);
  if (prev?.inLibrary && !prev.lastWatched) return write(shelf.filter((e) => e.id !== about.id));
  upsert(about, { inLibrary: !prev?.inLibrary });
}

/** Playback moved on. Like titles, something a tenth watched joins the library by itself. */
export function recordEpisode(about: About, episode: number, watched: number, duration: number, ended?: boolean) {
  const ratio = duration > 0 ? watched / duration : 0;
  const done = !!ended || ratio >= COMPLETE_AT;
  upsert(about, { episode, watched, duration, done, lastWatched: Date.now(), ...(ratio > 0.1 || done ? { inLibrary: true } : {}) });
}

/** An episode was opened (before anything is known about its length). */
export function openedEpisode(about: About, episode: number) {
  const prev = shelf.find((e) => e.id === about.id);
  if (prev?.episode === episode) return upsert(about, { lastWatched: Date.now() });
  upsert(about, { episode, watched: 0, duration: 0, done: false, lastWatched: Date.now() });
}

/** Puts back a list read earlier with getShelf (undo). */
export const restoreShelf = (before: ShelfEntry[]) => write(before);

export function removeFromShelf(id: number) {
  write(shelf.filter((e) => e.id !== id));
}

/** Where "continue" leads: the next episode once this one is finished, and whether the entry is finished. */
export function resumePoint(e: ShelfEntry | undefined): { episode: number; at: number; finished: boolean } {
  if (!e?.episode) return { episode: 1, at: 0, finished: false };
  if (!e.done) return { episode: e.episode, at: e.watched && e.duration && e.watched < e.duration - 30 ? e.watched : 0, finished: false };
  const last = e.episode >= Math.max(1, e.episodes);
  return { episode: last ? e.episode : e.episode + 1, at: 0, finished: last };
}

export type ShelfStatus = 'watching' | 'planned' | 'completed';
export const shelfStatus = (e: ShelfEntry): ShelfStatus => (!e.lastWatched ? 'planned' : resumePoint(e).finished ? 'completed' : 'watching');
export const shelfWatchUrl = (e: ShelfEntry) => {
  const { episode } = resumePoint(e);
  return `/anime/watch/${e.id}${episode > 1 ? `?ep=${episode}` : ''}`;
};
