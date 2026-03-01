import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Bookmark, ChevronLeft, ChevronRight, Star, Film, Tv, Info, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import WatchlistMenu from '../shared/WatchlistMenu';
import { useStore, WatchStatus } from '../../store/useStore';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../../api/services/genres';
import { mediaService } from '../../api/services/media';
import { useMedia } from '../../api/hooks/useMedia';

interface HeroSectionProps {
  items: (Movie | TVShow)[];
}

const HeroSection: React.FC<HeroSectionProps> = ({ items }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem } = useStore();

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const currentItem = items[currentIndex];
  const isMovie = currentItem && 'title' in currentItem;
  const mediaType = isMovie ? 'movie' : 'tv';

  const { data: contentRating } = useMedia.useContentRating(
    mediaType,
    currentItem?.id
  );

  const { data: images } = useQuery({
    queryKey: ['images', currentItem?.id],
    queryFn: () => mediaService.getImages(mediaType, currentItem.id),
    enabled: !!currentItem
  });

  useEffect(() => {
    const interval = setInterval(() => {
      paginate(1);
    }, 8000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentIndex((prev) => {
      if (newDirection === 1) {
        return prev === items.length - 1 ? 0 : prev + 1;
      }
      return prev === 0 ? items.length - 1 : prev - 1;
    });
  };

  if (!items.length) return null;

  const title = isMovie ? currentItem.title : currentItem.name;
  const releaseDate = isMovie ? currentItem.release_date : currentItem.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const watchlistItem = getWatchlistItem(currentItem.id, mediaType);

  const handleWatchlistAdd = (status: WatchStatus) => {
    addToWatchlist({
      id: currentItem.id,
      mediaType,
      title,
      posterPath: currentItem.poster_path,
      addedAt: Date.now(),
      status,
      releaseDate,
      ratingScore: currentItem.vote_average,
    });
    setIsWatchlistOpen(false);
  };

  const handleWatchlistRemove = () => {
    removeFromWatchlist(currentItem.id, mediaType);
    setIsWatchlistOpen(false);
  };

  const getGenreNames = (genreIds: number[]) => {
    return genreIds.map(id => genres.find(g => g.id === id)?.name).filter(Boolean);
  };

  const logo = images?.logos?.find(logo =>
    logo.iso_639_1 === 'en' || !logo.iso_639_1
  );

  const variants = {
    enter: (direction: number) => ({
      opacity: 0,
      scale: 1.1,
      filter: 'blur(10px)',
    }),
    center: {
      zIndex: 1,
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
    },
    exit: (direction: number) => ({
      zIndex: 0,
      opacity: 0,
      scale: 0.95,
      filter: 'blur(10px)',
    })
  };

  return (
    <div className="relative w-full h-[400px] md:h-[500px] lg:h-[600px] rounded-[2rem] overflow-hidden group/hero shadow-2xl bg-black">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={currentIndex}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            opacity: { duration: 0.6 },
            scale: { duration: 0.8, ease: "easeOut" },
            filter: { duration: 0.6 }
          }}
          className="absolute inset-0 cursor-pointer"
          onClick={() => navigate(`/${mediaType}/${currentItem.id}`)}
        >
          {/* Background Image */}
          <div className="absolute inset-0">
            <img
              src={getImageUrl(currentItem.backdrop_path, 'original')}
              alt={title}
              className="w-full h-full object-cover"
            />
            {/* Gradients like DetailsBanner */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-0 backdrop-blur-[1px]" />
          </div>

          {/* Content Area */}
          <div className="relative z-10 h-full flex flex-col justify-end p-6 md:p-10 lg:p-14">
            <div className="max-w-3xl">
              {/* Type tag redesigned */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-3 mb-5"
              >
                <div className="relative inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-accent/90 to-accent/70 backdrop-blur-lg text-white rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider shadow-lg shadow-accent/30 border border-accent/40">
                  {isMovie ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                  {isMovie ? 'Movie' : 'TV Series'}
                  <div className="absolute -inset-1 bg-accent/20 rounded-full blur-md -z-10" />
                </div>
                {contentRating && (
                  <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md text-white/80 text-[10px] md:text-xs font-bold rounded-full border border-white/10 uppercase">
                    {contentRating}
                  </span>
                )}
              </motion.div>

              {/* Logo or Title */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-6"
              >
                {logo ? (
                  <img
                    src={getImageUrl(logo.file_path, 'w500')}
                    alt={title}
                    className="h-16 md:h-24 lg:h-32 object-contain drop-shadow-[0_0_30px_rgba(0,0,0,0.5)]"
                  />
                ) : (
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tight leading-none drop-shadow-2xl">
                    {title}
                  </h1>
                )}
              </motion.div>

              {/* Stats & Genres */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap items-center gap-4 md:gap-6 mb-8"
              >
                <div className="flex items-center gap-2 group/stat">
                  <div className="p-1.5 bg-yellow-400/10 rounded-lg border border-yellow-400/20 group-hover/stat:bg-yellow-400/20 transition-colors">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  </div>
                  <span className="text-white font-bold">{currentItem.vote_average.toFixed(1)}</span>
                </div>

                {year && (
                  <div className="flex items-center gap-2 group/stat">
                    <div className="p-1.5 bg-green-400/10 rounded-lg border border-green-400/20 group-hover/stat:bg-green-400/20 transition-colors">
                      <Calendar className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-white font-bold">{year}</span>
                  </div>
                )}

                <div className="h-4 w-[1px] bg-white/20 hidden sm:block" />

                <div className="flex flex-wrap gap-2">
                  {getGenreNames(currentItem.genre_ids).slice(0, 3).map((genreName) => (
                    <span key={genreName} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium rounded-full border border-white/10 transition-colors cursor-default backdrop-blur-md">
                      {genreName}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* Description (Overview) */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-white/60 text-sm md:text-base leading-relaxed mb-8 max-w-2xl line-clamp-2 md:line-clamp-3"
              >
                {currentItem.overview}
              </motion.p>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-4 flex-wrap"
              >
                <Link
                  to={`/watch/${mediaType}/${currentItem.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-8 py-4 bg-accent hover:bg-accent/90 text-white rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-accent/20 active:scale-95 group/play border border-white/20"
                >
                  <Play className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-base uppercase tracking-wider">PLAY</span>
                </Link>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsWatchlistOpen(!isWatchlistOpen);
                    }}
                    className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-95 border hover:scale-105",
                      watchlistItem
                        ? "bg-white/10 border-accent/50 text-accent"
                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                    )}
                  >
                    <Bookmark className={cn(
                      "w-6 h-6 transition-transform",
                      watchlistItem ? "fill-current" : ""
                    )} />
                  </button>

                  <WatchlistMenu
                    isOpen={isWatchlistOpen}
                    onClose={() => setIsWatchlistOpen(false)}
                    onAdd={handleWatchlistAdd}
                    onRemove={handleWatchlistRemove}
                    currentStatus={watchlistItem?.status}
                    position="top-right"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows - Glassy style */}
      <button
        onClick={() => paginate(-1)}
        className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-black/20 hover:bg-accent/40 backdrop-blur-md border border-white/10 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90 opacity-0 group-hero:opacity-100 shadow-2xl"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        onClick={() => paginate(1)}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-black/20 hover:bg-accent/40 backdrop-blur-md border border-white/10 text-white rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90 opacity-0 group-hero:opacity-100 shadow-2xl"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Indicators - Bottom Center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2.5 px-4 py-2 bg-black/20 backdrop-blur-md rounded-full border border-white/5">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setDirection(index > currentIndex ? 1 : -1);
              setCurrentIndex(index);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500",
              index === currentIndex ? "bg-accent w-8" : "bg-white/20 w-1.5 hover:bg-white/40"
            )}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroSection;
