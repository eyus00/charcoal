import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, File, X, Loader2, AlertCircle, ExternalLink, ChevronDown, RefreshCw } from 'lucide-react';
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
  const [createdLink, setCreatedLink] = useState<string>('');
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(initialSeason);
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>(initialEpisode);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [showEpisodeDropdown, setShowEpisodeDropdown] = useState(false);
  const [movieYear, setMovieYear] = useState<string | undefined>(releaseYear);
  const [seasons, setSeasons] = useState<{season_number: number; name: string; episode_count: number}[]>([]);
  const [episodeCount, setEpisodeCount] = useState<number>(0);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);
  const episodeDropdownRef = useRef<HTMLDivElement>(null);

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
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize the browser when opened
  useEffect(() => {
    if (isOpen && title) {
      setIsLoading(true);
      setError(null);
      setFiles([]);
      
      let folderPath;
      if (isShow) {
        folderPath = createTVShowPath(title, selectedSeason);
      } else {
        folderPath = createMoviePath(title);
      }
      
      setCurrentPath(folderPath);
      setCreatedLink(folderPath);

      loadDirectoryContents(folderPath);
    }
  }, [isOpen, title, movieYear, isShow, selectedSeason, selectedEpisode]);

  const loadDirectoryContents = async (path: string) => {
    if (!isOpen) return;
    
    try {
      setIsLoading(true);
      setError(null);
      setFiles([]);
      
      const fileItems = await fetchDirectoryContents(path, selectedEpisode, selectedSeason);
      setFiles(fileItems);
      
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
    loadDirectoryContents(currentPath);
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
      setCurrentPath(file.url);
      setCreatedLink(file.url);
      loadDirectoryContents(file.url);
    }
  };

  const navigateUp = () => {
    const upPath = currentPath.split('/').slice(0, -2).join('/') + '/';
    if (upPath.includes(BASE_URL)) {
      setCurrentPath(upPath);
      setCreatedLink(upPath);
      loadDirectoryContents(upPath);
    }
  };

  const handleSeasonSelect = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    setShowSeasonDropdown(false);
    
    // Reset episode selection when season changes
    setSelectedEpisode(1);
    setShowEpisodeDropdown(false);
    
    // Update path for the new season
    const newPath = createTVShowPath(title, seasonNumber);
    setCurrentPath(newPath);
    setCreatedLink(newPath);
    loadDirectoryContents(newPath);
  };

  const handleEpisodeSelect = (episodeNumber: number) => {
    setSelectedEpisode(episodeNumber);
    setShowEpisodeDropdown(false);
    
    // Reload current directory to highlight the selected episode
    loadDirectoryContents(currentPath);
  };

  const openLinkInNewTab = () => {
    window.open(createdLink, '_blank');
  };

  if (!isOpen) return null;

  // Separate video files from directories
  const videoFiles = files.filter(file => file.isVideo);
  const directories = files.filter(file => file.isDirectory);

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
        <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Drive Browser
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Season & Episode Selector for TV Shows */}
        {isShow && (
          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="grid grid-cols-2 gap-3">
              {/* Season Selector */}
              <div ref={seasonDropdownRef} className="relative">
                <button
                  onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
                  className="w-full px-4 py-2.5 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between"
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
                  className="w-full px-4 py-2.5 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between"
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

        {/* Path & Link Bar */}
        <div className="p-4 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-2">
            <button 
              onClick={navigateUp}
              className="px-2 py-1 bg-light-surface dark:bg-dark-surface rounded hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex-shrink-0"
            >
              Up
            </button>
            <div className="flex-1 relative">
              <input
                ref={linkInputRef}
                type="text"
                value={createdLink}
                onChange={(e) => setCreatedLink(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 pr-10"
              />
              <button
                onClick={openLinkInNewTab}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[50vh] md:max-h-[40vh] overflow-y-auto scrollbar-thin p-4">
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
              <button
                onClick={refetchDirectory}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Directory
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Video Files Section */}
              {videoFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">
                      Video Files
                    </h3>
                    <button
                      onClick={refetchDirectory}
                      className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded transition-colors"
                      title="Refresh directory"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {videoFiles.map((file, index) => {
                      // Determine highlight intensity based on match score
                      let highlightClass = "";
                      if (file.matchScore && file.matchScore > 0) {
                        if (file.matchScore >= 90) {
                          highlightClass = "bg-red-600/20 dark:bg-red-500/20 border border-red-600/30 dark:border-red-500/30";
                        } else if (file.matchScore >= 50) {
                          highlightClass = "bg-red-600/10 dark:bg-red-500/10 border border-red-600/20 dark:border-red-500/20";
                        }
                      }
                      
                      return (
                        <button
                          key={index}
                          onClick={() => handleFileClick(file)}
                          className={cn(
                            "w-full p-3 rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left",
                            file.matchScore && file.matchScore > 0 ? highlightClass : "bg-light-surface dark:bg-dark-surface"
                          )}
                        >
                          <File className={cn(
                            "w-5 h-5 flex-shrink-0",
                            file.matchScore && file.matchScore > 0
                              ? "text-red-600 dark:text-red-500" 
                              : "text-light-text-secondary dark:text-dark-text-secondary"
                          )} />
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{file.name}</div>
                            {file.matchScore && file.matchScore >= 90 && (
                              <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                                Episode {selectedEpisode}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Directories Section */}
              {directories.length > 0 && (
                <div className={videoFiles.length > 0 ? "mt-6" : ""}>
                  <h3 className="text-sm font-semibold mb-3">Folders</h3>
                  <div className="space-y-2">
                    {directories.map((dir, index) => (
                      <button
                        key={index}
                        onClick={() => handleFileClick(dir)}
                        className="w-full p-3 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
                      >
                        <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0 truncate">{dir.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {files.length === 0 && !error && !isLoading && (
                <div className="text-center py-8">
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

        {/* Footer */}
        <div className="p-4 border-t border-border-light dark:border-border-dark text-xs text-light-text-secondary dark:text-dark-text-secondary">
          <p>
            Note: Direct file access depends on server availability. If files don't load, try the torrent option instead.
          </p>
        </div>
      </div>
    </>
  );
};

export default DriveBrowser;