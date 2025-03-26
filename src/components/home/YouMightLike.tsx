import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../../api/services/genres';
import { mediaService } from '../../api/services/media';

interface YouMightLikeProps {
  items: (Movie | TVShow)[];
}

const YouMightLike: React.FC<YouMightLikeProps> = ({ items }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch genres
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

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
    <div className="h-full flex flex-col bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
      <div className="p-4 border-b-2 border-gray-400/50 dark:border-white/20 flex items-center justify-between">
        <h2 className="text-xl font-semibold">You Might Like</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
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

              // Query for images
              const { data: images } = useQuery({
                queryKey: ['images', item.id],
                queryFn: () => mediaService.getImages(isMovie ? 'movie' : 'tv', item.id),
              });

              // Find the best logo
              const logo = images?.logos?.find(logo => 
                logo.iso_639_1 === 'en' || !logo.iso_639_1
              );

              return (
                <Link
                  key={item.id}
                  to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
                  className="flex-shrink-0 w-[350px] group/card"
                >
                  <div className="relative border border-gray-400/50 dark:border-white/20 rounded-xl overflow-hidden hover:border-red-500/50 transition-all duration-200">
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
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default YouMightLike;