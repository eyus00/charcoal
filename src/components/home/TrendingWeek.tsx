import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';
import { cn } from '../../lib/utils';

interface TrendingWeekProps {
  items: (Movie | TVShow)[];
  genres: Genre[];
}

const TrendingWeek: React.FC<TrendingWeekProps> = ({ items, genres }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const getGenreName = (genreId: number) => {
    return genres.find(g => g.id === genreId)?.name || '';
  };

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
      container.addEventListener('scroll', checkScroll);
      // Initial check
      checkScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
    };
  }, [items]);

  // Drag-to-scroll handlers
  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setScrollLeft(containerRef.current!.scrollLeft);
  };

  const endDrag = () => {
    setIsDragging(false);
  };

  const dragMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const moveX = e.clientX - startX;
    containerRef.current!.scrollLeft = scrollLeft - moveX;
  };

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

  return (
    <div className="relative">
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Trending This Week</h3>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className={cn(
          "absolute left-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-4 transition-all duration-200",
          "hover:bg-black/80 hover:scale-110 hover:shadow-lg",
          showLeftArrow ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => scroll('right')}
        className={cn(
          "absolute right-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-4 transition-all duration-200",
          "hover:bg-black/80 hover:scale-110 hover:shadow-lg",
          showRightArrow ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Carousel */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto scrollbar-thin"
        onMouseDown={startDrag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onMouseMove={dragMove}
      >
        <div className="flex gap-6">
          {items.map((media) => {
            const isMovie = 'title' in media;
            const title = isMovie ? media.title : media.name;
            const releaseDate = isMovie ? media.release_date : media.first_air_date;
            const year = new Date(releaseDate).getFullYear();

            return (
              <div key={media.id} className="w-[300px] flex-shrink-0">
                <Link
                  to={`/${isMovie ? 'movie' : 'tv'}/${media.id}`}
                  className="block"
                >
                  <div className="relative border-2 border-transparent hover:border-red-600 dark:hover:border-red-500 transition-colors overflow-hidden">
                    <div className="aspect-video">
                      <img
                        src={getImageUrl(media.backdrop_path, 'w780')}
                        alt={title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      {isMovie ? (
                        <Film className="w-4 h-4 text-white mb-1" />
                      ) : (
                        <Tv className="w-4 h-4 text-white mb-1" />
                      )}
                      <h4 className="text-white font-medium text-lg mb-2">{title}</h4>
                      
                      <div className="flex items-center gap-2 text-gray-300 text-sm mb-2">
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-white text-sm ml-1">
                            {media.vote_average.toFixed(1)}
                          </span>
                        </div>
                        <span>{year}</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {media.genre_ids.slice(0, 2).map((genreId) => (
                          <span key={genreId} className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded-full text-xs text-white">
                            {getGenreName(genreId)}
                          </span>
                        ))}
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
  );
};

export default TrendingWeek;