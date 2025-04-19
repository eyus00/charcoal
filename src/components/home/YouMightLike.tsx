import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Play, Bookmark, Film, Tv } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { useQuery, useQueries } from '@tanstack/react-query';
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

  // Add content rating query
  const contentRatingQueries = useQueries({
    queries: items.map(item => ({
      queryKey: ['contentRating', item.id],
      queryFn: async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/${'title' in item ? 'movie' : 'tv'}/${item.id}?api_key=50404130561567acf3e0725aeb09ec5d&append_to_response=release_dates,content_ratings`
        );
        const data = await response.json();
        
        if ('title' in item) {
          const usRating = data.release_dates?.results?.find(
            (r: any) => r.iso_3166_1 === 'US'
          )?.release_dates?.[0]?.certification;
          return usRating || 'NR';
        }
        
        const usRating = data.content_ratings?.results?.find(
          (r: any) => r.iso_3166_1 === 'US'
        )?.rating;
        return usRating || 'NR';
      }
    }))
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
      <div className="p-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <h2 className="text-xl font-semibold">You Might Like</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className={cn(
              "w-8 h-8 flex items-center justify-center hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors border border-border-light dark:border-border-dark",
              !canScrollLeft && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className={cn(
              "w-8 h-8 flex items-center justify-center hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors border border-border-light dark:border-border-dark",
              !canScrollRight && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canScrollRight}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3">
        <div 
          ref={containerRef}
          className="overflow-x-auto scrollbar-thin"
          style={{ scrollPaddingRight: '1rem' }}
        >
          <div className="flex gap-3">
            {items.map((item, index) => {
              const isMovie = 'title' in item;
              const title = isMovie ? item.title : item.name;
              const releaseDate = isMovie ? item.release_date : item.first_air_date;
              const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
              const watchlistItem = getWatchlistItem(item.id, isMovie ? 'movie' : 'tv');
              const contentRating = contentRatingQueries[index]?.data;

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
                  className="flex-shrink-0 w-[75vw] sm:w-[400px] lg:w-[450px] group/card relative"
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
                      
                      <div className="absolute inset-0 p-3 flex flex-col justify-end">
                        <div className="flex items-center gap-2 mb-2">
                          {isMovie ? (
                            <Film className="w-4 h-4 text-white" />
                          ) : (
                            <Tv className="w-4 h-4 text-white" />
                          )}
                          <span className="text-white text-sm">
                            {isMovie ? 'Movie' : 'TV Show'}
                          </span>
                        </div>

                        <h3 className="text-white font-medium text-lg mb-2 line-clamp-1">{title}</h3>

                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex items-center">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-white text-sm ml-1">{item.vote_average.toFixed(1)}</span>
                          </div>
                          {year && <span className="text-white text-sm">{year}</span>}
                          {contentRating && (
                            <span className="text-white text-xs px-1.5 py-0.5 border border-white/20 rounded">
                              {contentRating}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {getGenreNames(item.genre_ids).slice(0, 2).map((genreName) => (
                            <span key={genreName} className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white text-sm rounded-full">
                              {genreName}
                            </span>
                          ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="absolute bottom-3 right-3 flex flex-col gap-2" onClick={e => e.preventDefault()}>
                          <Link
                            to={`/watch/${isMovie ? 'movie' : 'tv'}/${item.id}`}
                            className="w-9 h-9 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center transition-colors shadow-lg group/watch border border-white/20"
                          >
                            <Play className="w-5 h-5 text-white group-hover/watch:scale-110 transition-transform" />
                          </Link>

                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                setActiveMenu(activeMenu === item.id ? null : item.id);
                              }}
                              className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors shadow-md border border-white/20",
                                watchlistItem
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-white/20 hover:bg-white/30"
                              )}
                            >
                              <Bookmark className={cn(
                                "w-5 h-5 transition-transform",
                                watchlistItem ? "text-white fill-white" : "text-white"
                              )} />
                            </button>

                            <WatchlistMenu
                              isOpen={activeMenu === item.id}
                              onClose={() => setActiveMenu(null)}
                              onAdd={handleWatchlistAdd}
                              onRemove={handleWatchlistRemove}
                              currentStatus={watchlistItem?.status}
                              position="top-left"
                            />
                          </div>
                        </div>
                      </div>
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