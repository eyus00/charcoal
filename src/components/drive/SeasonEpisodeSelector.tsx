import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SeasonEpisodeSelectorProps {
  selectedSeason?: number;
  selectedEpisode?: number;
  seasons: {season_number: number; name: string; episode_count: number}[];
  episodeCount: number;
  onSeasonSelect: (season: number) => void;
  onEpisodeSelect: (episode: number) => void;
}

const SeasonEpisodeSelector: React.FC<SeasonEpisodeSelectorProps> = ({
  selectedSeason,
  selectedEpisode,
  seasons,
  episodeCount,
  onSeasonSelect,
  onEpisodeSelect
}) => {
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [showEpisodeDropdown, setShowEpisodeDropdown] = useState(false);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);
  const episodeDropdownRef = useRef<HTMLDivElement>(null);

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

  return (
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
                  onClick={() => onSeasonSelect(season.season_number)}
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
  );
};

export default SeasonEpisodeSelector;