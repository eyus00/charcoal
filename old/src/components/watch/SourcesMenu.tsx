import React from 'react';
import { Server, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SOURCES } from '../../lib/sources';

interface SourcesMenuProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSource: string;
  onSourceSelect: (sourceId: string) => void;
  isLandscape?: boolean;
}

const SourcesMenu: React.FC<SourcesMenuProps> = ({
  isOpen,
  onClose,
  selectedSource,
  onSourceSelect,
  isLandscape,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "absolute z-50 w-64 bg-light-bg dark:bg-dark-bg border border-gray-400/50 dark:border-white/20 rounded-lg shadow-xl overflow-hidden",
          isLandscape ? "top-full right-0 mt-2" : "bottom-full right-0 mb-2"
        )}
      >
        <div className="flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-gray-400/50 dark:border-white/20">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-white" />
              <h3 className="text-lg font-semibold text-white">Select Source</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 dark:bg-dark-surface hover:bg-white/20 dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="overflow-y-auto scrollbar-thin max-h-[300px]">
            {SOURCES.map((source, index) => (
              <div key={source.id}>
                <button
                  onClick={() => onSourceSelect(source.id)}
                  className={cn(
                    "w-full px-4 py-3 hover:bg-white/10 dark:hover:bg-dark-surface/80 flex items-center justify-between group relative",
                    selectedSource === source.id && "bg-red-600/10 dark:bg-red-500/10 after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500"
                  )}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className={cn(
                      "font-medium text-white",
                      selectedSource === source.id && "text-red-600 dark:text-red-500"
                    )}>
                      {source.name}
                    </span>
                    {source.id === 'vidlink.pro' && (
                      <span className="text-xs text-white opacity-50">Recommended</span>
                    )}
                  </div>
                  <div className={cn(
                    "w-3 h-3 rounded-full border-2 transition-colors",
                    selectedSource === source.id 
                      ? "bg-red-600 border-red-600 dark:bg-red-500 dark:border-red-500" 
                      : "border-white/50"
                  )} />
                </button>
                {index < SOURCES.length - 1 && (
                  <div className="border-t border-gray-400/50 dark:border-white/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default SourcesMenu;