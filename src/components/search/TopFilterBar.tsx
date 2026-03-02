import React, { useRef } from 'react';
import { Filter } from 'lucide-react';
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
  
  const activeFilterCount = selectedGenres.length + (minRating > 0 ? 1 : 0) + (yearRange[0] !== 1900 || yearRange[1] !== currentYear + 2 ? 1 : 0);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  return (
    <div className="relative mb-10 z-10 group/topbar">
      <div className="flex items-center gap-4 bg-zinc-900/60 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-4 shadow-2xl transition-all hover:bg-zinc-900/80 hover:border-white/10">
        {/* Main Filter Toggle */}
        <button
          onClick={onOpenFilters}
          className={cn(
            "relative flex items-center gap-2 px-4 py-3.5 rounded-2xl font-black transition-all active:scale-95",
            activeFilterCount > 0
              ? "bg-accent text-white shadow-lg shadow-accent/20"
              : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white border border-white/5"
          )}
          title="Advanced filters"
        >
          <Filter className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-2 -right-2 w-6 h-6 bg-white text-accent rounded-lg flex items-center justify-center text-[9px] font-black shadow-lg">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="h-10 w-px bg-white/5 hidden md:block" />

        {/* Scrollable Quick Filters */}
        <div className="relative flex-1 group/scroll min-w-0 overflow-hidden">
          <div
            ref={scrollRef}
            className="flex items-center gap-2 overflow-x-auto scrollbar-none scroll-smooth px-2"
          >
            {/* High Rating Section */}
            <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.03] border border-white/5 rounded-2xl">
              <button
                onClick={() => onRatingChange(minRating === 7 ? 0 : 7)}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  minRating === 7
                    ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-500"
                    : "bg-transparent border-transparent text-white/30 hover:text-white/60"
                )}
              >
                7.0+
              </button>
              <button
                onClick={() => onRatingChange(minRating === 8 ? 0 : 8)}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  minRating === 8
                    ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-500"
                    : "bg-transparent border-transparent text-white/30 hover:text-white/60"
                )}
              >
                8.0+
              </button>
            </div>

            <div className="h-6 w-px bg-white/5 mx-1 flex-shrink-0" />

            {/* Years Section */}
            <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.03] border border-white/5 rounded-2xl">
              <button
                onClick={() => onYearChange(yearRange[0] === 2026 && yearRange[1] === 2026 ? [1900, currentYear + 2] : [2026, 2026])}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  yearRange[0] === 2026 && yearRange[1] === 2026
                    ? "bg-accent/20 border-accent/40 text-accent"
                    : "bg-transparent border-transparent text-white/30 hover:text-white/60"
                )}
              >
                2026
              </button>
              <button
                onClick={() => onYearChange(yearRange[0] === 2025 && yearRange[1] === 2025 ? [1900, currentYear + 2] : [2025, 2025])}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  yearRange[0] === 2025 && yearRange[1] === 2025
                    ? "bg-accent/20 border-accent/40 text-accent"
                    : "bg-transparent border-transparent text-white/30 hover:text-white/60"
                )}
              >
                2025
              </button>
              <button
                onClick={() => onYearChange(yearRange[0] === 2024 && yearRange[1] === 2024 ? [1900, currentYear + 2] : [2024, 2024])}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  yearRange[0] === 2024 && yearRange[1] === 2024
                    ? "bg-accent/20 border-accent/40 text-accent"
                    : "bg-transparent border-transparent text-white/30 hover:text-white/60"
                )}
              >
                2024
              </button>
            </div>

            <div className="h-6 w-px bg-white/5 mx-1 flex-shrink-0" />

            {/* Genres */}
            {genres.slice(0, 15).map((genre) => {
              const isSelected = selectedGenres.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  onClick={() => onGenreToggle(genre.id)}
                  className={cn(
                    "flex-shrink-0 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap",
                    isSelected
                      ? "bg-accent border-accent text-white shadow-lg shadow-accent/20"
                      : "bg-white/5 border-white/5 text-white/30 hover:bg-white/10 hover:text-white/60"
                  )}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
          
          {/* Scroll Fade */}
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none group-hover/scroll:from-zinc-900/80 transition-all duration-500" />
        </div>

        {/* Reset All */}
        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="hidden lg:flex items-center px-6 py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl transition-all border border-red-500/20 font-black text-[10px] uppercase tracking-widest active:scale-95"
            title="Reset all filters"
          >
            Reset
          </button>
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
