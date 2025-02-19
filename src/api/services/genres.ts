import { tmdbClient } from '../client';

export interface Genre {
  id: number;
  name: string;
}

export const genreService = {
  getMovieGenres: async () => {
    const { data } = await tmdbClient.get<{ genres: Genre[] }>('/genre/movie/list');
    return data.genres;
  },

  getTVGenres: async () => {
    const { data } = await tmdbClient.get<{ genres: Genre[] }>('/genre/tv/list');
    return data.genres;
  },

  getAllGenres: async () => {
    const [movieGenres, tvGenres] = await Promise.all([
      genreService.getMovieGenres(),
      genreService.getTVGenres(),
    ]);

    // Merge and deduplicate genres
    const uniqueGenres = new Map();
    [...movieGenres, ...tvGenres].forEach((genre) => {
      uniqueGenres.set(genre.id, genre);
    });

    return Array.from(uniqueGenres.values());
  },
};