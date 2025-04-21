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
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200",
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
        <div className="flex flex-col">
          <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-light-text-primary dark:text-white" />
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-white">Select Source</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-light-surface dark:bg-white/10 hover:bg-light-text-secondary/10 dark:hover:bg-white/20 rounded-md border border-border-light dark:border-white/20 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-light-text-primary dark:text-white" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[60vh]">
            {SOURCES.map((source, index) => (
              <div key={source.id}>
                <button
                  onClick={() => onSourceSelect(source.id)}
                  className={cn(
                    "w-full px-4 py-4 hover:bg-light-surface dark:hover:bg-white/10 flex items-center justify-between group relative",
                    selectedSource === source.id && "bg-red-600/10 dark:bg-red-500/10 after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500"
                  )}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className={cn(
                      "font-medium text-light-text-primary dark:text-white",
                      selectedSource === source.id && "text-red-600 dark:text-red-500"
                    )}>
                      {source.name}
                    </span>
                    {source.id === 'vidlink.pro' && (
                      <span className="text-xs text-light-text-primary dark:text-white opacity-50">Recommended</span>
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
                  <div className="border-t border-border-light dark:border-border-dark mx-4" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Menu */}
      <div
        className={cn(
          "absolute bottom-full right-0 mb-2 w-64 bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-xl overflow-hidden hidden md:block"
        )}
      >
        <div className="flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-border-light dark:border-border-dark">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-light-text-primary dark:text-white" />
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-white">Select Source</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-light-surface dark:bg-white/10 hover:bg-light-text-secondary/10 dark:hover:bg-white/20 rounded-md border border-border-light dark:border-white/20 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-light-text-primary dark:text-white" />
            </button>
          </div>

          <div className="overflow-y-auto scrollbar-thin max-h-[300px]">
            {SOURCES.map((source, index) => (
              <div key={source.id}>
                <button
                  onClick={() => onSourceSelect(source.id)}
                  className={cn(
                    "w-full px-4 py-3 hover:bg-light-surface dark:hover:bg-white/10 flex items-center justify-between group relative",
                    selectedSource === source.id && "bg-red-600/10 dark:bg-red-500/10 after:content-[''] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500"
                  )}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className={cn(
                      "font-medium text-light-text-primary dark:text-white",
                      selectedSource === source.id && "text-red-600 dark:text-red-500"
                    )}>
                      {source.name}
                    </span>
                    {source.id === 'vidlink.pro' && (
                      <span className="text-xs text-light-text-primary dark:text-white opacity-50">Recommended</span>
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
                  <div className="border-t border-border-light dark:border-border-dark mx-4" />
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