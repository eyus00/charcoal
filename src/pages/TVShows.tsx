import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tv, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMedia } from '../api/hooks/useMedia';
import { genreService } from '../api/services/genres';
import { useSearchFilters } from '../hooks/useSearchFilters';
import { useStore } from '../store/useStore';
import SearchFilters from '../components/search/SearchFilters';
import SearchResults from '../components/search/SearchResults';
import TopFilterBar from '../components/search/TopFilterBar';
import { cn } from '../lib/utils';

const TVShows = () => {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [nextPage, setNextPage] = useState(4);
  const [allShows, setAllShows] = useState<any[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { setFilters } = useStore();

  // Scroll to top when component mounts and reset mediaType filter
  useEffect(() => {
    window.scrollTo(0, 0);
    setFilters({ mediaType: 'all' });
  }, [setFilters]);

  // Fetch trending and popular TV shows
  const { data: trendingData } = useMedia.useTrending('tv', 'week');
  const { data: popularData1 } = useMedia.usePopular('tv', 1);
  const { data: popularData2 } = useMedia.usePopular('tv', 2);
  const { data: popularData3 } = useMedia.usePopular('tv', 3);
  const { data: popularDataNext } = useMedia.usePopular('tv', nextPage);

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  // Combine trending (at the top) with popular shows (3 pages initially for ~50+ items)
  useEffect(() => {
    if (nextPage === 4) {
      // Initial load: combine trending + 3 pages of popular
      const trendingIds = new Set(trendingData?.map(s => s.id) || []);

      const page1 = (popularData1?.results || []).filter(s => !trendingIds.has(s.id));
      const page1Ids = new Set(page1.map(s => s.id));

      const page2 = (popularData2?.results || []).filter(s => !trendingIds.has(s.id) && !page1Ids.has(s.id));
      const page2Ids = new Set(page2.map(s => s.id));

      const page3 = (popularData3?.results || []).filter(s => !trendingIds.has(s.id) && !page1Ids.has(s.id) && !page2Ids.has(s.id));

      const combined = [...(trendingData || []), ...page1, ...page2, ...page3];
      if (combined.length > 0) {
        setAllShows(combined);
      }
    } else if (popularDataNext?.results) {
      // Load more: append new page
      const existingIds = new Set(allShows.map(s => s.id));
      const newShows = popularDataNext.results.filter(s => !existingIds.has(s.id));
      setAllShows(prev => [...prev, ...newShows]);
    }
    setIsLoadingMore(false);
  }, [nextPage, popularData1, popularData2, popularData3, popularDataNext, trendingData]);

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
    results: allShows,
  });

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    minRating > 0 ||
    (yearRange[0] !== 1900 || yearRange[1] !== new Date().getFullYear() + 2);

  const loadMore = () => {
    if (nextPage < 10) {
      setIsLoadingMore(true);
      setNextPage(nextPage + 1);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
      {/* TV Shows Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pt-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-accent font-bold uppercase tracking-widest text-xs">
            <Tv className="w-4 h-4" />
            <span>TV Shows Catalog</span>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight">
              TV Shows
            </h1>
            <span className="text-2xl md:text-3xl text-white/20 font-medium translate-y-[8px]">
              ({filteredResults.length})
            </span>
          </div>
        </div>

        {/* Quick Clear All if filters active */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-2 px-6 py-3.5 bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg shadow-accent/20 transition-all font-bold text-sm border border-white/10 active:scale-95"
          >
            <X className="w-4 h-4" />
            Clear All Filters
          </button>
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
        mediaType="all"
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
                isLoading={false}
              />

              {/* Load More Button */}
              {nextPage < 10 && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className={cn(
                      "font-bold text-sm uppercase tracking-widest transition-all active:scale-95",
                      isLoadingMore
                        ? "text-white/40 cursor-not-allowed"
                        : "text-white hover:text-red-400"
                    )}
                  >
                    {isLoadingMore ? 'LOADING...' : 'LOAD MORE...'}
                  </button>
                </div>
              )}
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
                <Tv className="w-10 h-10 text-white/20" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-accent rounded-full animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">No TV shows found</h3>
                <p className="text-white/40 max-w-md px-6">
                  We couldn't find any TV shows matching your filters. Try adjusting your selection.
                </p>
              </div>
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
        mediaType="all"
        onGenreToggle={toggleGenre}
        onRatingChange={setMinRating}
        onYearChange={setYearRange}
        onMediaTypeChange={() => {}}
        onClearFilters={clearFilters}
        totalResults={filteredResults.length}
        hideMediaType={true}
      />
    </div>
  );
};

export default TVShows;
