import React from 'react';
import { FolderOpen, File, X, Loader2, AlertCircle, ExternalLink, ChevronDown, RefreshCw, Search, ArrowLeft, Home, History, Film, Video, ExternalLink as OutPlayerIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { FileItem } from '../lib/drive';

interface DriveBrowserUIProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isLoading: boolean;
  error: string | null;
  files: FileItem[];
  currentPath: string;
  navigationHistory: string[];
  historyIndex: number;
  selectedSeason?: number;
  selectedEpisode?: number;
  showSeasonDropdown: boolean;
  showEpisodeDropdown: boolean;
  seasons: {season_number: number; name: string; episode_count: number}[];
  episodeCount: number;
  searchQuery: string;
  isManualSearch: boolean;
  searchResults: string[];
  searchHistory: string[];
  showSearchHistory: boolean;
  filteredDirectories: string[];
  filteredVideoFiles: FileItem[];
  hasVideoFiles: boolean;
  groupedVideoFiles: {[key: number]: FileItem[]};
  seasonDropdownRef: React.RefObject<HTMLDivElement>;
  episodeDropdownRef: React.RefObject<HTMLDivElement>;
  searchInputRef: React.RefObject<HTMLInputElement>;
  searchHistoryRef: React.RefObject<HTMLDivElement>;
  linkInputRef: React.RefObject<HTMLInputElement>;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateHome: () => void;
  refetchDirectory: () => void;
  handleManualPathSubmit: (e: React.FormEvent) => void;
  handleSeasonSelect: (seasonNumber: number) => void;
  handleEpisodeSelect: (episodeNumber: number) => void;
  handleSearchInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSearch: () => void;
  handleSearchHistorySelect: (query: string) => void;
  handleFileClick: (file: FileItem) => void;
  handleOutPlayerClick: (url: string, e: React.MouseEvent) => void;
  handleDirectorySelect: (dirName: string) => void;
  openLinkInNewTab: () => void;
  toggleManualSearch: () => void;
  setShowSeasonDropdown: (show: boolean) => void;
  setShowEpisodeDropdown: (show: boolean) => void;
  setShowSearchHistory: (show: boolean) => void;
  setCurrentPath: (path: string) => void;
  getFileExtension: (filename: string) => string;
  getVideoQuality: (filename: string) => string;
  getVideoSource: (filename: string) => string;
  formatFileSize: (size: string | undefined) => string;
  shouldShowDirectories: boolean;
  hasSelectedEpisodeGroup: boolean;
  directoriesToDisplay: string[];
  videoFiles: FileItem[];
  directories: FileItem[];
  displayPath: string;
}

const DriveBrowserUI: React.FC<DriveBrowserUIProps> = ({
  isOpen,
  onClose,
  title,
  isLoading,
  error,
  files,
  currentPath,
  navigationHistory,
  historyIndex,
  selectedSeason,
  selectedEpisode,
  showSeasonDropdown,
  showEpisodeDropdown,
  seasons,
  episodeCount,
  searchQuery,
  isManualSearch,
  searchResults,
  searchHistory,
  showSearchHistory,
  filteredDirectories,
  filteredVideoFiles,
  hasVideoFiles,
  groupedVideoFiles,
  seasonDropdownRef,
  episodeDropdownRef,
  searchInputRef,
  searchHistoryRef,
  linkInputRef,
  navigateBack,
  navigateForward,
  navigateHome,
  refetchDirectory,
  handleManualPathSubmit,
  handleSeasonSelect,
  handleEpisodeSelect,
  handleSearchInputChange,
  handleSearch,
  handleSearchHistorySelect,
  handleFileClick,
  handleOutPlayerClick,
  handleDirectorySelect,
  openLinkInNewTab,
  toggleManualSearch,
  setShowSeasonDropdown,
  setShowEpisodeDropdown,
  setShowSearchHistory,
  setCurrentPath,
  getFileExtension,
  getVideoQuality,
  getVideoSource,
  formatFileSize,
  shouldShowDirectories,
  hasSelectedEpisodeGroup,
  directoriesToDisplay,
  videoFiles,
  directories,
  displayPath
}) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 md:max-w-xl md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:rounded-lg md:max-h-[90vh] shadow-xl">
        <div className="p-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Drive Browser
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex border border-border-light dark:border-border-dark rounded-lg overflow-hidden">
              <button
                onClick={() => {
                  if (isManualSearch) toggleManualSearch();
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
                  if (!isManualSearch) toggleManualSearch();
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

        {/* Combined Navigation Bar and Path Input */}
        <div className="p-3 border-b border-border-light dark:border-border-dark">
          <form onSubmit={handleManualPathSubmit} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 border border-border-light dark:border-border-dark rounded-lg overflow-hidden">
                <button 
                  type="button"
                  onClick={navigateBack}
                  disabled={historyIndex <= 0}
                  className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-px h-6 bg-border-light dark:bg-border-dark" />
                <button 
                  type="button"
                  onClick={navigateForward}
                  disabled={historyIndex >= navigationHistory.length - 1}
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
                className="flex-1 px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark outline-none focus:border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500"
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
        {seasons && seasons.length > 0 && !isManualSearch && (
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <div className="grid grid-cols-2 gap-3">
              {/* Season Selector */}
              <div ref={seasonDropdownRef} className="relative">
                <button
                  onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
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
                    {seasons.map((season) => (
                      <button
                        key={season.season_number}
                        onClick={() => handleSeasonSelect(season.season_number)}
                        className={cn(
                          "w-full px-4 py-2 text-left hover:bg-light-surface dark:hover:bg-dark-surface",
                          selectedSeason === season.season_number && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                        )}
                      >
                        Season {season.season_number}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Episode Selector */}
              <div ref={episodeDropdownRef} className="relative">
                <button
                  onClick={() => setShowEpisodeDropdown(!showEpisodeDropdown)}
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
                        onClick={() => handleEpisodeSelect(episodeNum)}
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
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  onFocus={() => searchHistory.length > 0 && setShowSearchHistory(true)}
                  placeholder={hasVideoFiles ? "Search files and directories..." : "Search directories..."}
                  className="w-full px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 pr-8"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                {searchHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSearchHistory(!showSearchHistory)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded transition-colors"
                  >
                    <History className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded flex items-center justify-center gap-1.5 transition-colors flex-shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
            
            {/* Search History Dropdown */}
            {showSearchHistory && searchHistory.length > 0 && (
              <div 
                ref={searchHistoryRef}
                className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                {searchHistory.map((query, index) => (
                  <button
                    key={index}
                    onClick={() => handleSearchHistorySelect(query)}
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
                    onClick={refetchDirectory}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Directory
                  </button>
                  <button
                    onClick={toggleManualSearch}
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

              {/* Selected Episode Group - Always show at the top if available */}
              {hasSelectedEpisodeGroup && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2">
                    Episode {selectedEpisode} Files
                  </h3>
                  <div 
                    className="rounded-lg overflow-hidden border border-red-500 dark:border-red-500"
                  >
                    <div className="px-3 py-2 font-medium text-sm bg-red-600/10 dark:bg-red-500/10 text-red-600 dark:text-red-500">
                      Episode {selectedEpisode}
                    </div>
                    <div className="divide-y divide-border-light dark:divide-border-dark">
                      {groupedVideoFiles[selectedEpisode].map((file, index) => {
                        // Get file metadata
                        const fileExt = getFileExtension(file.name);
                        const videoQuality = getVideoQuality(file.name);
                        const videoSource = getVideoSource(file.name);
                        
                        return (
                          <button
                            key={index}
                            onClick={() => handleFileClick(file)}
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
                                    onClick={(e) => handleOutPlayerClick(file.url, e)}
                                    className="px-1.5 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded flex items-center gap-1"
                                    title="Open in OutPlayer"
                                  >
                                    <OutPlayerIcon className="w-3 h-3" />
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

              {/* Video Files Section - Grouped by Episode (excluding the selected episode) */}
              {seasons && seasons.length > 0 && Object.keys(groupedVideoFiles).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Video Files {searchQuery && `matching "${searchQuery}"`}
                  </h3>
                  <div className="space-y-4">
                    {Object.entries(groupedVideoFiles)
                      .filter(([episodeNumStr]) => Number(episodeNumStr) !== selectedEpisode) // Filter out the selected episode
                      .map(([episodeNumStr, files]) => {
                        const episodeNum = parseInt(episodeNumStr);
                        
                        return (
                          <div 
                            key={episodeNumStr} 
                            className="rounded-lg overflow-hidden border border-border-light dark:border-border-dark"
                          >
                            <div className="px-3 py-2 font-medium text-sm bg-light-surface dark:bg-dark-surface">
                              {episodeNum > 0 ? `Episode ${episodeNum}` : 'Other Videos'}
                            </div>
                            <div className="divide-y divide-border-light dark:divide-border-dark">
                              {files.map((file, index) => {
                                // Get file metadata
                                const fileExt = getFileExtension(file.name);
                                const videoQuality = getVideoQuality(file.name);
                                const videoSource = getVideoSource(file.name);
                                
                                return (
                                  <button
                                    key={index}
                                    onClick={() => handleFileClick(file)}
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
                                            onClick={(e) => handleOutPlayerClick(file.url, e)}
                                            className="px-1.5 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded flex items-center gap-1"
                                            title="Open in OutPlayer"
                                          >
                                            <OutPlayerIcon className="w-3 h-3" />
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
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Video Files Section - Non-grouped (for movies) */}
              {(!seasons || seasons.length === 0) && videoFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Video Files {searchQuery && `matching "${searchQuery}"`}
                  </h3>
                  <div className="space-y-1.5">
                    {videoFiles.map((file, index) => {
                      // Get file metadata
                      const fileExt = getFileExtension(file.name);
                      const videoQuality = getVideoQuality(file.name);
                      const videoSource = getVideoSource(file.name);
                      
                      return (
                        <button
                          key={index}
                          onClick={() => handleFileClick(file)}
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
                                  onClick={(e) => handleOutPlayerClick(file.url, e)}
                                  className="px-1.5 py-0.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded flex items-center gap-1"
                                  title="Open in OutPlayer"
                                >
                                  <OutPlayerIcon className="w-3 h-3" />
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
              {files.length === 0 && searchResults.length === 0 && !error && !isLoading && (
                <div className="text-center py-8">
                  {isManualSearch ? (
                    <div>
                      <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                        Enter a search term to find {seasons && seasons.length > 0 ? 'TV shows' : 'movies'}
                      </p>
                      <p className="text-sm text-light-text-secondary/70 dark:text-dark-text-secondary/70">
                        Example: {seasons && seasons.length > 0 ? '"Breaking Bad", "Game of Thrones"' : '"Inception", "Avengers"'}
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