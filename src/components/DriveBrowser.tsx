import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, File, X, Loader2, AlertCircle, ExternalLink, ChevronDown, RefreshCw, Search, ArrowLeft, Home, History, Film, Video, ExternalLink as OutPlayerIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import axios from 'axios';
import { 
  BASE_URL, 
  fetchDirectoryContents, 
  createTVShowPath, 
  createMoviePath, 
  FileItem, 
  calculateEpisodeMatchScore 
} from '../lib/drive';

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
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [showEpisodeDropdown, setShowEpisodeDropdown] = useState(false);
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
  const [groupedVideoFiles, setGroupedVideoFiles] = useState<{[key: number]: FileItem[]}>({});
  const linkInputRef = useRef<HTMLInputElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);
  const episodeDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchHistoryRef = useRef<HTMLDivElement>(null);

  // Fetch movie release year from TMDB if not provided
  useEffect(() => {
    if (isOpen && !isShow && movieId && !releaseYear) {
      const fetchYear = async () => {
        try {
          const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            params: {
              api_key: '50404130561567acf3e0725aeb09ec5d'
            }
          });
          
          if (response.data?.release_date) {
            const year = new Date(response.data.release_date).getFullYear().toString();
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
          const response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}`, {
            params: {
              api_key: '50404130561567acf3e0725aeb09ec5d'
            }
          });
          
          if (response.data?.seasons) {
            // Filter out specials (season 0)
            const filteredSeasons = response.data.seasons.filter(
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
          const response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}/season/${selectedSeason}`, {
            params: {
              api_key: '50404130561567acf3e0725aeb09ec5d'
            }
          });
          
          if (response.data?.episodes) {
            setEpisodeCount(response.data.episodes.length);
            
            // Set initial episode if not already set
            if (!selectedEpisode && response.data.episodes.length > 0) {
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
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target as Node)) {
        setShowSeasonDropdown(false);
      }
      
      if (episodeDropdownRef.current && !episodeDropdownRef.current.contains(event.target as Node)) {
        setShowEpisodeDropdown(false);
      }
      
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

  // Group video files by episode number when they change
  useEffect(() => {
    if (files.length > 0 && isShow) {
      const videoFiles = files.filter(file => file.isVideo);
      
      // Group files by episode number
      const grouped: {[key: number]: FileItem[]} = {};
      
      videoFiles.forEach(file => {
        const episodeNum = file.episodeNumber;
        if (episodeNum) {
          if (!grouped[episodeNum]) {
            grouped[episodeNum] = [];
          }
          grouped[episodeNum].push(file);
        } else {
          // For files without episode number, put in a special group
          if (!grouped[0]) {
            grouped[0] = [];
          }
          grouped[0].push(file);
        }
      });
      
      // Sort the keys so the selected episode is first
      const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => {
        if (a === selectedEpisode) return -1;
        if (b === selectedEpisode) return 1;
        return a - b;
      });
      
      // Create a new ordered grouped object
      const orderedGrouped: {[key: number]: FileItem[]} = {};
      sortedKeys.forEach(key => {
        orderedGrouped[key] = grouped[key];
      });
      
      setGroupedVideoFiles(orderedGrouped);
      setHasVideoFiles(videoFiles.length > 0);
    } else {
      setGroupedVideoFiles({});
      setHasVideoFiles(false);
    }
  }, [files, isShow, selectedEpisode]);

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

  const handleOutPlayerClick = (url: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Open the URL with outplayer:// protocol
    window.location.href = `outplayer://${url}`;
  };

  const handleDirectorySelect = (dirName: string) => {
    const newPath = `${currentPath}${dirName}`;
    navigateTo(newPath);
  };

  const handleSeasonSelect = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    setShowSeasonDropdown(false);
    
    // Reset episode selection when season changes
    setSelectedEpisode(1);
    setShowEpisodeDropdown(false);
    
    // Update path for the new season
    const newPath = createTVShowPath(title, seasonNumber);
    navigateTo(newPath);
  };

  const handleEpisodeSelect = (episodeNumber: number) => {
    setSelectedEpisode(episodeNumber);
    setShowEpisodeDropdown(false);
    
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

  // Determine if we should show the directories section
  // Hide directories if we have video files and we're not in manual search mode
  const shouldShowDirectories = !hasVideoFiles || isManualSearch;

  // Determine if we should show the selected episode group at the top
  const hasSelectedEpisodeGroup = isShow && selectedEpisode && groupedVideoFiles[selectedEpisode]?.length > 0;

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
        {isShow && !isManualSearch && (
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
              {isShow && Object.keys(groupedVideoFiles).length > 0 && (
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
              {!isShow && videoFiles.length > 0 && (
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
              {shouldShowDirectories && (isManualSearch && (currentPath === `${BASE_URL}movies/` || currentPath === `${BASE_URL}tvs/`)) ? (
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