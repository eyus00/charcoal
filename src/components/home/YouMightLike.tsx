import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Sparkles, Film, Tv } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface YouMightLikeProps {
  items: (Movie | TVShow)[];
}

const YouMightLike: React.FC<YouMightLikeProps> = ({ items }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
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
  }, [items]);

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

  if (!items || items.length === 0) {
    return null;
  }

  const getMediaUrl = (item: Movie | TVShow) => {
    const type = 'title' in item ? 'movie' : 'tv';
    return `/${type}/${item.id}`;
  };

  const getYear = (item: Movie | TVShow) => {
    const dateStr = 'release_date' in item ? item.release_date : item.first_air_date;
    return dateStr ? new Date(dateStr).getFullYear() : '';
  };

  const getTitle = (item: Movie | TVShow) => {
    return 'title' in item ? item.title : item.name;
  };

  return (
    <div className="relative group/container py-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 rounded-xl border border-accent/20">
            <Sparkles className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">You Might Like</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-0.5">Top picks for you today</p>
          </div>
        </div>
      </div>

      {/* Navigation Arrows with glassy style */}
      <AnimatePresence>
        {showLeftArrow && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scroll('left')}
            className="absolute left-2 md:left-4 top-[60%] z-20 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
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
            className="absolute right-2 md:right-4 top-[60%] z-20 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
          >
            <ChevronRight className="w-5 h-5 md:w-7 md:h-7" />
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
          {items.map((item, index) => {
            const year = getYear(item);
            const itemTitle = getTitle(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group flex-shrink-0 w-[160px] md:w-[240px] flex flex-col gap-3"
              >
                <div className={cn(
                  "group flex flex-col gap-3 rounded-2xl transition-all text-left border relative overflow-hidden p-2",
                  "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10"
                )}>
                  {/* Poster Card */}
                  <Link
                    to={getMediaUrl(item)}
                    className="relative w-full aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 shadow-lg cursor-pointer"
                  >
                    <img
                      src={getImageUrl(item.poster_path, 'w500')}
                      alt={itemTitle}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors duration-300" />
                    {/* Year Badge - Top Left */}
                    {year && (
                      <div className="absolute top-2 left-2">
                        <div className="px-2 py-1 bg-black/50 backdrop-blur-md text-white rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/10">
                          {year}
                        </div>
                      </div>
                    )}
                    {/* Rating Badge - Top Right */}
                    {item.vote_average > 0 && (
                      <div className="absolute top-2 right-2">
                        <div className="flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-md text-white rounded-lg border border-white/10">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-[10px] font-bold">{item.vote_average.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                  </Link>

                  {/* Info Area - single line title with badge */}
                  <div className="flex items-center justify-between gap-2 min-w-0 px-1">
                    <Link
                      to={getMediaUrl(item)}
                      className="font-bold text-sm leading-tight text-white line-clamp-1"
                    >
                      {itemTitle}
                    </Link>
                    <div className="flex-shrink-0 p-1 bg-white/5 rounded-lg border border-white/10">
                      {'title' in item ? (
                        <Film className="w-3 h-3 text-white/60" />
                      ) : (
                        <Tv className="w-3 h-3 text-white/60" />
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
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

export default YouMightLike;
