import React from 'react';
import { cn } from '../lib/utils';

interface WatchlistMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (status: 'watching' | 'planned' | 'completed') => void;
  onRemove: () => void;
  currentStatus?: 'watching' | 'planned' | 'completed';
}

const WatchlistMenu: React.FC<WatchlistMenuProps> = ({
  isOpen,
  onClose,
  onAdd,
  onRemove,
  currentStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-full mt-2 right-0 w-48 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-border-light dark:border-border-dark overflow-hidden z-50">
      {!currentStatus ? (
        <div className="py-1">
          <button
            onClick={() => onAdd('watching')}
            className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2 group transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 group-hover:scale-110 transition-transform" />
            <div>
              <div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">Currently Watching</div>
              <div className="text-xs text-gray-500 dark:text-dark-text-secondary">Track your progress</div>
            </div>
          </button>
          <button
            onClick={() => onAdd('planned')}
            className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2 group transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-purple-500 group-hover:scale-110 transition-transform" />
            <div>
              <div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">Plan to Watch</div>
              <div className="text-xs text-gray-500 dark:text-dark-text-secondary">Save for later</div>
            </div>
          </button>
          <button
            onClick={() => onAdd('completed')}
            className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2 group transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-green-500 group-hover:scale-110 transition-transform" />
            <div>
              <div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">Completed</div>
              <div className="text-xs text-gray-500 dark:text-dark-text-secondary">Mark as finished</div>
            </div>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border-light dark:divide-border-dark">
          <div className="px-4 py-3">
            <div className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide font-medium">
              Current Status
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className={cn(
                "w-2 h-2 rounded-full",
                currentStatus === 'watching' && "bg-blue-500",
                currentStatus === 'planned' && "bg-purple-500",
                currentStatus === 'completed' && "bg-green-500"
              )} />
              <div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                {currentStatus === 'watching' && "Currently Watching"}
                {currentStatus === 'planned' && "Plan to Watch"}
                {currentStatus === 'completed' && "Completed"}
              </div>
            </div>
          </div>
          
          <div className="py-1">
            <button
              onClick={() => onAdd('watching')}
              className={cn(
                "w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors",
                currentStatus === 'watching' ? "text-blue-600 dark:text-blue-500 font-medium" : "text-light-text-primary dark:text-dark-text-primary"
              )}
            >
              Set as Watching
            </button>
            <button
              onClick={() => onAdd('planned')}
              className={cn(
                "w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors",
                currentStatus === 'planned' ? "text-purple-600 dark:text-purple-500 font-medium" : "text-light-text-primary dark:text-dark-text-primary"
              )}
            >
              Set as Plan to Watch
            </button>
            <button
              onClick={() => onAdd('completed')}
              className={cn(
                "w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors",
                currentStatus === 'completed' ? "text-green-600 dark:text-green-500 font-medium" : "text-light-text-primary dark:text-dark-text-primary"
              )}
            >
              Set as Completed
            </button>
          </div>

          <div className="py-1">
            <button
              onClick={onRemove}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-500 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
            >
              Remove from Watchlist
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchlistMenu;