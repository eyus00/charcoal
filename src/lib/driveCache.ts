import { FileItem } from './drive';

// Cache version for handling schema updates
const CACHE_VERSION = 1;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const COMPRESSION_ENABLED = true;

interface CacheEntry {
  version: number;
  timestamp: number;
  data: FileItem[];
  path: string;
  isManualMode: boolean;
}

interface CacheMetadata {
  lastVisitedPath: string;
  searchHistory: string[];
}

// Cache keys
const CACHE_KEYS = {
  BASE_MOVIES: 'drive_cache_movies',
  BASE_TV: 'drive_cache_tv',
  METADATA: 'drive_cache_metadata',
  MANUAL_PREFIX: 'drive_cache_manual_',
  SEARCH_PREFIX: 'drive_cache_search_',
} as const;

// Compression utilities
const compressData = (data: any): string => {
  if (!COMPRESSION_ENABLED) return JSON.stringify(data);
  try {
    const jsonString = JSON.stringify(data);
    // Use URL-safe base64 encoding
    const compressed = btoa(unescape(encodeURIComponent(jsonString)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return compressed;
  } catch (error) {
    console.error('Compression error:', error);
    return JSON.stringify(data);
  }
};

const decompressData = (compressed: string): any => {
  if (!COMPRESSION_ENABLED) return JSON.parse(compressed);
  try {
    // Restore base64 padding
    const base64 = compressed
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    
    const jsonString = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decompression error:', error);
    // Try parsing as plain JSON as fallback
    try {
      return JSON.parse(compressed);
    } catch {
      return null;
    }
  }
};

// Cache management
export const DriveCache = {
  // Initialize cache
  init() {
    try {
      // Cleanup expired entries
      this.cleanupExpiredEntries();
      
      // Initialize metadata if not exists
      if (!localStorage.getItem(CACHE_KEYS.METADATA)) {
        this.setMetadata({
          lastVisitedPath: '',
          searchHistory: [],
        });
      }
      
      return true;
    } catch (error) {
      console.error('Cache initialization error:', error);
      return false;
    }
  },

  // Set cache entry
  setEntry(key: string, data: FileItem[], path: string, isManualMode: boolean = false): void {
    try {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        data,
        path,
        isManualMode,
      };
      
      const compressed = compressData(entry);
      localStorage.setItem(key, compressed);
    } catch (error) {
      console.error('Cache set error:', error);
      // If compression fails, try without compression
      try {
        const entry: CacheEntry = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          data,
          path,
          isManualMode,
        };
        localStorage.setItem(key, JSON.stringify(entry));
      } catch (fallbackError) {
        console.error('Cache set fallback error:', fallbackError);
      }
    }
  },

  // Get cache entry
  getEntry(key: string): CacheEntry | null {
    try {
      const compressed = localStorage.getItem(key);
      if (!compressed) return null;
      
      const entry = decompressData(compressed);
      if (!entry || entry.version !== CACHE_VERSION) return null;
      
      // Check expiry
      if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(key);
        return null;
      }
      
      return entry;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  // Set metadata
  setMetadata(metadata: CacheMetadata): void {
    try {
      localStorage.setItem(CACHE_KEYS.METADATA, JSON.stringify(metadata));
    } catch (error) {
      console.error('Metadata set error:', error);
    }
  },

  // Get metadata
  getMetadata(): CacheMetadata {
    try {
      const data = localStorage.getItem(CACHE_KEYS.METADATA);
      return data ? JSON.parse(data) : { lastVisitedPath: '', searchHistory: [] };
    } catch (error) {
      console.error('Metadata get error:', error);
      return { lastVisitedPath: '', searchHistory: [] };
    }
  },

  // Update last visited path
  updateLastVisitedPath(path: string): void {
    const metadata = this.getMetadata();
    this.setMetadata({
      ...metadata,
      lastVisitedPath: path,
    });
  },

  // Add search term to history
  addSearchTerm(term: string): void {
    const metadata = this.getMetadata();
    const searchHistory = [term, ...metadata.searchHistory.filter(t => t !== term)].slice(0, 10);
    this.setMetadata({
      ...metadata,
      searchHistory,
    });
  },

  // Clear cache for a specific path
  clearPathCache(path: string): void {
    try {
      if (path.includes('/movies/')) {
        localStorage.removeItem(CACHE_KEYS.BASE_MOVIES);
      } else if (path.includes('/tvs/')) {
        localStorage.removeItem(CACHE_KEYS.BASE_TV);
      }
      
      // Clear manual mode cache for this path
      const manualKey = `${CACHE_KEYS.MANUAL_PREFIX}${path}`;
      localStorage.removeItem(manualKey);
      
      // Clear search cache related to this path
      const searchPrefix = `${CACHE_KEYS.SEARCH_PREFIX}${path}`;
      Object.keys(localStorage)
        .filter(key => key.startsWith(searchPrefix))
        .forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  },

  // Clear all cache
  clearAll(): void {
    try {
      Object.values(CACHE_KEYS).forEach(key => {
        if (typeof key === 'string') {
          Object.keys(localStorage)
            .filter(storageKey => storageKey.startsWith(key))
            .forEach(storageKey => localStorage.removeItem(storageKey));
        }
      });
    } catch (error) {
      console.error('Cache clear all error:', error);
    }
  },

  // Cleanup expired entries
  cleanupExpiredEntries(): void {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('drive_cache_')) {
          const entry = this.getEntry(key);
          if (!entry) {
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  },

  // Get cache status for a path
  getCacheStatus(path: string): {
    isCached: boolean;
    isExpired: boolean;
    lastUpdated: number | null;
  } {
    let key = '';
    if (path.includes('/movies/')) {
      key = CACHE_KEYS.BASE_MOVIES;
    } else if (path.includes('/tvs/')) {
      key = CACHE_KEYS.BASE_TV;
    } else {
      key = `${CACHE_KEYS.MANUAL_PREFIX}${path}`;
    }
    
    const entry = this.getEntry(key);
    if (!entry) {
      return {
        isCached: false,
        isExpired: true,
        lastUpdated: null,
      };
    }
    
    return {
      isCached: true,
      isExpired: Date.now() - entry.timestamp > CACHE_EXPIRY,
      lastUpdated: entry.timestamp,
    };
  },
};

// Initialize cache on module load
DriveCache.init();