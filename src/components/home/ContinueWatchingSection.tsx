import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle, Film, Tv, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { mediaService } from '../../api/services/media';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { WatchHistoryItem } from '../../store/useStore';

interface ContinueWatchingSectionProps {
  items: WatchHistoryItem[];
}

// ...imports unchanged

const ContinueWatchingSection: React.FC<ContinueWatchingSectionProps> = ({ items }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Fetch episode details unchanged
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

  const checkScrollPosition = () => {
    if (!containerRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      checkScrollPosition(); // Initial check
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScrollPosition);
      }
    };
  }, [items]);

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

  const formatSeasonEpisode = (season: number, episode: number) => {
    return `S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <h2 className="text-xl font-semibold">Continue Watching</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className={cn(
              "w-8 h-8 flex items-center justify-center hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors border border-border-light dark:border-border-dark",
              !canScrollLeft && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className={cn(
              "w-8 h-8 flex items-center justify-center hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors border border-border-light dark:border-border-dark",
              !canScrollRight && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canScrollRight}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3">
        <div 
          ref={containerRef}
          className="overflow-x-auto scrollbar-thin"
          style={{ scrollPaddingRight: '1rem' }}
        >
          <div className="flex gap-3">
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
                  className="flex-shrink-0 w-[75vw] sm:w-[400px] lg:w-[450px] relative"
                >
                  <div className="relative border border-border-light dark:border-border-dark rounded-lg overflow-hidden hover:border-red-500/50 transition-all duration-200 group">
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

                      <div className="absolute inset-0 p-3 flex flex-col justify-end">
                        <div className="flex items-center gap-2 mb-1">
                          {item.mediaType === 'movie' ? (
                            <Film className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Tv className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>

                        <h3 className="text-white font-medium text-base sm:text-lg mb-1 line-clamp-1">
                          {item.title}
                        </h3>

                        {item.mediaType === 'tv' && item.season && item.episode && episodeDetails && (
                          <span className="text-white/80 text-xs sm:text-sm mb-1.5 line-clamp-1">
                            {formatSeasonEpisode(item.season, item.episode)} • {episodeDetails.name}
                          </span>
                        )}

                        <div className="flex items-center gap-2 mb-1.5 text-xs">
                          {item.progress && (
                            <div className="flex items-center gap-2 text-white/80 w-full">
                              <div className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] rounded">
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
