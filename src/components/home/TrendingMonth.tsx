import React from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';

interface TrendingMonthProps {
  items: (Movie | TVShow)[];
  genres: Genre[];
}

const TrendingMonth: React.FC<TrendingMonthProps> = ({ items, genres }) => {
  const getGenreName = (genreId: number) => {
    return genres.find(g => g.id === genreId)?.name || '';
  };

  return (
    <div className="border border-border-light dark:border-border-dark h-full flex flex-col bg-light-bg dark:bg-dark-bg">
      <h3 className="px-4 py-3 border-b border-border-light dark:border-border-dark font-semibold flex-shrink-0">
        Trending This Month
      </h3>
      <div className="overflow-y-auto scrollbar-thin h-[400px]">
        <div className="divide-y divide-border-light dark:divide-border-dark">
          {items.map((media, index) => {
            const isMovie = 'title' in media;
            const title = isMovie ? media.title : media.name;
            const releaseDate = isMovie ? media.release_date : media.first_air_date;
            const year = new Date(releaseDate).getFullYear();

            return (
              <Link
                key={media.id}
                to={`/${isMovie ? 'movie' : 'tv'}/${media.id}`}
                className="flex items-start gap-4 p-4 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors group"
              >
                <span className="font-bold text-2xl text-light-text-secondary/60 dark:text-dark-text-secondary/80 w-8 flex-shrink-0">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <div className="flex-shrink-0 border-2 border-transparent group-hover:border-red-600 dark:group-hover:border-red-500 transition-colors">
                  <div className="relative aspect-[2/3] w-16">
                    <img
                      src={getImageUrl(media.poster_path, 'w185')}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {isMovie ? (
                    <Film className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary mb-1" />
                  ) : (
                    <Tv className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary mb-1" />
                  )}
                  <h4 className="font-medium text-base truncate mb-1">{title}</h4>
                  
                  <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-2">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      <span className="ml-0.5">
                        {media.vote_average.toFixed(1)}
                      </span>
                    </div>
                    <span>{year}</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {media.genre_ids.slice(0, 2).map((genreId) => (
                      <span key={genreId} className="px-2 py-0.5 bg-light-surface dark:bg-dark-surface rounded-full text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {getGenreName(genreId)}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TrendingMonth;