import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video as VideoIcon, List, X, ChevronLeft, ChevronRight, Play, Check, Eye, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';

interface Episode {
  episode_number: number;
  name: string;
  still_path: string | null;
  overview?: string;
  runtime?: number;
  air_date?: string;
}

interface Season {
  season_number: number;
  episodes: Episode[];
}

interface TVDetailsEpisodeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: Season[];
  tvId: string | undefined;
  currentSeason?: string;
  currentEpisode?: string;
  resumeInfo?: any;
}

const TVDetailsEpisodeSelector: React.FC<TVDetailsEpisodeSelectorProps> = ({
  isOpen,
  onClose,
  seasons,
  tvId,
  currentSeason,
  currentEpisode,
  resumeInfo,
}) => {
  const navigate = useNavigate();
  const { watchHistory } = useStore();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);

  if (!isOpen || !tvId || !seasons) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-xl z-50 flex items-end md:items-center justify-center"
        onClick={() => onClose()}
      >
        <motion.div
          initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 20 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className={cn(
            "w-full overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)] bg-white/5 border-white/10",
            isMobile
              ? "h-[90vh] rounded-t-3xl border-t"
              : "max-w-6xl h-[85vh] rounded-3xl border"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-8 border-b border-white/10 bg-white/5 gap-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <List className="w-5 h-5 md:w-6 md:h-6 text-accent" />
              <h2 className="text-white font-bold text-lg md:text-2xl tracking-tight">Episodes</h2>
            </div>
            <div className="flex items-center gap-3 md:gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 flex-shrink-0">
                {seasons.map((season) => (
                  <button
                    key={season.season_number}
                    onClick={() => setSelectedSeason(season.season_number)}
                    className={cn(
                      "px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-bold text-xs md:text-sm transition-all whitespace-nowrap",
                      selectedSeason === season.season_number
                        ? "bg-accent text-white shadow-lg shadow-accent/20"
                        : "text-white/40 hover:text-white/80"
                    )}
                  >
                    S{season.season_number}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onClose()}
                className="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all active:scale-95 border border-white/5 hover:border-white/10 flex-shrink-0"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>
          </div>

          {/* Episodes Grid */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
              {currentSeasonData?.episodes.map((episode: Episode) => {
                const airDate = episode.air_date ? new Date(episode.air_date) : null;
                const isUpcoming = airDate ? airDate > new Date() : false;
                const formattedDate = airDate
                  ? airDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: airDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                    })
                  : 'TBA';

                const historyItem = watchHistory.find(
                  h =>
                    h.id === Number(tvId) &&
                    h.mediaType === 'tv' &&
                    h.season === selectedSeason &&
                    h.episode === episode.episode_number
                );

                const watchedProgress = historyItem?.progress
                  ? (historyItem.progress.watched / historyItem.progress.duration) * 100
                  : 0;
                const isCompleted = historyItem?.isCompleted;

                const isCurrentEpisode =
                  Number(currentSeason) === selectedSeason && Number(episode.episode_number) === Number(currentEpisode);

                return (
                  <motion.button
                    key={episode.episode_number}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (episode.episode_number - 1) * 0.05 }}
                    disabled={isUpcoming}
                    onClick={() => {
                      navigate(`/watch/tv/${tvId}?season=${selectedSeason}&episode=${episode.episode_number}`);
                      onClose();
                    }}
                    className={cn(
                      "group flex flex-col gap-2 md:gap-3 p-2 md:p-3 rounded-2xl transition-all text-left border relative overflow-hidden",
                      isCurrentEpisode
                        ? "bg-accent/10 border-accent/40 ring-1 ring-accent/20"
                        : "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10",
                      isUpcoming && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="w-full aspect-video bg-white/5 rounded-xl overflow-hidden relative flex-shrink-0 shadow-lg transition-transform">
                      {episode.still_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w500${episode.still_path}`}
                          alt={episode.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/10">
                          <Play className="w-12 md:w-16 h-12 md:h-16 fill-current" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />

                      {/* Upcoming Badge */}
                      {isUpcoming && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                          <div className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-white shadow-2xl">
                            Upcoming
                          </div>
                        </div>
                      )}

                      {/* Bottom Left Badge */}
                      <div className="absolute bottom-1.5 md:bottom-2 left-1.5 md:left-2">
                        {episode.runtime && (
                          <div className="px-2 py-1 bg-black/80 backdrop-blur-md text-white rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider">
                            {episode.runtime}m
                          </div>
                        )}
                      </div>

                      {/* Bottom Right Badge */}
                      <div className="absolute bottom-1.5 md:bottom-2 right-1.5 md:right-2 flex items-center gap-1">
                        {isCompleted ? (
                          <div className="px-2 py-1 bg-green-500/80 backdrop-blur-md text-white rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Eye className="w-2.5 md:w-3 h-2.5 md:h-3" />
                            Watched
                          </div>
                        ) : historyItem?.progress && (
                          <div className="px-2 py-1 bg-accent/80 backdrop-blur-md text-white rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider">
                            {Math.max(1, Math.floor((historyItem.progress.duration - historyItem.progress.watched) / 60))}m left
                          </div>
                        )}
                      </div>

                      {/* Top Left Badge - Watching */}
                      {isCurrentEpisode && historyItem && (
                        <div className="absolute top-1.5 md:top-2 left-1.5 md:left-2 px-2 py-1 bg-accent text-white rounded-lg text-[8px] md:text-[10px] font-bold uppercase tracking-wider shadow-lg">
                          Watching
                        </div>
                      )}

                      {/* Progress Bar */}
                      {watchedProgress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${watchedProgress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Info Area */}
                    <div className="flex-1 px-1">
                      <h3
                        className={cn(
                          "text-xs md:text-sm font-bold leading-tight line-clamp-1 mb-1",
                          isCurrentEpisode ? "text-accent" : "text-white"
                        )}
                      >
                        {episode.episode_number}. {episode.name}
                      </h3>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[8px] md:text-[10px] text-white/40 font-bold uppercase tracking-wider">
                          {formattedDate}
                        </p>
                      </div>
                      <p className="text-[9px] md:text-[11px] text-white/50 line-clamp-2 mt-1 md:mt-2 leading-relaxed">
                        {episode.overview || "No description available."}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className={cn(
            "border-t border-white/10 bg-white/5 flex items-center justify-end gap-3 flex-shrink-0",
            isMobile ? "p-3 md:p-6" : "p-4 md:p-6"
          )}>
            {resumeInfo && !resumeInfo.isCompleted ? (
              <button
                onClick={() => {
                  navigate(`/watch/tv/${tvId}?season=${resumeInfo.season}&episode=${resumeInfo.episode}`);
                  onClose();
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-4 md:px-5 bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg shadow-accent/20 transition-all text-xs md:text-sm font-bold active:scale-95"
              >
                <Play className="w-4 md:w-5 h-4 md:h-5 fill-current" />
                Resume S{resumeInfo.season} • E{resumeInfo.episode}
              </button>
            ) : (
              <button
                onClick={() => {
                  navigate(`/watch/tv/${tvId}?season=1&episode=1`);
                  onClose();
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-4 md:px-5 bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg shadow-accent/20 transition-all text-xs md:text-sm font-bold active:scale-95"
              >
                <Play className="w-4 md:w-5 h-4 md:h-5 fill-current" />
                PLAY S1 • E1
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TVDetailsEpisodeSelector;
