import React, { useRef } from 'react';
import { Filter, Star, Clock, Calendar, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface TopFilterBarProps {
  onOpenFilters: () => void;
  selectedGenres: number[];
  onGenreToggle: (id: number) => void;
  genres: { id: number; name: string }[];
  minRating: number;
  yearRange: [number, number];
  onClearFilters: () => void;
  onRatingChange: (rating: number) => void;
  onYearChange: (range: [number, number]) => void;
}

const TopFilterBar: React.FC<TopFilterBarProps> = ({
  onOpenFilters,
  selectedGenres,
  onGenreToggle,
  genres,
  minRating,
  yearRange,
  onClearFilters,
  onRatingChange,
  onYearChange,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();

  const activeFilterCount = selectedGenres.length + (minRating > 0 ? 1 : 0) + (yearRange[0] !== 1900 || yearRange[1] !== currentYear ? 1 : 0);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  return (
    <div className="relative mb-8 z-10">
      <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-3 shadow-xl">
        {/* Main Filter Toggle */}
        <button
          onClick={onOpenFilters}
          className={cn(
            "relative flex items-center gap-2 px-5 py-3 rounded-2xl font-bold transition-all duration-300",
            activeFilterCount > 0
              ? "bg-accent text-white shadow-lg shadow-accent/20"
              : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
          )}
        >
          <Filter className="w-5 h-5" />
          <span className="text-sm">Filters</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-white text-accent rounded-full flex items-center justify-center text-xs font-black shadow-lg">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="h-10 w-px bg-white/10 hidden md:block" />

        {/* Scrollable Quick Genres */}
        <div className="relative flex-1 group/scroll min-w-0">
          <div
            ref={scrollRef}
            className="flex items-center gap-2 overflow-x-auto scrollbar-none scroll-smooth px-2"
          >
            {/* Quick Ratings */}
            <button
              onClick={() => onRatingChange(minRating === 7 ? 0 : 7)}
              className={cn(
                "flex-shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border whitespace-nowrap flex items-center gap-2",
                minRating === 7
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10"
              )}
            >
              <Star className={cn("w-3 h-3", minRating === 7 ? "fill-current" : "")} />
              7+ Rating
            </button>
            <button
              onClick={() => onRatingChange(minRating === 8 ? 0 : 8)}
              className={cn(
                "flex-shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border whitespace-nowrap flex items-center gap-2",
                minRating === 8
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10"
              )}
            >
              <Star className={cn("w-3 h-3", minRating === 8 ? "fill-current" : "")} />
              8+ Rating
            </button>

            <div className="h-6 w-px bg-white/5 mx-1 flex-shrink-0" />

            {/* Quick Years */}
            <button
              onClick={() => onYearChange(yearRange[0] === currentYear ? [1900, currentYear] : [currentYear, currentYear])}
              className={cn(
                "flex-shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border whitespace-nowrap flex items-center gap-2",
                yearRange[0] === currentYear
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10"
              )}
            >
              <Calendar className="w-3 h-3" />
              {currentYear}
            </button>
            <button
              onClick={() => onYearChange(yearRange[0] === 2020 && yearRange[1] === 2029 ? [1900, currentYear] : [2020, 2029])}
              className={cn(
                "flex-shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border whitespace-nowrap flex items-center gap-2",
                yearRange[0] === 2020 && yearRange[1] === 2029
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10"
              )}
            >
              <Calendar className="w-3 h-3" />
              2020s
            </button>

            <div className="h-6 w-px bg-white/5 mx-1 flex-shrink-0" />

            {/* Genres */}
            {genres.slice(0, 15).map((genre) => {
              const isSelected = selectedGenres.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  onClick={() => onGenreToggle(genre.id)}
                  className={cn(
                    "flex-shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border whitespace-nowrap",
                    isSelected
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isSelected && <Check className="w-3 h-3" />}
                    {genre.name}
                  </div>
                </button>
              );
            })}
          </div>
          
          {/* Scroll Fade */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900/0 to-transparent pointer-events-none group-hover/scroll:from-zinc-900/40" />
        </div>

        {/* Clear All */}
        {activeFilterCount > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={onClearFilters}
            className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl transition-all border border-red-500/20 font-bold text-xs"
          >
            <Clock className="w-4 h-4" />
            Clear
          </motion.button>
        )}
      </div>

      <style>{`
        .scrollbar-none {
          scrollbar-width: none;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default TopFilterBar;
