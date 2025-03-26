import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Film, Tv, Star, Calendar, Clock } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface HomeUpdatesProps {
  items: (Movie | TVShow)[];
}

const HomeUpdates: React.FC<HomeUpdatesProps> = ({ items }) => {
  return (
    <div className="h-full flex flex-col bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
      <div className="p-4 border-b-2 border-gray-400/50 dark:border-white/20">
        <h2 className="text-xl font-semibold">Latest Updates</h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* New Trailers Section */}
        <div className="p-4 border-b-2 border-gray-400/50 dark:border-white/20">
          <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
            <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">New</span>
            <span>Trailers</span>
          </div>
          <div className="space-y-3">
            <div className="relative aspect-video rounded-lg overflow-hidden group cursor-pointer">
              <img
                src="https://image.tmdb.org/t/p/w780/qhb1qOilapbapxWQn9jtRCMwXJF.jpg"
                alt="The Last Kingdom: Seven Kings Must Die"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center scale-0 group-hover:scale-110 transition-transform">
                  <Play className="w-6 h-6 text-white fill-white ml-1" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h4 className="text-white font-medium">The Last Kingdom: Seven Kings Must Die</h4>
                <div className="flex items-center gap-2 text-white/80 text-sm mt-1">
                  <Calendar className="w-4 h-4" />
                  <span>Today</span>
                </div>
              </div>
            </div>

            <div className="relative aspect-video rounded-lg overflow-hidden group cursor-pointer">
              <img
                src="https://image.tmdb.org/t/p/w780/9n2tJBplPbgR2ca05hS5CKXwP2c.jpg"
                alt="The Super Mario Bros. Movie"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center scale-0 group-hover:scale-110 transition-transform">
                  <Play className="w-6 h-6 text-white fill-white ml-1" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h4 className="text-white font-medium">The Super Mario Bros. Movie</h4>
                <div className="flex items-center gap-2 text-white/80 text-sm mt-1">
                  <Calendar className="w-4 h-4" />
                  <span>Yesterday</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Releases */}
        <div className="p-4">
          <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
            <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">Latest</span>
            <span>Releases</span>
          </div>
          <div className="space-y-3">
            {items.slice(0, 5).map((item) => {
              const isMovie = 'title' in item;
              const title = isMovie ? item.title : item.name;
              const releaseDate = isMovie ? item.release_date : item.first_air_date;
              const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

              return (
                <Link
                  key={item.id}
                  to={`/${isMovie ? 'movie' : 'tv'}/${item.id}`}
                  className="flex items-start gap-4 p-2 -mx-2 hover:bg-white/5 rounded-lg transition-colors group"
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
                      <span className="px-2 py-0.5 bg-white/10 rounded text-xs">New</span>
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

export default HomeUpdates;