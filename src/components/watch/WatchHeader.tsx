import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Server, List } from 'lucide-react';
import { WatchStatus } from '../../store/useStore';
import { cn } from '../../lib/utils';
import WatchlistButton from '../WatchlistButton';

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
            <WatchlistButton
              watchlistItem={watchlistItem}
              onAdd={onWatchlistAdd}
              onRemove={onWatchlistRemove}
              darkMode={true}
            />
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