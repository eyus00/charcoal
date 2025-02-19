import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WatchHistoryItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string;
  lastWatched: number; // timestamp
  progress?: {
    watched: number;
    duration: number;
  };
  // For TV Shows
  season?: number;
  episode?: number;
}

export type WatchStatus = 'watching' | 'planned' | 'completed';

export interface WatchlistItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string;
  addedAt: number;
  status: WatchStatus;
}

interface SearchStore {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  watchHistory: WatchHistoryItem[];
  addToWatchHistory: (item: WatchHistoryItem) => void;
  removeFromWatchHistory: (id: number, mediaType: 'movie' | 'tv') => void;
  clearWatchHistory: () => void;
  watchlist: WatchlistItem[];
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (id: number, mediaType: 'movie' | 'tv') => void;
  updateWatchlistStatus: (id: number, mediaType: 'movie' | 'tv', status: WatchStatus) => void;
  getWatchlistItem: (id: number, mediaType: 'movie' | 'tv') => WatchlistItem | undefined;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const RECENT_WATCH_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const useStore = create<SearchStore>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      watchHistory: [],
      addToWatchHistory: (item) =>
        set((state) => {
          const history = state.watchHistory.filter(
            (historyItem) => 
              !(historyItem.id === item.id && historyItem.mediaType === item.mediaType)
          );

          // Auto-add to watchlist as "watching" if recently watched
          const now = Date.now();
          if (now - item.lastWatched < RECENT_WATCH_THRESHOLD) {
            const existingWatchlistItem = state.watchlist.find(
              (watchItem) => watchItem.id === item.id && watchItem.mediaType === item.mediaType
            );

            if (!existingWatchlistItem) {
              state.watchlist.unshift({
                id: item.id,
                mediaType: item.mediaType,
                title: item.title,
                posterPath: item.posterPath,
                addedAt: now,
                status: 'watching',
              });
            } else if (existingWatchlistItem.status === 'planned') {
              // Update status to watching if it was planned
              state.watchlist = state.watchlist.map((watchItem) =>
                watchItem.id === item.id && watchItem.mediaType === item.mediaType
                  ? { ...watchItem, status: 'watching' }
                  : watchItem
              );
            }
          }

          return {
            watchHistory: [item, ...history].slice(0, 50), // Keep only last 50 items
            watchlist: state.watchlist,
          };
        }),
      removeFromWatchHistory: (id, mediaType) =>
        set((state) => ({
          watchHistory: state.watchHistory.filter(
            (item) => !(item.id === id && item.mediaType === item.mediaType)
          ),
        })),
      clearWatchHistory: () => set({ watchHistory: [] }),
      watchlist: [],
      addToWatchlist: (item) =>
        set((state) => {
          const watchlist = state.watchlist.filter(
            (listItem) => 
              !(listItem.id === item.id && listItem.mediaType === item.mediaType)
          );
          return {
            watchlist: [item, ...watchlist],
          };
        }),
      removeFromWatchlist: (id, mediaType) =>
        set((state) => ({
          watchlist: state.watchlist.filter(
            (item) => !(item.id === id && item.mediaType === item.mediaType)
          ),
        })),
      updateWatchlistStatus: (id, mediaType, status) =>
        set((state) => ({
          watchlist: state.watchlist.map((item) =>
            item.id === id && item.mediaType === mediaType
              ? { ...item, status }
              : item
          ),
        })),
      getWatchlistItem: (id, mediaType) => {
        const state = get();
        return state.watchlist.find(
          (item) => item.id === id && item.mediaType === mediaType
        );
      },
      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
    }),
    {
      name: 'watch-history',
    }
  )
);