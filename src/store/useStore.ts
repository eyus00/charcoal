import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Cache size limits
const WATCH_HISTORY_LIMIT = 50;
const WATCHLIST_LIMIT = 100;
const RECENT_WATCH_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days

export type WatchStatus = 'watching' | 'planned' | 'completed';

export interface WatchHistoryItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string;
  lastWatched: number;
  progress?: {
    watched: number;
    duration: number;
  };
  season?: number;
  episode?: number;
}

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
  // Cache for API responses
  cache: Record<string, { data: any; timestamp: number }>;
  setCache: (key: string, data: any) => void;
  getCache: (key: string) => any;
  clearCache: () => void;
}

// Cache expiration time (30 minutes)
const CACHE_EXPIRATION = 30 * 60 * 1000;

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
              state.watchlist = state.watchlist.map((watchItem) =>
                watchItem.id === item.id && watchItem.mediaType === item.mediaType
                  ? { ...watchItem, status: 'watching' }
                  : watchItem
              );
            }
          }

          return {
            watchHistory: [item, ...history].slice(0, WATCH_HISTORY_LIMIT),
            watchlist: state.watchlist.slice(0, WATCHLIST_LIMIT),
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
            watchlist: [item, ...watchlist].slice(0, WATCHLIST_LIMIT),
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
      // Cache implementation
      cache: {},
      setCache: (key: string, data: any) => 
        set((state) => ({
          cache: {
            ...state.cache,
            [key]: { data, timestamp: Date.now() }
          }
        })),
      getCache: (key: string) => {
        const state = get();
        const cached = state.cache[key];
        if (!cached) return null;
        
        // Check if cache is expired
        if (Date.now() - cached.timestamp > CACHE_EXPIRATION) {
          // Remove expired cache
          set((state) => {
            const { [key]: _, ...rest } = state.cache;
            return { cache: rest };
          });
          return null;
        }
        
        return cached.data;
      },
      clearCache: () => set({ cache: {} })
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        watchHistory: state.watchHistory,
        watchlist: state.watchlist,
        darkMode: state.darkMode
      })
    }
  )
);