import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Play, Plus } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../../api/services/genres';
import { mediaService } from '../../api/services/media';
import WatchlistMenu from '../WatchlistMenu';
import { useStore, WatchStatus } from '../../store/useStore';

interface YouMightLikeProps {
  items: (Movie | TVShow)[];
}

const YouMightLike: React.FC<YouMightLikeProps> = ({ items }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem } = useStore();
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Fetch genres
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  // Check scroll position
  const checkScrollPosition = () => {
    if (!containerRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      // Initial check
      checkScrollPosition();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScrollPosition);
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

  // Get genre names instead of IDs
  const getGenreNames = (genreIds: number[]) => {
    return genreIds.map(id => genres.find(g => g.id === id)?.name).filter(Boolean);
  };

  return (
    <div className="h-full flex flex-col bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg overflow-hidden">
      <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <h2 className="text-xl font-semibold">You Might Like</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className={cn(
              "p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded-xl transition-colors",
              !canScrollLeft && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className={cn(
              "p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded-xl transition-colors",
              !canScrollRight && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canScrollRight}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-4">
        {/* Scrollable Container */}
        <div 
          ref={containerRef}
          className="overflow-x-auto scrollbar-thin"
        >
          <div className="flex gap-4">
            {items.map((item) => {
              const isMovie = 'title' in item;
              const title = isMovie ? item.title : item.name;
              const releaseDate = isMovie ? item.release_date : item.first_air_date;
              const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
              const watchlistItem = getWatchlistItem(item.id, isMovie ? 'movie' : 'tv');

              // Query for images
              const { data: images } = useQuery({
                queryKey: ['images', item.id],
                queryFn: () => mediaService.getImages(isMovie ? 'movie' : 'tv', item.id),
              });

              // Find the best logo
              const logo = images?.logos?.find(logo => 
                logo.iso_639_1 === 'en' || !logo.iso_639_1
              );

              const handleWatchlistAdd = (status: WatchStatus) => {
                addToWatchlist({
                  id: item.id,
                  mediaType: isMovie ? 'movie' : 'tv',
                  title,
                  posterPath: item.poster_path,
                  addedAt: Date.now(),
                  status,
                });
                setActiveMenu(null);
              };

              const handleWatchlistRemove = () => {
                removeFromWatchlist(item.id, isMovie ? 'movie' : 'tv');
                setActiveMenu(null);
              };

              return (
                <div
                  key={item.id}
                  className="flex-shrink-0 w-[350px] group/card relative"
                >
                  <Link
                    to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
                    className="relative border border-border-light dark:border-border-dark rounded-lg overflow-hidden hover:border-red-500/50 transition-all duration-200 block"
                  >
                    <div className="aspect-video relative">
                      <img
                        src={getImageUrl(item.backdrop_path, 'w780')}
                        alt={title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                      
                      <div className="absolute inset-0 p-4 flex flex-col justify-end">
                        <h3 className="text-white font-medium text-lg mb-2 line-clamp-1">{title}</h3>
                        
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex items-center">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="ml-1 text-sm text-white">{item.vote_average.toFixed(1)}</span>
                          </div>
                          {year && <span className="text-sm text-white/80">{year}</span>}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {getGenreNames(item.genre_ids).slice(0, 2).map((genreName) => (
                            <span key={genreName} className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full">
                              {genreName}
                            </span>
                          ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="absolute bottom-4 right-4 flex items-center gap-2 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity z-20" onClick={e => e.preventDefault()}>
                          <Link
                            to={`/watch/${isMovie ? 'movie' : 'tv'}/${item.id}`}
                            className="w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors"
                          >
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </Link>

                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                setActiveMenu(activeMenu === item.id ? null : item.id);
                              }}
                              className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                                watchlistItem
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-white/20 hover:bg-white/30"
                              )}
                            >
                              <Plus className="w-4 h-4 text-white" />
                            </button>

                            <WatchlistMenu
                              isOpen={activeMenu === item.id}
                              onClose={() => setActiveMenu(null)}
                              onAdd={handleWatchlistAdd}
                              onRemove={handleWatchlistRemove}
                              currentStatus={watchlistItem?.status}
                              position="top-right"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Logo Watermark */}
                      {logo && (
                        <img
                          src={getImageUrl(logo.file_path, 'w300')}
                          alt={title}
                          className="absolute bottom-3 right-3 h-5 max-w-[80px] object-contain opacity-30"
                        />
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default YouMightLike;