import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  Bookmark, 
  Plus,
  Server,
  X,
  Star
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Source } from '../lib/sources';
import { WatchStatus } from '../store/useStore';
import { getImageUrl } from '../api/config';

interface WatchMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceChange: (sourceId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onAddToWatchlist: (status: WatchStatus) => void;
  onRemoveFromWatchlist: () => void;
  sources: Source[];
  selectedSource: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  releaseYear: number;
  rating: number;
  season?: number;
  episode?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  watchlistStatus?: WatchStatus;
  seasons?: {
    season_number: number;
    name: string;
    episodes: {
      episode_number: number;
      name: string;
      overview: string;
      still_path: string;
    }[];
  }[];
  onEpisodeSelect?: (season: number, episode: number) => void;
}

const WatchMenu: React.FC<WatchMenuProps> = ({
  isOpen,
  onClose,
  onSourceChange,
  onPrevious,
  onNext,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  sources,
  selectedSource,
  mediaType,
  title,
  posterPath,
  releaseYear,
  rating,
  season,
  episode,
  totalSeasons,
  totalEpisodes,
  watchlistStatus,
  seasons,
  onEpisodeSelect,
}) => {
  const [selectedSeason, setSelectedSeason] = React.useState(season || 1);
  const [isWatchlistOpen, setIsWatchlistOpen] = React.useState(false);
  const currentSeason = seasons?.find(s => s.season_number === selectedSeason);

  const handleEpisodeSelect = (season: number, episode: number) => {
    onEpisodeSelect?.(season, episode);
    onClose();
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

      {/* Menu */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 w-full md:w-96 bg-white z-50 transition-transform duration-300 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-start gap-4">
          <div className="w-16 aspect-[2/3] flex-shrink-0">
            <img
              src={getImageUrl(posterPath, 'w185')}
              alt={title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-medium truncate">{title}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                  <span>{releaseYear}</span>
                  <div className="flex items-center">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="ml-0.5">{rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {mediaType === 'tv' && season && episode && (
              <div className="mt-2 text-sm">
                Season {season}, Episode {episode}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Sources */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
              <Server className="w-4 h-4" />
              Sources
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => onSourceChange(source.id)}
                  className={cn(
                    "px-3 py-2 text-sm rounded transition-colors text-left",
                    selectedSource === source.id
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {source.name}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          {mediaType === 'tv' && (
            <div className="p-4 border-b">
              <div className="flex gap-2">
                <button
                  onClick={onPrevious}
                  disabled={season === 1 && episode === 1}
                  className="flex-1 px-4 py-2 bg-gray-100 rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={onNext}
                  disabled={season === totalSeasons && episode === totalEpisodes}
                  className="flex-1 px-4 py-2 bg-gray-100 rounded flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Watchlist */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <Bookmark className="w-4 h-4" />
                Watchlist
              </div>
              <div className="relative">
                {watchlistStatus ? (
                  <button
                    onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                    className="p-1.5 bg-gray-100 rounded-full"
                  >
                    <Bookmark className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                    className="p-1.5 hover:bg-gray-100 rounded-full"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}

                {isWatchlistOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border overflow-hidden">
                    {!watchlistStatus ? (
                      <>
                        <button
                          onClick={() => {
                            onAddToWatchlist('watching');
                            setIsWatchlistOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          Currently Watching
                        </button>
                        <button
                          onClick={() => {
                            onAddToWatchlist('planned');
                            setIsWatchlistOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                          Plan to Watch
                        </button>
                        <button
                          onClick={() => {
                            onAddToWatchlist('completed');
                            setIsWatchlistOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          Completed
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="px-4 py-2 border-b">
                          <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                            Current Status
                          </div>
                          <div className="text-sm font-medium capitalize mt-0.5">
                            {watchlistStatus === 'planned' ? 'Plan to Watch' : watchlistStatus}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            onAddToWatchlist('watching');
                            setIsWatchlistOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          Set as Watching
                        </button>
                        <button
                          onClick={() => {
                            onAddToWatchlist('planned');
                            setIsWatchlistOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          Set as Plan to Watch
                        </button>
                        <button
                          onClick={() => {
                            onAddToWatchlist('completed');
                            setIsWatchlistOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          Set as Completed
                        </button>
                        <div className="border-t">
                          <button
                            onClick={() => {
                              onRemoveFromWatchlist();
                              setIsWatchlistOpen(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                          >
                            Remove from Watchlist
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Episodes */}
          {mediaType === 'tv' && seasons && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Episodes</h3>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                  className="px-3 py-1.5 text-sm bg-gray-100 rounded"
                >
                  {seasons.map((season) => (
                    <option key={season.season_number} value={season.season_number}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                {currentSeason?.episodes.map((episode) => (
                  <button
                    key={episode.episode_number}
                    onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                    className="w-full flex gap-4 hover:bg-gray-50 p-2 -mx-2 rounded"
                  >
                    <div className="w-32 aspect-video bg-gray-100 flex-shrink-0 rounded overflow-hidden">
                      {episode.still_path ? (
                        <img
                          src={getImageUrl(episode.still_path, 'w300')}
                          alt={episode.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-medium mb-1">
                        Episode {episode.episode_number}
                      </div>
                      <div className="text-sm text-gray-900 font-medium mb-1 truncate">
                        {episode.name}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {episode.overview}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default WatchMenu;