import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';

interface TrendingWeekProps {
  items: (Movie | TVShow)[];
  genres: Genre[];
}

const TrendingWeek: React.FC<TrendingWeekProps> = ({ items, genres }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const getGenreName = (genreId: number) => {
    return genres.find(g => g.id === genreId)?.name || '';
  };

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

  return (
    <div ref={containerRef}>
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Trending This Week</h3>
      </div>

      {/* Carousel */}
      <div
        className="relative overflow-x-auto scrollbar-thin"
        onMouseDown={startDrag}
        onMouseUp={endDrag}
        onMouseMove={dragMove}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
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
                  className="block group"
                >
                  <div className="relative border border-border-light dark:border-border-dark overflow-hidden transition-all hover:border-gray-400 dark:hover:border-gray-600">
                    <div className="aspect-video">
                      <img
                        src={getImageUrl(media.backdrop_path, 'w780')}
                        alt={title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
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
                      <div className="flex flex-wrap gap-2 mb-2">
                        {media.genre_ids.slice(0, 2).map((genreId) => (
                          <span key={genreId} className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded-full text-xs text-white">
                            {getGenreName(genreId)}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-gray-300 text-sm">
                        <div className="flex items-center">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-white text-sm ml-1">
                            {media.vote_average.toFixed(1)}
                          </span>
                        </div>
                        <span>{year}</span>
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