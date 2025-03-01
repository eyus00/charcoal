// API configuration
export const TMDB_API_KEY = '50404130561567acf3e0725aeb09ec5d';
export const BASE_URL = 'https://api.themoviedb.org/3';
export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const getImageUrl = (path: string | null, size: string = 'original') => 
  path ? `${IMAGE_BASE_URL}/${size}${path}` : null;