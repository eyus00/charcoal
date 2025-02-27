import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';
import { cn } from '../../lib/utils';

interface FeaturedSliderProps {
  items: (Movie | TVShow)[];
  currentSlide: number;
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onSlideSelect: (index: number) => void;
  genres: Genre[];
}

const ArrowLeft = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const FeaturedSlider: React.FC<FeaturedSliderProps> = ({
  items,
  currentSlide,
  onPrevSlide,
  onNextSlide,
  onSlideSelect,
  genres,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      onNextSlide();
    }, 6000);
    return () => clearInterval(timer);
  }, [onNextSlide]);

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      onNextSlide();
    } else if (isRightSwipe) {
      onPrevSlide();
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  // Mouse drag handlers for desktop
  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (containerRef.current?.offsetLeft || 0));
    setScrollLeft(containerRef.current?.scrollLeft || 0);
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  const onDrag = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    
    if (!containerRef.current) return;
    
    const x = e.pageX - containerRef.current.offsetLeft;
    const dragDistance = (x - startX);
    
    if (Math.abs(dragDistance) > 100) {
      if (dragDistance > 0) {
        onPrevSlide();
      } else {
        onNextSlide();
      }
      stopDrag();
    }
  };

  const getGenreName = (genreId: number) => {
    return genres.find(g => g.id === genreId)?.name || '';
  };

  return (
    <div 
      ref={containerRef}
      className="relative border border-border-light dark:border-border-dark group select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={startDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onMouseMove={onDrag}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {items.map((item, index) => {
          const isMovie = 'title' in item;
          const title = isMovie ? item.title : item.name;
          const releaseDate = isMovie ? item.release_date : item.first_air_date;

          return (
            <Link
              key={item.id}
              to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
              className={cn(
                "absolute inset-0 transition-all duration-1000 ease-in-out",
                index === currentSlide 
                  ? "opacity-100 scale-100 pointer-events-auto" 
                  : "opacity-0 scale-105 pointer-events-none"
              )}
              onClick={(e) => {
                if (isDragging) {
                  e.preventDefault();
                }
              }}
            >
              <div className="relative h-full">
                <img
                  src={getImageUrl(item.backdrop_path)}
                  alt={title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div 
                  className={cn(
                    "absolute bottom-0 left-0 right-0 p-4 md:p-6 transition-all duration-1000 ease-in-out",
                    index === currentSlide 
                      ? "translate-y-0 opacity-100" 
                      : "translate-y-4 opacity-0"
                  )}
                >
                  <div className="max-w-2xl">
                    {isMovie ? (
                      <Film className="w-5 h-5 text-white mb-2" />
                    ) : (
                      <Tv className="w-5 h-5 text-white mb-2" />
                    )}
                    <h2 className="text-xl md:text-3xl font-bold text-white mb-2">{title}</h2>
                    
                    {/* Hide description on mobile */}
                    <p className="text-gray-200 text-sm md:text-base mb-3 line-clamp-2 md:line-clamp-3 hidden md:block">
                      {item.overview}
                    </p>
                    
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center">
                        <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-yellow-400" />
                        <span className="text-white ml-1 text-sm md:text-lg">{item.vote_average.toFixed(1)}</span>
                      </div>
                      <span className="text-white text-sm md:text-lg">{new Date(releaseDate).getFullYear()}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {item.genre_ids.slice(0, 2).map((genreId) => (
                        <span key={genreId} className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white">
                          {getGenreName(genreId)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Navigation - Hidden on mobile */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
        <button 
          onClick={(e) => { e.preventDefault(); onPrevSlide(); }} 
          className="opacity-0 group-hover:opacity-100 transition duration-300 p-1 hidden md:block"
        >
          <ArrowLeft />
        </button>
        <div className="flex gap-1">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={(e) => { e.preventDefault(); onSlideSelect(index); }}
              className={cn(
                "h-1 transition-all duration-300",
                currentSlide === index 
                  ? "bg-white w-4" 
                  : "bg-white/50 w-1 hover:bg-white/75"
              )}
            />
          ))}
        </div>
        <button 
          onClick={(e) => { e.preventDefault(); onNextSlide(); }} 
          className="opacity-0 group-hover:opacity-100 transition duration-300 p-1 hidden md:block"
        >
          <ArrowRight />
        </button>
      </div>
    </div>
  );
};

export default FeaturedSlider