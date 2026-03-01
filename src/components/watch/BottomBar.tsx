import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Server, MonitorPlay, List } from 'lucide-react';
import { cn } from '../../lib/utils';
import EpisodeSelector from './VideoPlayer/EpisodeSelector';
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
  isLandscape?: boolean;
  useCustomPlayer?: boolean;
  onTogglePlayer?: () => void;
  hasCustomPlayer?: boolean;
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
  isLandscape,
  useCustomPlayer,
  onTogglePlayer,
  hasCustomPlayer,
}) => {
  const [isEpisodeMenuOpen, setIsEpisodeMenuOpen] = React.useState(false);
  const [isSourcesMenuOpen, setIsSourcesMenuOpen] = React.useState(false);
  const episodeButtonRef = React.useRef<HTMLButtonElement>(null);
  const sourcesButtonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <div className={cn(
      "relative flex items-center justify-between gap-4 p-4 md:p-6 bg-black/95 backdrop-blur-xl border-t border-white/10 z-50",
      isLandscape && "border-b border-t-0"
    )}>
      {/* Back Button Container */}
      <div className="flex items-center gap-3 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex items-center justify-center p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95 group"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 group-hover:-translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Center Navigation Container */}
      <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md flex-1 max-w-[600px] min-w-0">
        {!isMovie && (
          <button
            onClick={onPrevious}
            disabled={isFirstEpisode}
            className="p-2.5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent rounded-xl transition-all active:scale-95 flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <button
          ref={episodeButtonRef}
          onClick={() => setIsEpisodeMenuOpen(!isEpisodeMenuOpen)}
          className={cn(
            "flex flex-col text-left px-3 md:px-5 py-1.5 md:py-2 rounded-xl transition-all group/title min-w-0 flex-1 hover:bg-white/10",
            isEpisodeMenuOpen && "bg-accent/20"
          )}
        >
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h1 className="text-white text-sm md:text-base font-bold tracking-tight transition-colors truncate">
              {showTitle}
            </h1>
            {!isMovie && (
              <div className={cn(
                "p-1 rounded-md transition-all flex-shrink-0",
                isEpisodeMenuOpen ? "bg-accent text-white" : "bg-white/10 text-white/40 group-hover/title:bg-accent/20 group-hover/title:text-accent"
              )}>
                <List className="w-3 h-3 md:w-3.5 md:h-3.5" />
              </div>
            )}
          </div>
          {!isMovie && currentSeason && currentEpisode && (
            <p className="text-white/40 text-[9px] md:text-xs font-bold uppercase tracking-wider mt-0.5 truncate">
              S{currentSeason} • E{currentEpisode} {episodeTitle && <span className="text-white/20 ml-1">· {episodeTitle}</span>}
            </p>
          )}
        </button>

        {!isMovie && (
          <button
            onClick={onNext}
            disabled={isLastEpisode}
            className="p-2.5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent rounded-xl transition-all active:scale-95 flex-shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Right Controls Container */}
      <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
        {hasCustomPlayer && (
          <button
            onClick={onTogglePlayer}
            className={cn(
              "px-3 md:px-5 py-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-2.5 active:scale-95",
              useCustomPlayer && "bg-accent/20 text-accent"
            )}
            title={useCustomPlayer ? "Switch to Embed Player" : "Switch to Custom Player"}
          >
            <MonitorPlay className="w-5 h-5" />
            <span className="hidden lg:inline font-bold text-sm">
              {useCustomPlayer ? "Embed Mode" : "Custom Player"}
            </span>
          </button>
        )}

        <div className="relative">
          <button
            ref={sourcesButtonRef}
            onClick={() => setIsSourcesMenuOpen(!isSourcesMenuOpen)}
            className={cn(
              "px-3 md:px-5 py-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-2.5 active:scale-95",
              isSourcesMenuOpen && "bg-accent/20 text-accent"
            )}
          >
            <Server className="w-5 h-5" />
            <span className="hidden md:inline font-bold text-sm">Source</span>
          </button>

          <SourcesMenu
            isOpen={isSourcesMenuOpen}
            onClose={() => setIsSourcesMenuOpen(false)}
            selectedSource={selectedSource}
            onSourceSelect={(source) => {
              onSourceChange(source);
              if (useCustomPlayer && onTogglePlayer) onTogglePlayer();
              setIsSourcesMenuOpen(false);
            }}
            isLandscape={isLandscape}
          />
        </div>
      </div>

      {/* Episode Selector Modal */}
      {isEpisodeMenuOpen && !isMovie && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
          <EpisodeSelector
            isOpen={isEpisodeMenuOpen}
            onClose={() => setIsEpisodeMenuOpen(false)}
            seasons={seasons || []}
            seasonNumber={Number(currentSeason)}
            episodeNumber={Number(currentEpisode)}
            id={tvId}
            onEpisodeSelect={onEpisodeSelect}
            onEpisodeNext={onNext}
            onEpisodePrevious={onPrevious}
            isFirstEpisode={isFirstEpisode}
            isLastEpisode={isLastEpisode}
            showTitle={showTitle}
          />
        </div>
      )}
    </div>
  );
};

export default BottomBar;
