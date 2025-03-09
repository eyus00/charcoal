import React from 'react';
import { FolderOpen, File, X, Loader2, AlertCircle, ExternalLink, ChevronDown, RefreshCw, Search, ArrowLeft, Home, History, Film, Video } from 'lucide-react';
import { cn } from '../lib/utils';
import { FileItem } from '../lib/drive';

interface DriveBrowserUIProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  files: FileItem[];
  currentPath: string;
  showLeftArrow: boolean;
  showRightArrow: boolean;
  searchQuery: string;
  showSearchHistory: boolean;
  searchHistory: string[];
  hasVideoFiles: boolean;
  filteredVideoFiles: FileItem[];
  filteredDirectories: string[];
  groupedVideoFiles: { [key: number]: FileItem[] };
  selectedSeason?: number;
  selectedEpisode?: number;
  showSeasonDropdown: boolean;
  showEpisodeDropdown: boolean;
  seasonOptions: { season_number: number; name: string }[];
  episodeCount: number;
  isManualSearch: boolean;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onNavigateHome: () => void;
  onRefreshDirectory: () => void;
  onOpenInNewTab: () => void;
  onSearchQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: () => void;
  onSearchHistorySelect: (query: string) => void;
  onSeasonSelect: (season: number) => void;
  onEpisodeSelect: (episode: number) => void;
  onDirectorySelect: (dirName: string) => void;
  onFileClick: (file: FileItem) => void;
  onOutPlayerClick: (url: string, e: React.MouseEvent) => void;
  onManualPathSubmit: (e: React.FormEvent) => void;
  onCurrentPathChange: (path: string) => void;
  onToggleManualSearch: () => void;
}

const DriveBrowserUI: React.FC<DriveBrowserUIProps> = ({
  isOpen,
  onClose,
  isLoading,
  error,
  files,
  currentPath,
  showLeftArrow,
  showRightArrow,
  searchQuery,
  showSearchHistory,
  searchHistory,
  hasVideoFiles,
  filteredVideoFiles,
  filteredDirectories,
  groupedVideoFiles,
  selectedSeason,
  selectedEpisode,
  showSeasonDropdown,
  showEpisodeDropdown,
  seasonOptions,
  episodeCount,
  isManualSearch,
  onNavigateBack,
  onNavigateForward,
  onNavigateHome,
  onRefreshDirectory,
  onOpenInNewTab,
  onSearchQueryChange,
  onSearch,
  onSearchHistorySelect,
  onSeasonSelect,
  onEpisodeSelect,
  onDirectorySelect,
  onFileClick,
  onOutPlayerClick,
  onManualPathSubmit,
  onCurrentPathChange,
  onToggleManualSearch
}) => {
  // Get file extension from filename
  const getFileExtension = (filename: string): string => {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : '';
  };

  // Get video quality from filename
  const getVideoQuality = (filename: string): string => {
    const qualityMatch = filename.match(/\b(720p|1080p|2160p|4K)\b/i);
    return qualityMatch ? qualityMatch[1].toUpperCase() : '';
  };

  // Get video source from filename
  const getVideoSource = (filename: string): string => {
    const sourceMatch = filename.match(/\b(BluRay|WEBDL|WEB-DL|WEBRip|HDRip|BRRip|DVDRip)\b/i);
    return sourceMatch ? sourceMatch[1].replace('WEBDL', 'WEB-DL') : '';
  };

  // Format file size for display
  const formatFileSize = (size: string | undefined): string => {
    if (!size) return 'Unknown size';
    
    // Check if it's already formatted (e.g., "1.5 GB")
    if (/^\d+(\.\d+)?\s*(KB|MB|GB|TB)/i.test(size)) {
      return size;
    }
    
    // Try to parse as a number
    const sizeNum = parseInt(size, 10);
    if (isNaN(sizeNum)) return size;
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let formattedSize = sizeNum;
    
    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024;
      unitIndex++;
    }
    
    return `${formattedSize.toFixed(2)} ${units[unitIndex]}`;
  };

  // Determine which directories to display
  const directoriesToDisplay = isManualSearch && (currentPath === "https://a.datadiff.us.kg/movies/" || currentPath === "https://a.datadiff.us.kg/tvs/")
    ? filteredDirectories
    : files.filter(file => file.isDirectory).map(dir => dir.name);

  // Determine if we should show the directories section
  const shouldShowDirectories = !hasVideoFiles || isManualSearch;

  // Determine if we should show the selected episode group at the top
  const hasSelectedEpisodeGroup = selectedEpisode && groupedVideoFiles[selectedEpisode]?.length > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 md:max-w-xl md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:rounded-lg md:max-h-[90vh] shadow-xl">
        {/* Header */}
        <div className="p-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Drive Browser
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex border border-border-light dark:border-border-dark rounded-lg overflow-hidden">
              <button
                onClick={() => {
                  if (isManualSearch) onToggleManualSearch();
                }}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  !isManualSearch 
                    ? "bg-red-600 text-white" 
                    : "hover:bg-light-surface dark:hover:bg-dark-surface"
                )}
              >
                Auto
              </button>
              <button
                onClick={() => {
                  if (!isManualSearch) onToggleManualSearch();
                }}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  isManualSearch 
                    ? "bg-red-600 text-white" 
                    : "hover:bg-light-surface dark:hover:bg-dark-surface"
                )}
              >
                Manual
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="p-3 border-b border-border-light dark:border-border-dark">
          <form onSubmit={onManualPathSubmit} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 border border-border-light dark:border-border-dark rounded-lg overflow-hidden">
                <button 
                  type="button"
                  onClick={onNavigateBack}
                  disabled={!showLeftArrow}
                  className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
                <button 
                  type="button"
                  onClick={onNavigateForward}
                  disabled={!showRightArrow}
                  className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Forward"
                >
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </button>
                <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
                <button 
                  type="button"
                  onClick={onNavigateHome}
                  className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface"
                  title="Home"
                >
                  <Home className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
                <button 
                  type="button"
                  onClick={onRefreshDirectory}
                  className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              
              <button
                type="button"
                onClick={onOpenInNewTab}
                className="p-2 border border-border-light dark:border-border-dark rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={currentPath}
                onChange={(e) => onCurrentPathChange(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark outline-none focus:border-accent rounded-lg"
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

        {/* Season & Episode Selector for TV Shows */}
        {selectedSeason !== undefined && (
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <div className="grid grid-cols-2 gap-3">
              {/* Season Selector */}
              <div className="relative">
                <button
                  onClick={() => onSeasonSelect(selectedSeason)}
                  className="w-full px-3 py-2 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between"
                >
                  <span>{selectedSeason ? `Season ${selectedSeason}` : 'Select Season'}</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    showSeasonDropdown && "transform rotate-180"
                  )} />
                </button>
                
                {showSeasonDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {seasonOptions.map((season) => (
                      <button
                        key={season.season_number}
                        onClick={() => onSeasonSelect(season.season_number)}
                        className={cn(
                          "w-full px-4 py-2 text-left hover:bg-light-surface dark:hover:bg-dark-surface",
                          selectedSeason === season.season_number && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                        )}
                      >
                        {season.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Episode Selector */}
              <div className="relative">
                <button
                  onClick={() => onEpisodeSelect(selectedEpisode || 1)}
                  className="w-full px-3 py-2 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between"
                >
                  <span>{selectedEpisode ? `Episode ${selectedEpisode}` : 'Select Episode'}</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    showEpisodeDropdown && "transform rotate-180"
                  )} />
                </button>
                
                {showEpisodeDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {Array.from({ length: episodeCount }, (_, i) => i + 1).map((episodeNum) => (
                      <button
                        key={episodeNum}
                        onClick={() => onEpisodeSelect(episodeNum)}
                        className={cn(
                          "w-full px-4 py-2 text-left hover:bg-light-surface dark:hover:bg-dark-surface",
                          selectedEpisode === episodeNum && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                        )}
                      >
                        Episode {episodeNum}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="p-3 border-b border-border-light dark:border-border-dark">
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={onSearchQueryChange}
                  placeholder={hasVideoFiles ? "Search files and directories..." : "Search directories..."}
                  className="w-full px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 pr-8"
                  onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                />
                {searchHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSearchHistorySelect(searchHistory[0])}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded transition-colors"
                  >
                    <History className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
                  </button>
                )}
              </div>
              <button
                onClick={onSearch}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded flex items-center justify-center gap-1.5 transition-colors flex-shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
            
            {/* Search History Dropdown */}
            {showSearchHistory && searchHistory.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchHistory.map((query, index) => (
                  <button
                    key={index}
                    onClick={() => onSearchHistorySelect(query)}
                    className="w-full px-3 py-2 text-left hover:bg-light-surface dark:hover:bg-dark-surface flex items-center gap-2"
                  >
                    <History className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                    <span className="truncate">{query}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[55vh] md:max-h-[45vh] overflow-y-auto scrollbar-thin p-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-2" />
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                Loading directory contents...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
              <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                {error}
              </p>
              {isManualSearch ? (
                <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Try a different search term or browse manually
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={onRefreshDirectory}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Directory
                  </button>
                  <button
                    onClick={onToggleManualSearch}
                    className="px-4 py-2 bg-light-surface dark:bg-dark-surface hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    Try Manual Search
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Selected Episode Group - Always show at the top if available */}
              {hasSelectedEpisodeGroup && selectedEpisode && groupedVideoFiles[selectedEpisode] && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2">
                    Episode {selectedEpisode} Files
                  </h3>
                  <div className="rounded-lg overflow-hidden border border-red-500 dark:border-red-500">
                    <div className="px-3 py-2 font-medium text-sm bg-red-600/10 dark:bg-red-500/10 text-red-600 dark:text-red-500">
                      Episode {selectedEpisode}
                    </div>
                    <div className="divide-y divide-border-light dark:divide-border-dark">
                      {groupedVideoFiles[selectedEpisode].map((file, index) => {
                        const fileExt = getFileExtension(file.name);
                        const videoQuality = getVideoQuality(file.name);
                        const videoSource = getVideoSource(file.name);
                        
                        return (
                          <button
                            key={index}
                            onClick={() => onFileClick(file)}
                            className="w-full p-2.5 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="p-1.5 rounded-md bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 flex-shrink-0">
                                <Video className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="font-medium truncate">{file.name}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                  {fileExt && (
                                    <span className="px-1.5 py-0.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded">
                                      {fileExt}
                                    </span>
                                  )}
                                  {videoQuality && (
                                    <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded">
                                      {videoQuality}
                                    </span>
                                  )}
                                  {videoSource && (
                                    <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded">
                                      {videoSource}
                                    </span>
                                  )}
                                  {file.size && (
                                    <span className="px-1.5 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">
                                      {formatFileSize(file.size)}
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => onOutPlayerClick(file.url, e)}
                                    className="px-1.5 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded flex items-center gap-1"
                                    title="Open in OutPlayer"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    OutPlayer
                                  </button>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Video Files Section - Non-grouped (for movies) */}
              {filteredVideoFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Video Files {searchQuery && `matching "${searchQuery}"`}
                  </h3>
                  <div className="space-y-1.5">
                    {filteredVideoFiles.map((file, index) => {
                      const fileExt = getFileExtension(file.name);
                      const videoQuality = getVideoQuality(file.name);
                      const videoSource = getVideoSource(file.name);
                      
                      return (
                        <button
                          key={index}
                          onClick={() => onFileClick(file)}
                          className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="p-1.5 rounded-md bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 flex-shrink-0">
                              <Video className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="font-medium truncate">{file.name}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                                {fileExt && (
                                  <span className="px-1.5 py-0.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded">
                                    {fileExt}
                                  </span>
                                )}
                                {videoQuality && (
                                  <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded">
                                    {videoQuality}
                                  </span>
                                )}
                                {videoSource && (
                                  <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded">
                                    {videoSource}
                                  </span>
                                )}
                                {file.size && (
                                  <span className="px-1.5 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">
                                    {formatFileSize(file.size)}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => onOutPlayerClick(file.url, e)}
                                  className="px-1.5 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded flex items-center gap-1"
                                  title="Open in OutPlayer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  OutPlayer
                                </button>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Directories Section */}
              {shouldShowDirectories && directoriesToDisplay.length > 0 && (
                <div className={filteredVideoFiles.length > 0 ? "mt-4" : ""}>
                  <h3 className="text-sm font-semibold mb-2">Folders</h3>
                  <div className="space-y-1.5">
                    {directoriesToDisplay.map((dirName, index) => (
                      <button
                        key={index}
                        onClick={() => onDirectorySelect(dirName)}
                        className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
                      >
                        <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0 truncate">{dirName}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {files.length === 0 && !error && !isLoading && (
                <div className="text-center py-8">
                  {isManualSearch ? (
                    <div>
                      <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                        Enter a search term to find content
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-light-text-secondary dark:text-dark-text-secondary">
                        No files found in this directory
                      </p>
                      <button
                        onClick={onRefreshDirectory}
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
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border-light dark:border-border-dark text-xs text-light-text-secondary dark:text-dark-text-secondary">
          <p>
            Note: Direct file access depends on server availability. If files don't load, try the torrent option instead.
          </p>
        </div>
      </div>
    </>
  );
};

export default DriveBrowserUI;