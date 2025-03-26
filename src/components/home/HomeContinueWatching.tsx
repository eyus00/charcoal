import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Play, Film, Tv, Star } from 'lucide-react';
import { WatchHistoryItem } from '../../store/useStore';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface HomeContinueWatchingProps {
  watchHistory: WatchHistoryItem[];
}

const HomeContinueWatching: React.FC<HomeContinueWatchingProps> = ({
  watchHistory
}) => {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getWatchProgress = (item: WatchHistoryItem) => {
    if (!item.progress) return null;

    const totalDuration = item.progress.duration;
    if (totalDuration === 0) return null;

    const watched = item.progress.watched;
    const remaining = Math.max(0, totalDuration - watched);
    const percentage = Math.round((watched / totalDuration) * 100);

    return {
      watched: formatDuration(Math.floor(watched)),
      remaining: formatDuration(Math.floor(remaining)),
      percentage,
    };
  };

  if (watchHistory.length === 0) {
    return (
      <div className="h-full flex flex-col bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
        <div className="p-4 border-b-2 border-gray-400/50 dark:border-white/20">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Continue Watching
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <Clock className="w-12 h-12 text-light-text-secondary dark:text-dark-text-secondary mx-auto mb-3" />
            <p className="text-light-text-secondary dark:text-dark-text-secondary">
              Your watch history will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
      <div className="p-4 border-b-2 border-gray-400/50 dark:border-white/20">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Continue Watching
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
          {watchHistory.slice(0, 4).map((item) => {
            const progress = getWatchProgress(item);
            
            return (
              <Link
                key={`${item.mediaType}-${item.id}`}
                to={`/watch/${item.mediaType}/${item.id}${
                  item.season !== undefined
                    ? `?season=${item.season}&episode=${item.episode}`
                    : ''
                }`}
                className="block group"
              >
                <div className="relative aspect-video rounded-lg overflow-hidden">
                  <img
                    src={getImageUrl(item.posterPath, 'w780')}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors" />
                  
                  {/* Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center scale-0 group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-white fill-white ml-1" />
                    </div>
                  </div>

                  {/* Content Info */}
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
                      {item.mediaType === 'movie' ? (
                        <Film className="w-4 h-4" />
                      ) : (
                        <Tv className="w-4 h-4" />
                      )}
                      {item.mediaType === 'tv' && item.season && item.episode && (
                        <span>S{item.season}:E{item.episode}</span>
                      )}
                    </div>
                    <h4 className="text-white font-medium truncate">{item.title}</h4>
                  </div>

                  {/* Progress Bar */}
                  {progress && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-red-600"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Progress Info */}
                {progress && (
                  <div className="flex items-center justify-between mt-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{progress.watched} watched</span>
                    </div>
                    <span>{progress.remaining} left</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HomeContinueWatching;