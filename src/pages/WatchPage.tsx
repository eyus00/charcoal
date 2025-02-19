import React, { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMedia } from '../api/hooks/useMedia';
import { SOURCES, getSource, getMovieUrl, getTvUrl } from '../lib/sources';
import { useStore, WatchStatus } from '../store/useStore';
import { useQueries } from '@tanstack/react-query';
import { mediaService } from '../api/services/media';
import EpisodeMenu from '../components/EpisodeMenu';
import WatchHeader from '../components/watch/WatchHeader';
import SourcesMenu from '../components/watch/SourcesMenu';
import VideoPlayer from '../components/watch/VideoPlayer';
import { useWatchTracking } from '../hooks/useWatchTracking';

const WatchPage: React.FC = () => {
  const { mediaType, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const [isEpisodeMenuOpen, setIsEpisodeMenuOpen] = useState(false);
  const [isSourcesMenuOpen, setIsSourcesMenuOpen] = useState(false);
  const { addToWatchHistory, addToWatchlist, removeFromWatchlist, getWatchlistItem } = useStore();

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

  const watchlistItem = getWatchlistItem(Number(id), mediaType as 'movie' | 'tv');

  // Track watch time and history
  useWatchTracking({
    mediaType,
    id: Number(id),
    title: mediaType === 'movie' ? details?.title : details?.name,
    posterPath: details?.poster_path,
    season,
    episode,
    onAddToHistory: addToWatchHistory,
  });

  const videoUrl = mediaType === 'movie'
    ? getMovieUrl(selectedSource, Number(id))
    : getTvUrl(selectedSource, Number(id), Number(season), Number(episode));

  if (!videoUrl) {
    return <div>Invalid media type or missing parameters</div>;
  }

  const title = mediaType === 'movie' ? details?.title : details?.name;
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

  const handleWatchlistAdd = (status: WatchStatus) => {
    if (!details) return;
    
    addToWatchlist({
      id: Number(id),
      mediaType: mediaType as 'movie' | 'tv',
      title: mediaType === 'movie' ? details.title : details.name,
      posterPath: details.poster_path,
      addedAt: Date.now(),
      status,
    });
  };

  return (
    <div className="min-h-screen bg-black">
      <WatchHeader
        title={title}
        mediaType={mediaType!}
        season={season}
        episode={episode}
        backUrl={backUrl}
        watchlistItem={watchlistItem}
        onWatchlistAdd={handleWatchlistAdd}
        onWatchlistRemove={() => removeFromWatchlist(Number(id), mediaType as 'movie' | 'tv')}
        onSourcesOpen={() => setIsSourcesMenuOpen(true)}
        onEpisodesOpen={() => setIsEpisodeMenuOpen(true)}
      />

      <VideoPlayer url={videoUrl} />

      <SourcesMenu
        isOpen={isSourcesMenuOpen}
        onClose={() => setIsSourcesMenuOpen(false)}
        selectedSource={selectedSource}
        onSourceSelect={setSelectedSource}
      />

      {mediaType === 'tv' && details && (
        <EpisodeMenu
          isOpen={isEpisodeMenuOpen}
          onClose={() => setIsEpisodeMenuOpen(false)}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onEpisodeSelect={handleEpisodeSelect}
          seasons={seasons}
          currentSeason={Number(season)}
          currentEpisode={Number(episode)}
          totalSeasons={details.number_of_seasons}
          totalEpisodes={details.seasons?.[Number(season) - 1]?.episode_count}
        />
      )}
    </div>
  );
};

export default WatchPage;