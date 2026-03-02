import React, { useState } from 'react';
import { Star, Calendar, Film, Check, X, SlidersHorizontal } from 'lucide-react';
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
  { label: '2020s', range: [2020, 2029] },
  { label: '2010s', range: [2010, 2019] },
  { label: '2000s', range: [2000, 2009] },
];

const SearchBarFilterMenu: React.FC<SearchBarFilterMenuProps> = ({ isOpen, onClose }) => {
  const { filters, setFilters, clearFilters } = useStore();
  const { selectedGenres, minRating, yearRange } = filters;
  const [isDragging, setIsDragging] = useState(false);

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const handleYearSelect = (range: [number, number]) => {
    setFilters({ yearRange: range });
  };

  const handleGenreToggle = (genreId: number) => {
    const newGenres = selectedGenres.includes(genreId)
      ? selectedGenres.filter((id) => id !== genreId)
      : [...selectedGenres, genreId];
    setFilters({ selectedGenres: newGenres });
  };

  const handleRatingSliderChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.min(Math.max(x / width, 0), 1);
    const rating = Math.round(percentage * 90) / 10;
    setFilters({ minRating: rating });
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
            className="absolute top-full left-0 mt-3 w-80 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-[70] p-5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold text-white tracking-tight">Quick Filters</h3>
              </div>
              <button
                onClick={clearFilters}
                className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-red-500 transition-colors"
              >
                Reset
              </button>
            </div>

            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {/* Rating Section */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/50">
                    <Star className="w-3 h-3 text-accent" />
                    Rating
                  </div>
                  <span className="text-[10px] font-black text-accent">{minRating > 0 ? minRating.toFixed(1) : 'Any'}</span>
                </div>
                <div 
                  className="relative w-full h-1.5 bg-white/5 rounded-full overflow-visible cursor-pointer group"
                  onMouseDown={() => setIsDragging(true)}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  onMouseMove={handleRatingSliderChange}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-75"
                    style={{ width: `${(minRating / 9) * 100}%` }}
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-accent rounded-full shadow-lg -translate-x-1/2 cursor-grab active:cursor-grabbing transition-all hover:scale-110 active:scale-95"
                    style={{ left: `${(minRating / 9) * 100}%` }}
                  />
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
                        "px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all border",
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
                          "px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all border flex items-center gap-1.5",
                          isSelected
                            ? "bg-accent border-accent text-white"
                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                        )}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5" />}
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
