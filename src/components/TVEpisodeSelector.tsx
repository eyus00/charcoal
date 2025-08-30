import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, StepForward, ChevronDown, List, Play, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { getImageUrl } from '../api/config';
import { useStore } from '../store/useStore';
import { getVideoProgress } from '../lib/watch';

interface Episode {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string;
  runtime?: number;
  air_date?: string;
}

interface Season {
  season_number: number;
  name: string;
  episodes: Episode[];
}

interface TVEpisodeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: Season[];
  tvId: number;
  title: string;
}

const TVEpisodeSelector: React.FC<TVEpisodeSelectorProps> = ({
  isOpen,
  onClose,
  seasons,
  tvId,
  title,
}) => {
  const navigate = useNavigate();
  const [selectedSeason, setSelectedSeason] = React.useState(1);
  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);
  const { watchHistory } = useStore();

  // Get resume info from both sources
  const resumeInfo = getVideoProgress();
  const historyInfo = watchHistory.find(
    item => item.mediaType === 'tv' && item.id === tvId
  );

  // Use the most recent progress
  const currentProgress = resumeInfo?.id === tvId && resumeInfo?.mediaType === 'tv'
    ? resumeInfo
    : historyInfo;

  React.useEffect(() => {
    if (seasons.length > 0 && seasons[0]) {
      setSelectedSeason(seasons[0].season_number);
    }
  }, [seasons]);

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  const formatAirDate = (date?: string) => {
    if (!date) return 'TBA';
    const airDate = new Date(date);
    const now = new Date();
    const isInFuture = airDate > now;
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: airDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }).format(airDate) + (isInFuture ? ' (Upcoming)' : '');
  };

  const getEpisodeProgress = (seasonNumber: number, episodeNumber: number) => {
    // Check both sources for progress
    const videoProgress = getVideoProgress();
    const historyProgress = watchHistory.find(
      item => 
        item.mediaType === 'tv' && 
        item.id === tvId && 
        item.season === seasonNumber && 
        item.episode === episodeNumber
    );

    // Use video progress if it's more recent
    if (videoProgress?.id === tvId && 
        videoProgress?.season === seasonNumber && 
        videoProgress?.episode === episodeNumber) {
      return {
        progress: (videoProgress.timestamp / videoProgress.duration) * 100,
        isCompleted: videoProgress.isCompleted || (videoProgress.timestamp / videoProgress.duration) >= 0.9,
        isWatching: !videoProgress.isCompleted && videoProgress.timestamp > 0,
        remainingTime: formatDuration(Math.floor((videoProgress.duration - videoProgress.timestamp) / 60))
      };
    }

    // Fall back to history progress
    if (historyProgress?.progress) {
      const watched = historyProgress.progress.watched;
      const duration = historyProgress.progress.duration;
      const remaining = Math.max(0, duration - watched);

      return {
        progress: (watched / duration) * 100,
        isCompleted: historyProgress.isCompleted || (watched / duration) >= 0.9,
        isWatching: !historyProgress.isCompleted && watched > 0,
        remainingTime: formatDuration(Math.floor(remaining / 60))
      };
    }

    return null;
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    navigate(`/watch/tv/${tvId}?season=${season}&episode=${episode}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 shadow-xl border-2 border-gray-400/50 dark:border-white/20 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-400/50 dark:border-white/20 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <List className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Select Episode</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resume Button */}
        {currentProgress && (
          <div className="px-4 pt-4 flex-shrink-0">
            <button
              onClick={() => handleEpisodeSelect(currentProgress.season!, currentProgress.episode!)}
              className="w-full px-4 py-3 bg-red-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-red-700 transition-colors relative"
            >
              <StepForward className="w-5 h-5" />
              Resume S{currentProgress.season}:E{currentProgress.episode}
              {currentProgress.progress && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-b-lg overflow-hidden">
                  <div
                    className="h-full bg-white/30"
                    style={{
                      width: `${(currentProgress.progress.watched / currentProgress.progress.duration) * 100}%`
                    }}
                  />
                </div>
              )}
            </button>
          </div>
        )}

        {/* Season Selector */}
        <div className="px-4 py-3 border-b border-gray-400/50 dark:border-white/20 flex-shrink-0">
          <div className="relative">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 hover:border-red-600 dark:hover:border-red-500 border border-gray-400/50 dark:border-white/20 rounded-md text-light-text-primary dark:text-dark-text-primary appearance-none focus:outline-none transition-all pr-10"
            >
              {seasons.map((season) => (
                <option
                  key={season.season_number}
                  value={season.season_number}
                  className="bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary"
                >
                  {season.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" />
          </div>
        </div>

        {/* Episodes List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="space-y-0">
            {currentSeasonData?.episodes.map((episode, index) => {
              const duration = formatDuration(episode.runtime);
              const progress = getEpisodeProgress(selectedSeason, episode.episode_number);
              const isLast = index === (currentSeasonData?.episodes.length || 0) - 1;
              const isCurrent = currentProgress?.season === selectedSeason && 
                              currentProgress?.episode === episode.episode_number;

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className={cn(
                    "w-full px-4 py-4 hover:bg-light-surface dark:hover:bg-dark-surface/80 flex gap-4 group relative",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10 after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500",
                    !isLast && "border-b border-gray-400/50 dark:border-white/20",
                    progress?.isCompleted && "opacity-60"
                  )}
                >
                  <div className="w-28 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded-md border border-gray-400/50 dark:border-white/20 overflow-hidden relative">
                    {episode.still_path ? (
                      <img
                        src={getImageUrl(episode.still_path, 'w300')}
                        alt={episode.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-light-surface dark:bg-dark-surface" />
                    )}
                    {duration && (
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-red-600 dark:bg-red-500 rounded-md border border-gray-400/50 dark:border-white/20 text-xs text-white">
                        {duration}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 bg-red-600 hover:bg-red-700 rounded-md flex items-center justify-center transition-colors shadow-lg border border-white/20">
                        {progress?.isCompleted ? (
                          <Check className="w-4 h-4 text-white scale-100 group-hover:scale-110 transition-transform" />
                        ) : (isCurrent || progress?.isWatching) ? (
                          <StepForward className="w-4 h-4 text-white scale-100 group-hover:scale-110 transition-transform" />
                        ) : (
                          <Play className="w-4 h-4 text-white scale-100 group-hover:scale-110 transition-transform" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium truncate max-w-[200px] text-light-text-primary dark:text-dark-text-primary",
                        isCurrent && "text-red-600 dark:text-red-500"
                      )}>
                        {episode.episode_number}. {episode.name}
                      </span>
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2 mb-0.5">
                      {episode.overview}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-light-text-secondary/60 dark:text-dark-text-secondary/60">
                        {formatAirDate(episode.air_date)}
                      </span>
                      {progress?.remainingTime && (
                        <span className="text-xs text-light-text-secondary/60 dark:text-dark-text-secondary/60">
                          {progress.remainingTime} left
                        </span>
                      )}
                    </div>
                    {progress && (
                      <div className="mt-1">
                        <div className="h-1 bg-light-surface dark:bg-dark-surface rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-red-600 dark:bg-red-500 transition-all duration-300"
                            style={{ width: `${Math.min(progress.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default TVEpisodeSelector;