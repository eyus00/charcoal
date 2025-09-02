import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star, Clock, Play, Bookmark, StepForward } from 'lucide-react';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { WatchStatus, WatchHistoryItem } from '../../store/useStore';
import WatchlistMenu from './WatchlistMenu';
import { getResumeInfo } from '../../lib/watch';

interface DetailsBannerProps {
  type: 'movie' | 'tv';
  title: string;
  year: number;
  overview: string;
  posterPath: string;
  backdropPath: string;
  rating: number;
  runtime?: number;
  contentRating?: string;
  genres?: { id: number; name: string }[];
  watchlistItem?: { status: WatchStatus };
  onWatchlistAdd: (status: WatchStatus) => void;
  onWatchlistRemove: () => void;
  id: string;
  season?: string;
  episode?: string;
  watchHistory: WatchHistoryItem[];
  onPlayClick?: (e: React.MouseEvent) => void;
  numberOfSeasons?: number;
}

const DetailsBanner: React.FC<DetailsBannerProps> = ({
  type,
  title,
  year,
  overview,
  posterPath,
  backdropPath,
  rating,
  runtime,
  contentRating,
  genres,
  watchlistItem,
  onWatchlistAdd,
  onWatchlistRemove,
  id,
  season,
  episode,
  watchHistory,
  onPlayClick,
  numberOfSeasons,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  const resumeInfo = getResumeInfo(type, Number(id), watchHistory);

  useEffect(() => {
    const checkTextHeight = () => {
      if (textRef.current) {
        const lineHeight = parseInt(window.getComputedStyle(textRef.current).lineHeight);
        const threeLineHeight = lineHeight * 3;
        setNeedsExpansion(textRef.current.scrollHeight > threeLineHeight);
      }
    };

    checkTextHeight();
    window.addEventListener('resize', checkTextHeight);
    return () => window.removeEventListener('resize', checkTextHeight);
  }, [overview]);

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  const getWatchUrl = () => {
    if (type === 'movie') {
      return `/watch/movie/${id}`;
    }
    
    if (resumeInfo?.season && resumeInfo?.episode) {
      return `/watch/tv/${id}?season=${resumeInfo.season}&episode=${resumeInfo.episode}`;
    }
    
    return `/watch/tv/${id}?season=${season || '1'}&episode=${episode || '1'}`;
  };

  return (
    <div 
      className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden relative"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(0, 0, 0, 0.8), rgb(18, 18, 18) 100%), url(${getImageUrl(backdropPath)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
          <div className="w-40 md:w-48 flex-shrink-0">
            <img
              src={getImageUrl(posterPath, 'w500')}
              alt={title}
              className="w-full rounded-lg border border-gray-400/50 dark:border-white/20"
            />
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex justify-center md:justify-start items-center gap-2 mb-2">
              {type === 'movie' ? (
                <Film className="w-5 h-5 text-white" />
              ) : (
                <Tv className="w-5 h-5 text-white" />
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
              {title} <span className="text-white/60">({year})</span>
            </h1>

            <div className="flex justify-center md:justify-start items-center gap-3 mb-3">
              <div className="flex items-center">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                <span className="ml-1 text-white text-base">{rating.toFixed(1)}</span>
              </div>
              {type === 'movie' ? (
                runtime > 0 && (
                  <div className="flex items-center text-white">
                    <Clock className="w-5 h-5" />
                    <span className="ml-2">{formatDuration(runtime)}</span>
                  </div>
                )
              ) : (
                numberOfSeasons && (
                  <div className="flex items-center text-white">
                    <span>{numberOfSeasons} Season{numberOfSeasons > 1 ? 's' : ''}</span>
                  </div>
                )
              )}
              {contentRating && (
                <span className="text-white text-sm px-2 py-0.5 border border-white/20 rounded">
                  {contentRating}
                </span>
              )}
            </div>

            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
              {genres?.map((genre) => (
                <span key={genre.id} className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm rounded-full">
                  {genre.name}
                </span>
              ))}
            </div>

            <div className="relative mb-3 max-w-2xl mx-auto md:mx-0">
              <div className={cn(
                "relative text-sm md:text-base text-white/90",
                !isExpanded && "max-h-[3.5em] overflow-hidden"
              )}>
                <p ref={textRef} className="leading-relaxed">
                  {overview}
                </p>
                {needsExpansion && !isExpanded && (
                  <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-black to-transparent" />
                )}
              </div>
              {needsExpansion && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-white/60 hover:text-white text-sm font-medium mt-1"
                >
                  {isExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>

            <div className="flex justify-center md:justify-start items-center gap-2">
              {type === 'movie' ? (
                <Link
                  to={getWatchUrl()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg border border-white/20"
                >
                  {resumeInfo && !resumeInfo.isCompleted ? (
                    <>
                      <StepForward className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Resume</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Play</span>
                    </>
                  )}
                </Link>
              ) : (
                <button
                  onClick={onPlayClick}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg border border-white/20"
                >
                  {resumeInfo && !resumeInfo.isCompleted ? (
                    <>
                      <StepForward className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Resume</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Play</span>
                    </>
                  )}
                </button>
              )}

              <div className="relative">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveMenu(activeMenu === Number(id) ? null : Number(id));
                  }}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-md border border-white/20",
                    watchlistItem
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-white/20 hover:bg-white/30"
                  )}
                >
                  <Bookmark className={cn(
                    "w-5 h-5 transition-transform",
                    watchlistItem ? "text-white fill-white" : "text-white"
                  )} />
                </button>

                <WatchlistMenu
                  isOpen={activeMenu === Number(id)}
                  onClose={() => setActiveMenu(null)}
                  onAdd={onWatchlistAdd}
                  onRemove={onWatchlistRemove}
                  currentStatus={watchlistItem?.status}
                  position="top-left"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsBanner;