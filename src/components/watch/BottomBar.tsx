import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Server } from 'lucide-react';
import { cn } from '../../lib/utils';
import EpisodeSelector from './EpisodeSelector';
import SourcesMenu from './SourcesMenu';

interface BottomBarProps {
  onBack: () => void;
  backUrl: string;
  onPrevious: () => void;
  onNext: () => void;
  onSourceChange: (source: string) => void;
  selectedSource: string;
  showTitle?: string;
  episodeTitle?: string;
  seasons?: any[];
  currentSeason?: string;
  currentEpisode?: string;
  selectedSeason: number;
  onSeasonChange: (season: number) => void;
  onEpisodeSelect: (season: number, episode: number) => void;
  isFirstEpisode: boolean;
  isLastEpisode: boolean;
  tvId: number;
  isMovie?: boolean;
}

const BottomBar: React.FC<BottomBarProps> = ({
  onBack,
  backUrl,
  onPrevious,
  onNext,
  onSourceChange,
  selectedSource,
  showTitle,
  episodeTitle,
  seasons,
  currentSeason,
  currentEpisode,
  selectedSeason,
  onSeasonChange,
  onEpisodeSelect,
  isFirstEpisode,
  isLastEpisode,
  tvId,
  isMovie,
}) => {
  const [isEpisodeMenuOpen, setIsEpisodeMenuOpen] = React.useState(false);
  const [isSourcesMenuOpen, setIsSourcesMenuOpen] = React.useState(false);
  const episodeButtonRef = React.useRef<HTMLButtonElement>(null);
  const sourcesButtonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <div className="relative flex items-center justify-between gap-2 p-2 bg-black/90 backdrop-blur-sm border-t border-white/20">
      <button
        onClick={onBack}
        className="h-10 px-3 md:px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1.5 transition-all duration-200 border border-white/20 flex-shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="font-medium text-sm hidden md:inline">Back</span>
      </button>

      <div className="relative flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/20 flex-1 max-w-[calc(100%-160px)] md:max-w-[500px]">
        {!isMovie && (
          <button
            onClick={onPrevious}
            disabled={isFirstEpisode}
            className="h-8 px-2 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <button
          ref={episodeButtonRef}
          onClick={() => setIsEpisodeMenuOpen(!isEpisodeMenuOpen)}
          className="h-8 px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center transition-all duration-200 border border-white/20 flex-1 min-w-0 overflow-hidden"
        >
          <div className="flex items-center gap-2 text-sm font-medium w-full min-w-0">
            <span className="truncate">{showTitle}</span>
            {!isMovie && currentSeason && currentEpisode && (
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-white/60">•</span>
                <span>
                  S{currentSeason.padStart(2, '0')}E{currentEpisode.padStart(2, '0')}
                </span>
              </span>
            )}
          </div>
        </button>
        {!isMovie && (
          <button
            onClick={onNext}
            disabled={isLastEpisode}
            className="h-8 px-2 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center transition-all duration-200 border border-white/20 hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {isEpisodeMenuOpen && !isMovie && (
          <EpisodeSelector
            isOpen={isEpisodeMenuOpen}
            onClose={() => setIsEpisodeMenuOpen(false)}
            seasons={seasons}
            selectedSeason={selectedSeason}
            currentSeason={currentSeason}
            currentEpisode={currentEpisode}
            onSeasonChange={onSeasonChange}
            onEpisodeSelect={onEpisodeSelect}
            tvId={tvId}
          />
        )}
      </div>

      <div className="relative">
        <button
          ref={sourcesButtonRef}
          onClick={() => setIsSourcesMenuOpen(!isSourcesMenuOpen)}
          className="h-10 px-3 md:px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1.5 transition-all duration-200 border border-white/20 flex-shrink-0"
        >
          <Server className="w-4 h-4" />
          <span className="font-medium text-sm hidden md:inline">Source</span>
        </button>

        <SourcesMenu
          isOpen={isSourcesMenuOpen}
          onClose={() => setIsSourcesMenuOpen(false)}
          selectedSource={selectedSource}
          onSourceSelect={(source) => {
            onSourceChange(source);
            setIsSourcesMenuOpen(false);
          }}
        />
      </div>
    </div>
  );
};

export default BottomBar;