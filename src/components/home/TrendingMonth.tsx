import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';

interface TrendingMonthProps {
  items: (Movie | TVShow)[];
  genres: Genre[];
}

const TrendingMonth: React.FC<TrendingMonthProps> = ({ items, genres }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const getGenreName = (genreId: number) =>
    genres.find((g) => g.id === genreId)?.name || '';

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;

    const scrollAmount = containerRef.current.clientWidth * 0.8;
    const newScrollLeft = direction === 'left'
      ? containerRef.current.scrollLeft - scrollAmount
      : containerRef.current.scrollLeft + scrollAmount;

    containerRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-start mb-4 px-4">
        <h3 className="text-xl font-semibold">Trending This Month</h3>
      </div>

      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-1/2 transition-all duration-200 hover:bg-black/80 hover:scale-110 shadow-lg"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-1/2 transition-all duration-200 hover:bg-black/80 hover:scale-110 shadow-lg"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div ref={containerRef} className="relative overflow-x-auto scrollbar-thin px-4">
        <div className="flex gap-3 py-2">
          {items.map((media) => {
            const isMovie = 'title' in media;
            const title = isMovie ? media.title : media.name;
            const releaseDate = isMovie ? media.release_date : media.first_air_date;
            const year = new Date(releaseDate).getFullYear();

            return (
              <div key={media.id} className="w-[350px] flex-shrink-0 shadow-lg border border-border-light dark:border-border-dark hover:scale-105 transition-transform">
                <Link to={`/${isMovie ? 'movie' : 'tv'}/${media.id}`} className="block group">
                  <div className="relative border-4 border-transparent group-hover:border-red-600 dark:group-hover:border-red-500 transition-all duration-200 transform overflow-visible">
                    <div className="aspect-video relative">
                      <img
                        src={getImageUrl(media.backdrop_path, 'w780')}
                        alt={title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent shadow-[inset_0_-2rem_2rem_rgba(0,0,0,0.5)]" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      {isMovie ? <Film className="w-4 h-4 text-white mb-1" /> : <Tv className="w-4 h-4 text-white mb-1" />}
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
                          <span
                            key={genreId}
                            className="px-2 py-0.5 bg-white/10 rounded-full text-xs text-white"
                          >
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

export default TrendingMonth;