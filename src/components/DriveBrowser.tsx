import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, File, X, Loader2, AlertCircle, ExternalLink, Download, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  BASE_URL, 
  FileItem, 
  SeasonInfo, 
  fetchDirectoryContents, 
  createTVShowPath, 
  createMoviePath, 
  fetchTVShowSeasons 
} from '../lib/drive';

interface DriveBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  releaseYear?: string;
  isShow?: boolean;
  tvId?: number;
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
  season: initialSeason,
  episode: initialEpisode,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [createdLink, setCreatedLink] = useState<string>('');
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(initialSeason);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Fetch seasons from TMDB if it's a TV show
  useEffect(() => {
    if (isOpen && isShow && tvId) {
      const loadSeasons = async () => {
        try {
          const seasonsData = await fetchTVShowSeasons(tvId);
          setSeasons(seasonsData.filter(s => s.season_number > 0)); // Filter out specials (season 0)
        } catch (error) {
          console.error("Failed to load seasons:", error);
        }
      };
      
      loadSeasons();
    }
  }, [isOpen, isShow, tvId]);

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
  }, [isOpen, title, releaseYear, isShow, selectedSeason]);

  const loadDirectoryContents = async (path: string) => {
    // Only attempt to load if the browser is open
    if (!isOpen) return;
    
    try {
      setIsLoading(true);
      setError(null);
      setFiles([]);
      
      const fileItems = await fetchDirectoryContents(path);
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

  const handleFileClick = (file: FileItem) => {
    if (file.isVideo) {
      // Open video file in a new tab or download it
      window.open(file.url, '_blank');
    } else if (file.isDirectory) {
      // Navigate to the selected directory
      setCurrentPath(file.url);
      setCreatedLink(file.url);
      loadDirectoryContents(file.url);
    }
  };

  const navigateUp = () => {
    const upPath = currentPath.split('/').slice(0, -2).join('/') + '/';
    if (upPath.includes(BASE_URL)) {
      setCurrentPath(upPath);
      loadDirectoryContents(upPath);
    }
  };

  const handleSeasonSelect = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    setShowSeasonDropdown(false);
  };

  const copyLinkToClipboard = () => {
    if (linkInputRef.current) {
      linkInputRef.current.select();
      document.execCommand('copy');
      // Optional: Show a temporary "Copied!" message
    }
  };

  // Separate video files from directories
  const videoFiles = files.filter(file => file.isVideo);
  const directories = files.filter(file => file.isDirectory);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 md:max-w-md md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:rounded-lg md:max-h-[80vh] shadow-xl">
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

        {/* Season Selector for TV Shows */}
        {isShow && seasons.length > 0 && (
          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="relative">
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
                      {season.name} ({season.episode_count} episodes)
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current Path */}
        <div className="p-4 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin text-sm text-light-text-secondary dark:text-dark-text-secondary">
            <button 
              onClick={navigateUp}
              className="px-2 py-1 bg-light-surface dark:bg-dark-surface rounded hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex-shrink-0"
            >
              Up
            </button>
            <div className="truncate">
              {currentPath.replace(BASE_URL, '')}
            </div>
          </div>
        </div>

        {/* Created Link */}
        <div className="p-4 border-b border-border-light dark:border-border-dark">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Direct Link:
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={linkInputRef}
                type="text"
                value={createdLink}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button
                onClick={copyLinkToClipboard}
                className="p-2 bg-light-surface dark:bg-dark-surface hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-lg transition-colors"
                title="Copy to clipboard"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[40vh] md:max-h-[30vh] overflow-y-auto scrollbar-thin p-4">
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
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                The directory might not exist or the server could be unavailable.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Video Files Section */}
              {videoFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Video Files</h3>
                  <div className="space-y-2">
                    {videoFiles.map((file, index) => (
                      <button
                        key={index}
                        onClick={() => handleFileClick(file)}
                        className="w-full p-3 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
                      >
                        <File className="w-5 h-5 text-red-600 dark:text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{file.name}</div>
                          {file.size && (
                            <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                              {file.size}
                            </div>
                          )}
                        </div>
                        <Download className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                      </button>
                    ))}
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
                </div>
              )}
            </div>
          )}
        </div>

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