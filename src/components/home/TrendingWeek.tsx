import React from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star } from 'lucide-react';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';
import { Genre } from '../../api/services/genres';

interface TrendingWeekProps {
  items: (Movie | TVShow)[];
  genres: Genre[];
}

const TrendingWeek: React.FC<TrendingWeekProps> = ({ items, genres }) => {
  const getGenreName = (genreId: number) =>
    genres.find((g) => g.id === genreId)?.name || '';

  return (
    <div className="border border-border-light dark:border-border-dark h-[calc(100vh-13rem)] md:h-[500px] bg-light-bg dark:bg-dark-bg">
      <div className="overflow-y-auto scrollbar-thin h-full">
        <div className="flex flex-col gap-4 p-3">
          {items.map((media, index) => {
            const isMovie = 'title' in media;
            const title = isMovie ? media.title : media.name;
            const releaseDate = isMovie ? media.release_date : media.first_air_date;
            const year = new Date(releaseDate).getFullYear();

            return (
              <Link
                key={media.id}
                to={`/${isMovie ? 'movie' : 'tv'}/${media.id}`}
                className="flex gap-3 items-center border-4 border-transparent hover:border-red-600 dark:hover:border-red-500 transition-colors hover:scale-[1.02] transition-transform group p-2 mx-2"
              >
                <span className="text-5xl font-extrabold text-dark-text-secondary dark:text-light-text-secondary drop-shadow-md">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <div className="flex-shrink-0 border-4 border-border-light dark:border-border-dark shadow-lg">
                  <div className="relative aspect-[2/3] w-20">
                    <img
                      src={getImageUrl(media.poster_path, 'w185')}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    {isMovie ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                  </div>
                  <h4 className="font-bold text-base truncate mb-1 text-light-text-primary dark:text-dark-text-primary">{title}</h4>
                  <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      <span className="ml-1 font-bold">{media.vote_average.toFixed(1)}</span>
                    </div>
                    <span>{year}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {media.genre_ids.slice(0, 2).map((genreId) => (
                      <span
                        key={genreId}
                        className="px-2 py-0.5 bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary rounded-full text-xs"
                      >
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

export default TrendingWeek;