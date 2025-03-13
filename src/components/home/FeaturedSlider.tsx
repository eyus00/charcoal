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
  const [isHovering, setIsHovering] = useState(false);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isHovering) {
        onNextSlide();
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [onNextSlide, isHovering]);

  useEffect(() => {
    setShowControls(true);
    const timer = setTimeout(() => {
      if (!isHovering) {
        setShowControls(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentSlide, isHovering]);

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
      className="relative border border-border-light dark:border-border-dark shadow-lg group select-none h-[calc(100vh-13rem)] md:h-[500px] bg-light-bg dark:bg-dark-bg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={startDrag}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onMouseMove={onDrag}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseEnter={() => {
        setIsHovering(true);
        setShowControls(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        setShowControls(false);
      }}
    >
      <div className="relative h-full">
        {items.map((item, index) => {
          const isMovie = 'title' in item;
          const title = isMovie ? item.title : item.name;
          const releaseDate = isMovie ? item.release_date : item.first_air_date;
          const year = new Date(releaseDate).getFullYear();

          return (
            <Link
              key={item.id}
              to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
              className={cn(
                "absolute inset-0 transition-all duration-500 ease-in-out transform",
                "hover:scale-[1.02] hover:z-20",
                index === currentSlide 
                  ? "opacity-100 translate-x-0 z-10" 
                  : index < currentSlide
                    ? "opacity-0 -translate-x-full z-0"
                    : "opacity-0 translate-x-full z-0"
              )}
              onClick={(e) => {
                if (isDragging) {
                  e.preventDefault();
                }
              }}
            >
              <div className="relative h-full border-4 border-transparent hover:border-red-600 dark:hover:border-red-500 transition-colors">
                <img
                  src={getImageUrl(item.backdrop_path)}
                  alt={title}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div 
                  className={cn(
                    "absolute bottom-0 left-0 right-0 p-4 md:p-8",
                    "transform transition-all duration-500 ease-out",
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
                    <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 md:mb-3">{title}</h2>
                    
                    <p className="text-gray-200 text-base md:text-lg mb-4 line-clamp-2 hidden lg:block">
                      {item.overview}
                    </p>
                    
                    <div className="flex items-center gap-4 mb-2 md:mb-4">
                      <div className="flex items-center">
                        <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-yellow-400" />
                        <span className="text-white ml-1 text-sm md:text-lg font-medium">{item.vote_average.toFixed(1)}</span>
                      </div>
                      <span className="text-white text-sm md:text-lg">{year}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {item.genre_ids.slice(0, 3).map((genreId) => (
                        <span key={genreId} className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white">
                          {getGenreName(genreId)}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 mt-6">
                      {items.map((_, index) => (
                        <button
                          key={index}
                          onClick={(e) => { e.preventDefault(); onSlideSelect(index); }}
                          className={cn(
                            "w-2 h-2 rounded-full transition-all duration-500",
                            currentSlide === index 
                              ? "bg-white w-6" 
                              : "bg-white/50 hover:bg-white/75"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default FeaturedSlider;