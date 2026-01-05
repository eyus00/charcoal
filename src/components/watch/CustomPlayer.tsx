import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  ChevronDown,
  Subtitles
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Quality {
  quality: string;
  url: string;
}

interface Caption {
  language: string;
  url: string;
  default?: boolean;
}

interface CustomPlayerProps {
  streamUrl: string;
  qualities?: Quality[];
  captions?: Caption[];
  title?: string;
  poster?: string;
  onProgress?: (progress: number, duration: number) => void;
  onEnded?: () => void;
}

const CustomPlayer: React.FC<CustomPlayerProps> = ({
  streamUrl,
  qualities = [],
  captions = [],
  title = 'Video Player',
  poster,
  onProgress,
  onEnded
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressTimeoutRef = useRef<NodeJS.Timeout>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showCaptionMenu, setShowCaptionMenu] = useState(false);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Auto-hide controls
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(controlsTimeoutRef.current);
      if (isPlaying) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    if (containerRef.current) {
      containerRef.current.addEventListener('mousemove', handleMouseMove);
      containerRef.current.addEventListener('mouseleave', () => {
        if (isPlaying) setShowControls(false);
      });
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove);
      }
      clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  // Handle fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowRight':
          videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 5, duration);
          break;
        case 'ArrowLeft':
          videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 5, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(volume + 0.1, 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(volume - 0.1, 0));
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          setIsMuted(!isMuted);
          break;
        case 'KeyC':
          setShowCaptionMenu(!showCaptionMenu);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, isMuted, duration, showCaptionMenu]);

  // Handle video events
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      
      if (onProgress) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = setTimeout(() => {
          onProgress(time, duration);
        }, 1000);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleProgress = () => {
    if (videoRef.current) {
      const bufferedLength = videoRef.current.buffered.length;
      if (bufferedLength > 0) {
        const bufferedEnd = videoRef.current.buffered.end(bufferedLength - 1);
        setBuffered((bufferedEnd / duration) * 100);
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    if (newVolume > 0) {
      setIsMuted(false);
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          await (containerRef.current as any).mozRequestFullScreen();
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const handleQualityChange = (quality: Quality) => {
    if (videoRef.current && selectedQuality !== quality.quality) {
      setLoadingQuality(true);
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = isPlaying;

      videoRef.current.src = quality.url;
      videoRef.current.currentTime = currentTime;

      if (wasPlaying) {
        videoRef.current.play();
      }

      setSelectedQuality(quality.quality);
      setShowQualityMenu(false);

      const onLoadedData = () => {
        setLoadingQuality(false);
        videoRef.current?.removeEventListener('loadeddata', onLoadedData);
      };

      videoRef.current.addEventListener('loadeddata', onLoadedData);
    }
  };

  const handleCaptionToggle = (caption: Caption | null) => {
    if (!videoRef.current) return;

    if (caption) {
      const trackElement = document.createElement('track');
      trackElement.kind = 'captions';
      trackElement.label = caption.language;
      trackElement.src = caption.url;
      if (caption.default) trackElement.default = true;

      videoRef.current.innerHTML = '';
      videoRef.current.appendChild(trackElement);
      setSelectedCaption(caption.language);
    } else {
      const tracks = videoRef.current.querySelectorAll('track');
      tracks.forEach(track => track.remove());
      setSelectedCaption(null);
    }
    setShowCaptionMenu(false);
  };

  const formatTime = (time: number): string => {
    if (!time || isNaN(time)) return '0:00';
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
  };

  return (
    <div
      ref={containerRef}
      className="player-container relative w-full h-full bg-black flex items-center justify-center group"
    >
      <video
        ref={videoRef}
        src={qualities.length > 0 ? qualities[0].url : streamUrl}
        className="w-full h-full"
        poster={poster}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onEnded={onEnded}
        crossOrigin="anonymous"
      />

      {/* Loading indicator */}
      {loadingQuality && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      )}

      {/* Controls */}
      <div
        className={cn(
          'player-controls absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300',
          !showControls && isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
      >
        {/* Progress bar */}
        <div className="w-full mb-3 cursor-pointer group/progress">
          <div
            className="relative h-1 bg-gray-600 rounded hover:h-2 transition-all"
            onClick={handleProgressBarClick}
          >
            {/* Buffered */}
            <div
              className="absolute h-full bg-gray-500 rounded"
              style={{ width: `${buffered}%` }}
            />
            {/* Progress */}
            <div
              className="absolute h-full bg-red-500 rounded"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full scale-0 group-hover/progress:scale-100 transition-transform -translate-x-1/2" />
            </div>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="p-2 hover:bg-white/20 rounded transition-colors"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" fill="white" />
              ) : (
                <Play className="w-5 h-5 text-white" fill="white" />
              )}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/volume">
              <button
                onClick={handleMuteToggle}
                className="p-2 hover:bg-white/20 rounded transition-colors"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover/volume:w-24 transition-all h-1 bg-gray-600 rounded cursor-pointer appearance-none"
              />
            </div>

            {/* Time display */}
            <span className="text-white text-sm ml-2 whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Captions */}
            {captions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowCaptionMenu(!showCaptionMenu)}
                  className="p-2 hover:bg-white/20 rounded transition-colors"
                  title="Subtitles (C)"
                >
                  <Subtitles
                    className={cn(
                      'w-5 h-5',
                      selectedCaption ? 'text-white' : 'text-gray-400'
                    )}
                  />
                </button>
                {showCaptionMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded shadow-lg z-50">
                    <button
                      onClick={() => handleCaptionToggle(null)}
                      className={cn(
                        'block w-full text-left px-4 py-2 hover:bg-gray-800 transition-colors',
                        !selectedCaption && 'bg-blue-600'
                      )}
                    >
                      Off
                    </button>
                    {captions.map(caption => (
                      <button
                        key={caption.language}
                        onClick={() => handleCaptionToggle(caption)}
                        className={cn(
                          'block w-full text-left px-4 py-2 hover:bg-gray-800 transition-colors',
                          selectedCaption === caption.language && 'bg-blue-600'
                        )}
                      >
                        {caption.language}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality selector */}
            {qualities.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="p-2 hover:bg-white/20 rounded transition-colors flex items-center gap-1"
                  title="Quality"
                >
                  <Settings className="w-5 h-5 text-white" />
                  <span className="text-white text-sm">
                    {selectedQuality || qualities[0]?.quality}
                  </span>
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded shadow-lg z-50">
                    {qualities.map(quality => (
                      <button
                        key={quality.quality}
                        onClick={() => handleQualityChange(quality)}
                        className={cn(
                          'block w-full text-left px-4 py-2 hover:bg-gray-800 transition-colors',
                          selectedQuality === quality.quality && 'bg-blue-600'
                        )}
                      >
                        {quality.quality}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/20 rounded transition-colors"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5 text-white" />
              ) : (
                <Maximize className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Play button overlay */}
      {!isPlaying && (
        <button
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center hover:bg-black/30 transition-colors"
          title="Play (Space)"
        >
          <Play className="w-16 h-16 text-white fill-white opacity-80 hover:opacity-100 transition-opacity" />
        </button>
      )}

      {/* Title */}
      {title && (
        <div className="absolute top-4 left-4 text-white text-sm bg-black/50 px-3 py-1 rounded">
          {title}
        </div>
      )}
    </div>
  );
};

export default CustomPlayer;
