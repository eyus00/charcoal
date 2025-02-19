import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRightCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { getImageUrl } from '../api/config';

interface Episode {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string;
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
  const [selectedSeason, setSelectedSeason] = React.useState(1);
  const navigate = useNavigate();
  const currentSeason = seasons.find(s => s.season_number === selectedSeason);

  // Get the last watched episode from localStorage
  const progressData = localStorage.getItem('vidLinkProgress');
  const watchProgress = progressData ? JSON.parse(progressData) : null;
  const showProgress = watchProgress?.[tvId];

  const handleEpisodeSelect = (season: number, episode: number) => {
    onEpisodeSelect(season, episode);
    navigate(`/watch/tv/${tvId}?season=${season}&episode=${episode}`);
  };

  const handleContinueWatching = () => {
    if (showProgress?.last_season_watched && showProgress?.last_episode_watched) {
      handleEpisodeSelect(
        Number(showProgress.last_season_watched),
        Number(showProgress.last_episode_watched)
      );
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 md:hidden",
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

          {showProgress && (
            <button
              onClick={handleContinueWatching}
              className="mx-4 mt-4 mb-2 px-4 py-3 bg-red-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
            >
              <ArrowRightCircle className="w-5 h-5" />
              Continue Watching
            </button>
          )}

          <div className="px-4 py-3 border-b border-border-light dark:border-border-dark">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {seasons.map((season) => (
                <option key={season.season_number} value={season.season_number}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {currentSeason?.episodes.map((episode) => {
              const episodeProgress = showProgress?.show_progress?.[`s${selectedSeason}e${episode.episode_number}`];
              const progress = episodeProgress?.progress?.watched / episodeProgress?.progress?.duration * 100 || 0;

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className="w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark relative"
                >
                  <div className="w-32 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden">
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
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium mb-1 truncate pr-2">
                      Episode {episode.episode_number}
                    </div>
                    <div className="text-sm text-light-text-primary dark:text-dark-text-primary font-medium mb-1 truncate">
                      {episode.name}
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
                  </div>
                  {progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-light-surface dark:bg-dark-surface">
                      <div
                        className="h-full bg-red-600 dark:bg-red-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
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

          {showProgress && (
            <button
              onClick={handleContinueWatching}
              className="mx-4 mt-4 mb-2 px-4 py-2 bg-red-600 text-white rounded flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
            >
              <ArrowRightCircle className="w-4 h-4" />
              Continue Watching
            </button>
          )}

          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="w-full px-3 py-2 bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {seasons.map((season) => (
                <option key={season.season_number} value={season.season_number}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {currentSeason?.episodes.map((episode) => {
              const episodeProgress = showProgress?.show_progress?.[`s${selectedSeason}e${episode.episode_number}`];
              const progress = episodeProgress?.progress?.watched / episodeProgress?.progress?.duration * 100 || 0;

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className="w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark relative"
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
                    <div className="font-medium">
                      {episode.name}
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
                  </div>
                  {progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-light-surface dark:bg-dark-surface">
                      <div
                        className="h-full bg-red- full bg-red-600 dark:bg-red-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
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