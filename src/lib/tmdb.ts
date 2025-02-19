import axios from 'axios';

const TMDB_API_KEY = '50404130561567acf3e0725aeb09ec5d'; // Replace with your TMDB API key
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export interface Movie {
  id: number;
  title: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date: string;
  overview: string;
  genre_ids: number[];
}

export interface TVShow {
  id: number;
  name: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  first_air_date: string;
  overview: string;
  genre_ids: number[];
}

export const tmdb = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
});

export const getImageUrl = (path: string, size: string = 'original') => 
  path ? `${IMAGE_BASE_URL}/${size}${path}` : null;

export const getTrending = async (mediaType: 'movie' | 'tv' = 'movie', timeWindow: 'day' | 'week' = 'week') => {
  const { data } = await tmdb.get(`/trending/${mediaType}/${timeWindow}`);
  return data.results;
};

export const getPopular = async (mediaType: 'movie' | 'tv' = 'movie', page: number = 1) => {
  const { data } = await tmdb.get(`/${mediaType}/popular`, { params: { page } });
  return data;
};

export const getDetails = async (mediaType: 'movie' | 'tv', id: number) => {
  const { data } = await tmdb.get(`/${mediaType}/${id}`);
  return data;
};

export const search = async (query: string, page: number = 1) => {
  const { data } = await tmdb.get('/search/multi', { params: { query, page } });
  return data;
};