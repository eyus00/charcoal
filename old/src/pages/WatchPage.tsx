import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMedia } from '../api/hooks/useMedia';
import { SOURCES, getMovieUrl, getTvUrl } from '../lib/sources';
import { useWatchTracking } from '../hooks/useWatchTracking';
import { useStore } from '../store/useStore';
import { useQueries } from '@tanstack/react-query';
import { mediaService } from '../api/services/media';
import { cn } from '../lib/utils';
import VideoPlayer from '../components/watch/VideoPlayer';
import BottomBar from '../components/watch/BottomBar';

const WatchPage: React.FC = () => {
  const { mediaType, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const [selectedSeason, setSelectedSeason] = useState(Number(season) || 1);
  const [isLandscape, setIsLandscape] = useState(false);

  const { addToWatchHistory, updateWatchlistStatus } = useStore();

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

  useWatchTracking({
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
        <VideoPlayer videoUrl={videoUrl} />
      </div>
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
      />
    </div>
  );
};

export default WatchPage;