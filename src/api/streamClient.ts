import axios, { AxiosInstance } from 'axios';

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface StreamQuality {
  quality: string;
  url: string;
}

interface Caption {
  language: string;
  url: string;
  default?: boolean;
}

export interface StreamResponse {
  success: boolean;
  data?: {
    title: string;
    type: 'hls' | 'mp4';
    qualities: StreamQuality[];
    captions: Caption[];
    sourceProvider: string;
    duration?: number;
  };
  error?: string;
  fallbacks?: string[];
}

class StreamClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get stream URLs for a movie or TV episode
   */
  async getStream(
    tmdbId: number,
    type: 'movie' | 'tv',
    season?: number,
    episode?: number,
    quality: string = 'auto'
  ): Promise<StreamResponse> {
    try {
      const params = new URLSearchParams({
        tmdbId: tmdbId.toString(),
        type,
        quality
      });

      if (type === 'tv' && season !== undefined && episode !== undefined) {
        params.append('season', season.toString());
        params.append('episode', episode.toString());
      }

      const response = await this.client.get<StreamResponse>(
        `/sources/get?${params.toString()}`
      );

      return response.data;
    } catch (error: any) {
      console.error('Error fetching stream:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch stream'
      };
    }
  }

  /**
   * Get available providers
   */
  async getProviders(): Promise<any> {
    try {
      const response = await this.client.get('/sources/providers');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching providers:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Proxy a request through the external proxy service
   */
  async proxyRequest(
    url: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    try {
      return await this.client.post('/sources/proxy', {
        url,
        headers
      });
    } catch (error: any) {
      console.error('Error proxying request:', error);
      throw error;
    }
  }

  /**
   * Search for movies or TV shows
   */
  async search(query: string, type?: 'movie' | 'tv'): Promise<any> {
    try {
      const params = new URLSearchParams({ query });
      if (type) params.append('type', type);

      const response = await this.client.get(`/meta/search?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      console.error('Error searching:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get movie details
   */
  async getMovieDetails(movieId: number): Promise<any> {
    try {
      const response = await this.client.get(`/meta/movie/${movieId}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching movie details:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get TV show details
   */
  async getTVDetails(tvId: number): Promise<any> {
    try {
      const response = await this.client.get(`/meta/tv/${tvId}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching TV details:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get TV season details
   */
  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
    try {
      const response = await this.client.get(
        `/meta/tv/${tvId}/season/${seasonNumber}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching season details:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get TV episode details
   */
  async getEpisodeDetails(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<any> {
    try {
      const response = await this.client.get(
        `/meta/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching episode details:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get recommendations for a movie or TV show
   */
  async getRecommendations(
    type: 'movie' | 'tv',
    id: number
  ): Promise<any> {
    try {
      const response = await this.client.get(
        `/meta/${type}/${id}/recommendations`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching recommendations:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        baseURL: API_BASE_URL.replace('/api', '')
      });
      return response.data?.status === 'ok';
    } catch (error) {
      console.error('Server health check failed:', error);
      return false;
    }
  }
}

export const streamClient = new StreamClient();
