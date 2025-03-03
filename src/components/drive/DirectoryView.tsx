import React from 'react';
import { FolderOpen, Video, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FileItem } from '../../lib/drive';
import VideoFileItem from './VideoFileItem';

interface DirectoryViewProps {
  searchResults: string[];
  handleDirectorySelect: (dirName: string) => void;
  isShow: boolean | undefined;
  groupedVideoFiles: {[key: number]: FileItem[]};
  selectedEpisode: number | undefined;
  videoFiles: FileItem[];
  handleFileClick: (file: FileItem) => void;
  handleOpenInBrowser: (url: string) => void;
  handleOpenInOutPlayer: (url: string) => void;
  shouldShowDirectories: boolean;
  isManualSearch: boolean;
  currentPath: string;
  BASE_URL: string;
  filteredDirectories: string[];
  directories: FileItem[];
  files: FileItem[];
  searchQuery: string;
  refetchDirectory: () => void;
}

const DirectoryView: React.FC<DirectoryViewProps> = ({
  searchResults,
  handleDirectorySelect,
  isShow,
  groupedVideoFiles,
  selectedEpisode,
  videoFiles,
  handleFileClick,
  handleOpenInBrowser,
  handleOpenInOutPlayer,
  shouldShowDirectories,
  isManualSearch,
  currentPath,
  BASE_URL,
  filteredDirectories,
  directories,
  files,
  searchQuery,
  refetchDirectory
}) => {
  return (
    <div className="space-y-3">
      {/* Search Results Section */}
      {searchResults.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Search Results for "{searchQuery}"
          </h3>
          <div className="space-y-1.5">
            {searchResults.map((dirName, index) => (
              <button
                key={index}
                onClick={() => handleDirectorySelect(dirName)}
                className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
              >
                <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0 truncate">{dirName}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Files Section - Grouped by Episode */}
      {isShow && Object.keys(groupedVideoFiles).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Video Files {searchQuery && `matching "${searchQuery}"`}
          </h3>
          <div className="space-y-4">
            {Object.entries(groupedVideoFiles).map(([episodeNumStr, files]) => {
              const episodeNum = parseInt(episodeNumStr);
              const isSelectedEpisode = episodeNum === selectedEpisode;
              
              return (
                <div 
                  key={episodeNumStr} 
                  className={cn(
                    "rounded-lg overflow-hidden border",
                    isSelectedEpisode 
                      ? "border-red-500 dark:border-red-500" 
                      : "border-border-light dark:border-border-dark"
                  )}
                >
                  <div className={cn(
                    "px-3 py-2 font-medium text-sm",
                    isSelectedEpisode 
                      ? "bg-red-600/10 dark:bg-red-500/10 text-red-600 dark:text-red-500" 
                      : "bg-light-surface dark:bg-dark-surface"
                  )}>
                    {episodeNum > 0 ? `Episode ${episodeNum}` : 'Other Videos'}
                  </div>
                  <div className="divide-y divide-border-light dark:divide-border-dark">
                    {files.map((file, index) => (
                      <VideoFileItem 
                        key={index}
                        file={file}
                        onClick={() => handleFileClick(file)}
                        onOpenInBrowser={handleOpenInBrowser}
                        onOpenInOutPlayer={handleOpenInOutPlayer}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video Files Section - Non-grouped (for movies) */}
      {!isShow && videoFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Video Files {searchQuery && `matching "${searchQuery}"`}
          </h3>
          <div className="space-y-1.5">
            {videoFiles.map((file, index) => (
              <VideoFileItem 
                key={index}
                file={file}
                onClick={() => handleFileClick(file)}
                onOpenInBrowser={handleOpenInBrowser}
                onOpenInOutPlayer={handleOpenInOutPlayer}
                isCard={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Directories Section - Only show if no video files or in manual search mode */}
      {shouldShowDirectories && isManualSearch && (currentPath === `${BASE_URL}movies/` || currentPath === `${BASE_URL}tvs/`) ? (
        <div className={videoFiles.length > 0 ? "mt-4" : ""}>
          <h3 className="text-sm font-semibold mb-2">Folders</h3>
          <div className="space-y-1.5">
            {filteredDirectories.map((dirName, index) => (
              <button
                key={index}
                onClick={() => handleDirectorySelect(dirName)}
                className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
              >
                <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0 truncate">{dirName}</div>
              </button>
            ))}
          </div>
        </div>
      ) : shouldShowDirectories && directories.length > 0 && (
        <div className={videoFiles.length > 0 ? "mt-4" : ""}>
          <h3 className="text-sm font-semibold mb-2">Folders</h3>
          <div className="space-y-1.5">
            {directories.map((dir, index) => (
              <button
                key={index}
                onClick={() => handleFileClick(dir)}
                className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
              >
                <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0 truncate">{dir.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && searchResults.length === 0 && (
        <div className="text-center py-8">
          {isManualSearch ? (
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                Enter a search term to find {isShow ? 'TV shows' : 'movies'}
              </p>
              <p className="text-sm text-light-text-secondary/70 dark:text-dark-text-secondary/70">
                Example: {isShow ? '"Breaking Bad", "Game of Thrones"' : '"Inception", "Avengers"'}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                No files found in this directory
              </p>
              <button
                onClick={refetchDirectory}
                className="mt-4 px-4 py-2 bg-light-surface dark:bg-dark-surface hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-lg transition-colors flex items-center gap-2 mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DirectoryView;