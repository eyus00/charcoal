import React from 'react';
import { ArrowLeft, Home, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavigationBarProps {
  currentPath: string;
  setCurrentPath: (path: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateHome: () => void;
  refetchDirectory: () => void;
  openLinkInNewTab: () => void;
  handleManualPathSubmit: (e: React.FormEvent) => void;
  linkInputRef: React.RefObject<HTMLInputElement>;
  canGoBack: boolean;
  canGoForward: boolean;
}

const NavigationBar: React.FC<NavigationBarProps> = ({
  currentPath,
  setCurrentPath,
  navigateBack,
  navigateForward,
  navigateHome,
  refetchDirectory,
  openLinkInNewTab,
  handleManualPathSubmit,
  linkInputRef,
  canGoBack,
  canGoForward,
}) => {
  return (
    <div className="p-3 border-b border-border-light dark:border-border-dark">
      <form onSubmit={handleManualPathSubmit} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border-light dark:border-border-dark rounded-lg overflow-hidden">
            <button 
              type="button"
              onClick={navigateBack}
              disabled={!canGoBack}
              className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface disabled:opacity-50 disabled:cursor-not-allowed"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
            <button 
              type="button"
              onClick={navigateForward}
              disabled={!canGoForward}
              className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface disabled:opacity-50 disabled:cursor-not-allowed"
              title="Forward"
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </button>
            <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
            <button 
              type="button"
              onClick={navigateHome}
              className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface"
              title="Home"
            >
              <Home className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
            <button 
              type="button"
              onClick={refetchDirectory}
              className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          
          <button
            type="button"
            onClick={openLinkInNewTab}
            className="p-2 border border-border-light dark:border-border-dark rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            ref={linkInputRef}
            type="text"
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Enter path..."
          />
          <button
            type="submit"
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Go
          </button>
        </div>
      </form>
    </div>
  );
};

export default NavigationBar;