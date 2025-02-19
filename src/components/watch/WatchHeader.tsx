import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bookmark, Server, List } from 'lucide-react';
import { WatchStatus } from '../../store/useStore';
import { cn } from '../../lib/utils';

interface WatchHeaderProps {
  title: string | undefined;
  mediaType: string;
  season?: string | null;
  episode?: string | null;
  backUrl: string;
  watchlistItem?: {
    status: WatchStatus;
  };
  onWatchlistAdd: (status: WatchStatus) => void;
  onWatchlistRemove: () => void;
  onSourcesOpen: () => void;
  onEpisodesOpen: () => void;
}

const WatchHeader: React.FC<WatchHeaderProps> = ({
  title,
  mediaType,
  season,
  episode,
  backUrl,
  watchlistItem,
  onWatchlistAdd,
  onWatchlistRemove,
  onSourcesOpen,
  onEpisodesOpen,
}) => {
  const [isWatchlistOpen, setIsWatchlistOpen] = React.useState(false);

  return (
    <div className={cn(
      "fixed z-20 h-14 bg-black/90 backdrop-blur-sm flex items-center px-4",
      "md:top-0 md:bottom-auto md:left-0 md:right-0", // Desktop: Top
      "top-auto bottom-0 left-0 right-0", // Mobile: Bottom
    )}>
      <Link
        to={backUrl}
        className="p-2 text-white/80 hover:text-white -ml-2"
      >
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <div className="flex items-center gap-4 ml-2">
        <h1 className="text-white font-medium truncate">
          {title || 'Loading...'}
          {mediaType === 'tv' && season && episode && (
            <span className="text-white/60">
              {' '}
              • S{season}:E{episode}
            </span>
          )}
        </h1>
        {title && (
          <div className="flex items-center gap-2">
            <div className="relative">
              {watchlistItem ? (
                <button
                  onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                >
                  <Bookmark className="w-4 h-4 text-white fill-white" />
                </button>
              ) : (
                <button
                  onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Bookmark className="w-4 h-4 text-white" />
                </button>
              )}

              {isWatchlistOpen && (
                <div className="absolute bottom-full right-0 mb-1 w-48 bg-white rounded-lg shadow-lg border overflow-hidden">
                  {!watchlistItem ? (
                    <>
                      <button
                        onClick={() => {
                          onWatchlistAdd('watching');
                          setIsWatchlistOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        Currently Watching
                      </button>
                      <button
                        onClick={() => {
                          onWatchlistAdd('planned');
                          setIsWatchlistOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        Plan to Watch
                      </button>
                      <button
                        onClick={() => {
                          onWatchlistAdd('completed');
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
                          {watchlistItem.status === 'planned' ? 'Plan to Watch' : watchlistItem.status}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          onWatchlistAdd('watching');
                          setIsWatchlistOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        Set as Watching
                      </button>
                      <button
                        onClick={() => {
                          onWatchlistAdd('planned');
                          setIsWatchlistOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        Set as Plan to Watch
                      </button>
                      <button
                        onClick={() => {
                          onWatchlistAdd('completed');
                          setIsWatchlistOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        Set as Completed
                      </button>
                      <div className="border-t">
                        <button
                          onClick={() => {
                            onWatchlistRemove();
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
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onSourcesOpen}
          className="p-2 text-white/80 hover:text-white"
        >
          <Server className="w-5 h-5" />
        </button>
        {mediaType === 'tv' && (
          <button
            onClick={onEpisodesOpen}
            className="p-2 text-white/80 hover:text-white -mr-2"
          >
            <List className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default WatchHeader;