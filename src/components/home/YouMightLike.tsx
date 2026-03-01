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
            className="absolute left-4 top-[60%] z-20 -translate-y-1/2 w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
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
            className="absolute right-4 top-[60%] z-20 -translate-y-1/2 w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
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
          {items.map((item, index) => {
            const year = getYear(item);
            const itemTitle = getTitle(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "group flex-shrink-0 w-[200px] md:w-[240px] flex flex-col gap-4 rounded-3xl transition-all text-left border relative overflow-hidden p-3",
                  "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10"
                )}
              >
                {/* Poster Card */}
                <Link
                  to={getMediaUrl(item)}
                  className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden flex-shrink-0 shadow-xl cursor-pointer"
                >
                  <img
                    src={getImageUrl(item.poster_path, 'w500')}
                    alt={itemTitle}
                    className="w-full h-full object-cover transition-transform duration-500"
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {year && (
                      <div className="px-2.5 py-1 bg-black/50 backdrop-blur-md text-white rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/10 shadow-lg">
                        {year}
                      </div>
                    )}
                  </div>

                  <div className="absolute top-3 right-3">
                    {item.vote_average > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-md text-white rounded-lg border border-white/10 shadow-lg">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        <span className="text-[11px] font-black tracking-tighter">{item.vote_average.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                </Link>

                {/* Info Area */}
                <div className="px-1 pb-1 flex items-center justify-between gap-3 min-w-0">
                  <Link
                    to={getMediaUrl(item)}
                    className="font-bold text-base md:text-lg leading-tight text-white truncate hover:text-accent transition-colors"
                  >
                    {itemTitle}
                  </Link>
                  <div className="flex-shrink-0 p-1.5 bg-white/5 rounded-lg border border-white/10">
                    {'title' in item ? (
                      <Film className="w-3.5 h-3.5 text-white/60" />
                    ) : (
                      <Tv className="w-3.5 h-3.5 text-white/60" />
                    )}
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
