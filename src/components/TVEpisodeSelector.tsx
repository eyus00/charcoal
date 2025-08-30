import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, StepForward, ChevronDown, List, Play, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { getImageUrl } from '../api/config';
import { useStore } from '../store/useStore';
import { BottomSheet } from './BottomSheet';

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
  selectedSeason: number;
  selectedEpisode: number;
  onSeasonChange: (season: number) => void;
  onEpisodeChange: (episode: number) => void;
  currentSeason: Season | undefined;
  currentEpisode: Episode | undefined;
  getVideoProgress: () => any;
}

const TVEpisodeSelector: React.FC<TVEpisodeSelectorProps> = ({
  isOpen,
  onClose,
  seasons,
  tvId,
  title,
  selectedSeason,
  selectedEpisode,
  onSeasonChange,
  onEpisodeChange,
  currentSeason,
  currentEpisode,
  getVideoProgress,
}) => {
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);
  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);
  const { watchHistory } = useStore();
  const navigate = useNavigate();

  const handleEpisodeSelect = (seasonNum: number, episodeNum: number) => {
    onSeasonChange(seasonNum);
    onEpisodeChange(episodeNum);
    navigate(`/watch/tv/${tvId}?season=${seasonNum}&episode=${episodeNum}`);
    onClose();
  };

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
      onSeasonChange(seasons[0].season_number);
    }
  }, [seasons, onSeasonChange]);

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

  if (!isOpen) return null;

  return (
    <>
      {/* Desktop Version */}
      <div className="hidden lg:block space-y-4">
        {/* Season Selector */}
        <div className="relative">
          <button
            onClick={() => setIsSeasonOpen(!isSeasonOpen)}
            className="w-full flex items-center justify-between bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark px-4 py-3 rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
          >
            <span>Season {selectedSeason}</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${isSeasonOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isSeasonOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
              {seasons.map((season) => (
                <button
                  key={season.season_number}
                  onClick={() => {
                    onSeasonChange(season.season_number);
                    setIsSeasonOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors",
                    season.season_number === selectedSeason && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                  )}
                >
                  Season {season.season_number}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Episode Selector */}
        {currentSeason && (
          <div className="relative">
            <button
              onClick={() => setIsEpisodeOpen(!isEpisodeOpen)}
              className="w-full flex items-center justify-between bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark px-4 py-3 rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
            >
              <span>Episode {selectedEpisode}: {currentEpisode?.name}</span>
              <ChevronDown className={`w-5 h-5 transition-transform ${isEpisodeOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isEpisodeOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {currentSeason.episodes.map((episode) => (
                  <button
                    key={episode.episode_number}
                    onClick={() => {
                      onEpisodeChange(episode.episode_number);
                      setIsEpisodeOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors",
                      episode.episode_number === selectedEpisode && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                    )}
                  >
                    <div className="font-medium">Episode {episode.episode_number}: {episode.name}</div>
                    {episode.overview && (
                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1 line-clamp-2">{episode.overview}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Version */}
      <div className="lg:hidden">
        <button
          onClick={() => {}}
          className="w-full flex items-center justify-between bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark px-4 py-3 rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
        >
          <div className="text-left">
            <div className="font-medium">Season {selectedSeason}, Episode {selectedEpisode}</div>
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{currentEpisode?.name}</div>
          </div>
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Bottom Sheet */}
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Select Episode"
      >
        <div className="p-6 space-y-6">
          {/* Resume Button */}
          {currentProgress && (
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
          )}

          {seasons.map((season) => (
            <div key={season.season_number} className="space-y-3">
              <h4 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
                Season {season.season_number}
              </h4>
              <div className="space-y-2">
                {season.episodes.map((episode) => {
                  const progress = getEpisodeProgress(season.season_number, episode.episode_number);
                  const duration = formatDuration(episode.runtime);
                  const isCurrent = season.season_number === selectedSeason && episode.episode_number === selectedEpisode;

                  return (
                    <button
                      key={episode.episode_number}
                      onClick={() => handleEpisodeSelect(season.season_number, episode.episode_number)}
                      className={cn(
                        "w-full text-left p-4 rounded-lg transition-colors relative",
                        isCurrent
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700',
                        progress?.isCompleted && "opacity-60"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {progress?.isCompleted ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : progress?.isWatching ? (
                            <StepForward className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Play size={16} className="text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            Episode {episode.episode_number}: {episode.name}
                          </div>
                          {episode.overview && (
                            <div className="text-sm text-gray-400 mt-1 line-clamp-3">
                              {episode.overview}
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            {duration && (
                              <div className="text-xs text-gray-500">
                                {duration}
                              </div>
                            )}
                            <div className="text-xs text-gray-500">
                              {formatAirDate(episode.air_date)}
                            </div>
                          </div>
                          {progress && (
                            <div className="mt-2">
                              <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-red-500 transition-all duration-300"
                                  style={{ width: `${Math.min(progress.progress, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
};

export default TVEpisodeSelector;