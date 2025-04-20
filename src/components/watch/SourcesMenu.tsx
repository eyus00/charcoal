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
          'fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ease-in-out',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ease-in-out',
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <div className="bg-light-bg dark:bg-dark-bg border border-gray-400/50 dark:border-white/20 rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-gray-400/50 dark:border-white/20">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-white" />
              <h3 className="text-lg font-semibold text-white">
                Select Source
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 dark:bg-dark-surface hover:bg-white/20 dark:hover:bg-dark-surface/80 rounded-lg border border-gray-400/50 dark:border-white/20 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto">
            <div className="space-y-2">
              {SOURCES.map((source) => (
                <button
                  key={source.id}
                  onClick={() => {
                    onSourceSelect(source.id);
                    onClose();
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-400/50 dark:border-white/20 transition-all duration-200 backdrop-blur-sm relative',
                    'hover:bg-white/10 dark:hover:bg-dark-surface/80 hover:border-red-600 dark:hover:border-red-500',
                    selectedSource === source.id
                      ? 'bg-red-600/10 dark:bg-red-500/10 after:content-[""] after:absolute after:left-0 after:top-0 after:h-full after:w-1 after:bg-red-600 dark:after:bg-red-500 after:rounded-l-lg'
                      : 'bg-white/10 dark:bg-dark-surface text-white'
                  )}
                >
                  <span className="font-medium text-sm text-white">{source.name}</span>
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full transition-all duration-200',
                      selectedSource === source.id
                        ? 'bg-red-600 dark:bg-red-500 ring-2 ring-red-600/50 dark:ring-red-500/50'
                        : 'border-2 border-gray-400/50 dark:border-white/20'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SourcesMenu;