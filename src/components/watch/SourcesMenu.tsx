import React from 'react';
import { Server, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SOURCES } from '../../lib/sources';

interface SourcesMenuProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSource: string;
  onSourceSelect: (sourceId: string) => void;
}

const SourcesMenu: React.FC<SourcesMenuProps> = ({
  isOpen,
  onClose,
  selectedSource,
  onSourceSelect,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[100] transition-opacity duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-[100] bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 md:max-w-md md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:rounded-lg shadow-xl border-2 border-gray-400/50 dark:border-white/20">
        <div className="flex flex-col">
          <div className="p-4 border-b border-gray-400/50 dark:border-white/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Select Source</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-light-surface/80 dark:bg-dark-surface hover:bg-light-surface dark:hover:bg-dark-surface/80 rounded-md border border-gray-400/50 dark:border-white/20 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[60vh] md:max-h-[400px]">
            {SOURCES.map((source, index) => (
              <div key={source.id}>
                <button
                  onClick={() => onSourceSelect(source.id)}
                  className={cn(
                    "w-full px-4 py-4 hover:bg-light-surface dark:hover:bg-dark-surface/80 flex items-center justify-between group relative",
                    selectedSource === source.id && "bg-red-600/10 dark:bg-red-500/10 after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500"
                  )}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className={cn(
                      "font-medium",
                      selectedSource === source.id && "text-red-600 dark:text-red-500"
                    )}>
                      {source.name}
                    </span>
                    {source.id === 'vidlink.pro' && (
                      <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className={cn(
                    "w-3 h-3 rounded-full border-2 transition-colors",
                    selectedSource === source.id 
                      ? "bg-red-600 border-red-600 dark:bg-red-500 dark:border-red-500" 
                      : "border-light-text-secondary/50 dark:border-white/50"
                  )} />
                </button>
                {index < SOURCES.length - 1 && (
                  <div className="border-b border-gray-400/50 dark:border-white/20" />
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