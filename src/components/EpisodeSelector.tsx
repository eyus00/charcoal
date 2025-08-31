import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronDown, RotateCcw, Play, Check, StepForward } from 'lucide-react';
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

interface EpisodeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: Season[];
  tvId: number;
  onEpisodeSelect: (season: number, episode: number) => void;
}

const EpisodeSelector = ({ isOpen, onClose, seasons, tvId, onEpisodeSelect }: EpisodeSelectorProps) => {
  const [selectedSeason, setSelectedSeason] = useState(1);
  const navigate = useNavigate();
  const { watchHistory } = useStore();
  const currentSeason = seasons.find(s => s.season_number === selectedSeason);

  useEffect(() => {
    if (seasons.length > 0 && seasons[0]) {
      setSelectedSeason(seasons[0].season_number);
    }
  }, [seasons]);

  const videoProgress = getVideoProgress();

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

    const historyProgress = watchHistory.find(
      item => item.mediaType === 'tv' && item.id === tvId && item.season === seasonNumber && item.episode === episodeNumber
    );

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

  const sortedEpisodes = useMemo(() => {
    if (!currentSeason?.episodes) return [];

    return [...currentSeason.episodes].sort((a, b) => {
      const progressA = getEpisodeProgress(selectedSeason, a.episode_number);
      const progressB = getEpisodeProgress(selectedSeason, b.episode_number);

      if (progressA?.isCompleted && !progressB?.isCompleted) return 1;
      if (!progressA?.isCompleted && progressB?.isCompleted) return -1;
      return a.episode_number - b.episode_number;
    });
  }, [currentSeason, selectedSeason, watchHistory, videoProgress]);

  const handleEpisodeSelect = (season: number, episode: number) => {
    onEpisodeSelect(season, episode);
    navigate(`/watch/tv/${tvId}?season=${season}&episode=${episode}`);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Mobile Bottom Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 md:hidden",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="h-[80vh] flex flex-col">
          <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
            <h2 className="text-lg font-semibold">Select Episode</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-border-light dark:border-border-dark">
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 appearance-none"
              >
                {seasons.map((season) => (
                  <option key={season.season_number} value={season.season_number}>
                    {season.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {sortedEpisodes.map((episode) => {
              const duration = formatDuration(episode.runtime);
              const progress = getEpisodeProgress(selectedSeason, episode.episode_number);
              const isCurrent = videoProgress?.id === tvId &&
                                videoProgress?.season === selectedSeason &&
                                videoProgress?.episode === episode.episode_number;

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className={cn(
                    "w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark relative",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10"
                  )}
                >
                  <div className="w-32 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden relative">
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
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-red-600 dark:bg-red-500 rounded text-xs text-white">
                        {duration}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium truncate",
                        isCurrent && "text-red-600 dark:text-red-500"
                      )}>
                        {episode.episode_number}. {episode.name}
                      </span>
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
                    <div className="flex items-center justify-between text-xs text-light-text-secondary/60 dark:text-dark-text-secondary/60 mt-1">
                      <span>{formatAirDate(episode.air_date)}</span>
                      {progress?.remainingTime && <span>{progress.remainingTime} left</span>}
                    </div>
                    {progress && (
                      <div className="mt-1">
                        <div className="h-1 bg-light-surface dark:bg-dark-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-600 dark:bg-red-500"
                            style={{ width: `${Math.min(progress.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-y-0 right-4 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {progress?.isCompleted ? (
                      <Check className="w-4 h-4 text-red-600 dark:text-red-500" />
                    ) : (isCurrent || progress?.isWatching) ? (
                      <StepForward className="w-4 h-4 text-red-600 dark:text-red-500" />
                    ) : (
                      <Play className="w-4 h-4 text-red-600 dark:text-red-500" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 w-96 bg-light-bg dark:bg-dark-bg shadow-lg transform transition-transform duration-300 z-50 hidden md:block",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
            <h2 className="text-lg font-semibold">Select Episode</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                className="w-full px-3 py-2 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded focus:outline-none focus:ring-2 focus:ring-red-500 appearance-none pr-10"
              >
                {seasons.map((season) => (
                  <option key={season.season_number} value={season.season_number}>
                    {season.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {sortedEpisodes.map((episode) => {
              const duration = formatDuration(episode.runtime);
              const progress = getEpisodeProgress(selectedSeason, episode.episode_number);
              const isCurrent = videoProgress?.id === tvId &&
                                videoProgress?.season === selectedSeason &&
                                videoProgress?.episode === episode.episode_number;

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className={cn(
                    "w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark relative",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10"
                  )}
                >
                  <div className="w-24 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden relative">
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
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-red-600 dark:bg-red-500 rounded text-xs text-white">
                        {duration}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium truncate",
                        isCurrent && "text-red-600 dark:text-red-500"
                      )}>
                        {episode.episode_number}. {episode.name}
                      </span>
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
                    <div className="flex items-center justify-between text-xs text-light-text-secondary/60 dark:text-dark-text-secondary/60 mt-1">
                      <span>{formatAirDate(episode.air_date)}</span>
                      {progress?.remainingTime && <span>{progress.remainingTime} left</span>}
                    </div>
                    {progress && (
                      <div className="mt-1">
                        <div className="h-1 bg-light-surface dark:bg-dark-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-600 dark:bg-red-500"
                            style={{ width: `${Math.min(progress.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-y-0 right-4 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {progress?.isCompleted ? (
                      <Check className="w-4 h-4 text-red-600 dark:text-red-500" />
                    ) : (isCurrent || progress?.isWatching) ? (
                      <StepForward className="w-4 h-4 text-red-600 dark:text-red-500" />
                    ) : (
                      <Play className="w-4 h-4 text-red-600 dark:text-red-500" />
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

export default EpisodeSelector;