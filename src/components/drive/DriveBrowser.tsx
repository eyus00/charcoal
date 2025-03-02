import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, X, Loader2, AlertCircle, ExternalLink, RefreshCw, Search, ArrowLeft, Home, History, Video } from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  BASE_URL, 
  fetchDirectoryContents, 
  createTVShowPath, 
  createMoviePath, 
  FileItem
} from './utils';
import DirectoryList from './DirectoryList';
import VideoFileList from './VideoFileList';
import SearchBar from './SearchBar';
import NavigationBar from './NavigationBar';
import SeasonEpisodeSelector from './SeasonEpisodeSelector';

interface DriveBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  releaseYear?: string;
  isShow?: boolean;
  tvId?: number;
  movieId?: number;
  season?: number;
  episode?: number;
}

const DriveBrowser: React.FC<DriveBrowserProps> = ({
  isOpen,
  onClose,
  title,
  releaseYear,
  isShow,
  tvId,
  movieId,
  season: initialSeason,
  episode: initialEpisode,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(initialSeason);
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>(initialEpisode);
  const [movieYear, setMovieYear] = useState<string | undefined>(releaseYear);
  const [seasons, setSeasons] = useState<{season_number: number; name: string; episode_count: number}[]>([]);
  const [episodeCount, setEpisodeCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isManualSearch, setIsManualSearch] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [allDirectories, setAllDirectories] = useState<string[]>([]);
  const [filteredDirectories, setFilteredDirectories] = useState<string[]>([]);
  const [filteredVideoFiles, setFilteredVideoFiles] = useState<FileItem[]>([]);
  const [hasVideoFiles, setHasVideoFiles] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchHistoryRef = useRef<HTMLDivElement>(null);

  // Fetch movie release year from TMDB if not provided
  useEffect(() => {
    if (isOpen && !isShow && movieId && !releaseYear) {
      const fetchYear = async () => {
        try {
          const response = await fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=50404130561567acf3e0725aeb09ec5d`);
          const data = await response.json();
          
          if (data?.release_date) {
            const year = new Date(data.release_date).getFullYear().toString();
            setMovieYear(year);
          }
        } catch (error) {
          console.error("Error fetching movie release year:", error);
        }
      };
      
      fetchYear();
    } else if (releaseYear) {
      setMovieYear(releaseYear);
    }
  }, [isOpen, isShow, movieId, releaseYear]);

  // Fetch TV show seasons from TMDB
  useEffect(() => {
    if (isOpen && isShow && tvId) {
      const fetchSeasons = async () => {
        try {
          const response = await fetch(`https://api.themoviedb.org/3/tv/${tvId}?api_key=50404130561567acf3e0725aeb09ec5d`);
          const data = await response.json();
          
          if (data?.seasons) {
            // Filter out specials (season 0)
            const filteredSeasons = data.seasons.filter(
              (season: any) => season.season_number > 0
            );
            setSeasons(filteredSeasons);
            
            // Set initial season if not already set
            if (!selectedSeason && filteredSeasons.length > 0) {
              setSelectedSeason(filteredSeasons[0].season_number);
            }
          }
        } catch (error) {
          console.error("Error fetching TV show seasons:", error);
        }
      };
      
      fetchSeasons();
    }
  }, [isOpen, isShow, tvId, selectedSeason]);

  // Fetch episode count for selected season
  useEffect(() => {
    if (isShow && tvId && selectedSeason) {
      const fetchEpisodeCount = async () => {
        try {
          const response = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${selectedSeason}?api_key=50404130561567acf3e0725aeb09ec5d`);
          const data = await response.json();
          
          if (data?.episodes) {
            setEpisodeCount(data.episodes.length);
            
            // Set initial episode if not already set
            if (!selectedEpisode && data.episodes.length > 0) {
              setSelectedEpisode(1);
            }
          }
        } catch (error) {
          console.error("Error fetching episode count:", error);
        }
      };
      
      fetchEpisodeCount();
    }
  }, [isShow, tvId, selectedSeason, selectedEpisode]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchHistoryRef.current && !searchHistoryRef.current.contains(event.target as Node) && 
          searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowSearchHistory(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize the browser when opened
  useEffect(() => {
    if (isOpen) {
      // Load search history from localStorage
      const savedSearchHistory = localStorage.getItem('driveSearchHistory');
      if (savedSearchHistory) {
        try {
          setSearchHistory(JSON.parse(savedSearchHistory));
        } catch (e) {
          console.error("Error parsing search history:", e);
          setSearchHistory([]);
        }
      }
      
      if (title && !isManualSearch) {
        setIsLoading(true);
        setError(null);
        setFiles([]);
        
        let folderPath;
        if (isShow) {
          folderPath = createTVShowPath(title, selectedSeason);
        } else {
          folderPath = createMoviePath(title, movieYear);
        }
        
        setCurrentPath(folderPath);
        
        // Reset navigation history
        setNavigationHistory([folderPath]);
        setHistoryIndex(0);
        
        loadDirectoryContents(folderPath);
      } else if (isManualSearch) {
        // Set the root path for manual search
        const rootPath = isShow ? `${BASE_URL}tvs/` : `${BASE_URL}movies/`;
        setCurrentPath(rootPath);
        
        // Reset navigation history
        setNavigationHistory([rootPath]);
        setHistoryIndex(0);
        
        // Load root directory contents for manual search
        loadDirectoryContents(rootPath, true);
      }
    }
  }, [isOpen, title, movieYear, isShow, selectedSeason, selectedEpisode, isManualSearch]);

  // Filter video files when search query changes
  useEffect(() => {
    if (files.length > 0) {
      const videoFiles = files.filter(file => file.isVideo);
      setHasVideoFiles(videoFiles.length > 0);
      
      if (searchQuery.trim() === '') {
        setFilteredVideoFiles(videoFiles);
      } else {
        const filtered = videoFiles.filter(file => 
          file.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setFilteredVideoFiles(filtered);
      }
    } else {
      setHasVideoFiles(false);
      setFilteredVideoFiles([]);
    }
  }, [files, searchQuery]);

  const loadDirectoryContents = async (path: string, isRootDirectory = false) => {
    if (!isOpen) return;
    
    try {
      setIsLoading(true);
      setError(null);
      setFiles([]);
      setSearchResults([]);
      setFilteredVideoFiles([]);
      
      const fileItems = await fetchDirectoryContents(path, selectedEpisode, selectedSeason);
      setFiles(fileItems);
      
      // Check if there are video files
      const videoFiles = fileItems.filter(item => item.isVideo);
      setHasVideoFiles(videoFiles.length > 0);
      setFilteredVideoFiles(videoFiles);
      
      // If this is a root directory, store all directories for filtering
      if (isRootDirectory) {
        const directories = fileItems
          .filter(item => item.isDirectory)
          .map(item => item.name);
        setAllDirectories(directories);
        setFilteredDirectories(directories);
      }
      
      if (fileItems.length === 0) {
        setError("No files found in this directory");
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error in loadDirectoryContents:", error);
      setIsLoading(false);
      setError("Failed to access directory. The server might be unavailable or the content doesn't exist.");
    }
  };

  const refetchDirectory = () => {
    loadDirectoryContents(currentPath, currentPath === `${BASE_URL}movies/` || currentPath === `${BASE_URL}tvs/`);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // If search is cleared, show all directories
      setFilteredDirectories(allDirectories);
      
      // Reset video file filtering
      const videoFiles = files.filter(file => file.isVideo);
      setFilteredVideoFiles(videoFiles);
      return;
    }
    
    if (isManualSearch && (currentPath === `${BASE_URL}movies/` || currentPath === `${BASE_URL}tvs/`)) {
      // Filter from already loaded directories
      const filtered = allDirectories.filter(dir => 
        dir.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredDirectories(filtered);
      
      if (filtered.length === 0) {
        setError("No matching directories found");
      } else {
        setError(null);
      }
      
      // Add to search history
      if (!searchHistory.includes(searchQuery)) {
        const newHistory = [searchQuery, ...searchHistory.slice(0, 9)]; // Keep only last 10 searches
        setSearchHistory(newHistory);
        localStorage.setItem('driveSearchHistory', JSON.stringify(newHistory));
      }
      
      return;
    }
    
    // Filter video files in current directory
    const videoFiles = files.filter(file => file.isVideo);
    if (videoFiles.length > 0) {
      const filtered = videoFiles.filter(file => 
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredVideoFiles(filtered);
      
      if (filtered.length === 0 && searchQuery.trim() !== '') {
        setError("No matching video files found");
      } else {
        setError(null);
      }
      
      // Add to search history
      if (!searchHistory.includes(searchQuery)) {
        const newHistory = [searchQuery, ...searchHistory.slice(0, 9)]; // Keep only last 10 searches
        setSearchHistory(newHistory);
        localStorage.setItem('driveSearchHistory', JSON.stringify(newHistory));
      }
      
      return;
    }
    
    // For other directories, perform a server-side search
    setIsLoading(true);
    setError(null);
    setSearchResults([]);
    setFiles([]);
    
    try {
      // Use a CORS proxy to access the directory
      const corsProxy = 'https://api.allorigins.win/raw?url=';
      const response = await fetch(corsProxy + encodeURIComponent(currentPath));
      
      if (!response.ok) {
        throw new Error("Directory not found or inaccessible");
      }
      
      const html = await response.text();
      
      // Parse the directory listing HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract directory links
      const links = doc.querySelectorAll('a');
      const directories: string[] = [];
      
      links.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href || href === '../' || href === './') return;
        
        const name = link.textContent?.trim() || href;
        if (href.endsWith('/')) {
          // Only include directories that match the search query
          if (name.toLowerCase().includes(searchQuery.toLowerCase())) {
            directories.push(name);
          }
        }
      });
      
      setSearchResults(directories);
      setIsLoading(false);
      
      if (directories.length === 0) {
        setError("No matching directories found");
      }
      
      // Add to search history
      if (!searchHistory.includes(searchQuery)) {
        const newHistory = [searchQuery, ...searchHistory.slice(0, 9)]; // Keep only last 10 searches
        setSearchHistory(newHistory);
        localStorage.setItem('driveSearchHistory', JSON.stringify(newHistory));
      }
    } catch (error) {
      console.error("Error searching directories:", error);
      setIsLoading(false);
      setError("Failed to search directories. The server might be unavailable.");
    }
  };

  // Navigation functions
  const navigateTo = (path: string, addToHistory = true) => {
    setCurrentPath(path);
    
    if (addToHistory) {
      // Add to navigation history
      const newHistory = navigationHistory.slice(0, historyIndex + 1);
      newHistory.push(path);
      setNavigationHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    
    const isRootDir = path === `${BASE_URL}movies/` || path === `${BASE_URL}tvs/`;
    loadDirectoryContents(path, isRootDir);
  };

  const navigateBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentPath(navigationHistory[newIndex]);
      const isRootDir = navigationHistory[newIndex] === `${BASE_URL}movies/` || navigationHistory[newIndex] === `${BASE_URL}tvs/`;
      loadDirectoryContents(navigationHistory[newIndex], isRootDir);
    }
  };

  const navigateForward = () => {
    if (historyIndex < navigationHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentPath(navigationHistory[newIndex]);
      const isRootDir = navigationHistory[newIndex] === `${BASE_URL}movies/` || navigationHistory[newIndex] === `${BASE_URL}tvs/`;
      loadDirectoryContents(navigationHistory[newIndex], isRootDir);
    }
  };

  const navigateHome = () => {
    const homePath = BASE_URL;
    navigateTo(homePath);
  };

  // Event handlers
  const handleFileClick = (file: FileItem) => {
    if (file.isVideo) {
      // Create an anchor element and trigger download
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (file.isDirectory) {
      navigateTo(file.url);
    }
  };

  const handleDirectorySelect = (dirName: string) => {
    const newPath = `${currentPath}${dirName}`;
    navigateTo(newPath);
  };

  const handleSeasonSelect = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    
    // Reset episode selection when season changes
    setSelectedEpisode(1);
    
    // Update path for the new season
    const newPath = createTVShowPath(title, seasonNumber);
    navigateTo(newPath);
  };

  const handleEpisodeSelect = (episodeNumber: number) => {
    setSelectedEpisode(episodeNumber);
    
    // Reload current directory to highlight the selected episode
    loadDirectoryContents(currentPath);
  };

  const handleSearchHistorySelect = (query: string) => {
    setSearchQuery(query);
    setShowSearchHistory(false);
    // Auto-search when selecting from history
    setTimeout(() => {
      handleSearch();
    }, 0);
  };

  const openLinkInNewTab = () => {
    window.open(currentPath, '_blank');
  };

  const toggleManualSearch = () => {
    setIsManualSearch(!isManualSearch);
    if (!isManualSearch) {
      // Switching to manual search
      const rootPath = isShow ? `${BASE_URL}tvs/` : `${BASE_URL}movies/`;
      navigateTo(rootPath, true);
    } else {
      // Switching back to automatic search
      if (title) {
        let folderPath;
        if (isShow) {
          folderPath = createTVShowPath(title, selectedSeason);
        } else {
          folderPath = createMoviePath(title, movieYear);
        }
        navigateTo(folderPath, true);
      }
    }
  };

  const handleManualPathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPath) {
      navigateTo(currentPath);
    }
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    
    // Auto-search for video files in current directory
    if (!isManualSearch || (currentPath !== `${BASE_URL}movies/` && currentPath !== `${BASE_URL}tvs/`)) {
      const videoFiles = files.filter(file => file.isVideo);
      if (videoFiles.length > 0) {
        if (e.target.value.trim() === '') {
          setFilteredVideoFiles(videoFiles);
          setError(null);
        } else {
          const filtered = videoFiles.filter(file => 
            file.name.toLowerCase().includes(e.target.value.toLowerCase())
          );
          setFilteredVideoFiles(filtered);
          
          if (filtered.length === 0) {
            setError("No matching video files found");
          } else {
            setError(null);
          }
        }
      }
    }
  };

  if (!isOpen) return null;

  // Separate video files from directories
  const videoFiles = filteredVideoFiles;
  const directories = files.filter(file => file.isDirectory);

  // Format the current path for display
  const displayPath = currentPath.replace(BASE_URL, '');

  // Determine which directories to display
  const directoriesToDisplay = isManualSearch && (currentPath === `${BASE_URL}movies/` || currentPath === `${BASE_URL}tvs/`)
    ? filteredDirectories
    : directories.map(dir => dir.name);

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

        {/* Season & Episode Selector for TV Shows */}
        {isShow && !isManualSearch && hasVideoFiles && (
          <SeasonEpisodeSelector
            seasons={seasons}
            selectedSeason={selectedSeason}
            selectedEpisode={selectedEpisode}
            episodeCount={episodeCount}
            onSeasonSelect={handleSeasonSelect}
            onEpisodeSelect={handleEpisodeSelect}
          />
        )}

        {/* Navigation Bar */}
        <NavigationBar
          currentPath={currentPath}
          setCurrentPath={setCurrentPath}
          navigateBack={navigateBack}
          navigateForward={navigateForward}
          navigateHome={navigateHome}
          refetchDirectory={refetchDirectory}
          openLinkInNewTab={openLinkInNewTab}
          handleManualPathSubmit={handleManualPathSubmit}
          linkInputRef={linkInputRef}
          canGoBack={historyIndex > 0}
          canGoForward={historyIndex < navigationHistory.length - 1}
        />

        {/* Search Bar */}
        <SearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSearch={handleSearch}
          handleSearchInputChange={handleSearchInputChange}
          searchHistory={searchHistory}
          showSearchHistory={showSearchHistory}
          setShowSearchHistory={setShowSearchHistory}
          handleSearchHistorySelect={handleSearchHistorySelect}
          searchInputRef={searchInputRef}
          searchHistoryRef={searchHistoryRef}
          hasVideoFiles={hasVideoFiles}
        />

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

              {/* Video Files Section - Prioritized */}
              {videoFiles.length > 0 && (
                <VideoFileList 
                  videoFiles={videoFiles} 
                  selectedEpisode={selectedEpisode} 
                  onFileClick={handleFileClick}
                  searchQuery={searchQuery}
                />
              )}

              {/* Directories Section */}
              <DirectoryList
                directories={directoriesToDisplay}
                onDirectorySelect={handleDirectorySelect}
                isManualSearch={isManualSearch}
                currentPath={currentPath}
                BASE_URL={BASE_URL}
                directories={directories}
                onFileClick={handleFileClick}
              />

              {/* Empty State */}
              {files.length === 0 && searchResults.length === 0 && !error && !isLoading && (
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

export default DriveBrowser;