import axios from 'axios';
import { BASE_URL, TMDB_API_KEY } from './config';

// Create axios instance with default config
export const tmdbClient = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
  // Add caching headers
  headers: {
    'Cache-Control': 'max-age=3600', // Cache for 1 hour
  },
  // Add timeout
  timeout: 10000, // 10 seconds
});

// Add request interceptor for error handling
tmdbClient.interceptors.request.use(
  (config) => {
    // Add timestamp to prevent caching when needed
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
tmdbClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 1;
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return tmdbClient(error.config);
    }
    return Promise.reject(error);
  }
);