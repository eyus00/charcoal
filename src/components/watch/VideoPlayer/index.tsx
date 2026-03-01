import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import HlsLib from 'hls.js';
import { BackendApiResponse, BackendSource, BackendSubtitle } from '../../../api/player-types';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  List,
  Settings2,
  Subtitles,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Monitor,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useStore } from '../../../store/useStore';
import { QualitySelector, formatQuality } from './QualitySelector';
import SubtitleSelector from './SubtitleSelector';
import EpisodeSelector from './EpisodeSelector';

const Hls = HlsLib;

interface VideoPlayerProps {
  id?: number;
  apiResponse: BackendApiResponse;
  onEpisodeNext?: () => void;
  onEpisodePrevious?: () => void;
  currentEpisodeInfo?: { season: number; episode: number; total: number };
  isMovie?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  showTitle?: string;
  seasons?: any[];
  onEpisodeSelect?: (season: number, episode: number) => void;
  isFirstEpisode?: boolean;
  isLastEpisode?: boolean;
  onBack?: () => void;
  onTogglePlayer?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  id,
  apiResponse,
  isMovie,
  seasonNumber,
  episodeNumber,
  episodeTitle,
  showTitle,
  seasons,
  onEpisodeSelect,
  isFirstEpisode,
  isLastEpisode,
  onBack,
  onTogglePlayer,
  onEpisodeNext,
  onEpisodePrevious,
  onProgress
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const { watchHistory } = useStore();
  const initialSource = useMemo(() => {
    const sHD = apiResponse.sources.find(s => formatQuality(s.quality) === 'HD');
    if (sHD) return sHD;
    const s1080 = apiResponse.sources.find(s => formatQuality(s.quality) === '1080p');
    return s1080 || apiResponse.sources[0] || null;
  }, [apiResponse.sources]);

  const [currentSource, setCurrentSource] = useState<BackendSource | null>(initialSource);
  const [triedSources, setTriedSources] = useState<Set<string>>(new Set());
  const [currentSubtitle, setCurrentSubtitle] = useState<BackendSubtitle | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showQuality, setShowQuality] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showEpisodeSelector, setShowEpisodeSelector] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(seasonNumber || 1);

  useEffect(() => {
    setSelectedSeason(seasonNumber || 1);
  }, [seasonNumber]);

  useEffect(() => {
    if (!videoRef.current || !currentSource) return;

    const video = videoRef.current;
    setIsLoading(true);
    setProgress(0);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.src = '';

    if (currentSource.type === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          capLevelToPlayerSize: true,
          autoStartLoad: true,
          lowLatencyMode: false,
        });

        const onHlsError = (error: any) => {
          console.error('HLS Error:', error);
          setIsLoading(false);
        };

        hls.on(Hls.Events.ERROR, onHlsError);
        hls.loadSource(currentSource.url);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = currentSource.url;
      }
    } else {
      video.src = currentSource.url;
    }

    const handleTimeUpdate = () => {
      if (video.duration && !isNaN(video.duration)) {
        const currentProgress = (video.currentTime / video.duration) * 100;
        setProgress(currentProgress);
        onProgress?.(video.currentTime, video.duration);
      }
    };

    const handleDurationChange = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleCanPlay = () => setIsLoading(false);
    const handleError = () => {
      console.error('Video Player Error');
      if (currentSource) {
        setTriedSources(prev => new Set(prev).add(currentSource.url));

        const remainingSources = apiResponse.sources.filter(s => !triedSources.has(s.url) && s.url !== currentSource.url);
        if (remainingSources.length > 0) {
          const sHD = remainingSources.find(s => formatQuality(s.quality) === 'HD');
          const s1080 = remainingSources.find(s => formatQuality(s.quality) === '1080p');
          setCurrentSource(sHD || s1080 || remainingSources[0]);
        }
      }
      setIsLoading(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [currentSource, apiResponse.sources, triedSources]);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !videoRef.current || !duration) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(clickX / rect.width, 1));
    const newTime = percentage * duration;

    videoRef.current.currentTime = newTime;
    setProgress(percentage * 100);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const vol = Number(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showQuality && !showSubtitles && !showEpisodeSelector) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    if (showQuality || showSubtitles || showEpisodeSelector) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    }
  }, [showQuality, showSubtitles, showEpisodeSelector]);

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const skip = (amount: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.currentTime += amount;
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden group select-none font-sans"
      onMouseMove={handleMouseMove}
      onClick={() => togglePlay()}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
      >
        {currentSubtitle && (
          <track
            key={`${currentSubtitle.url}-${currentSubtitle.label}`}
            kind="subtitles"
            src={currentSubtitle.url}
            label={currentSubtitle.label}
            srcLang="en"
            default
          />
        )}
      </video>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] z-20">
          <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Top Header */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 p-4 md:p-8 flex items-start justify-between z-40 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 md:gap-3 p-1 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md min-w-0 max-w-[70%] sm:max-w-none">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95 group"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 group-hover:-translate-x-1 transition-transform" />
              </button>
            )}

            <div className="h-6 md:h-8 w-[1px] bg-white/10 mx-0.5 md:mx-1" />

            {showTitle && (
              <button
                onClick={(e) => {
                  if (!isMovie && seasons) {
                    e.stopPropagation();
                    setShowEpisodeSelector(!showEpisodeSelector);
                    setShowQuality(false);
                    setShowSubtitles(false);
                  }
                }}
                className={cn(
                  "flex flex-col text-left px-2 md:px-4 py-1.5 md:py-2 rounded-xl transition-all group/title min-w-0",
                  !isMovie && seasons ? "hover:bg-white/10 cursor-pointer" : "cursor-default"
                )}
              >
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  <h1 className="text-white text-sm md:text-lg font-bold tracking-tight transition-colors truncate">
                    {showTitle}
                  </h1>
                  {!isMovie && seasons && (
                    <div className={cn(
                      "p-1 rounded-md transition-all flex-shrink-0",
                      showEpisodeSelector ? "bg-accent/20 text-accent" : "bg-white/10 text-white/40 group-hover/title:bg-accent/20 group-hover/title:text-accent"
                    )}>
                      <List className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    </div>
                  )}
                </div>
                {!isMovie && seasonNumber && episodeNumber && (
                  <p className="text-white/40 text-[9px] md:text-xs font-bold uppercase tracking-wider mt-0.5 truncate">
                    S{seasonNumber} • E{episodeNumber} {episodeTitle && <span className="text-white/20 ml-1">· {episodeTitle}</span>}
                  </p>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
            {onTogglePlayer && (
              <button
                onClick={onTogglePlayer}
                className="px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-2.5 active:scale-95"
                title="Switch Player"
              >
                <Monitor className="w-5 h-5" />
                <span className="hidden sm:inline font-bold text-sm">Embed Mode</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Episode Selector Modal */}
      {!isMovie && showEpisodeSelector && seasons && (
        <EpisodeSelector
          isOpen={showEpisodeSelector}
          onClose={() => setShowEpisodeSelector(false)}
          seasons={seasons}
          seasonNumber={seasonNumber}
          episodeNumber={episodeNumber}
          id={id}
          isMovie={isMovie}
          isFirstEpisode={isFirstEpisode}
          isLastEpisode={isLastEpisode}
          onEpisodeSelect={onEpisodeSelect}
          onEpisodeNext={onEpisodeNext}
          onEpisodePrevious={onEpisodePrevious}
          showTitle={showTitle}
        />
      )}

      {/* Main Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 transition-all duration-500 flex flex-col justify-end p-6 md:p-10 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none z-30",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}
      >
        {/* Progress Bar Container */}
        <div
          ref={progressBarRef}
          className="w-full mb-4 md:mb-6 group/progress relative pointer-events-auto cursor-pointer py-2 md:py-4"
          onClick={handleProgressBarClick}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="relative h-1 md:h-2 bg-white/10 rounded-full overflow-hidden transition-all group-hover/progress:h-2 md:group-hover/progress:h-3">
            <div
              className="absolute top-0 left-0 h-full bg-accent transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 md:w-5 md:h-5 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all transform -translate-x-1/2 opacity-0 group-hover/progress:opacity-100 scale-50 group-hover/progress:scale-100"
            style={{ left: `${progress}%` }}
          />
        </div>

        {/* Controls Row */}
        <div className="flex flex-row items-center justify-between gap-2 md:gap-6 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 md:gap-8">
            <div className="flex items-center gap-1 md:gap-5">
              <button
                onClick={(e) => skip(-10, e)}
                className="text-white/70 hover:text-white transition-all p-2 md:p-3 rounded-xl hover:bg-white/10 active:scale-95"
                title="Rewind 10s"
              >
                <RotateCcw className="w-5 h-5 md:w-7 md:h-7" />
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-10 h-10 md:w-16 md:h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 md:w-8 md:h-8 fill-current" />
                ) : (
                  <Play className="w-5 h-5 md:w-8 md:h-8 fill-current ml-0.5 md:ml-1" />
                )}
              </button>

              <button
                onClick={(e) => skip(10, e)}
                className="text-white/70 hover:text-white transition-all p-2 md:p-3 rounded-xl hover:bg-white/10 active:scale-95"
                title="Forward 10s"
              >
                <RotateCw className="w-5 h-5 md:w-7 md:h-7" />
              </button>
            </div>

            <div className="flex items-center gap-2 md:gap-4 text-white/90 font-bold tabular-nums text-xs md:text-lg">
              <span className="opacity-100">{formatTime(videoRef.current?.currentTime || 0)}</span>
              <span className="text-white/20">/</span>
              <span className="text-white/50">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-5">
            <div className="hidden sm:flex items-center gap-2 group/volume">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setVolume(volume === 0 ? 1 : 0);
                  if (videoRef.current) videoRef.current.volume = volume === 0 ? 1 : 0;
                }}
                className="text-white/70 hover:text-white transition-all p-3 rounded-xl hover:bg-white/10 active:scale-90"
              >
                {volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
              <div className="w-0 group-hover/volume:w-24 overflow-hidden transition-all duration-300">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-accent"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 md:gap-2 p-1 md:p-1.5 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl backdrop-blur-md">
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQuality(!showQuality);
                    setShowSubtitles(false);
                  }}
                  className={cn(
                    "px-2 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl transition-all flex items-center gap-2 active:scale-95",
                    showQuality ? "bg-accent text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Settings2 className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline font-bold text-sm">{currentSource && formatQuality(currentSource.quality)}</span>
                </button>
                {showQuality && (
                  <div className="absolute bottom-full right-0 mb-4 animate-in fade-in slide-in-from-bottom-2">
                    <QualitySelector
                      sources={apiResponse.sources}
                      currentSource={currentSource}
                      onSelect={(src) => {
                        setCurrentSource(src);
                        setShowQuality(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSubtitles(!showSubtitles);
                    setShowQuality(false);
                  }}
                  className={cn(
                    "px-2 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl transition-all flex items-center gap-2 active:scale-95",
                    showSubtitles ? "bg-accent text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Subtitles className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline font-bold text-sm">Captions</span>
                </button>
                {showSubtitles && (
                  <div className="absolute bottom-full right-0 mb-4 animate-in fade-in slide-in-from-bottom-2">
                    <SubtitleSelector
                      subtitles={apiResponse.subtitles}
                      currentSubtitle={currentSubtitle}
                      onSelect={(sub) => {
                        setCurrentSubtitle(sub);
                        setShowSubtitles(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={(e) => toggleFullscreen(e)}
                className="p-2 md:p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg md:rounded-xl transition-all active:scale-95"
              >
                <Maximize className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
};

export default VideoPlayer;
