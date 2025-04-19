import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Bookmark, ChevronLeft, ChevronRight, Star, Film, Tv } from 'lucide-react';
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
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const watchlistButtonRef = useRef<HTMLDivElement>(null);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem } = useStore();

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const { data: contentRating } = useQuery({
    queryKey: ['contentRating', items[currentIndex]?.id],
    queryFn: async () => {
      const response = await fetch(
        `https://api.themoviedb.org/3/${'title' in items[currentIndex] ? 'movie' : 'tv'}/${items[currentIndex].id}?api_key=50404130561567acf3e0725aeb09ec5d&append_to_response=release_dates,content_ratings`
      );
      const data = await response.json();

      if ('title' in items[currentIndex]) {
        const usRating = data.release_dates?.results?.find(
          (r: any) => r.iso_3166_1 === 'US'
        )?.release_dates?.[0]?.certification;
        return usRating || 'NR';
      }

      const usRating = data.content_ratings?.results?.find(
        (r: any) => r.iso_3166_1 === 'US'
      )?.rating;
      return usRating || 'NR';
    },
    enabled: !!items[currentIndex]
  });

  const { data: images } = useQuery({
    queryKey: ['images', items[currentIndex]?.id],
    queryFn: () => mediaService.getImages('movie' in items[currentIndex] ? 'movie' : 'tv', items[currentIndex].id),
    enabled: !!items[currentIndex]
  });

  useEffect(() => {
    const interval = setInterval(() => {
      handleNavigation();
    }, 6000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  const handleNavigation = () => {
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

  const handleContentClick = () => {
    navigate(`/${isMovie ? 'movie' : 'tv'}/${currentItem.id}`);
  };

  const getGenreNames = (genreIds: number[]) => {
    return genreIds.map(id => genres.find(g => g.id === id)?.name).filter(Boolean);
  };

  const logo = images?.logos?.find(logo =>
    logo.iso_639_1 === 'en' || !logo.iso_639_1
  );

  return (
    <div className="relative h-[300px] md:h-[500px] group">
      <div className="absolute inset-0">
        <img
          src={getImageUrl(currentItem.backdrop_path)}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </div>

      {logo && (
        <div className="absolute bottom-4 right-4 z-10">
          <img
            src={getImageUrl(logo.file_path, 'w300')}
            alt={title}
            className="h-6 max-w-[100px] object-contain opacity-30"
          />
        </div>
      )}

      <div
        className="absolute inset-0 flex flex-col justify-end p-4 md:p-8 cursor-pointer"
        onClick={handleContentClick}
      >
        <div className="mb-6 md:mb-2">
          <div className="flex items-center gap-2 mb-3">
            {isMovie ? (
              <Film className="w-4 h-4 text-white" />
            ) : (
              <Tv className="w-4 h-4 text-white" />
            )}
            <span className="text-white text-sm">{isMovie ? 'Movie' : 'TV Show'}</span>
          </div>

          <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">{title}</h2>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center">
              <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-yellow-400" />
              <span className="text-white text-sm md:text-lg ml-1">{currentItem.vote_average.toFixed(1)}</span>
            </div>
            {year && <span className="text-white text-sm md:text-lg">{year}</span>}
            {contentRating && (
              <span className="text-white text-xs md:text-sm px-1.5 py-0.5 border border-white/20 rounded">
                {contentRating}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {getGenreNames(currentItem.genre_ids).slice(0, 3).map((genreName) => (
              <span key={genreName} className="px-2 py-0.5 md:px-3 md:py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs md:text-sm text-white">
                {genreName}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
              <Link
                to={`/watch/${isMovie ? 'movie' : 'tv'}/${currentItem.id}`}
                className="w-10 h-10 md:w-12 md:h-12 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center transition-colors shadow-lg group/watch border border-white/20"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 text-white group-hover/watch:scale-110 transition-transform" />
              </Link>

              <div className="relative">
                <button
                  onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                  className={cn(
                    "w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center transition-colors shadow-md border border-white/20",
                    watchlistItem
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-white/10 hover:bg-white/20 backdrop-blur-sm"
                  )}
                >
                  <Bookmark className={cn(
                    "w-5 h-5 md:w-6 md:h-6 transition-transform",
                    watchlistItem ? "text-white fill-white" : "text-white"
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
            </div>

            {/* 👇 Updated Navigation Buttons (Smaller + Aligned) */}
            <div className="flex items-center gap-2 h-10 md:h-12">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(prev => (prev === 0 ? items.length - 1 : prev - 1));
                }}
                className="w-8 md:w-10 h-8 md:h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm text-white border border-white/20"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(prev => (prev === items.length - 1 ? 0 : prev + 1));
                }}
                className="w-8 md:w-10 h-8 md:h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm text-white border border-white/20"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1 z-20">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(index);
              }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                index === currentIndex ? "bg-red-600 w-4" : "bg-white/50"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
