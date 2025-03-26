import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import WatchlistMenu from '../WatchlistMenu';
import { useStore, WatchStatus } from '../../store/useStore';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../../api/services/genres';
import { mediaService } from '../../api/services/media';

interface HeroSectionProps {
  items: (Movie | TVShow)[];
}

const HeroSection: React.FC<HeroSectionProps> = ({ items }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem } = useStore();

  // Fetch genres
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  // Fetch images for current item
  const { data: images } = useQuery({
    queryKey: ['images', items[currentIndex]?.id],
    queryFn: () => mediaService.getImages('movie' in items[currentIndex] ? 'movie' : 'tv', items[currentIndex].id),
    enabled: !!items[currentIndex]
  });

  useEffect(() => {
    const interval = setInterval(() => {
      handleNext();
    }, 6000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  const handlePrev = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
    setTimeout(() => setIsAnimating(false), 500);
  };

  const handleNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
    setTimeout(() => setIsAnimating(false), 500);
  };

  if (!items.length) return null;

  const currentItem = items[currentIndex];
  const isMovie = 'title' in currentItem;
  const title = isMovie ? currentItem.title : currentItem.name;
  const releaseDate = isMovie ? currentItem.release_date : currentItem.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const watchlistItem = getWatchlistItem(currentItem.id, isMovie ? 'movie' : 'tv');

  const handleWatchlistAdd = (status: WatchStatus) => {
    addToWatchlist({
      id: currentItem.id,
      mediaType: isMovie ? 'movie' : 'tv',
      title,
      posterPath: currentItem.poster_path,
      addedAt: Date.now(),
      status,
    });
    setIsWatchlistOpen(false);
  };

  const handleWatchlistRemove = () => {
    removeFromWatchlist(currentItem.id, isMovie ? 'movie' : 'tv');
    setIsWatchlistOpen(false);
  };

  // Get genre names instead of IDs
  const getGenreNames = (genreIds: number[]) => {
    return genreIds.map(id => genres.find(g => g.id === id)?.name).filter(Boolean);
  };

  // Find the best logo
  const logo = images?.logos?.find(logo => 
    logo.iso_639_1 === 'en' || !logo.iso_639_1
  );

  return (
    <div className="relative h-[300px] md:h-[500px] group">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={getImageUrl(currentItem.backdrop_path)}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
      </div>

      {/* Logo Watermark */}
      {logo && (
        <div className="absolute bottom-4 right-4 z-10">
          <img
            src={getImageUrl(logo.file_path, 'w300')}
            alt={title}
            className="h-6 max-w-[100px] object-contain opacity-30"
          />
        </div>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 md:p-8">
        <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 md:mb-4">{title}</h2>

        <div className="flex items-center gap-4 mb-2 md:mb-3">
          <div className="flex items-center">
            <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-yellow-400" />
            <span className="text-white ml-1 text-sm md:text-lg">{currentItem.vote_average.toFixed(1)}</span>
          </div>
          {year && <span className="text-white text-sm md:text-lg">{year}</span>}
        </div>

        <div className="flex flex-wrap gap-2 mb-4 md:mb-6">
          {getGenreNames(currentItem.genre_ids).slice(0, 3).map((genreName) => (
            <span key={genreName} className="px-2 py-0.5 md:px-3 md:py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white">
              {genreName}
            </span>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            to={`/watch/${isMovie ? 'movie' : 'tv'}/${currentItem.id}`}
            className="w-10 h-10 md:w-12 md:h-12 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors"
          >
            <Play className="w-5 h-5 md:w-6 md:h-6 text-white fill-white ml-1" />
          </Link>

          <button
            onClick={() => setIsWatchlistOpen(true)}
            className="w-10 h-10 md:w-12 md:h-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors relative"
          >
            <Plus className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </button>

          <WatchlistMenu
            isOpen={isWatchlistOpen}
            onClose={() => setIsWatchlistOpen(false)}
            onAdd={handleWatchlistAdd}
            onRemove={handleWatchlistRemove}
            currentStatus={watchlistItem?.status}
          />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="absolute bottom-8 right-8 flex items-center gap-2">
        <button
          onClick={handlePrev}
          className="p-2 md:p-3 bg-black/60 rounded-full text-white transform transition-all duration-200 hover:bg-black/80"
        >
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        <button
          onClick={handleNext}
          className="p-2 md:p-3 bg-black/60 rounded-full text-white transform transition-all duration-200 hover:bg-black/80"
        >
          <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      {/* Indicators */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              index === currentIndex ? "bg-red-600 w-4" : "bg-white/50"
            )}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroSection;