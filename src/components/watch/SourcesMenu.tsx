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
          "fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "absolute z-50 w-72 bg-black/90 border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md",
          isLandscape ? "top-full right-0 mt-2" : "bottom-full right-0 mb-2"
        )}
      >
        <div className="flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-bold text-white">Sources</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-all active:scale-95"
              aria-label="Close"
              title="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="overflow-y-auto scrollbar-thin max-h-[320px] p-2">
            <div className="space-y-1">
              {SOURCES.map((source) => (
                <button
                  key={source.id}
                  onClick={() => onSourceSelect(source.id)}
                  className={cn(
                    "w-full px-4 py-3 rounded-lg flex items-center justify-between transition-all",
                    selectedSource === source.id
                      ? "bg-accent/20 border border-accent/50 text-accent hover:bg-accent/30"
                      : "bg-white/5 border border-transparent hover:bg-white/10 text-white"
                  )}
                >
                  <div className="flex flex-col items-start gap-1 flex-1">
                    <span className="font-semibold">
                      {source.name}
                    </span>
                    {source.id === 'vidlink.pro' && (
                      <span className="text-xs text-accent/70 font-medium uppercase">Recommended</span>
                    )}
                  </div>
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ml-2 transition-colors",
                    selectedSource === source.id
                      ? "bg-accent border-accent"
                      : "border-white/30"
                  )} />
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
