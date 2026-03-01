import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Film, Tv, ChevronLeft, ChevronRight, History, Eye, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { mediaService } from '../../api/services/media';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { WatchHistoryItem } from '../../store/useStore';

interface ContinueWatchingSectionProps {
  items: WatchHistoryItem[];
}

const ContinueWatchingSection: React.FC<ContinueWatchingSectionProps> = ({ items }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const episodeQueries = useQuery({
    queryKey: ['episodes', items.map(item => `${item.id}-${item.season}-${item.episode}`)],
    queryFn: async () => {
      const episodeDetails = await Promise.all(
        items
          .filter(item => item.mediaType === 'tv' && item.season && item.episode)
          .map(item =>
            mediaService.getTVSeasonDetails(item.id, item.season!)
              .then(season => season.episodes.find(ep => ep.episode_number === item.episode))
              .catch(() => null)
          )
      );
      return episodeDetails;
    },
    enabled: items.some(item => item.mediaType === 'tv'),
  });

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

  const formatSeasonEpisode = (season: number, episode: number) => {
    return `S${season}`;
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  };

  if (items.length === 0) return null;

  return (
    <div className="relative group/container py-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 rounded-xl border border-accent/20">
            <History className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Continue Watching</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-0.5">Pick up where you left off</p>
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
            const episodeDetails = item.mediaType === 'tv' ? episodeQueries.data?.[index] : null;
            const progress = item.progress
              ? (item.progress.watched / item.progress.duration) * 100
              : 0;
            const remainingMinutes = item.progress
              ? Math.floor((item.progress.duration - item.progress.watched) / 60)
              : 0;
            const durationMinutes = item.progress ? Math.floor(item.progress.duration / 60) : 0;

            return (
              <motion.div
                key={`${item.mediaType}-${item.id}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "group flex-shrink-0 w-[300px] md:w-[340px] flex flex-col gap-4 rounded-3xl transition-all text-left border relative overflow-hidden p-3",
                  "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10"
                )}
              >
                {/* Poster Card */}
                <Link
                  to={`/watch/${item.mediaType}/${item.id}${
                    item.mediaType === 'tv' ? `?season=${item.season}&episode=${item.episode}` : ''
                  }`}
                  className="relative w-full aspect-video rounded-2xl overflow-hidden flex-shrink-0 shadow-xl cursor-pointer"
                >
                  <img
                    src={getImageUrl(
                      item.mediaType === 'tv' && episodeDetails?.still_path
                        ? episodeDetails.still_path
                        : item.posterPath,
                      'w780'
                    )}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  {/* Top Badges (TV Info) */}
                    <div className="absolute top-3 left-3 max-w-[calc(100%-24px)]">
                      <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md text-white rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wider border border-white/20 shadow-lg flex items-center gap-2 w-full">
                        <span className="whitespace-nowrap">{formatSeasonEpisode(item.season, item.episode)}</span>
                        <span className="w-2 h-2 bg-white rounded-full flex-shrink-0"></span>
                        <span className="whitespace-nowrap">E{item.episode}</span>
                        {episodeDetails?.name && (
                          <>
                            <span className="w-1.5 h-1.5 bg-white/40 rounded-full flex-shrink-0"></span>
                            <span className="text-white/80 font-medium tracking-normal truncate min-w-0">
                              {episodeDetails.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                  {/* Bottom Badges */}
                  <div className="absolute bottom-3 left-3 flex gap-2">
                    {durationMinutes > 0 && (
                      <div className="px-2.5 py-1 bg-black/80 backdrop-blur-md text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/10 shadow-lg">
                        {formatTime(durationMinutes)}
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                    {item.isCompleted ? (
                      <div className="px-2.5 py-1 bg-green-500/80 backdrop-blur-md text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/10 shadow-lg flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        Watched
                      </div>
                    ) : remainingMinutes > 0 && (
                      <div className="px-2.5 py-1 bg-accent/80 backdrop-blur-md text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/10 shadow-lg">
                        {formatTime(remainingMinutes)} left
                      </div>
                    )}
                  </div>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100">
                    <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center shadow-2xl border-2 border-white/20">
                      <Play className="w-8 h-8 text-white fill-current ml-1" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className="h-full bg-accent relative"
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </motion.div>
                  </div>
                </Link>

                {/* Info Area */}
                <div className="px-1 pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-base md:text-lg leading-tight text-white truncate">
                      {item.title}
                    </h3>
                    <div className="flex-shrink-0 p-1.5 bg-white/5 rounded-lg border border-white/10">
                      {item.mediaType === 'movie' ? (
                        <Film className="w-3.5 h-3.5 text-white/60" />
                      ) : (
                        <Tv className="w-3.5 h-3.5 text-white/60" />
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

export default ContinueWatchingSection;
