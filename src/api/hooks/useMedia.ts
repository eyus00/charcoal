import { useQuery } from '@tanstack/react-query';
import { mediaService } from '../services/media';
import { MediaType, TimeWindow } from '../types';
import { useStore } from '../../store/useStore';

// Cache durations
const CACHE_TIME = 30 * 60 * 1000; // 30 minutes
const STALE_TIME = 10 * 60 * 1000; // 10 minutes

export const useMedia = {
  useTrending: (mediaType?: MediaType, timeWindow?: TimeWindow) => {
    const { getCache, setCache } = useStore();
    const cacheKey = `trending-${mediaType}-${timeWindow}`;
    
    return useQuery({
      queryKey: ['trending', mediaType, timeWindow],
      queryFn: async () => {
        // Check cache first
        const cached = getCache(cacheKey);
        if (cached) return cached;
        
        const data = await mediaService.getTrending(mediaType, timeWindow);
        setCache(cacheKey, data);
        return data;
      },
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
    });
  },

  usePopular: (mediaType?: MediaType, page?: number) => {
    const { getCache, setCache } = useStore();
    const cacheKey = `popular-${mediaType}-${page}`;
    
    return useQuery({
      queryKey: ['popular', mediaType, page],
      queryFn: async () => {
        const cached = getCache(cacheKey);
        if (cached) return cached;
        
        const data = await mediaService.getPopular(mediaType, page);
        setCache(cacheKey, data);
        return data;
      },
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
    });
  },

  useDetails: (mediaType: MediaType, id: number) => {
    const { getCache, setCache } = useStore();
    const cacheKey = `details-${mediaType}-${id}`;
    
    return useQuery({
      queryKey: [mediaType, id],
      queryFn: async () => {
        const cached = getCache(cacheKey);
        if (cached) return cached;
        
        const data = await mediaService.getDetails(mediaType, id);
        setCache(cacheKey, data);
        return data;
      },
      enabled: !!id,
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
    });
  },

  useSearch: (query: string, page?: number) => {
    const { getCache, setCache } = useStore();
    const cacheKey = `search-${query}-${page}`;
    
    return useQuery({
      queryKey: ['search', query, page],
      queryFn: async () => {
        const cached = getCache(cacheKey);
        if (cached) return cached;
        
        const data = await mediaService.search(query, page);
        setCache(cacheKey, data);
        return data;
      },
      enabled: !!query,
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
    });
  },

  useCombinedTrending: (timeWindow: TimeWindow = 'week', limit: number = 10) => {
    const { getCache, setCache } = useStore();
    const cacheKey = `trending-combined-${timeWindow}-${limit}`;
    
    return useQuery({
      queryKey: ['trending', 'combined', timeWindow],
      queryFn: async () => {
        const cached = getCache(cacheKey);
        if (cached) return cached;
        
        const [movies, shows] = await Promise.all([
          mediaService.getTrending('movie', timeWindow),
          mediaService.getTrending('tv', timeWindow)
        ]);
        
        const data = [...movies, ...shows]
          .sort(() => Math.random() - 0.5)
          .slice(0, limit);
          
        setCache(cacheKey, data);
        return data;
      },
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
    });
  },
};