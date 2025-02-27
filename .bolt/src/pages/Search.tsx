import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { genreService } from '../api/services/genres';
import { useSearchFilters } from '../hooks/useSearchFilters';
import SearchFilters from '../components/search/SearchFilters';
import SearchResults from '../components/search/SearchResults';

const Search = () => {
  const [searchParams] = useSearchParams();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const query = searchParams.get('q') || '';

  // Scroll to top when search results change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [query]);

  const { data: searchResults, isLoading } = useMedia.useSearch(query);
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const {
    selectedGenres,
    minRating,
    yearRange,
    filteredResults,
    toggleGenre,
    setMinRating,
    setYearRange,
    clearFilters,
  } = useSearchFilters({
    results: searchResults?.results.filter((item) => item.media_type !== 'person') || [],
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">
          Search Results for "{query}"
        </h1>
        <button
          onClick={() => setIsFiltersOpen(true)}
          className="hidden md:flex items-center gap-2 px-4 py-2 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
        >
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filters</span>
        </button>
      </div>

      <SearchResults
        results={filteredResults}
        isLoading={isLoading}
      />

      {/* Floating Filter Button for Mobile */}
      <button
        onClick={() => setIsFiltersOpen(true)}
        className="fixed right-4 bottom-24 z-30 md:hidden bg-red-600 text-white p-4 rounded-full shadow-lg flex items-center justify-center hover:bg-red-700 transition-colors"
      >
        <Filter className="w-5 h-5" />
      </button>

      <SearchFilters
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        genres={genres}
        selectedGenres={selectedGenres}
        minRating={minRating}
        yearRange={yearRange}
        onGenreToggle={toggleGenre}
        onRatingChange={setMinRating}
        onYearChange={setYearRange}
        onClearFilters={clearFilters}
        totalResults={filteredResults.length}
      />
    </div>
  );
};

export default Search;