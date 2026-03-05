import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Film, Tv, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WatchlistItem, WatchStatus, useStore } from '../../store/useStore';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface WatchlistProps {
  watchlist: WatchlistItem[];
  onRemoveFromWatchlist: (id: number, mediaType: 'movie' | 'tv') => void;
}

interface Filter {
  id: string;
  label: string;
  value: WatchStatus | 'movie' | 'tv';
  type: 'status' | 'mediaType';
}

const FILTERS: Filter[] = [
  { id: 'watching', label: 'Watching', value: 'watching', type: 'status' },
  { id: 'planned', label: 'To Watch', value: 'planned', type: 'status' },
  { id: 'completed', label: 'Watched', value: 'completed', type: 'status' },
  { id: 'movie', label: 'Movies', value: 'movie', type: 'mediaType' },
  { id: 'tv', label: 'TV Shows', value: 'tv', type: 'mediaType' },
];

const STATUS_COLORS = {
  watching: { bg: 'bg-red-500/80', border: 'border-red-500/40', text: 'text-red-400', icon: 'bg-red-500' },
  planned: { bg: 'bg-orange-500/80', border: 'border-orange-500/40', text: 'text-orange-400', icon: 'bg-orange-500' },
  completed: { bg: 'bg-red-600/80', border: 'border-red-600/40', text: 'text-red-500', icon: 'bg-red-600' },
};

const STATUS_LABELS = {
  watching: 'Watching',
  planned: 'To Watch',
  completed: 'Watched',
};

const Watchlist: React.FC<WatchlistProps> = ({
  watchlist,
  onRemoveFromWatchlist,
}) => {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const toggleFilter = (filterId: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(filterId)) {
      newFilters.delete(filterId);
    } else {
      newFilters.add(filterId);
    }
    setActiveFilters(newFilters);
  };

  const filteredWatchlist = watchlist.filter(item => {
    const statusFilters = FILTERS.filter(f => f.type === 'status' && activeFilters.has(f.id)).map(f => f.value);
    const mediaFilters = FILTERS.filter(f => f.type === 'mediaType' && activeFilters.has(f.id)).map(f => f.value);

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(item.status as WatchStatus);
    const matchesMedia = mediaFilters.length === 0 || mediaFilters.includes(item.mediaType);

    return matchesStatus && matchesMedia;
  });

  React.useEffect(() => {
    const checkScroll = () => {
      if (!containerRef.current) return;

      setShowLeftArrow(containerRef.current.scrollLeft > 0);
      setShowRightArrow(
        containerRef.current.scrollLeft <
          containerRef.current.scrollWidth - containerRef.current.clientWidth - 10
      );
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll, { passive: true });
      checkScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
    };
  }, [filteredWatchlist]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;

    const scrollAmount = containerRef.current.clientWidth * 0.8;
    const newScrollLeft = direction === 'left'
      ? containerRef.current.scrollLeft - scrollAmount
      : containerRef.current.scrollLeft + scrollAmount;

    containerRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });
  };

  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (containerRef.current?.offsetLeft || 0));
    setScrollLeft(containerRef.current?.scrollLeft || 0);
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  const onDrag = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();

    const x = e.pageX - (containerRef.current.offsetLeft || 0);
    const walk = (x - startX) * 2;
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div className="relative group/container py-2 md:py-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 md:mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-2.5 bg-accent/10 rounded-lg md:rounded-xl border border-accent/20">
            <Bookmark className="w-5 h-5 md:w-6 md:h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-black text-white tracking-tight">Watchlist</h2>
            <p className="text-white/40 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-0.5">
              {watchlist.length} item{watchlist.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-10 md:py-16 px-4 rounded-2xl md:rounded-3xl border border-white/5 bg-white/[0.03]">
          <Bookmark className="w-12 h-12 md:w-16 md:h-16 text-white/20 mx-auto mb-3 md:mb-4" />
          <p className="text-white/60 text-base md:text-lg font-semibold">Your watchlist is empty</p>
          <p className="text-white/40 text-[10px] md:text-sm mt-1.5 md:mt-2">
            Add movies and TV shows to keep track of what you want to watch
          </p>
        </div>
      ) : (
        <>
          {/* Filters - Responsive layout for mobile (2 rows) and desktop */}
          <div className="mb-6 md:mb-8 px-2 flex flex-wrap items-center justify-start gap-2 md:gap-3">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => toggleFilter(filter.id)}
                className={cn(
                  "px-3 md:px-4 py-2 md:py-2.5 text-[10px] md:text-sm font-bold rounded-full transition-all border flex items-center justify-center gap-2 uppercase tracking-wider whitespace-nowrap min-w-0",
                  activeFilters.has(filter.id)
                    ? "bg-accent text-white border-accent/60 shadow-lg shadow-accent/20"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                )}
              >
                {filter.type === 'mediaType' ? (
                  filter.value === 'movie' ? <Film className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" /> : <Tv className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                ) : (
                  <div className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    filter.value === 'watching' && "bg-red-500",
                    filter.value === 'planned' && "bg-orange-500",
                    filter.value === 'completed' && "bg-red-600"
                  )} />
                )}
                <span>{filter.label}</span>
              </button>
            ))}
          </div>

          {filteredWatchlist.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl border border-white/5 bg-white/[0.03]">
              <p className="text-white/60">No items match your filters</p>
            </div>
          ) : (
            <>
            <div className="relative group/cards">
              {/* Navigation Arrows with glassy style */}
              <AnimatePresence>
                {showLeftArrow && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => scroll('left')}
                    className="absolute left-4 top-1/2 z-20 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
                  >
                    <ChevronLeft className="w-5 h-5 md:w-7 md:h-7" />
                  </motion.button>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showRightArrow && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => scroll('right')}
                    className="absolute right-4 top-1/2 z-20 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
                  >
                    <ChevronRight className="w-5 h-5 md:w-7 md:h-7" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Scrollable Container */}
              <div
                ref={containerRef}
                className="overflow-x-auto scrollbar-none px-2 py-2 md:py-4"
                onMouseDown={startDrag}
                onMouseUp={stopDrag}
                onMouseLeave={stopDrag}
                onMouseMove={onDrag}
                style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'auto' }}
              >
                <div className="flex gap-4 md:gap-6">
                  {filteredWatchlist.map((item, index) => {
                    const itemKey = `${item.mediaType}-${item.id}`;
                    const statusConfig = STATUS_COLORS[item.status];

                    return (
                      <motion.div
                        key={itemKey}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          "group flex-shrink-0 w-[140px] md:w-[200px] flex flex-col gap-2 md:gap-3 rounded-xl md:rounded-2xl transition-all text-left border relative overflow-hidden p-1.5 md:p-2",
                          "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10 duration-300"
                        )}
                      >
                        {/* Poster Card */}
                        <Link
                          to={`/${item.mediaType}/${item.id}`}
                          className="relative w-full aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 shadow-lg cursor-pointer"
                        >
                          <img
                            src={getImageUrl(item.posterPath, 'w342')}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />

                          {/* Overlay */}
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors duration-300" />

                          {/* Year Badge - Top Left */}
                          {item.releaseDate && (
                            <div className="absolute top-1.5 md:top-2 left-1.5 md:left-2">
                              <div className="px-1.5 md:px-2 py-0.5 md:py-1 bg-black/50 backdrop-blur-md text-white rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider border border-white/10">
                                {new Date(item.releaseDate).getFullYear()}
                              </div>
                            </div>
                          )}

                          {/* Status Badge - Bottom Left */}
                          <div className="absolute bottom-1.5 md:bottom-2 left-1.5 md:left-2">
                            <div className={cn(
                              "px-1.5 md:px-2.5 py-1 md:py-1.5 bg-black/70 backdrop-blur-md text-white rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider border shadow-lg flex items-center gap-1 md:gap-1.5",
                              statusConfig.border
                            )}>
                              <div className={cn("w-1.5 md:w-2 h-1.5 md:h-2 rounded-full", statusConfig.icon)} />
                              {STATUS_LABELS[item.status]}
                            </div>
                          </div>

                          {/* Rating Badge - Top Right */}
                          {item.ratingScore && (
                            <div className="absolute top-1.5 md:top-2 right-1.5 md:right-2">
                              <div className="flex items-center gap-0.5 md:gap-1 px-1.5 md:px-2 py-0.5 md:py-1 bg-black/50 backdrop-blur-md text-white rounded-lg border border-white/10">
                                <Star className="w-2.5 md:w-3 h-2.5 md:h-3 text-yellow-400 fill-yellow-400" />
                                <span className="text-[8px] md:text-[10px] font-bold">{item.ratingScore.toFixed(1)}</span>
                              </div>
                            </div>
                          )}
                        </Link>

                        {/* Info Area */}
                        <div className="px-1 md:px-2 pb-1 flex items-center justify-between gap-2 min-w-0">
                          <Link
                            to={`/${item.mediaType}/${item.id}`}
                            className="font-bold text-xs md:text-sm leading-tight text-white line-clamp-1 hover:text-accent transition-colors"
                          >
                            {item.title}
                          </Link>
                          <div className="flex-shrink-0 p-1 bg-white/5 rounded-lg border border-white/10">
                            {item.mediaType === 'tv' ? (
                              <Tv className="w-2.5 md:w-3 h-2.5 md:h-3 text-white/60" />
                            ) : (
                              <Film className="w-2.5 md:w-3 h-2.5 md:h-3 text-white/60" />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
            </>
          )}
        </>
      )}

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

export default Watchlist;
