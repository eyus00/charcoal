import React from 'react';
import { cn } from '../lib/utils';

interface WatchlistMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (status: 'watching' | 'planned' | 'completed') => void;
  onRemove: () => void;
  currentStatus?: 'watching' | 'planned' | 'completed';
  containerRef?: React.RefObject<HTMLDivElement>;
  position?: 'top-right' | 'top-left';
}

const WatchlistMenu: React.FC<WatchlistMenuProps> = ({
  isOpen,
  onClose,
  onAdd,
  onRemove,
  currentStatus,
  containerRef,
  position = 'top-right',
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      <div 
        className={cn(
          "absolute z-50 w-40 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-border-light dark:border-border-dark overflow-hidden",
          position === 'top-right' && "right-0 bottom-full mb-1",
          position === 'top-left' && "left-0 bottom-full mb-1"
        )}
        ref={containerRef}
      >
        {!currentStatus ? (
          <div className="py-1">
            <button
              onClick={() => onAdd('watching')}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2 group transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm">Currently Watching</span>
            </button>
            <button
              onClick={() => onAdd('planned')}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2 group transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-sm">Plan to Watch</span>
            </button>
            <button
              onClick={() => onAdd('completed')}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-bg flex items-center gap-2 group transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm">Completed</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border-light dark:divide-border-dark">
            <div className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  currentStatus === 'watching' && "bg-blue-500",
                  currentStatus === 'planned' && "bg-purple-500",
                  currentStatus === 'completed' && "bg-green-500"
                )} />
                <span className="text-sm font-medium">
                  {currentStatus === 'watching' && "Currently Watching"}
                  {currentStatus === 'planned' && "Plan to Watch"}
                  {currentStatus === 'completed' && "Completed"}
                </span>
              </div>
            </div>
            
            <div className="py-1">
              <button
                onClick={() => onAdd('watching')}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors",
                  currentStatus === 'watching' ? "text-blue-600 dark:text-blue-500 font-medium" : "text-light-text-primary dark:text-dark-text-primary"
                )}
              >
                Set as Watching
              </button>
              <button
                onClick={() => onAdd('planned')}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors",
                  currentStatus === 'planned' ? "text-purple-600 dark:text-purple-500 font-medium" : "text-light-text-primary dark:text-dark-text-primary"
                )}
              >
                Set as Plan to Watch
              </button>
              <button
                onClick={() => onAdd('completed')}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors",
                  currentStatus === 'completed' ? "text-green-600 dark:text-green-500 font-medium" : "text-light-text-primary dark:text-dark-text-primary"
                )}
              >
                Set as Completed
              </button>
            </div>

            <div className="py-1">
              <button
                onClick={onRemove}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-500 hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
              >
                Remove from Watchlist
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default WatchlistMenu;