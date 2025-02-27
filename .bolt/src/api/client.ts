import axios from 'axios';
import { BASE_URL, TMDB_API_KEY } from './config';

export const tmdbClient = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
});