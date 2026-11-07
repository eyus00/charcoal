import { useSyncExternalStore } from 'react';
import type { MediaType } from './tmdb';

// ---------- types ----------

export type WatchStatus = 'watching' | 'planned' | 'completed';

export interface EpisodeKey { season: number; episode: number }

export interface HistoryItem {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  progress?: { watched: number; duration: number };
  isCompleted?: boolean;
  /** For TV: the episode after this one, if it exists (computed when recorded). */
  nextEpisode?: EpisodeKey | null;
  lastWatched: number;
}

export interface WatchlistItem {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  addedAt: number;
  status: WatchStatus;
  releaseDate?: string;
  ratingScore?: number;
}

export interface Settings {
  /** 'jelly' or an embed server id */
  server: string;
  autoplayNext: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  subtitleLabel: string | null;
  /** Sandbox embed iframes so they can't open pop-ups (some servers refuse to play). */
  blockPopups: boolean;
  /** Optional stream proxy (e.g. a Cloudflare Worker) that replaces Jelly's /v1/proxy for playback. */
  proxyUrl: string;
}

export interface State {
  history: HistoryItem[];
  watchlist: WatchlistItem[];
  settings: Settings;
}

const KEY = 'charcoal:v2';
const LEGACY_KEY = 'watch-history'; // zustand persist key used by the old app
const MAX_HISTORY = 1000;
export const COMPLETE_AT = 0.9;

const defaultSettings: Settings = {
  server: 'jelly',
  autoplayNext: true,
  volume: 1,
  muted: false,
  playbackRate: 1,
  subtitleLabel: null,
  blockPopups: false,
  proxyUrl: '',
};

// ---------- load / migrate ----------

function safeRead(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sanitize(raw: Partial<State> | null): State {
  const history = Array.isArray(raw?.history) ? raw!.history.filter((h) => h && typeof h.id === 'number') : [];
  const watchlist = Array.isArray(raw?.watchlist) ? raw!.watchlist.filter((w) => w && typeof w.id === 'number') : [];
  return { history, watchlist, settings: { ...defaultSettings, ...(raw?.settings ?? {}) } };
}

function load(): State {
  const current = safeRead(KEY) as Partial<State> | null;
  if (current) return sanitize(current);

  // One-time migration from the old app. The old key is left untouched.
  const legacy = safeRead(LEGACY_KEY) as { state?: { watchHistory?: HistoryItem[]; watchlist?: WatchlistItem[] } } | null;
  const migrated = sanitize({
    history: legacy?.state?.watchHistory ?? [],
    watchlist: legacy?.state?.watchlist ?? [],
  });
  migrated.history.sort((a, b) => b.lastWatched - a.lastWatched);
  return migrated;
}

// ---------- tiny external store ----------

let state: State = load();
const listeners = new Set<() => void>();
let writeTimer: number | undefined;

function persist() {
  window.clearTimeout(writeTimer);
  writeTimer = undefined;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

function setState(update: (s: State) => State) {
  state = update(state);
  listeners.forEach((l) => l());
  // Batch writes: playback reports progress often, localStorage is synchronous.
  if (writeTimer === undefined) writeTimer = window.setTimeout(persist, 1000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => writeTimer !== undefined && persist());
  document.addEventListener('visibilitychange', () => document.hidden && writeTimer !== undefined && persist());
  // Keep tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });
  if (!localStorage.getItem(KEY)) persist();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Select a slice. Selectors must return existing references (no new objects/arrays). */
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}
export const getState = () => state;

// ---------- helpers ----------

const sameEntry = (a: HistoryItem, b: Pick<HistoryItem, 'id' | 'mediaType' | 'season' | 'episode'>) =>
  a.id === b.id && a.mediaType === b.mediaType && (a.mediaType === 'movie' || (a.season === b.season && a.episode === b.episode));

export function findProgress(history: HistoryItem[], mediaType: MediaType, id: number, season?: number, episode?: number) {
  return history.find((h) => sameEntry(h, { id, mediaType, season, episode }));
}

/** Most recent history entry for a title (any episode). History is kept newest-first. */
export const latestFor = (history: HistoryItem[], mediaType: MediaType, id: number) =>
  history.find((h) => h.id === id && h.mediaType === mediaType);

export const percent = (h?: HistoryItem) =>
  h?.progress && h.progress.duration > 0 ? Math.min(100, (h.progress.watched / h.progress.duration) * 100) : 0;

/** Where "Play/Resume" should go for a title. */
export function resumeTarget(history: HistoryItem[], mediaType: MediaType, id: number) {
  const last = latestFor(history, mediaType, id);
  if (!last) return null;
  if (mediaType === 'movie') return { item: last, season: undefined, episode: undefined, isNext: false };
  if (last.isCompleted && last.nextEpisode) {
    return { item: last, season: last.nextEpisode.season, episode: last.nextEpisode.episode, isNext: true };
  }
  return { item: last, season: last.season, episode: last.episode, isNext: false };
}

/** One entry per title (latest episode for shows), newest first. */
export function historyByTitle(history: HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  return history.filter((h) => !seen.has(h.mediaType + h.id) && !!seen.add(h.mediaType + h.id));
}

/** One entry per title, newest first, skipping finished movies and finished shows. */
export function continueWatching(history: HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  const out: HistoryItem[] = [];
  for (const h of history) {
    const k = h.mediaType + h.id;
    if (seen.has(k)) continue;
    seen.add(k);
    if (h.isCompleted && (h.mediaType === 'movie' || !h.nextEpisode)) continue;
    out.push(h);
  }
  return out;
}

/** Link that resumes a history entry (or starts its next episode). */
export function watchUrl(h: HistoryItem) {
  if (h.mediaType === 'movie') return `/watch/movie/${h.id}`;
  const t = h.isCompleted && h.nextEpisode ? h.nextEpisode : { season: h.season, episode: h.episode };
  return `/watch/tv/${h.id}?season=${t.season}&episode=${t.episode}`;
}

// ---------- actions ----------

export const actions = {
  recordProgress(entry: Omit<HistoryItem, 'lastWatched' | 'isCompleted'> & { ended?: boolean }) {
    const { ended, ...item } = entry;
    const p = item.progress;
    const ratio = p && p.duration > 0 ? p.watched / p.duration : 0;
    const isCompleted = !!ended || ratio >= COMPLETE_AT;
    setState((s) => {
      const prev = s.history.find((h) => sameEntry(h, item));
      // Don't let an unknown-progress update (embeds without events) erase real progress.
      const progress = item.progress ?? prev?.progress;
      const next: HistoryItem = { ...prev, ...item, progress, isCompleted: isCompleted || (!item.progress && !!prev?.isCompleted), lastWatched: Date.now() };
      const history = [next, ...s.history.filter((h) => !sameEntry(h, item))].slice(0, MAX_HISTORY);

      // Keep the bookmark status in step with playback (old app behaviour).
      const watchlist = s.watchlist.map((w) => {
        if (w.id !== item.id || w.mediaType !== item.mediaType) return w;
        const status: WatchStatus =
          item.mediaType === 'movie' && isCompleted ? 'completed' : ratio > 0.1 || isCompleted ? 'watching' : w.status;
        return status === w.status ? w : { ...w, status };
      });
      return { ...s, history, watchlist };
    });
  },

  removeHistory(mediaType: MediaType, id: number) {
    setState((s) => ({ ...s, history: s.history.filter((h) => !(h.id === id && h.mediaType === mediaType)) }));
  },

  removeHistoryEntry(item: HistoryItem) {
    setState((s) => ({ ...s, history: s.history.filter((h) => !sameEntry(h, item)) }));
  },

  clearHistory() {
    setState((s) => ({ ...s, history: [] }));
  },

  setBookmark(item: Omit<WatchlistItem, 'addedAt'>) {
    setState((s) => {
      const existing = s.watchlist.find((w) => w.id === item.id && w.mediaType === item.mediaType);
      const next = { ...item, addedAt: existing?.addedAt ?? Date.now() };
      return { ...s, watchlist: existing ? s.watchlist.map((w) => (w === existing ? next : w)) : [next, ...s.watchlist] };
    });
  },

  removeBookmark(mediaType: MediaType, id: number) {
    setState((s) => ({ ...s, watchlist: s.watchlist.filter((w) => !(w.id === id && w.mediaType === mediaType)) }));
  },

  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },

  exportData(): string {
    return JSON.stringify({ app: 'charcoal', version: 2, exportedAt: new Date().toISOString(), ...state }, null, 2);
  },

  importData(json: string): { history: number; watchlist: number } {
    const parsed = JSON.parse(json);
    // Accept our own export or a raw old-app localStorage dump.
    const incoming = sanitize(
      parsed?.state ? { history: parsed.state.watchHistory, watchlist: parsed.state.watchlist } : parsed,
    );
    setState((s) => {
      const history = [...incoming.history, ...s.history]
        .sort((a, b) => b.lastWatched - a.lastWatched)
        .filter((h, i, arr) => arr.findIndex((x) => sameEntry(x, h)) === i)
        .slice(0, MAX_HISTORY);
      const watchlist = [...incoming.watchlist, ...s.watchlist].filter(
        (w, i, arr) => arr.findIndex((x) => x.id === w.id && x.mediaType === w.mediaType) === i,
      );
      return { ...s, history, watchlist };
    });
    persist();
    return { history: incoming.history.length, watchlist: incoming.watchlist.length };
  },
};
