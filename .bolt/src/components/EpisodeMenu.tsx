import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getImageUrl } from '../api/config';

interface EpisodeMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onEpisodeSelect: (season: number, episode: number) => void;
  seasons: {
    season_number: number;
    name: string;
    episodes: {
      episode_number: number;
      name: string;
      overview: string;
      still_path: string;
      runtime?: number;
    }[];
  }[];
  currentSeason: number;
  currentEpisode: number;
  totalSeasons?: number;
  totalEpisodes?: number;
}

const EpisodeMenu: React.FC<EpisodeMenuProps> = ({
  isOpen,
  onClose,
  onPrevious,
  onNext,
  onEpisodeSelect,
  seasons,
  currentSeason,
  currentEpisode,
  totalSeasons,
  totalEpisodes,
}) => {
  const [selectedSeason, setSelectedSeason] = React.useState(currentSeason);
  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  const isCurrentEpisode = (season: number, episode: number) => {
    return season === currentSeason && episode === currentEpisode;
  };

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
            <h2 className="text-lg font-semibold">Episodes</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="flex gap-2">
              <button
                onClick={onPrevious}
                disabled={currentSeason === 1 && currentEpisode === 1}
                className="flex-1 px-4 py-2 bg-light-surface dark:bg-dark-surface rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={onNext}
                disabled={currentSeason === totalSeasons && currentEpisode === totalEpisodes}
                className="flex-1 px-4 py-2 bg-light-surface dark:bg-dark-surface rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-border-light dark:border-border-dark">
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                className="w-full appearance-none px-4 py-2.5 bg-light-surface dark:bg-dark-surface rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
              >
                {seasons.map((season) => (
                  <option key={season.season_number} value={season.season_number}>
                    {season.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {currentSeasonData?.episodes.map((episode) => {
              const duration = formatDuration(episode.runtime);
              const isCurrent = isCurrentEpisode(selectedSeason, episode.episode_number);

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => {
                    onEpisodeSelect(selectedSeason, episode.episode_number);
                    onClose();
                  }}
                  className={cn(
                    "w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10"
                  )}
                >
                  <div className="w-32 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden">
                    {episode.still_path ? (
                      <img
                        src={getImageUrl(episode.still_path, 'w300')}
                        alt={episode .name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-light-surface dark:bg-dark-surface" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium truncate",
                        isCurrent && "text-red-600 dark:text-red-500"
                      )}>
                        {episode.name}
                      </span>
                      {duration && (
                        <span className="px-2 py-0.5 bg-light-surface dark:bg-dark-surface rounded text-xs text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                          {duration}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
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
            <h2 className="text-lg font-semibold">Episodes</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="flex gap-2">
              <button
                onClick={onPrevious}
                disabled={currentSeason === 1 && currentEpisode === 1}
                className="flex-1 px-4 py-2 bg-light-surface dark:bg-dark-surface rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={onNext}
                disabled={currentSeason === totalSeasons && currentEpisode === totalEpisodes}
                className="flex-1 px-4 py-2 bg-light-surface dark:bg-dark-surface rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                className="w-full appearance-none px-3 py-2 bg-light-surface dark:bg-dark-surface rounded focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
              >
                {seasons.map((season) => (
                  <option key={season.season_number} value={season.season_number}>
                    {season.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {currentSeasonData?.episodes.map((episode) => {
              const duration = formatDuration(episode.runtime);
              const isCurrent = isCurrentEpisode(selectedSeason, episode.episode_number);

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => {
                    onEpisodeSelect(selectedSeason, episode.episode_number);
                    onClose();
                  }}
                  className={cn(
                    "w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10"
                  )}
                >
                  <div className="w-24 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden">
                    {episode.still_path ? (
                      <img
                        src={getImageUrl(episode.still_path, 'w300')}
                        alt={episode.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-light-surface dark:bg-dark-surface" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium",
                        isCurrent && "text-red-600 dark:text-red-500"
                      )}>
                        {episode.name}
                      </span>
                      {duration && (
                        <span className="px-2 py-0.5 bg-light-surface dark:bg-dark-surface rounded text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          {duration}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
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

export default EpisodeMenu;