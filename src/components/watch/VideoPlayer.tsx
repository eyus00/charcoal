import React, { useState, useEffect } from 'react';
import { VideoPlayer as CustomVideoPlayer } from './VideoPlayer/index';
import { BackendApiResponse } from '../../api/player-types';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface VideoPlayerProps {
  id?: number;
  videoUrl?: string;
  jellyData?: BackendApiResponse | null;
  useCustomPlayer: boolean;
  isMovie?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  showTitle?: string;
  seasons?: any[];
  onEpisodeNext?: () => void;
  onEpisodePrevious?: () => void;
  onEpisodeSelect?: (season: number, episode: number) => void;
  isFirstEpisode?: boolean;
  isLastEpisode?: boolean;
  onBack?: () => void;
  onTogglePlayer?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  resumeTime?: number;
  jellyError?: string | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  id,
  videoUrl,
  jellyData,
  useCustomPlayer,
  isMovie,
  seasonNumber,
  episodeNumber,
  episodeTitle,
  showTitle,
  seasons,
  onEpisodeNext,
  onEpisodePrevious,
  onEpisodeSelect,
  isFirstEpisode,
  isLastEpisode,
  onBack,
  onTogglePlayer,
  onProgress,
  resumeTime,
  jellyError,
}) => {
  const [showEpisodeSelector, setShowEpisodeSelector] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(seasonNumber || 1);

  useEffect(() => {
    setSelectedSeason(seasonNumber || 1);
  }, [seasonNumber]);

  if (useCustomPlayer) {
    if (!jellyData) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {jellyError ? (
            <div className="flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/40">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <h3 className="text-white font-bold text-xl tracking-tight">Server Unavailable</h3>
                <p className="text-white/40 text-sm font-medium">{jellyError}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-accent/20 border-t-accent rounded-full animate-spin"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-b-accent/40 rounded-full animate-spin-slow"></div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <h3 className="text-white font-bold text-xl tracking-tight">Trying Jelly Server</h3>
                <p className="text-white/40 text-sm font-medium animate-pulse">Establishing secure connection...</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative w-full h-full bg-black overflow-hidden">
        <CustomVideoPlayer
          id={id}
          apiResponse={jellyData}
          isMovie={isMovie}
          seasonNumber={seasonNumber}
          episodeNumber={episodeNumber}
          episodeTitle={episodeTitle}
          showTitle={showTitle}
          seasons={seasons}
          onEpisodeSelect={onEpisodeSelect}
          onEpisodeNext={onEpisodeNext}
          onEpisodePrevious={onEpisodePrevious}
          isFirstEpisode={isFirstEpisode}
          isLastEpisode={isLastEpisode}
          onBack={onBack}
          onTogglePlayer={onTogglePlayer}
          onProgress={onProgress}
          resumeTime={resumeTime}
        />
      </div>
    );
  }

  if (!videoUrl) return null;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <iframe
        key={videoUrl}
        src={videoUrl}
        className="w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
      {onTogglePlayer && (
        <div className="absolute top-0 left-0 right-0 p-4 md:p-8 z-40 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center gap-3 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
              <button
                onClick={onTogglePlayer}
                className="px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-2 active:scale-95"
                title="Switch to Jelly Player"
              >
                <div className="hidden sm:flex flex-col">
                  <span className="text-[10px] md:text-xs font-medium text-white/50">SWITCH TO</span>
                  <span className="font-bold text-sm leading-tight">Jelly Mode</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
