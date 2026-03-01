import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Film, Tv, Star, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WatchlistItem, WatchStatus, useStore } from '../../store/useStore';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import WatchlistMenu from '../shared/WatchlistMenu';

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
  { id: 'watching', label: 'Currently Watching', value: 'watching', type: 'status' },
  { id: 'planned', label: 'Plan to Watch', value: 'planned', type: 'status' },
  { id: 'completed', label: 'Completed', value: 'completed', type: 'status' },
  { id: 'movie', label: 'Movies', value: 'movie', type: 'mediaType' },
  { id: 'tv', label: 'TV Shows', value: 'tv', type: 'mediaType' },
];

const STATUS_COLORS = {
  watching: { bg: 'bg-blue-500/80', border: 'border-blue-500/40', text: 'text-blue-400', icon: 'bg-blue-500' },
  planned: { bg: 'bg-purple-500/80', border: 'border-purple-500/40', text: 'text-purple-400', icon: 'bg-purple-500' },
  completed: { bg: 'bg-green-500/80', border: 'border-green-500/40', text: 'text-green-400', icon: 'bg-green-500' },
};

const STATUS_LABELS = {
  watching: 'Watching',
  planned: 'Plan to Watch',
  completed: 'Completed',
};

const Watchlist: React.FC<WatchlistProps> = ({
  watchlist,
  onRemoveFromWatchlist,
}) => {
  const { updateWatchlistStatus } = useStore();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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
    <div className="relative group/container py-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 rounded-xl border border-accent/20">
            <Bookmark className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Watchlist</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-0.5">
              {watchlist.length} item{watchlist.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl border border-white/5 bg-white/[0.03]">
          <Bookmark className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 text-lg font-semibold">Your watchlist is empty</p>
          <p className="text-white/40 text-sm mt-2">
            Add movies and TV shows to keep track of what you want to watch
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="mb-8 px-2 flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => toggleFilter(filter.id)}
                className={cn(
                  "px-4 py-2 text-sm font-bold rounded-2xl transition-all border flex items-center gap-2 uppercase tracking-wider",
                  activeFilters.has(filter.id)
                    ? "bg-accent text-white border-accent/50 shadow-lg shadow-accent/20"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                )}
              >
                {filter.type === 'mediaType' ? (
                  filter.value === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />
                ) : (
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    filter.value === 'watching' && "bg-blue-400",
                    filter.value === 'planned' && "bg-purple-400",
                    filter.value === 'completed' && "bg-green-400"
                  )} />
                )}
                {filter.label}
              </button>
            ))}
          </div>

          {filteredWatchlist.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl border border-white/5 bg-white/[0.03]">
              <p className="text-white/60">No items match your filters</p>
            </div>
          ) : (
            <>
              {/* Navigation Arrows with glassy style */}
              <AnimatePresence>
                {showLeftArrow && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => scroll('left')}
                    className="absolute left-4 top-[45%] z-20 -translate-y-1/2 w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
                  >
                    <ChevronLeft className="w-7 h-7" />
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
                    className="absolute right-4 top-[45%] z-20 -translate-y-1/2 w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
                  >
                    <ChevronRight className="w-7 h-7" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Scrollable Container */}
              <div
                ref={containerRef}
                className="overflow-x-auto scrollbar-none px-2 py-4"
                onMouseDown={startDrag}
                onMouseUp={stopDrag}
                onMouseLeave={stopDrag}
                onMouseMove={onDrag}
                onTouchStart={(e) => startDrag(e as unknown as React.MouseEvent)}
                onTouchEnd={stopDrag}
                onTouchMove={(e) => onDrag(e as unknown as React.MouseEvent)}
                style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'pan-y' }}
              >
                <div className="flex gap-6">
                  {filteredWatchlist.map((item, index) => {
                    const itemKey = `${item.mediaType}-${item.id}`;
                    const statusConfig = STATUS_COLORS[item.status];

                    return (
                      <motion.div
                        key={itemKey}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          "group flex-shrink-0 w-[180px] flex flex-col gap-3 rounded-2xl transition-all text-left border relative overflow-hidden",
                          "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10"
                        )}
                        ref={(el) => {
                          if (el) menuRefs.current[itemKey] = el;
                        }}
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

                          {/* Status Badge - Top Left */}
                          <div className="absolute top-2 left-2">
                            <div className={cn(
                              "px-2.5 py-1.5 bg-black/60 backdrop-blur-md text-white rounded-lg text-[10px] font-bold uppercase tracking-wider border shadow-lg flex items-center gap-1.5",
                              statusConfig.border
                            )}>
                              <div className={cn("w-2 h-2 rounded-full", statusConfig.icon)} />
                              {STATUS_LABELS[item.status]}
                            </div>
                          </div>

                          {/* Menu Button - Top Right */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMenuOpen(menuOpen === itemKey ? null : itemKey);
                              }}
                              className="w-9 h-9 bg-black/60 backdrop-blur-md hover:bg-accent/40 text-white rounded-lg flex items-center justify-center transition-all border border-white/10 hover:border-accent/60"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                              </svg>
                            </button>
                            
                            {menuOpen === itemKey && (
                              <WatchlistMenu
                                isOpen={true}
                                onClose={() => setMenuOpen(null)}
                                onAdd={(status) => {
                                  updateWatchlistStatus(item.id, item.mediaType, status);
                                  setMenuOpen(null);
                                }}
                                onRemove={() => {
                                  onRemoveFromWatchlist(item.id, item.mediaType);
                                  setMenuOpen(null);
                                }}
                                currentStatus={item.status}
                                containerRef={menuRefs.current[itemKey] ? { current: menuRefs.current[itemKey] } : undefined}
                                position="top-right"
                              />
                            )}
                          </div>

                          {/* Delete Button - Bottom Right (hover) */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              onRemoveFromWatchlist(item.id, item.mediaType);
                            }}
                            className="absolute bottom-2 right-2 p-2 bg-black/60 backdrop-blur-md hover:bg-red-500/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-white/10 hover:border-red-500/40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Link>

                        {/* Info Area */}
                        <div className="px-2 pb-2 flex flex-col gap-2 min-h-[70px]">
                          <Link
                            to={`/${item.mediaType}/${item.id}`}
                            className="font-bold text-sm leading-tight text-white line-clamp-2 hover:text-accent transition-colors"
                          >
                            {item.title}
                          </Link>

                          <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 rounded-md border border-white/10">
                              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                              <span className="text-[10px] font-bold text-white/70">8.5</span>
                            </div>
                            <div className="flex-shrink-0 p-1 bg-white/5 rounded-md border border-white/10">
                              {item.mediaType === 'tv' ? (
                                <Tv className="w-3 h-3 text-white/60" />
                              ) : (
                                <Film className="w-3 h-3 text-white/60" />
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
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
