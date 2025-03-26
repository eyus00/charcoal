import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Star, Film, Tv } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface UpdatesProps {
  items: (Movie | TVShow)[];
}

const Updates: React.FC<UpdatesProps> = ({ items }) => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-xl font-semibold">Latest Updates</h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-white/10">
        {items.map((item) => {
          const isMovie = 'title' in item;
          const title = isMovie ? item.title : item.name;
          const releaseDate = isMovie ? item.release_date : item.first_air_date;
          const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

          return (
            <Link
              key={item.id}
              to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
              className="flex items-start gap-4 p-4 hover:bg-white/5 transition-colors group"
            >
              <div className="relative flex-shrink-0">
                <div className="relative aspect-[2/3] w-16">
                  <img
                    src={getImageUrl(item.poster_path, 'w185')}
                    alt={title}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <Play className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
                  {isMovie ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                  <span>{year}</span>
                </div>

                <h4 className="font-medium truncate mb-1">{title}</h4>

                <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  <div className="flex items-center">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="ml-1">{item.vote_average.toFixed(1)}</span>
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

export default Updates;