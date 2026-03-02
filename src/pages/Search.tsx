import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Fuse from 'fuse.js';
import { useMedia } from '../api/hooks/useMedia';
import { genreService } from '../api/services/genres';
import { useSearchFilters } from '../hooks/useSearchFilters';
import SearchFilters from '../components/search/SearchFilters';
import SearchResults from '../components/search/SearchResults';
import TopFilterBar from '../components/search/TopFilterBar';
import { cn } from '../lib/utils';

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const query = searchParams.get('q') || '';
  const shouldOpenFilters = searchParams.get('filters') === 'true';

  // Handle opening filters from URL params
  useEffect(() => {
    if (shouldOpenFilters) {
      setIsFiltersOpen(true);
      // Remove the filters param from URL after opening
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('filters');
      setSearchParams(newParams, { replace: true });
    }
  }, [shouldOpenFilters, searchParams, setSearchParams]);

  // Scroll to top when search results change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [query]);

  const { data: searchResults, isLoading } = useMedia.useSearch(query);
  const { data: popularMedia } = useMedia.usePopular('movie');
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const rawResults = useMemo(() => {
    if (!query) return popularMedia?.results || [];
    return searchResults?.results.filter((item) => item.media_type !== 'person') || [];
  }, [searchResults, popularMedia, query]);

  // Improved search functionality with Fuse.js for fuzzy matching
  const fuseResults = useMemo(() => {
    if (!query || rawResults.length === 0) return rawResults;

    const fuse = new Fuse(rawResults, {
      keys: ['title', 'name', 'original_title', 'original_name'],
      threshold: 0.4, // Adjust for more/less sensitivity
      includeScore: true,
      shouldSort: true,
    });

    const result = fuse.search(query);
    // If we have fuzzy matches, return them; otherwise, return raw results
    return result.length > 0 ? result.map(r => r.item) : rawResults;
  }, [rawResults, query]);

  const {
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
  } = useSearchFilters({
    results: fuseResults,
  });

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    minRating > 0 ||
    (yearRange[0] !== 1900 || yearRange[1] !== new Date().getFullYear() + 2) ||
    (mediaType !== 'all' && mediaType !== undefined && mediaType !== '');

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
      {/* Search Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pt-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-accent font-bold uppercase tracking-widest text-xs">
            <SearchIcon className="w-4 h-4" />
            <span>Search Results</span>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight">
              {query || "Explore"}
            </h1>
            {query && (
              <span className="text-2xl md:text-3xl text-white/20 font-medium translate-y-[8px]">
                ({filteredResults.length})
              </span>
            )}
          </div>
        </div>

        {/* Quick Clear All if filters active */}
        {hasActiveFilters && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={clearFilters}
            className="flex items-center gap-2 px-6 py-3.5 bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg shadow-accent/20 transition-all font-bold text-sm border border-white/10 active:scale-95"
          >
            <X className="w-4 h-4" />
            Clear All Filters
          </motion.button>
        )}
      </div>

      {/* Top Filters Bar */}
      <TopFilterBar
        onOpenFilters={() => setIsFiltersOpen(true)}
        selectedGenres={selectedGenres}
        onGenreToggle={toggleGenre}
        genres={genres}
        minRating={minRating}
        yearRange={yearRange}
        mediaType={mediaType}
        onClearFilters={clearFilters}
        onRatingChange={setMinRating}
        onYearChange={setYearRange}
      />

      {/* Results Content */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {filteredResults.length > 0 ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <SearchResults
                results={filteredResults}
                isLoading={isLoading}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-32 flex flex-col items-center justify-center text-center space-y-6 bg-white/5 border border-white/10 rounded-[3rem] backdrop-blur-md"
            >
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/5 relative">
                <SearchIcon className="w-10 h-10 text-white/20" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-accent rounded-full animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">No results found</h3>
                <p className="text-white/40 max-w-md px-6">
                  We couldn't find anything matching your search. Try adjusting your filters or search for something else.
                </p>
              </div>
              <button
                onClick={clearFilters}
                className="px-8 py-4 bg-accent hover:bg-accent/90 text-white font-bold rounded-2xl shadow-xl shadow-accent/20 transition-all active:scale-95"
              >
                Clear All Filters
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      {/* Advanced Filters Modal */}
      <SearchFilters
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        genres={genres}
        selectedGenres={selectedGenres}
        minRating={minRating}
        yearRange={yearRange}
        mediaType={mediaType}
        onGenreToggle={toggleGenre}
        onRatingChange={setMinRating}
        onYearChange={setYearRange}
        onMediaTypeChange={setMediaType}
        onClearFilters={clearFilters}
        totalResults={filteredResults.length}
      />
    </div>
  );
};

export default Search;
