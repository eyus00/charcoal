import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter, Search as SearchIcon, X, SlidersHorizontal, Sparkles } from 'lucide-react';
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
  const [showFAB, setShowFAB] = useState(false);
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

  // Scroll logic for FAB
  useEffect(() => {
    const handleScroll = () => {
      setShowFAB(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    filteredResults,
    toggleGenre,
    setMinRating,
    setYearRange,
    clearFilters,
  } = useSearchFilters({
    results: fuseResults,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
      {/* Search Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pt-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-accent font-bold uppercase tracking-widest text-xs">
            <SearchIcon className="w-4 h-4" />
            <span>Search Results</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight flex items-center gap-4">
            {query || "Explore"}
            {query && (
              <span className="text-2xl md:text-3xl text-white/20 font-medium">
                ({filteredResults.length})
              </span>
            )}
          </h1>
        </div>

        {/* Quick Clear All if filters active */}
        {(selectedGenres.length > 0 || minRating > 0) && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={clearFilters}
            className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl border border-red-500/20 transition-all font-bold text-sm group"
          >
            <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
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

      {/* Floating Action Button (FAB) */}
      <AnimatePresence>
        {showFAB && (
          <motion.button
            initial={{ opacity: 0, scale: 0, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0, y: 20 }}
            onClick={() => setIsFiltersOpen(true)}
            className="fixed bottom-24 right-6 md:bottom-12 md:right-12 z-[60] w-16 h-16 bg-accent hover:bg-accent/90 text-white rounded-[1.5rem] shadow-2xl flex items-center justify-center transition-all active:scale-90 group hover:shadow-accent/40 border border-white/20"
          >
            <div className="relative">
              <SlidersHorizontal className="w-7 h-7 group-hover:rotate-12 transition-transform" />
              {(selectedGenres.length > 0 || minRating > 0) && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full" />
              )}
            </div>
            <div className="absolute inset-0 bg-accent rounded-[1.5rem] animate-ping opacity-20 -z-10 group-hover:opacity-40 transition-opacity" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Advanced Filters Modal */}
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
