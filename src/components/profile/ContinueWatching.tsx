import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Trash2, Play, Timer, Star } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { WatchHistoryItem } from '../../store/useStore';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { mediaService } from '../../api/services/media';

interface ContinueWatchingProps {
  watchHistory: WatchHistoryItem[];
  onClearHistory: () => void;
  onRemoveFromHistory: (id: number, mediaType: 'movie' | 'tv') => void;
}

const ContinueWatching: React.FC<ContinueWatchingProps> = ({
  watchHistory,
  onClearHistory,
  onRemoveFromHistory,
}) => {
  const detailQueries = useQueries({
    queries: watchHistory.map(item => ({
      queryKey: ['details', item.mediaType, item.id],
      queryFn: () => mediaService.getDetails(item.mediaType, item.id),
    }))
  });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getWatchProgress = (item: WatchHistoryItem, details: any) => {
    if (!item.progress) return null;

    let totalDuration = item.progress.duration;
    if (item.mediaType === 'movie') {
      totalDuration = (details?.runtime || 0) * 60;
    } else if (item.mediaType === 'tv') {
      totalDuration = (details?.episode_run_time?.[0] || 0) * 60;
    }

    if (totalDuration === 0) return null;

    const watched = item.progress.watched;
    const remaining = Math.max(0, totalDuration - watched);

    return {
      watched: formatDuration(Math.floor(watched)),
      remaining: formatDuration(Math.floor(remaining)),
      percentage: Math.round((watched / totalDuration) * 100)
    };
  };

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Continue Watching
        </h2>
        {watchHistory.length > 0 && (
          <button
            onClick={onClearHistory}
            className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </button>
        )}
      </div>

      {watchHistory.length === 0 ? (
        <div className="text-center py-12 bg-light-surface dark:bg-dark-surface rounded-lg">
          <Clock className="w-12 h-12 text-light-text-secondary dark:text-dark-text-secondary mx-auto mb-3" />
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Your watch history will appear here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[calc(3*144px+2*1rem)] overflow-y-auto scrollbar-thin pr-2">
          {watchHistory.map((item, index) => {
            const details = detailQueries[index]?.data;
            const progress = getWatchProgress(item, details);
            const isAccurateTracking = item.progress?.duration > 0;
            const releaseDate = details?.release_date || details?.first_air_date;
            const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

            return (
              <div
                key={`${item.mediaType}-${item.id}`}
                className="flex gap-4 bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark hover:border-accent transition-colors group"
              >
                <div className="w-24 flex-shrink-0 relative">
                  <img
                    src={getImageUrl(item.posterPath, 'w185')}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-white">{details?.vote_average?.toFixed(1)}</span>
                      </div>
                      {year && <span className="text-white">{year}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0 py-3 pr-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{item.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        <span className="capitalize">{item.mediaType}</span>
                        {item.season !== undefined && (
                          <span>• S{item.season}:E{item.episode}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveFromHistory(item.id, item.mediaType)}
                      className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-light-text-secondary dark:text-dark-text-secondary">
                        {formatDate(item.lastWatched)}
                      </span>
                      {progress && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                            <Timer className="w-3 h-3" />
                            <span>{progress.watched}</span>
                          </div>
                          <div className={cn(
                            "px-1.5 py-0.5 text-xs rounded-md",
                            isAccurateTracking 
                              ? "bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                              : "bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary"
                          )}>
                            {progress.remaining} left
                          </div>
                        </div>
                      )}
                    </div>
                    {progress && (
                      <div className="relative h-1.5 bg-light-surface dark:bg-dark-surface rounded-full overflow-hidden">
                        <div className="absolute inset-0 bg-border-light dark:bg-border-dark opacity-50" />
                        <div
                          className={cn(
                            "absolute inset-y-0 left-0 transition-all duration-300",
                            isAccurateTracking 
                              ? "bg-gradient-to-r from-red-500 to-red-600"
                              : "bg-gradient-to-r from-light-text-secondary to-light-text-secondary dark:from-dark-text-secondary dark:to-dark-text-secondary"
                          )}
                          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <Link
                    to={`/watch/${item.mediaType}/${item.id}${
                      item.season !== undefined
                        ? `?season=${item.season}&episode=${item.episode}`
                        : ''
                    }`}
                    className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400 mt-3"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContinueWatching;