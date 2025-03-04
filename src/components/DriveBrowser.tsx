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
import DriveBrowserUI from './DriveBrowserUI';

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
    <DriveBrowserUI
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      isLoading={isLoading}
      error={error}
      files={files}
      currentPath={currentPath}
      navigationHistory={navigationHistory}
      historyIndex={historyIndex}
      selectedSeason={selectedSeason}
      selectedEpisode={selectedEpisode}
      showSeasonDropdown={showSeasonDropdown}
      showEpisodeDropdown={showEpisodeDropdown}
      seasons={seasons}
      episodeCount={episodeCount}
      searchQuery={searchQuery}
      isManualSearch={isManualSearch}
      searchResults={searchResults}
      searchHistory={searchHistory}
      showSearchHistory={showSearchHistory}
      filteredDirectories={filteredDirectories}
      filteredVideoFiles={filteredVideoFiles}
      hasVideoFiles={hasVideoFiles}
      groupedVideoFiles={groupedVideoFiles}
      seasonDropdownRef={seasonDropdownRef}
      episodeDropdownRef={episodeDropdownRef}
      searchInputRef={searchInputRef}
      searchHistoryRef={searchHistoryRef}
      linkInputRef={linkInputRef}
      navigateBack={navigateBack}
      navigateForward={navigateForward}
      navigateHome={navigateHome}
      refetchDirectory={refetchDirectory}
      handleManualPathSubmit={handleManualPathSubmit}
      handleSeasonSelect={handleSeasonSelect}
      handleEpisodeSelect={handleEpisodeSelect}
      handleSearchInputChange={handleSearchInputChange}
      handleSearch={handleSearch}
      handleSearchHistorySelect={handleSearchHistorySelect}
      handleFileClick={handleFileClick}
      handleOutPlayerClick={handleOutPlayerClick}
      handleDirectorySelect={handleDirectorySelect}
      openLinkInNewTab={openLinkInNewTab}
      toggleManualSearch={toggleManualSearch}
      setShowSeasonDropdown={setShowSeasonDropdown}
      setShowEpisodeDropdown={setShowEpisodeDropdown}
      setShowSearchHistory={setShowSearchHistory}
      setCurrentPath={setCurrentPath}
      getFileExtension={getFileExtension}
      getVideoQuality={getVideoQuality}
      getVideoSource={getVideoSource}
      formatFileSize={formatFileSize}
      shouldShowDirectories={shouldShowDirectories}
      hasSelectedEpisodeGroup={hasSelectedEpisodeGroup}
      directoriesToDisplay={directoriesToDisplay}
      videoFiles={videoFiles}
      directories={directories}
      displayPath={displayPath}
    />
  );
};

export default DriveBrowser;