import React, { useState } from 'react';
import { Star, X, Calendar, Film, SlidersHorizontal, Trash2, Tv } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface Genre {
  id: number;
  name: string;
}

interface SearchFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  genres: Genre[];
  selectedGenres: number[];
  minRating: number;
  yearRange: [number, number];
  mediaType: 'all' | 'movie' | 'tv';
  onGenreToggle: (genreId: number) => void;
  onRatingChange: (rating: number) => void;
  onYearChange: (range: [number, number]) => void;
  onMediaTypeChange: (type: 'all' | 'movie' | 'tv') => void;
  onClearFilters: () => void;
  totalResults: number;
  hideMediaType?: boolean;
}

const YEAR_OPTIONS = [
  { label: '2026', range: [2026, 2026] },
  { label: '2025', range: [2025, 2025] },
  { label: '2024', range: [2024, 2024] },
  { label: '2020s', range: [2020, 2029] },
  { label: '2010s', range: [2010, 2019] },
  { label: '2000s', range: [2000, 2009] },
  { label: '1990s', range: [1990, 1999] },
  { label: '1980s', range: [1980, 1989] },
];

const RATING_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9];

const SearchFilters: React.FC<SearchFiltersProps> = ({
  isOpen,
  onClose,
  genres,
  selectedGenres,
  minRating,
  yearRange,
  mediaType,
  onGenreToggle,
  onRatingChange,
  onYearChange,
  onMediaTypeChange,
  onClearFilters,
  totalResults,
  hideMediaType = false,
}) => {
  const currentYear = new Date().getFullYear();

  const handleRangeSelect = (range: [number, number]) => {
    if (yearRange[0] === range[0] && yearRange[1] === range[1]) {
      onYearChange([1900, currentYear + 2]);
    } else {
      onYearChange(range);
    }
  };

  const handleRatingSelect = (rating: number) => {
    onRatingChange(minRating === rating ? 0 : rating);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 md:p-8"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl max-h-full overflow-hidden bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-white/10 bg-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent">
                    <SlidersHorizontal className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Advanced Filters</h2>
                  </div>
                </div>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={onClearFilters}
                    className="p-3 hover:bg-red-500/10 text-white/40 hover:text-red-500 rounded-lg transition-all active:scale-95"
                    title="Clear All"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-3 hover:bg-white/10 text-white rounded-lg transition-all active:scale-95"
                    title="Close"
                  >
                    <X className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10 custom-scrollbar">
                {!hideMediaType && (
                  <>
                    {/* Media Type Section */}
                    <section>
                      <div className="flex items-center gap-2 mb-5">
                        <Film className="w-5 h-5 text-accent" />
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50">Media Type</h3>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          onClick={() => onMediaTypeChange('all')}
                          className={cn(
                            "px-6 py-2.5 rounded-full text-xs font-black transition-all border",
                            mediaType === 'all'
                              ? "bg-accent border-accent text-white shadow-lg shadow-accent/20"
                              : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10"
                          )}
                        >
                          All
                        </button>
                        <button
                          onClick={() => onMediaTypeChange('movie')}
                          className={cn(
                            "px-6 py-2.5 rounded-full text-xs font-black transition-all border flex items-center gap-2",
                            mediaType === 'movie'
                              ? "bg-accent border-accent text-white shadow-lg shadow-accent/20"
                              : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10"
                          )}
                        >
                          <Film className="w-3.5 h-3.5" />
                          Movies
                        </button>
                        <button
                          onClick={() => onMediaTypeChange('tv')}
                          className={cn(
                            "px-6 py-2.5 rounded-full text-xs font-black transition-all border flex items-center gap-2",
                            mediaType === 'tv'
                              ? "bg-accent border-accent text-white shadow-lg shadow-accent/20"
                              : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10"
                          )}
                        >
                          <Tv className="w-3.5 h-3.5" />
                          TV Shows
                        </button>
                      </div>
                    </section>
                  </>
                )}

                {/* Genres Section */}
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <Film className="w-5 h-5 text-accent" />
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50">Genres</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {genres.map((genre) => {
                      const isSelected = selectedGenres.includes(genre.id);
                      return (
                        <button
                          key={genre.id}
                          onClick={() => onGenreToggle(genre.id)}
                          className={cn(
                            "px-6 py-2.5 rounded-full text-xs font-black transition-all border",
                            isSelected
                              ? "bg-accent border-accent text-white shadow-lg shadow-accent/20"
                              : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10"
                          )}
                        >
                          {genre.name}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Release Year Section */}
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <Calendar className="w-5 h-5 text-accent" />
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50">Release Year</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {YEAR_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => handleRangeSelect(opt.range as [number, number])}
                        className={cn(
                          "px-6 py-2.5 rounded-full text-xs font-black transition-all border",
                          yearRange[0] === opt.range[0] && yearRange[1] === opt.range[1]
                            ? "bg-accent border-accent text-white shadow-lg shadow-accent/20"
                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Rating Section */}
                <section className="pb-4">
                  <div className="flex items-center gap-2 mb-5">
                    <Star className="w-5 h-5 text-accent" />
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50">Minimum Rating</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {RATING_OPTIONS.map((rating) => (
                      <button
                        key={rating}
                        onClick={() => handleRatingSelect(rating)}
                        className={cn(
                          "px-6 py-2.5 rounded-full text-xs font-black transition-all border",
                          minRating === rating
                            ? "bg-yellow-500 border-yellow-500 text-white shadow-lg shadow-yellow-500/20"
                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10"
                        )}
                      >
                        {rating}+
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              {/* Footer */}
              <div className="p-6 md:p-8 bg-white/5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-end gap-4">
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all active:scale-95 border border-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-8 sm:px-12 py-3.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-all shadow-lg shadow-accent/20 active:scale-95 border border-white/10"
                >
                  Show Results
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SearchFilters;
