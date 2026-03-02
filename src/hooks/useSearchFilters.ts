import { useCallback, useMemo } from 'react';
import { Movie, TVShow } from '../api/types';
import { useStore } from '../store/useStore';

interface UseSearchFiltersProps {
  results: (Movie | TVShow)[];
}

export const useSearchFilters = ({ results }: UseSearchFiltersProps) => {
  const { filters, setFilters, clearFilters } = useStore();
  const { selectedGenres, minRating, yearRange, mediaType } = filters;

  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
      const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

      // Media type filter
      if (mediaType !== 'all') {
        const itemType = 'release_date' in item ? 'movie' : 'tv';
        if (itemType !== mediaType) return false;
      }

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
  }, [results, mediaType, selectedGenres, minRating, yearRange]);

  const toggleGenre = useCallback((genreId: number) => {
    const newGenres = selectedGenres.includes(genreId)
      ? selectedGenres.filter((id) => id !== genreId)
      : [...selectedGenres, genreId];
    setFilters({ selectedGenres: newGenres });
  }, [selectedGenres, setFilters]);

  const setMinRating = useCallback((rating: number) => {
    setFilters({ minRating: rating });
  }, [setFilters]);

  const setYearRange = useCallback((range: [number, number]) => {
    setFilters({ yearRange: range });
  }, [setFilters]);

  const setMediaType = useCallback((type: 'all' | 'movie' | 'tv') => {
    setFilters({ mediaType: type });
  }, [setFilters]);

  return {
    selectedGenres,
    minRating,
    yearRange,
    mediaType,
    filteredResults,
    toggleGenre,
    setMinRating,
    setYearRange,
    setMediaType,
    clearFilters,
  };
};
