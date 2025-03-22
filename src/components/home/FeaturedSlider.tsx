import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';
import { cn } from '../../lib/utils';

interface FeaturedSliderProps {
  items: (Movie | TVShow)[];
  genres: Genre[];
}

const FeaturedSlider: React.FC<FeaturedSliderProps> = ({
  items,
  genres,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const autoPlayRef = useRef<number>();

  const getGenreName = (genreId: number) => {
    return genres.find(g => g.id === genreId)?.name || '';
  };

  useEffect(() => {
    const startAutoPlay = () => {
      autoPlayRef.current = window.setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % items.length);
      }, 6000);
    };

    startAutoPlay();

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [items.length]);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    setDragStartTime(Date.now());
    
    if ('touches' in e) {
      setStartX(e.touches[0].clientX);
    } else {
      setStartX(e.clientX);
    }

    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
    }
  };

  const handleDragEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    let endX: number;
    if ('changedTouches' in e) {
      endX = e.changedTouches[0].clientX;
    } else {
      endX = e.clientX;
    }

    const dragDistance = endX - startX;
    const dragTime = Date.now() - dragStartTime;

    if (Math.abs(dragDistance) > 100 || (Math.abs(dragDistance) > 50 && dragTime < 300)) {
      if (dragDistance > 0) {
        setCurrentSlide((prev) => (prev - 1 + items.length) % items.length);
      } else {
        setCurrentSlide((prev) => (prev + 1) % items.length);
      }
    }
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
  };

  return (
    <div className="relative bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark">
      <div 
        ref={containerRef} 
        className="aspect-[16/9] relative overflow-hidden"
        onMouseDown={handleDragStart}
        onMouseUp={handleDragEnd}
        onMouseMove={handleDragMove}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleDragStart}
        onTouchEnd={handleDragEnd}
        onTouchMove={handleDragMove}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {items.map((item, index) => {
          const isMovie = 'title' in item;
          const title = isMovie ? item.title : item.name;
          const releaseDate = isMovie ? item.release_date : item.first_air_date;
          const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

          return (
            <Link
              key={item.id}
              to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
              className={cn(
                "absolute inset-0 transition-all duration-500 ease-in-out transform",
                index === currentSlide 
                  ? "translate-x-0 opacity-100 pointer-events-auto" 
                  : index < currentSlide
                  ? "-translate-x-full opacity-0 pointer-events-none"
                  : "translate-x-full opacity-0 pointer-events-none"
              )}
              onClick={(e) => {
                if (isDragging) {
                  e.preventDefault();
                }
              }}
            >
              <div className="relative h-full border-4 border-transparent hover:border-red-600 dark:hover:border-red-500 transition-all duration-200 transform overflow-hidden box-border">
                <img
                  src={getImageUrl(item.backdrop_path)}
                  alt={title}
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent shadow-[inset_0_-2rem_2rem_rgba(0,0,0,0.5)] pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
                  {isMovie ? <Film className="w-5 h-5 text-white mb-2" /> : <Tv className="w-5 h-5 text-white mb-2" />}
                  <h2 className="text-xl md:text-3xl font-bold text-white mb-2 line-clamp-2">{title}</h2>

                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 fill-yellow-400" />
                      <span className="text-white ml-1 text-sm md:text-lg">{item.vote_average.toFixed(1)}</span>
                    </div>
                    {year && <span className="text-white text-sm md:text-lg">{year}</span>}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {item.genre_ids.slice(0, 2).map((genreId) => (
                      <span key={genreId} className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white">
                        {getGenreName(genreId)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={cn("w-1.5 h-1.5 rounded-full", currentSlide === index ? "bg-red-600" : "bg-white/50")}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default FeaturedSlider;