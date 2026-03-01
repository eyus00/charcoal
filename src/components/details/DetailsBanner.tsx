import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Star, Clock, Play, Bookmark, SkipForward, Calendar, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';
import { WatchStatus, WatchHistoryItem } from '../../store/useStore';
import WatchlistMenu from '../shared/WatchlistMenu';
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
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const resumeInfo = getResumeInfo(type, Number(id), watchHistory);

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
    <div className="relative w-full rounded-[2rem] overflow-hidden group/banner shadow-2xl">
      {/* Background layers */}
      <div className="absolute inset-0">
        <img
          src={getImageUrl(backdropPath, 'original')}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/30 to-transparent" />
        <div className="absolute inset-0 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 p-6 md:p-10 lg:p-14">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center lg:items-end">
          {/* Poster */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-48 md:w-64 lg:w-72 flex-shrink-0 relative"
          >
            <div className="absolute -inset-1 bg-gradient-to-b from-accent/50 to-accent/30 rounded-2xl blur opacity-20" />
            <img
              src={getImageUrl(posterPath, 'w500')}
              alt={title}
              className="relative w-full rounded-2xl border border-white/10 shadow-2xl"
            />
          </motion.div>

          {/* Content */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              {/* Type tag redesigned */}
              <div className="flex justify-center lg:justify-start items-center gap-3 mb-5">
                <div className="relative inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-accent/90 to-accent/70 backdrop-blur-lg text-white rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider shadow-lg shadow-accent/30 border border-accent/40">
                  {type === 'movie' ? (
                    <Film className="w-3.5 h-3.5" />
                  ) : (
                    <Tv className="w-3.5 h-3.5" />
                  )}
                  {type === 'movie' ? 'Movie' : 'TV Series'}
                  <div className="absolute -inset-1 bg-accent/20 rounded-full blur-md -z-10" />
                </div>
                {contentRating && (
                  <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md text-white/80 text-[10px] md:text-xs font-bold rounded-full border border-white/10 uppercase">
                    {contentRating}
                  </span>
                )}
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-4 text-white tracking-tight leading-none">
                {title}
              </h1>

              {/* Stats */}
              <div className="flex flex-wrap justify-center lg:justify-start items-center gap-6 mb-6">
                <div className="flex items-center gap-2 group/stat">
                  <div className="p-2 bg-yellow-400/10 rounded-lg border border-yellow-400/20 group-hover/stat:bg-yellow-400/20 transition-colors">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{rating.toFixed(1)}</div>
                    <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Rating</div>
                  </div>
                </div>

                {type === 'movie' ? (
                  runtime > 0 && (
                    <div className="flex items-center gap-2 group/stat">
                      <div className="p-2 bg-blue-400/10 rounded-lg border border-blue-400/20 group-hover/stat:bg-blue-400/20 transition-colors">
                        <Clock className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-white">{formatDuration(runtime)}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Duration</div>
                      </div>
                    </div>
                  )
                ) : (
                  numberOfSeasons && (
                    <div className="flex items-center gap-2 group/stat">
                      <div className="p-2 bg-accent/10 rounded-lg border border-accent/20 group-hover/stat:bg-accent/20 transition-colors">
                        <Layers className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-white">
                          {numberOfSeasons} {numberOfSeasons === 1 ? 'Season' : 'Seasons'}
                        </div>
                        <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Content</div>
                      </div>
                    </div>
                  )
                )}

                <div className="flex items-center gap-2 group/stat">
                  <div className="p-2 bg-green-400/10 rounded-lg border border-green-400/20 group-hover/stat:bg-green-400/20 transition-colors">
                    <Calendar className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{year}</div>
                    <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Release</div>
                  </div>
                </div>
              </div>

              {/* Genres */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-6">
                {genres?.map((genre) => (
                  <span
                    key={genre.id}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-full border border-white/20 transition-colors cursor-default backdrop-blur-md"
                  >
                    {genre.name}
                  </span>
                ))}
              </div>

              {/* Overview – fixed height + ellipsis, 4 lines */}
              <div className="mb-8 max-w-2xl mx-auto lg:mx-0">
                <p
                  className="text-sm md:text-base text-white/70 leading-relaxed text-left line-clamp-4"
                >
                  {overview}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-center lg:justify-start items-center gap-4">
                {type === 'movie' ? (
                  <Link
                    to={getWatchUrl()}
                    className="w-full sm:w-auto px-8 py-4 bg-accent hover:bg-accent/90 text-white rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-accent/20 active:scale-95 group/play border border-white/20"
                  >
                    {resumeInfo && !resumeInfo.isCompleted ? (
                      <>
                        <SkipForward className="w-5 h-5 fill-current group-hover:translate-x-1 transition-transform" />
                        <span className="font-bold text-lg uppercase tracking-wide">Resume</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-current ml-0.5 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-lg uppercase tracking-wide">Play</span>
                      </>
                    )}
                  </Link>
                ) : (
                  <button
                    onClick={onPlayClick}
                    className="w-full sm:w-auto px-8 py-4 bg-accent hover:bg-accent/90 text-white rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-accent/20 active:scale-95 group/play border border-white/20"
                  >
                    {resumeInfo && !resumeInfo.isCompleted ? (
                      <>
                        <SkipForward className="w-5 h-5 fill-current group-hover:translate-x-1 transition-transform" />
                        <span className="font-bold text-lg uppercase tracking-wide">Resume</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-current ml-0.5 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-lg uppercase tracking-wide">Play</span>
                      </>
                    )}
                  </button>
                )}

                <div className="relative w-full sm:w-auto">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveMenu(activeMenu === Number(id) ? null : Number(id));
                    }}
                    className={cn(
                      "w-full sm:w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-95 border",
                      watchlistItem
                        ? "bg-white/10 border-accent/50 text-accent"
                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                    )}
                  >
                    <Bookmark
                      className={cn(
                        "w-6 h-6 transition-transform",
                        watchlistItem ? "fill-current" : ""
                      )}
                    />
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
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsBanner;
