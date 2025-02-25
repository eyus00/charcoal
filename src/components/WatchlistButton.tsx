import React, { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { WatchStatus } from '../store/useStore';
import { cn } from '../lib/utils';

interface WatchlistButtonProps {
  watchlistItem?: {
    status: WatchStatus;
  };
  onAdd: (status: WatchStatus) => void;
  onRemove: () => void;
  darkMode?: boolean;
  duration?: number;
}

const WatchlistButton: React.FC<WatchlistButtonProps> = ({
  watchlistItem,
  onAdd,
  onRemove,
  darkMode = false,
  duration,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  return (
    <div className="relative">
      {watchlistItem ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={darkMode 
            ? "p-1.5 bg-white/10 hover:bg-white/20 transition-colors" 
            : "p-1.5 bg-light-surface dark:bg-dark-surface hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-full transition-colors"
          }
        >
          <Bookmark className={darkMode 
            ? "w-5 h-5 text-white fill-white" 
            : "w-5 h-5 fill-current"
          } />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={darkMode 
            ? "p-1.5 hover:bg-white/10 transition-colors" 
            : "p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          }
        >
          <Bookmark className={darkMode ? "w-5 h-5 text-white" : "w-5 h-5"} />
        </button>
      )}

      {isOpen && (
        <div className={cn(
          "absolute w-48 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-border-light dark:border-border-dark overflow-hidden z-50",
          isMobile ? "bottom-full right-0 mb-2" : "top-full right-0 mt-1"
        )}>
          {!watchlistItem ? (
            <>
              <button
                onClick={() => {
                  onAdd('watching');
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Currently Watching
              </button>
              <button
                onClick={() => {
                  onAdd('planned');
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                Plan to Watch
              </button>
              <button
                onClick={() => {
                  onAdd('completed');
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Completed
              </button>
            </>
          ) : (
            <>
              <div className="px-4 py-2 border-b border-border-light dark:border-border-dark">
                <div className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide font-medium">
                  Current Status
                </div>
                <div className="text-sm font-medium capitalize mt-0.5 text-light-text-primary dark:text-dark-text-primary">
                  {watchlistItem.status === 'planned' ? 'Plan to Watch' : watchlistItem.status}
                </div>
              </div>
              <button
                onClick={() => {
                  onAdd('watching');
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg text-light-text-primary dark:text-dark-text-primary"
              >
                Set as Watching
              </button>
              <button
                onClick={() => {
                  onAdd('planned');
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg text-light-text-primary dark:text-dark-text-primary"
              >
                Set as Plan to Watch
              </button>
              <button
                onClick={() => {
                  onAdd('completed');
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg text-light-text-primary dark:text-dark-text-primary"
              >
                Set as Completed
              </button>
              <div className="border-t border-border-light dark:border-border-dark">
                <button
                  onClick={() => {
                    onRemove();
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-500 hover:bg-gray-50 dark:hover:bg-dark-bg"
                >
                  Remove from Watchlist
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default WatchlistButton;