import { tmdbClient } from '../client';
import { Movie, TVShow, MediaType, TimeWindow, PaginatedResponse } from '../types';

export const mediaService = {
  getTrending: async (mediaType: MediaType = 'movie', timeWindow: TimeWindow = 'week') => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
      `/trending/${mediaType}/${timeWindow}`
    );
    return data.results;
  },

  getPopular: async (mediaType: MediaType = 'movie', page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
      `/${mediaType}/popular`,
      { params: { page } }
    );
    return data;
  },

  getDetails: async (mediaType: MediaType, id: number) => {
    const { data } = await tmdbClient.get<Movie | TVShow>(
      `/${mediaType}/${id}`,
      {
        params: {
          append_to_response: 'videos,seasons,similar,recommendations,images'
        }
      }
    );
    return data;
  },

  getTVSeasonDetails: async (tvId: number, seasonNumber: number) => {
    const { data } = await tmdbClient.get(
      `/tv/${tvId}/season/${seasonNumber}`
    );
    return data;
  },

  search: async (query: string, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
      '/search/multi',
      { params: { query, page } }
    );
    return data;
  },
  
  getSimilar: async (mediaType: MediaType, id: number, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
      `/${mediaType}/${id}/similar`,
      { params: { page } }
    );
    return data.results;
  },
  
  getRecommendations: async (mediaType: MediaType, id: number, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow>>(
      `/${mediaType}/${id}/recommendations`,
      { params: { page } }
    );
    return data.results;
  },

  getImages: async (mediaType: MediaType, id: number) => {
    const { data } = await tmdbClient.get(
      `/${mediaType}/${id}/images`
    );
    return data;
  },

  getContentRating: async (mediaType: MediaType, id: number): Promise<string> => {
    const appendParam = mediaType === 'movie' ? 'release_dates' : 'content_ratings';
    const { data } = await tmdbClient.get(
      `/${mediaType}/${id}`,
      {
        params: {
          append_to_response: appendParam
        }
      }
    );

    if (mediaType === 'movie') {
      const usRating = data.release_dates?.results?.find(
        (r: any) => r.iso_3166_1 === 'US'
      )?.release_dates?.[0]?.certification;
      return usRating || 'NR';
    } else {
      const usRating = data.content_ratings?.results?.find(
        (r: any) => r.iso_3166_1 === 'US'
      )?.rating;
      return usRating || 'NR';
    }
  }
};