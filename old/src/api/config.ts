// API configuration
export const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
export const BASE_URL = import.meta.env.VITE_TMDB_BASE_URL || 'https://api.themoviedb.org/3';
export const IMAGE_BASE_URL = import.meta.env.VITE_TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';

export const getImageUrl = (path: string | null, size: string = 'original') => 
  path ? `${IMAGE_BASE_URL}/${size}${path}` : null;