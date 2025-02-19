import React from 'react';
import { X, Server } from 'lucide-react';
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
          "fixed inset-x-0 bottom-0 z-50 bg-light-bg/95 dark:bg-dark-bg/95 backdrop-blur-md rounded-t-2xl transition-all duration-300 md:hidden",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="p-4 flex items-center justify-between border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Select Source</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
          {SOURCES.map((source) => (
            <button
              key={source.id}
              onClick={() => {
                onSourceSelect(source.id);
                onClose();
              }}
              className={cn(
                "relative px-4 py-3 rounded-lg transition-all text-left",
                "hover:bg-light-surface dark:hover:bg-dark-surface active:scale-95",
                selectedSource === source.id
                  ? "bg-red-50 dark:bg-red-500/10 text-red-900 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/20"
                  : "text-light-text-secondary dark:text-dark-text-secondary"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{source.name}</span>
                <div className={cn(
                  "w-4 h-4 rounded-full transition-colors",
                  selectedSource === source.id
                    ? "bg-red-600 dark:bg-red-500 ring-4 ring-red-100 dark:ring-red-500/20"
                    : "border-2 border-border-light dark:border-border-dark"
                )} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 w-72 bg-light-bg/95 dark:bg-dark-bg/95 backdrop-blur-md shadow-xl transform transition-all duration-300 z-50 hidden md:flex md:flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 flex items-center justify-between border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Select Source</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          {SOURCES.map((source) => (
            <button
              key={source.id}
              onClick={() => {
                onSourceSelect(source.id);
                onClose();
              }}
              className={cn(
                "relative w-full px-4 py-3.5 rounded-lg transition-all text-left group",
                "hover:bg-light-surface dark:hover:bg-dark-surface active:scale-95",
                selectedSource === source.id
                  ? "bg-red-50 dark:bg-red-500/10 text-red-900 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/20"
                  : "text-light-text-secondary dark:text-dark-text-secondary"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "font-medium transition-colors",
                  selectedSource === source.id
                    ? "text-red-900 dark:text-red-400"
                    : "text-light-text-primary dark:text-dark-text-primary group-hover:text-light-text-primary dark:group-hover:text-dark-text-primary"
                )}>
                  {source.name}
                </span>
                <div className={cn(
                  "w-4 h-4 rounded-full transition-colors",
                  selectedSource === source.id
                    ? "bg-red-600 dark:bg-red-500 ring-4 ring-red-100 dark:ring-red-500/20"
                    : "border-2 border-border-light dark:border-border-dark group-hover:border-light-text-secondary dark:group-hover:border-dark-text-secondary"
                )} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default SourcesMenu;