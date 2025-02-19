import { useState, useCallback, useMemo } from 'react';
import { Movie, TVShow } from '../api/types';

interface UseSearchFiltersProps {
  results: (Movie | TVShow)[];
}

export const useSearchFilters = ({ results }: UseSearchFiltersProps) => {
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [yearRange, setYearRange] = useState<[number, number]>([1900, new Date().getFullYear()]);

  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
      const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

      // Genre filter
      if (selectedGenres.length > 0) {
        const hasSelectedGenre = item.genre_ids.some((id) => selectedGenres.includes(id));
        if (!hasSelectedGenre) return false;
      }

      // Rating filter
      if (minRating > 0 && item.vote_average < minRating) {
        return false;
      }

      // Year filter
      if (year) {
        if (year < yearRange[0] || year > yearRange[1]) {
          return false;
        }
      }

      return true;
    });
  }, [results, selectedGenres, minRating, yearRange]);

  const toggleGenre = useCallback((genreId: number) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId)
        ? prev.filter((id) => id !== genreId)
        : [...prev, genreId]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedGenres([]);
    setMinRating(0);
    setYearRange([1900, new Date().getFullYear()]);
  }, []);

  return {
    selectedGenres,
    minRating,
    yearRange,
    filteredResults,
    toggleGenre,
    setMinRating,
    setYearRange,
    clearFilters,
  };
};