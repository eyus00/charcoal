import { tmdbClient } from '../client';
import { Movie, TVShow, MediaType, TimeWindow, PaginatedResponse } from '../types';

// Implement request deduplication
const pendingRequests: Record<string, Promise<any>> = {};

const dedupRequest = async <T>(
  key: string,
  request: () => Promise<T>
): Promise<T> => {
  if (!pendingRequests[key]) {
    pendingRequests[key] = request().finally(() => {
      delete pendingRequests[key];
    });
  }
  return pendingRequests[key];
};

export const mediaService = {
  getTrending: async (mediaType: MediaType = 'movie', timeWindow: TimeWindow = 'week') => {
    const key = `trending-${mediaType}-${timeWindow}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
        `/trending/${mediaType}/${timeWindow}`
      );
      return data.results;
    });
  },

  getPopular: async (mediaType: MediaType = 'movie', page: number = 1) => {
    const key = `popular-${mediaType}-${page}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
        `/${mediaType}/popular`,
        { params: { page } }
      );
      return data;
    });
  },

  getDetails: async (mediaType: MediaType, id: number) => {
    const key = `details-${mediaType}-${id}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get<Movie | TVShow>(
        `/${mediaType}/${id}`,
        {
          params: {
            append_to_response: 'videos,seasons,similar,recommendations'
          }
        }
      );
      return data;
    });
  },

  getTVSeasonDetails: async (tvId: number, seasonNumber: number) => {
    const key = `tv-season-${tvId}-${seasonNumber}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get(
        `/tv/${tvId}/season/${seasonNumber}`
      );
      return data;
    });
  },

  search: async (query: string, page: number = 1) => {
    const key = `search-${query}-${page}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
        '/search/multi',
        { params: { query, page } }
      );
      return data;
    });
  },
  
  getSimilar: async (mediaType: MediaType, id: number, page: number = 1) => {
    const key = `similar-${mediaType}-${id}-${page}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
        `/${mediaType}/${id}/similar`,
        { params: { page } }
      );
      return data.results;
    });
  },
  
  getRecommendations: async (mediaType: MediaType, id: number, page: number = 1) => {
    const key = `recommendations-${mediaType}-${id}-${page}`;
    return dedupRequest(key, async () => {
      const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
        `/${mediaType}/${id}/recommendations`,
        { params: { page } }
      );
      return data.results;
    });
  }
};