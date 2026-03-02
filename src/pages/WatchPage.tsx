import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, AlertCircle } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { SOURCES, getMovieUrl, getTvUrl } from '../lib/sources';
import { useWatchTracking } from '../hooks/useWatchTracking';
import { useStore } from '../store/useStore';
import { useQueries } from '@tanstack/react-query';
import { mediaService } from '../api/services/media';
import { cn } from '../lib/utils';
import VideoPlayer from '../components/watch/VideoPlayer';
import BottomBar from '../components/watch/BottomBar';
import { fetchMovieData, fetchTVData } from '../lib/jelly';
import { BackendApiResponse } from '../api/player-types';
import { getVideoProgress } from '../lib/watch';

const WatchPage: React.FC = () => {
  const { mediaType, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const [selectedSeason, setSelectedSeason] = useState(Number(season) || 1);
  const [isLandscape, setIsLandscape] = useState(false);
  const [jellyData, setJellyData] = useState<BackendApiResponse | null>(null);
  const [useCustomPlayer, setUseCustomPlayer] = useState(true);
  const [isJellyLoading, setIsJellyLoading] = useState(true);
  const [jellyError, setJellyError] = useState<string | null>(null);

  const { addToWatchHistory, updateWatchlistStatus, watchHistory } = useStore();

  // Extract resume time from watch history
  const resumeTime = useMemo(() => {
    const progress = getVideoProgress();
    if (progress && progress.id === Number(id) && progress.mediaType === mediaType) {
      return progress.timestamp;
    }

    const historyItem = watchHistory.find(
      item => item.id === Number(id) && item.mediaType === mediaType &&
              (mediaType === 'movie' || (item.season === Number(season) && item.episode === Number(episode)))
    );

    if (historyItem?.progress) {
      return historyItem.progress.watched;
    }

    return undefined;
  }, [id, mediaType, season, episode, watchHistory]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setIsJellyLoading(true);
      setJellyError(null);

      try {
        let data: BackendApiResponse | null = null;

        if (mediaType === 'movie') {
          data = await fetchMovieData(Number(id));
        } else if (mediaType === 'tv' && season && episode) {
          data = await fetchTVData(Number(id), Number(season), Number(episode));
        }

        if (data) {
          setJellyData(data);
        } else {
          setJellyError('Could not load Jelly server. Try the embed player using the button in the top right.');
        }
      } catch (error) {
        console.error('Jelly server error:', error);
        setJellyError('Jelly server unavailable. Try the embed player using the button in the top right.');
      } finally {
        setIsJellyLoading(false);
      }
    };

    fetchData();
  }, [mediaType, id, season, episode]);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const { data: details } = useMedia.useDetails(
    mediaType as 'movie' | 'tv',
    Number(id)
  );

  const seasonQueries = useQueries({
    queries: (details?.seasons ?? []).map(season => ({
      queryKey: ['season', id, season.season_number],
      queryFn: () => mediaService.getTVSeasonDetails(Number(id), season.season_number),
      enabled: !!details && mediaType === 'tv'
    }))
  });

  const seasons = seasonQueries
    .filter(query => query.data)
    .map(query => query.data);

  const { reportProgress } = useWatchTracking({
    mediaType,
    id: Number(id),
    title: mediaType === 'movie' ? details?.title : details?.name,
    posterPath: details?.poster_path,
    season,
    episode,
    onAddToHistory: addToWatchHistory,
    onUpdateWatchlist: updateWatchlistStatus,
  });

  const videoUrl = mediaType === 'movie'
    ? getMovieUrl(selectedSource, Number(id))
    : getTvUrl(selectedSource, Number(id), Number(season), Number(episode));

  if (!videoUrl) {
    return <div>Invalid media type or missing parameters</div>;
  }

  const backUrl = mediaType === 'movie' ? `/movie/${id}` : `/tv/${id}`;

  const handleBack = () => {
    navigate(backUrl);
  };

  const handlePrevious = () => {
    if (mediaType === 'tv' && episode && season) {
      if (Number(episode) > 1) {
        navigate(`/watch/tv/${id}?season=${season}&episode=${Number(episode) - 1}`);
      } else if (Number(season) > 1) {
        navigate(`/watch/tv/${id}?season=${Number(season) - 1}&episode=1`);
      }
    }
  };

  const handleNext = () => {
    if (mediaType === 'tv' && episode && season) {
      const currentSeason = seasons?.find(s => s.season_number === Number(season));
      if (Number(episode) < (currentSeason?.episodes?.length || 0)) {
        navigate(`/watch/tv/${id}?season=${season}&episode=${Number(episode) + 1}`);
      } else if (Number(season) < (details?.number_of_seasons || 0)) {
        navigate(`/watch/tv/${id}?season=${Number(season) + 1}&episode=1`);
      }
    }
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    navigate(`/watch/tv/${id}?season=${season}&episode=${episode}`);
  };

  const currentSeasonData = seasons?.find(s => s.season_number === selectedSeason);
  const currentEpisodeData = currentSeasonData?.episodes.find(e => e.episode_number === Number(episode));

  const isFirstEpisode = Number(season) === 1 && Number(episode) === 1;
  const isLastEpisode = Number(season) === seasons?.length && Number(episode) === currentSeasonData?.episodes.length;

  return (
    <div className={cn(
      "fixed inset-0 flex flex-col bg-black",
      isLandscape && "flex-col-reverse"
    )}>
      <div className="relative flex-1">
        <AnimatePresence mode="wait">
          {isJellyLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black"
            >
              <div className="flex flex-col items-center gap-8">
                {/* Animated loading spinner */}
                <div className="relative w-20 h-20">
                  <motion.div
                    className="absolute inset-0 border-4 border-accent/20 border-t-accent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  />
                  <motion.div
                    className="absolute inset-2 border-2 border-transparent border-r-accent/40 rounded-full"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Server className="w-8 h-8 text-accent" />
                  </div>
                </div>

                {/* Status message */}
                <div className="flex flex-col items-center gap-2">
                  <h3 className="text-white font-bold text-xl tracking-tight">Preparing Jelly Server</h3>
                  <motion.p
                    className="text-white/40 text-sm font-medium"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    Establishing secure connection...
                  </motion.p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <VideoPlayer
                id={Number(id)}
                videoUrl={videoUrl}
                jellyData={jellyData}
                useCustomPlayer={useCustomPlayer}
                isMovie={mediaType === 'movie'}
                seasonNumber={Number(season)}
                episodeNumber={Number(episode)}
                episodeTitle={currentEpisodeData?.name}
                showTitle={mediaType === 'movie' ? details?.title : details?.name}
                seasons={seasons}
                onEpisodeNext={handleNext}
                onEpisodePrevious={handlePrevious}
                onEpisodeSelect={handleEpisodeSelect}
                isFirstEpisode={isFirstEpisode}
                isLastEpisode={isLastEpisode}
                onBack={handleBack}
                onTogglePlayer={() => setUseCustomPlayer(!useCustomPlayer)}
                onProgress={reportProgress}
                resumeTime={resumeTime}
                jellyError={jellyError}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {(!useCustomPlayer || !jellyData) && (
        <BottomBar
          onBack={() => navigate(backUrl)}
          backUrl={backUrl}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onSourceChange={setSelectedSource}
          selectedSource={selectedSource}
          showTitle={mediaType === 'movie' ? details?.title : details?.name}
          episodeTitle={currentEpisodeData?.name}
          seasons={seasons}
          currentSeason={season}
          currentEpisode={episode}
          selectedSeason={selectedSeason}
          onSeasonChange={setSelectedSeason}
          onEpisodeSelect={handleEpisodeSelect}
          isFirstEpisode={isFirstEpisode}
          isLastEpisode={isLastEpisode}
          tvId={Number(id)}
          isMovie={mediaType === 'movie'}
          isLandscape={isLandscape}
          useCustomPlayer={useCustomPlayer}
          onTogglePlayer={() => setUseCustomPlayer(!useCustomPlayer)}
          hasCustomPlayer={!!jellyData}
        />
      )}
    </div>
  );
};

export default WatchPage;
