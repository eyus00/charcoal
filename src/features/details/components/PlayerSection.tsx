import React, { useRef, useEffect } from 'react';
import { Server, ChevronLeft, ChevronRight, Play, ChevronDown, List, X } from 'lucide-react';
import { SOURCES } from '../../../lib/sources';
import { getImageUrl } from '../../../api/config';
import { cn } from '../../../lib/utils';
import SourcesMenu from '../../../components/watch/SourcesMenu';
import { useStore } from '../../../store/useStore';

interface PlayerSectionProps {
  videoUrl: string;
  selectedSource: string;
  onSourceSelect: (source: string) => void;
  movieTitle?: string;
  seasons?: {
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
  currentSeason?: number;
  currentEpisode?: number;
  onEpisodeSelect?: (season: number, episode: number) => void;
}

const PlayerSection: React.FC<PlayerSectionProps> = ({
  videoUrl,
  selectedSource,
  onSourceSelect,
  movieTitle,
  seasons,
  currentSeason = 1,
  currentEpisode = 1,
  onEpisodeSelect,
}) => {
  const [isSourcesOpen, setIsSourcesOpen] = React.useState(false);
  const [isEpisodesOpen, setIsEpisodesOpen] = React.useState(false);
  const [selectedSeason, setSelectedSeason] = React.useState(currentSeason);
  const [playerHeight, setPlayerHeight] = React.useState(0);
  const playerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const episodeMenuRef = useRef<HTMLDivElement>(null);
  const { sidebarOpen } = useStore();

  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);
  const currentEpisodeData = currentSeasonData?.episodes.find(e => e.episode_number === currentEpisode);

  useEffect(() => {
    const updatePlayerHeight = () => {
      if (playerRef.current && containerRef.current) {
        setPlayerHeight(playerRef.current.offsetHeight);
        containerRef.current.style.width = '100%';
        void containerRef.current.offsetWidth;
      }
    };

    updatePlayerHeight();

    const observer = new ResizeObserver(() => {
      updatePlayerHeight();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('resize', updatePlayerHeight);

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
      window.removeEventListener('resize', updatePlayerHeight);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        episodeMenuRef.current &&
        !episodeMenuRef.current.contains(event.target as Node) &&
        isEpisodesOpen
      ) {
        setIsEpisodesOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEpisodesOpen]);

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    onEpisodeSelect?.(season, episode);
    setIsEpisodesOpen(false);
  };

  const handlePrevious = () => {
    if (currentEpisode > 1) {
      handleEpisodeSelect(currentSeason, currentEpisode - 1);
    } else if (currentSeason > 1) {
      const prevSeason = seasons?.find(s => s.season_number === currentSeason - 1);
      if (prevSeason) {
        handleEpisodeSelect(currentSeason - 1, prevSeason.episodes.length);
      }
    }
  };

  const handleNext = () => {
    const currentSeasonData = seasons?.find(s => s.season_number === currentSeason);
    if (currentSeasonData && currentEpisode < currentSeasonData.episodes.length) {
      handleEpisodeSelect(currentSeason, currentEpisode + 1);
    } else if (currentSeason < (seasons?.length || 0)) {
      handleEpisodeSelect(currentSeason + 1, 1);
    }
  };

  const displayTitle = seasons && currentEpisodeData 
    ? `${currentEpisodeData.episode_number}. ${currentEpisodeData.name}`
    : movieTitle || 'Movie';

  return (
    <div className="bg-light-bg dark:bg-dark-bg border border-gray-400/50 dark:border-white/20 rounded-lg overflow-hidden" ref={containerRef}>
      <div className="relative">
        <div className="flex-1 relative" ref={playerRef}>
          <div className="aspect-video">
            <iframe
              key={videoUrl}
              src={videoUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
          <div className="flex items-center justify-between gap-3 p-2 bg-light-bg dark:bg-dark-bg border-t border-gray-400/50 dark:border-white/20 backdrop-blur-sm">
            <button
              onClick={() => setIsSourcesOpen(true)}
              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md flex items-center gap-2 transition-all duration-200 border border-white/20 hover:border-red-500"
            >
              <Server className="w-4 h-4" />
              <span className="font-medium text-sm">Source</span>
            </button>
            <div className="flex items-center justify-center gap-2 flex-1">
              {seasons && (
                <button
                  onClick={handlePrevious}
                  disabled={currentSeason === 1 && currentEpisode === 1}
                  className="p-2 bg-white/10 dark:bg-dark-surface hover:bg-white/20 dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous Episode"
                >
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
              )}
              <span className="text-white font-medium text-sm truncate max-w-[300px] text-center">
                {displayTitle}
              </span>
              {seasons && (
                <button
                  onClick={handleNext}
                  disabled={currentSeason === seasons.length && currentEpisode === currentSeasonData?.episodes.length}
                  className="p-2 bg-white/10 dark:bg-dark-surface hover:bg-white/20 dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next Episode"
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
            {seasons && (
              <button
                onClick={() => setIsEpisodesOpen(!isEpisodesOpen)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-200 border border-white/20 hover:border-red-500"
              >
                <List className="w-4 h-4" />
                <span className="font-medium text-sm">Episodes</span>
              </button>
            )}
          </div>
        </div>

        {seasons && (
          <div
            ref={episodeMenuRef}
            className={cn(
              "absolute right-4 bottom-14 h-[60%] w-[min(400px,80vw)] bg-light-bg dark:bg-dark-bg border border-gray-400/50 dark:border-white/20 rounded-md transition-transform duration-300 z-20 shadow-xl",
              isEpisodesOpen ? "translate-x-0" : "translate-x-[calc(100%+16px)]",
              "md:w-[min(400px,50vw)]",
              "bottom-14 top-auto h-[70vh] w-[calc(100%-16px)] mx-2 rounded-md md:h-[60%] md:mx-0 md:w-[min(400px,50vw)] md:rounded-md md:bottom-14 md:top-auto",
              isEpisodesOpen ? "md:translate-y-0 translate-y-0" : "md:translate-y-0 translate-y-full"
            )}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 flex items-center justify-between border-b border-gray-400/50 dark:border-white/20">
                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-white" />
                  <h3 className="text-lg font-semibold text-white">Select Episode</h3>
                </div>
                <button
                  onClick={() => setIsEpisodesOpen(false)}
                  className="p-2 bg-white/10 dark:bg-dark-surface hover:bg-white/20 dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 border-b border-gray-400/50 dark:border-white/20">
                <div className="relative">
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      const newSeason = parseInt(e.target.value);
                      setSelectedSeason(newSeason);
                      handleEpisodeSelect(newSeason, 1);
                    }}
                    className="w-full px-4 py-2.5 bg-white/10 dark:bg-dark-surface hover:bg-white/20 dark:hover:bg-dark-surface/80 hover:border-red-600 dark:hover:border-red-500 border border-gray-400/50 dark:border-white/20 rounded-md text-white appearance-none focus:outline-none transition-all pr-10"
                  >
                    {seasons.map((season) => (
                      <option
                        key={season.season_number}
                        value={season.season_number}
                        className="bg-light-bg dark:bg-dark-bg text-white"
                      >
                        {season.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white pointer-events-none" />
                </div>
              </div>

              {/* Episode List */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <div className="space-y-0">
                  {currentSeasonData?.episodes.map((episode, index) => {
                    const duration = formatDuration(episode.runtime);
                    const isCurrent = selectedSeason === currentSeason && episode.episode_number === currentEpisode;
                    const isLast = index === (currentSeasonData?.episodes.length || 0) - 1;

                    return (
                      <button
                        key={episode.episode_number}
                        onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                        className={cn(
                          "w-full px-4 py-4 hover:bg-white/10 dark:hover:bg-dark-surface/80 flex gap-4 group relative",
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
                              <Play className="w-4 h-4 text-white scale-100 group-hover:scale-110 transition-transform" />
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "font-medium truncate max-w-[200px] text-white",
                              isCurrent && "text-red-600 dark:text-red-500"
                            )}>
                              {episode.episode_number}. {episode.name}
                            </span>
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
          </div>
        )}
      </div>

      <SourcesMenu
        isOpen={isSourcesOpen}
        onClose={() => setIsSourcesOpen(false)}
        selectedSource={selectedSource}
        onSourceSelect={(source) => {
          onSourceSelect(source);
          setIsSourcesOpen(false);
        }}
      />
    </div>
  );
};

export default PlayerSection;