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
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const ratingTrackRef = React.useRef<HTMLDivElement>(null);

  const handleRangeSelect = (range: [number, number]) => {
    onYearChange(range);
  };

  const handleRatingMouseDown = () => {
    setIsDragging(true);
  };

  const handleRatingMouseUp = () => {
    setIsDragging(false);
  };

  const handleRatingChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ratingTrackRef.current) return;
    const rect = ratingTrackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.min(Math.max(x / width, 0), 1);
    const rating = Math.round(percentage * 90) / 10; // 0.0 to 9.0
    onRatingChange(rating);
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
              className="w-full max-w-2xl max-h-full overflow-hidden bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20 text-accent">
                    <SlidersHorizontal className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Advanced Filters</h2>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{totalResults.toLocaleString()} results found</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClearFilters}
                    className="p-3 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-500 rounded-xl transition-all active:scale-95 border border-white/5 hover:border-red-500/20"
                    title="Clear All"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all active:scale-95 border border-white/5 hover:border-white/10"
                    title="Close"
                  >
                    <X className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10 custom-scrollbar">
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
                        "px-4 py-2.5 rounded-xl text-xs font-black transition-all border",
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
                        "px-4 py-2.5 rounded-xl text-xs font-black transition-all border flex items-center gap-2",
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
                        "px-4 py-2.5 rounded-xl text-xs font-black transition-all border flex items-center gap-2",
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
                            "px-4 py-2.5 rounded-xl text-xs font-black transition-all border",
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
                          "px-4 py-2.5 rounded-xl text-xs font-black transition-all border",
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
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-accent" />
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-white/50">Minimum Rating</h3>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 rounded-xl border border-yellow-400/20">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      <span className="text-sm font-black text-yellow-400">
                        {minRating === 0 ? 'Any' : minRating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div
                    ref={ratingTrackRef}
                    className="relative w-full h-3 bg-white/5 rounded-full overflow-visible cursor-pointer"
                    onMouseDown={handleRatingMouseDown}
                    onMouseUp={handleRatingMouseUp}
                    onMouseLeave={handleRatingMouseUp}
                    onMouseMove={handleRatingChange}
                  >
                    {/* Active track */}
                    <div
                      className="absolute inset-y-0 left-0 bg-accent rounded-full shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)]"
                      style={{ width: `${(minRating / 9) * 100}%` }}
                    />

                    {/* Dial / Handle */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-3 border-accent rounded-full shadow-2xl -translate-x-1/2 cursor-grab active:cursor-grabbing hover:scale-125 active:scale-105 transition-all flex items-center justify-center"
                      style={{ left: `${(minRating / 9) * 100}%` }}
                    >
                      <div className="w-1 h-1 bg-accent rounded-full" />
                    </div>
                  </div>
                  <div className="flex justify-between mt-6 text-[9px] font-black text-white/20 uppercase tracking-widest">
                    <span>Any</span>
                    <span>2.0</span>
                    <span>4.0</span>
                    <span>6.0</span>
                    <span>8.0</span>
                    <span>9.0</span>
                  </div>
                </section>
              </div>

              {/* Footer */}
              <div className="p-6 md:p-8 bg-black/40 border-t border-white/5 flex items-center justify-end gap-4">
                <button
                  onClick={onClose}
                  className="flex-1 md:flex-none px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl transition-all active:scale-95 border border-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 md:flex-none px-12 py-4 bg-accent hover:bg-accent/90 text-white font-black rounded-2xl transition-all shadow-xl shadow-accent/20 active:scale-95 border border-white/10"
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
