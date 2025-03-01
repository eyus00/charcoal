import React, { useState, useEffect, useRef } from 'react';
import { Download, X, AlertCircle, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface TorrentInfo {
  quality: string;
  type: string;
  size: string;
  seeders: number;
  magnet: string;
  sourceUrl?: string;
  isOptimal?: boolean;
}

interface TorrentDownloaderProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  releaseYear?: string;
  isShow?: boolean;
  season?: number;
  episode?: number;
}

const TorrentDownloader: React.FC<TorrentDownloaderProps> = ({
  isOpen,
  onClose,
  title,
  releaseYear,
  isShow,
  season: initialSeason,
  episode: initialEpisode,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [season, setSeason] = useState<number | undefined>(initialSeason);
  const [episode, setEpisode] = useState<number | undefined>(initialEpisode);
  const [seasonOptions, setSeasonOptions] = useState<number[]>([]);
  const [episodeOptions, setEpisodeOptions] = useState<number[]>([]);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [showEpisodeDropdown, setShowEpisodeDropdown] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);
  const episodeDropdownRef = useRef<HTMLDivElement>(null);

  // Reset season/episode when props change
  useEffect(() => {
    setSeason(initialSeason);
    setEpisode(initialEpisode);
  }, [initialSeason, initialEpisode]);

  // Generate season and episode options
  useEffect(() => {
    if (isShow) {
      // Generate seasons 1-20
      const seasons = Array.from({ length: 20 }, (_, i) => i + 1);
      setSeasonOptions(seasons);
      
      // Generate episodes 1-30
      const episodes = Array.from({ length: 30 }, (_, i) => i + 1);
      setEpisodeOptions(episodes);
    }
  }, [isShow]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        seasonDropdownRef.current && 
        !seasonDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSeasonDropdown(false);
      }
      
      if (
        episodeDropdownRef.current && 
        !episodeDropdownRef.current.contains(event.target as Node)
      ) {
        setShowEpisodeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && title) {
      setIsLoading(true);
      setError(null);
      fetchTorrentInfo();
    }
  }, [isOpen, title, season, episode]);

  const parseFileSize = (sizeText: string): string => {
    // Check if it contains a proper size format like "1.9 GB"
    const sizeMatch = sizeText.match(/Size\s*:\s*([\d.]+)\s*(KB|MB|GB|TB)/i);
    if (sizeMatch) {
      return `${sizeMatch[1]} ${sizeMatch[2]}`;
    }
    
    // Try to extract just the number and unit if in a different format
    const generalSizeMatch = sizeText.match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
    if (generalSizeMatch) {
      return `${generalSizeMatch[1]} ${generalSizeMatch[2]}`;
    }
    
    return 'Unknown size';
  };

  const fetchTorrentInfo = async () => {
    if (!title) return;

    try {
      const corsProxy = 'https://api.allorigins.win/raw?url=';
      
      let searchQuery = title;
      if (releaseYear) {
        searchQuery += ` ${releaseYear}`;
      }
      if (isShow && season) {
        searchQuery += ` S${String(season).padStart(2, '0')}`;
        if (episode) {
          searchQuery += `E${String(episode).padStart(2, '0')}`;
        }
      }
      
      const targetUrl = `https://cloudtorrents.com/search?query=${encodeURIComponent(searchQuery)}&ordering=-se`;
      
      const response = await fetch(corsProxy + encodeURIComponent(targetUrl));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const rows = doc.querySelectorAll('tbody tr');
      
      const qualityTypeMap = new Map();

      for (const row of rows) {
        const titleElement = row.querySelector('td:first-child a');
        if (!titleElement) continue;

        const torrentTitle = titleElement.textContent.trim();
        const torrentUrl = titleElement.getAttribute('href');
        
        if (!verifyTorrentTitle(torrentTitle, title, releaseYear)) continue;

        const magnetElement = row.querySelector('a[href^="magnet:"]');
        if (!magnetElement) continue;

        const magnetLink = magnetElement.getAttribute('href');
        if (!magnetLink) continue;
        
        let quality = 'N/A';
        const qualityMatch = torrentTitle.match(/\b(720p|1080p|2160p|4K)\b/i);
        if (qualityMatch) {
          quality = qualityMatch[1].toUpperCase();
        }
        
        let type = 'N/A';
        const typeMatch = torrentTitle.match(/\b(BluRay|WEBDL|WEB-DL|WEBRip|HDRip|BRRip|DVDRip)\b/i);
        if (typeMatch) {
          type = typeMatch[1].replace('WEBDL', 'WEB-DL');
        }

        // Get the full row HTML to extract size information
        const rowHtml = row.outerHTML;
        const sizeMatch = rowHtml.match(/Size\s*:\s*([\d.]+)\s*(KB|MB|GB|TB)/i);
        let size = 'Unknown size';
        
        if (sizeMatch) {
          size = `${sizeMatch[1]} ${sizeMatch[2]}`;
        }

        const seedersElement = row.querySelector('td:nth-child(5)');
        const seeders = parseInt(seedersElement?.textContent.trim() || '0', 10);

        const torrent = {
          quality,
          type,
          size,
          seeders: seeders,
          magnet: magnetLink,
          sourceUrl: torrentUrl ? `https://cloudtorrents.com${torrentUrl}` : undefined
        };

        const key = `${quality}-${type}`;
        
        if (!qualityTypeMap.has(key) || qualityTypeMap.get(key).seeders < seeders) {
          qualityTypeMap.set(key, torrent);
        }
      }

      const foundTorrents = Array.from(qualityTypeMap.values());
      foundTorrents.sort((a, b) => {
        const qualityOrder = { '4K': 4, '2160P': 3, '1080P': 2, '720P': 1, 'N/A': 0 };
        const qualityDiff = (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
        if (qualityDiff !== 0) return qualityDiff;
        return b.seeders - a.seeders;
      });

      // Mark the optimal torrent
      if (foundTorrents.length > 0) {
        foundTorrents[0].isOptimal = true;
      }

      setTorrents(foundTorrents.slice(0, 6));
      setIsLoading(false);
      
      if (foundTorrents.length === 0) {
        setError('No torrents found. Try using the external search options below.');
      }
    } catch (error) {
      console.error('Error fetching torrent info:', error);
      setIsLoading(false);
      setError('Failed to fetch torrents. Try using the external search options below.');
    }
  };

  const verifyTorrentTitle = (torrentTitle: string, contentTitle: string, releaseYear?: string) => {
    const cleanTorrentTitle = torrentTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanContentTitle = contentTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (!cleanTorrentTitle.includes(cleanContentTitle)) {
      return false;
    }
    
    if (releaseYear && !torrentTitle.includes(releaseYear)) {
      return false;
    }
    
    if (isShow && season) {
      const seasonPattern = new RegExp(`S${String(season).padStart(2, '0')}`, 'i');
      if (!seasonPattern.test(torrentTitle)) {
        return false;
      }
      
      if (episode) {
        const episodePattern = new RegExp(`E${String(episode).padStart(2, '0')}`, 'i');
        if (!episodePattern.test(torrentTitle)) {
          return false;
        }
      }
    }
    
    return true;
  };

  const handleSeasonSelect = (s: number) => {
    setSeason(s);
    setShowSeasonDropdown(false);
  };

  const handleEpisodeSelect = (e: number) => {
    setEpisode(e);
    setShowEpisodeDropdown(false);
  };

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
            <Download className="w-5 h-5" />
            Download Options
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Season/Episode Selector for TV Shows */}
        {isShow && (
          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <h3 className="text-sm font-semibold mb-3">Season & Episode</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Season Selector */}
              <div ref={seasonDropdownRef} className="relative">
                <div 
                  onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
                  className="w-full px-4 py-2.5 bg-light-surface dark:bg-dark-surface rounded-lg border border-border-light dark:border-border-dark flex items-center justify-between cursor-pointer"
                >
                  <span>Season {season || 1}</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    showSeasonDropdown && "transform rotate-180"
                  )} />
                </div>
                
                {showSeasonDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {seasonOptions.map((s) => (
                      <div
                        key={s}
                        onClick={() => handleSeasonSelect(s)}
                        className={cn(
                          "px-4 py-2 cursor-pointer hover:bg-light-surface dark:hover:bg-dark-surface",
                          season === s && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                        )}
                      >
                        Season {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Episode Selector */}
              <div ref={episodeDropdownRef} className="relative">
                <div 
                  onClick={() => setShowEpisodeDropdown(!showEpisodeDropdown)}
                  className="w-full px-4 py-2.5 bg-light-surface dark:bg-dark-surface rounded-lg border border-border-light dark:border-border-dark flex items-center justify-between cursor-pointer"
                >
                  <span>Episode {episode || 1}</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    showEpisodeDropdown && "transform rotate-180"
                  )} />
                </div>
                
                {showEpisodeDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {episodeOptions.map((e) => (
                      <div
                        key={e}
                        onClick={() => handleEpisodeSelect(e)}
                        className={cn(
                          "px-4 py-2 cursor-pointer hover:bg-light-surface dark:hover:bg-dark-surface",
                          episode === e && "bg-red-600/10 text-red-600 dark:bg-red-500/10 dark:text-red-500"
                        )}
                      >
                        Episode {e}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div 
          ref={contentRef}
          className="p-4 max-h-[70vh] md:max-h-[60vh] overflow-y-auto scrollbar-thin"
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-2" />
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                Loading download options...
              </p>
            </div>
          ) : error && torrents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
              <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
                {error}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6">
                You can use external torrent search sites to find and download this content.
              </p>
              
              <div className="space-y-3 w-full">
                <a 
                  href={`https://1337x.to/search/${encodeURIComponent(title)}${isShow && season ? `+S${String(season).padStart(2, '0')}` : ''}${isShow && episode ? `E${String(episode).padStart(2, '0')}` : ''}/1/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-3 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                >
                  <span className="font-medium">Search on 1337x</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                
                <a 
                  href={`https://thepiratebay.org/search.php?q=${encodeURIComponent(title)}${isShow && season ? `+S${String(season).padStart(2, '0')}` : ''}${isShow && episode ? `E${String(episode).padStart(2, '0')}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-3 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                >
                  <span className="font-medium">Search on The Pirate Bay</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
                
                <a 
                  href={`https://rarbg.to/torrents.php?search=${encodeURIComponent(title)}${isShow && season ? `+S${String(season).padStart(2, '0')}` : ''}${isShow && episode ? `E${String(episode).padStart(2, '0')}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-3 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                >
                  <span className="font-medium">Search on RARBG</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          ) : (
            <>
              {torrents.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-3">Available Torrents</h3>
                  <div className="space-y-3">
                    {torrents.map((torrent, index) => (
                      <div
                        key={index}
                        className={cn(
                          "p-4 rounded-lg border transition-colors",
                          torrent.isOptimal 
                            ? "border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-500/10" 
                            : "border-border-light dark:border-border-dark hover:bg-light-surface dark:hover:bg-dark-surface"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Download className={cn(
                              "w-5 h-5",
                              torrent.isOptimal ? "text-red-600 dark:text-red-500" : "text-light-text-secondary dark:text-dark-text-secondary"
                            )} />
                            <span className={cn(
                              "font-medium",
                              torrent.isOptimal ? "text-red-600 dark:text-red-500" : ""
                            )}>
                              {torrent.quality} {torrent.type}
                            </span>
                          </div>
                          {torrent.isOptimal && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
                          <span>Size: {torrent.size}</span>
                          <span>Seeders: {torrent.seeders}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <a
                            href={torrent.magnet}
                            className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                          {torrent.sourceUrl && (
                            <a
                              href={torrent.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-light-surface dark:bg-dark-surface hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* External search options as fallback */}
              <div>
                <h3 className="text-sm font-semibold mb-3">External Search Options</h3>
                <div className="space-y-3">
                  <a 
                    href={`https://1337x.to/search/${encodeURIComponent(title)}${isShow && season ? `+S${String(season).padStart(2, '0')}` : ''}${isShow && episode ? `E${String(episode).padStart(2, '0')}` : ''}/1/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-4 py-3 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                  >
                    <span className="font-medium">Search on 1337x</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  
                  <a 
                    href={`https://thepiratebay.org/search.php?q=${encodeURIComponent(title)}${isShow && season ? `+S${String(season).padStart(2, '0')}` : ''}${isShow && episode ? `E${String(episode).padStart(2, '0')}` : ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-4 py-3 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                  >
                    <span className="font-medium">Search on The Pirate Bay</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  
                  <a 
                    href={`https://rarbg.to/torrents.php?search=${encodeURIComponent(title)}${isShow && season ? `+S${String(season).padStart(2, '0')}` : ''}${isShow && episode ? `E${String(episode).padStart(2, '0')}` : ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-4 py-3 bg-light-surface dark:bg-dark-surface rounded-lg flex items-center justify-between hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
                  >
                    <span className="font-medium">Search on RARBG</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border-light dark:border-border-dark text-xs text-light-text-secondary dark:text-dark-text-secondary">
          <p>
            Note: Please ensure you have the necessary rights to download this content and follow your local laws regarding copyright.
          </p>
        </div>
      </div>
    </>
  );
};

export default TorrentDownloader;