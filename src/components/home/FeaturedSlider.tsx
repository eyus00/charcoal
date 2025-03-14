import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const getGenreName = (genreId: number) => {
    return genres.find(g => g.id === genreId)?.name || '';
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [items.length]);

  const handlePrevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % items.length);
  };

  return (
    <div className="relative bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark">
      <button
        onClick={(e) => { e.preventDefault(); handlePrevSlide(); }}
        className="absolute left-4 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-1/2 transition-all duration-200 hover:bg-black/80 hover:scale-110 shadow-lg"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={(e) => { e.preventDefault(); handleNextSlide(); }}
        className="absolute right-4 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-1/2 transition-all duration-200 hover:bg-black/80 hover:scale-110 shadow-lg"
        aria-label="Next slide"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div ref={containerRef} className="aspect-[16/9] relative overflow-hidden">
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

                  <div className="flex flex-wrap gap-2">
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
    </div>
  );
};

export default FeaturedSlider;