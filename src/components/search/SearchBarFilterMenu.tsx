import React, { useState } from 'react';
import { Star, Calendar, Film, SlidersHorizontal, Tv, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../../api/services/genres';

interface SearchBarFilterMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const YEAR_OPTIONS = [
  { label: '2026', range: [2026, 2026] },
  { label: '2025', range: [2025, 2025] },
  { label: '2024', range: [2024, 2024] },
  { label: '2020s', range: [2020, 2029] },
  { label: '2010s', range: [2010, 2019] },
  { label: '2000s', range: [2000, 2009] },
];

const RATING_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9];

const SearchBarFilterMenu: React.FC<SearchBarFilterMenuProps> = ({ isOpen, onClose }) => {
  const { filters, setFilters, clearFilters } = useStore();
  const { selectedGenres, minRating, yearRange } = filters;
  const currentYear = new Date().getFullYear();

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const handleYearSelect = (range: [number, number]) => {
    if (yearRange[0] === range[0] && yearRange[1] === range[1]) {
      setFilters({ yearRange: [1900, currentYear + 2] });
    } else {
      setFilters({ yearRange: range });
    }
  };

  const handleRatingSelect = (rating: number) => {
    setFilters({ minRating: minRating === rating ? 0 : rating });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for click away */}
          <div className="fixed inset-0 z-[60]" onClick={onClose} />
          
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 sm:left-auto right-0 mt-3 w-full max-w-[calc(100vw-2rem)] sm:w-80 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl z-[70] p-5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white tracking-tight">Quick Filters</h3>
              </div>
              <button
                onClick={clearFilters}
                className="p-3 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-500 rounded-lg transition-all active:scale-95 border border-white/5 hover:border-red-500/20"
                title="Clear All"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {/* Media Type Section */}
              <section>
                <div className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest text-white/50">
                  <Film className="w-3 h-3 text-accent" />
                  Media Type
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilters({ mediaType: 'all' })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-black transition-all border",
                      filters.mediaType === 'all'
                        ? "bg-accent border-accent text-white"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilters({ mediaType: 'movie' })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-black transition-all border",
                      filters.mediaType === 'movie'
                        ? "bg-accent border-accent text-white"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    Movies
                  </button>
                  <button
                    onClick={() => setFilters({ mediaType: 'tv' })}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-black transition-all border",
                      filters.mediaType === 'tv'
                        ? "bg-accent border-accent text-white"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    TV Shows
                  </button>
                </div>
              </section>

              {/* Rating Section */}
              <section>
                <div className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest text-white/50">
                  <Star className="w-3 h-3 text-accent" />
                  Rating
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {RATING_OPTIONS.map((rating) => (
                    <button
                      key={rating}
                      onClick={() => handleRatingSelect(rating)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-black transition-all border",
                        minRating === rating
                          ? "bg-yellow-500 border-yellow-500 text-white"
                          : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                      )}
                    >
                      {rating}+
                    </button>
                  ))}
                </div>
              </section>

              {/* Years Section */}
              <section>
                <div className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest text-white/50">
                  <Calendar className="w-3 h-3 text-accent" />
                  Years
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {YEAR_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleYearSelect(opt.range as [number, number])}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-black transition-all border",
                        yearRange[0] === opt.range[0] && yearRange[1] === opt.range[1]
                          ? "bg-accent border-accent text-white"
                          : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Genres Section */}
              <section>
                <div className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest text-white/50">
                  <Film className="w-3 h-3 text-accent" />
                  Genres
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {genres.slice(0, 12).map((genre) => {
                    const isSelected = selectedGenres.includes(genre.id);
                    return (
                      <button
                        key={genre.id}
                        onClick={() => handleGenreToggle(genre.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[10px] font-black transition-all border",
                          isSelected
                            ? "bg-accent border-accent text-white"
                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                        )}
                      >
                        {genre.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SearchBarFilterMenu;
