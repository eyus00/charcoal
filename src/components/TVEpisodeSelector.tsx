import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, StepForward, ChevronDown, List, Play, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { getImageUrl } from '../api/config';
import { useStore } from '../store/useStore';

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

  // Get resume info from watch history
  const resumeInfo = watchHistory.find(
    item => item.mediaType === 'tv' && item.id === tvId
  );

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
    const episodeHistory = watchHistory.find(
      item => 
        item.mediaType === 'tv' && 
        item.id === tvId && 
        item.season === seasonNumber && 
        item.episode === episodeNumber
    );

    if (!episodeHistory?.progress) return null;

    const watched = episodeHistory.progress.watched;
    const duration = episodeHistory.progress.duration;
    const remaining = Math.max(0, duration - watched);

    return {
      progress: (watched / duration) * 100,
      isCompleted: episodeHistory.isCompleted || (watched / duration) >= 0.9,
      isWatching: !episodeHistory.isCompleted && watched > 0,
      remainingTime: formatDuration(Math.floor(remaining / 60))
    };
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    navigate(`/watch/tv/${tvId}?season=${season}&episode=${episode}`);
    onClose();
  };

  const handlePrevious = () => {
    if (resumeInfo?.season && resumeInfo?.episode) {
      if (resumeInfo.episode > 1) {
        handleEpisodeSelect(resumeInfo.season, resumeInfo.episode - 1);
      } else if (resumeInfo.season > 1) {
        const prevSeason = seasons.find(s => s.season_number === resumeInfo.season - 1);
        if (prevSeason) {
          handleEpisodeSelect(resumeInfo.season - 1, prevSeason.episodes.length);
        }
      }
    }
  };

  const handleNext = () => {
    if (resumeInfo?.season && resumeInfo?.episode) {
      const currentSeason = seasons.find(s => s.season_number === resumeInfo.season);
      if (currentSeason && resumeInfo.episode < currentSeason.episodes.length) {
        handleEpisodeSelect(resumeInfo.season, resumeInfo.episode + 1);
      } else if (resumeInfo.season < seasons.length) {
        handleEpisodeSelect(resumeInfo.season + 1, 1);
      }
    }
  };

  // Sort episodes by watched status
  const sortedEpisodes = React.useMemo(() => {
    if (!currentSeasonData?.episodes) return [];
    
    return [...currentSeasonData.episodes].sort((a, b) => {
      const progressA = getEpisodeProgress(selectedSeason, a.episode_number);
      const progressB = getEpisodeProgress(selectedSeason, b.episode_number);
      
      if (progressA?.isCompleted && !progressB?.isCompleted) return 1;
      if (!progressA?.isCompleted && progressB?.isCompleted) return -1;
      return a.episode_number - b.episode_number;
    });
  }, [currentSeasonData, selectedSeason, watchHistory]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[100] transition-opacity duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-[100] bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 md:max-w-xl md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:rounded-lg shadow-xl border-2 border-gray-400/50 dark:border-white/20 flex flex-col max-h-[85vh] md:max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-400/50 dark:border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Select Episode</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {resumeInfo && (
          <div className="mx-4 mt-4 mb-2 flex items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={resumeInfo.season === 1 && resumeInfo.episode === 1}
              className="w-10 h-10 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 text-light-text-primary dark:text-white rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-gray-400/50 dark:border-white/20 hover:border-red-600 dark:hover:border-red-500"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleEpisodeSelect(resumeInfo.season!, resumeInfo.episode!)}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors border border-white/20"
            >
              <StepForward className="w-4 h-4" />
              Resume S{resumeInfo.season}:E{resumeInfo.episode}
            </button>
            <button
              onClick={handleNext}
              disabled={resumeInfo.season === seasons.length && resumeInfo.episode === currentSeasonData?.episodes.length}
              className="w-10 h-10 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 text-light-text-primary dark:text-white rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-gray-400/50 dark:border-white/20 hover:border-red-600 dark:hover:border-red-500"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {resumeInfo?.progress && (
              <div className="absolute bottom-0 left-0 right-0 h-1 Bg-white/10 rounded-b overflow-hidden">
                <div
                  className="h-full bg-white/30"
                  style={{
                    width: `${(resumeInfo.progress.watched / resumeInfo.progress.duration) * 100}%`
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-b border-gray-400/50 dark:border-white/20">
          <div className="relative">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 hover:border-red-600 dark:hover:border-red-500 border border-gray-400/50 dark:border-white/20 rounded-md text-light-text-primary dark:text-white appearance-none focus:outline-none transition-all pr-10"
            >
              {seasons.map((season) => (
                <option
                  key={season.season_number}
                  value={season.season_number}
                  className="bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-white"
                >
                  {season.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="space-y-0">
            {sortedEpisodes.map((episode, index) => {
              const duration = formatDuration(episode.runtime);
              const progress = getEpisodeProgress(selectedSeason, episode.episode_number);
              const isLast = index === (currentSeasonData?.episodes.length || 0) - 1;
              const isCurrent = resumeInfo?.season === selectedSeason && resumeInfo?.episode === episode.episode_number;

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className={cn(
                    "w-full px-4 py-3 hover:bg-light-surface dark:hover:bg-dark-surface/80 flex gap-4 group relative",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10 after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500",
                    !isLast && "border-b border-gray-400/50 dark:border-white/20"
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
                        "font-medium truncate max-w-[200px] text-light-text-primary dark:text-white",
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