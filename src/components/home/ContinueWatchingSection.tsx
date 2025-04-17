import React from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle, Star, Clock, Film, Tv, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { mediaService } from '../../api/services/media';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { WatchHistoryItem } from '../../store/useStore';

interface ContinueWatchingSectionProps {
  items: WatchHistoryItem[];
}

const ContinueWatchingSection: React.FC<ContinueWatchingSectionProps> = ({ items }) => {
  // Fetch episode details for TV shows
  const episodeQueries = useQuery({
    queryKey: ['episodes', items.map(item => `${item.id}-${item.season}-${item.episode}`)],
    queryFn: async () => {
      const episodeDetails = await Promise.all(
        items
          .filter(item => item.mediaType === 'tv' && item.season && item.episode)
          .map(item =>
            mediaService.getTVSeasonDetails(item.id, item.season!)
              .then(season => season.episodes.find(ep => ep.episode_number === item.episode))
          )
      );
      return episodeDetails;
    },
    enabled: items.some(item => item.mediaType === 'tv'),
  });

  if (items.length === 0) return null;

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className="h-full flex flex-col bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <h2 className="text-xl font-semibold">Continue Watching</h2>
      </div>

      <div className="flex-1 p-4">
        <div 
          className="overflow-x-auto scrollbar-thin"
          style={{ scrollPaddingRight: '1rem' }}
        >
          <div className="flex gap-4">
            {items.map((item, index) => {
              const episodeDetails = item.mediaType === 'tv' ? episodeQueries.data?.[index] : null;
              const progress = item.progress
                ? Math.round((item.progress.watched / item.progress.duration) * 100)
                : 0;
              const remaining = item.progress
                ? item.progress.duration - item.progress.watched
                : 0;

              return (
                <Link
                  key={`${item.mediaType}-${item.id}`}
                  to={`/watch/${item.mediaType}/${item.id}${
                    item.mediaType === 'tv' ? `?season=${item.season}&episode=${item.episode}` : ''
                  }`}
                  className="flex-shrink-0 w-[65vw] sm:w-[350px] lg:w-[400px] relative"
                >
                  <div className="relative border border-border-light dark:border-border-dark rounded-lg overflow-hidden hover:border-red-500/50 transition-all duration-200">
                    <div className="aspect-video relative">
                      <img
                        src={getImageUrl(
                          item.mediaType === 'tv' && episodeDetails?.still_path
                            ? episodeDetails.still_path
                            : item.posterPath,
                          'w780'
                        )}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                      
                      <div className="absolute inset-0 p-4 flex flex-col justify-end">
                        {/* Status Tag */}
                        <div className="absolute top-3 left-3">
                          <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                            {progress >= 90 ? 'Completed' : 'Watching'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-1.5">
                          {item.mediaType === 'movie' ? (
                            <Film className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Tv className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>

                        <h3 className="text-white font-medium text-base sm:text-lg mb-1.5 line-clamp-1">
                          {item.title}
                          {item.mediaType === 'tv' && item.season && item.episode && (
                            <span className="text-white/80 ml-2 text-sm">
                              S{item.season}:E{item.episode}
                            </span>
                          )}
                          {item.mediaType === 'tv' && episodeDetails && (
                            <span className="block text-xs sm:text-sm text-white/80 mt-0.5">
                              {episodeDetails.name}
                            </span>
                          )}
                        </h3>
                        
                        <div className="flex items-center gap-2 mb-2 text-xs">
                          {item.progress && (
                            <div className="flex items-center gap-2 text-white/80 w-full">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{formatTimeAgo(item.lastWatched)}</span>
                              </div>
                              <div className="w-px h-2.5 bg-white/20" />
                              <div className="px-1.5 py-0.5 bg-red-600/70 text-white text-[10px] rounded">
                                {formatDuration(remaining)} left
                              </div>
                              <div className="ml-auto text-[10px] text-white/60">
                                {formatDuration(item.progress.duration)}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div>
                          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-600"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Play button overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-600/90 flex items-center justify-center">
                          <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
                        </div>
                      </div>
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

export default ContinueWatchingSection;