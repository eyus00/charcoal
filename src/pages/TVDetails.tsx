import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStore, WatchStatus } from '../store/useStore';
import { SOURCES, getTvUrl } from '../lib/sources';
import { useWatchTracking } from '../hooks/useWatchTracking';
import { useTVDetails } from '../features/details/api/useTVDetails';
import DetailsBanner from '../features/details/components/DetailsBanner';
import PlayerSection from '../features/details/components/PlayerSection';
import RelatedContent from '../features/details/components/RelatedContent';

const TVDetails = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const { details, isLoading, contentRating, seasons } = useTVDetails(id);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, addToWatchHistory, sidebarOpen } = useStore();

  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';
  const watchlistItem = getWatchlistItem(Number(id), 'tv');

  useWatchTracking({
    mediaType: 'tv',
    id: Number(id),
    title: details?.name,
    posterPath: details?.poster_path,
    season,
    episode,
    onAddToHistory: addToWatchHistory,
    onUpdateWatchlist: (id, mediaType, status) => {
      if (status === 'watching') {
        handleWatchlistAdd('watching');
      }
    },
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (isLoading || !details) return <div>Loading...</div>;

  const year = new Date(details.first_air_date).getFullYear();
  const videoUrl = getTvUrl(selectedSource, Number(id), Number(season), Number(episode));

  const handleWatchlistAdd = (status: WatchStatus) => {
    addToWatchlist({
      id: Number(id),
      mediaType: 'tv',
      title: details.name,
      posterPath: details.poster_path,
      addedAt: Date.now(),
      status,
    });
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    setSearchParams({ season: season.toString(), episode: episode.toString() });
  };

  return (
    <div className="min-h-screen space-y-8">
      <DetailsBanner
        type="tv"
        title={details.name}
        year={year}
        overview={details.overview}
        posterPath={details.poster_path}
        backdropPath={details.backdrop_path}
        rating={details.vote_average}
        contentRating={contentRating}
        genres={details.genres}
        watchlistItem={watchlistItem}
        onWatchlistAdd={handleWatchlistAdd}
        onWatchlistRemove={() => removeFromWatchlist(Number(id), 'tv')}
        id={id!}
        season={season}
        episode={episode}
      />

      <PlayerSection
        videoUrl={videoUrl}
        selectedSource={selectedSource}
        onSourceSelect={setSelectedSource}
        seasons={seasons}
        currentSeason={Number(season)}
        currentEpisode={Number(episode)}
        onEpisodeSelect={handleEpisodeSelect}
        sidebarOpen={sidebarOpen}
      />

      <RelatedContent
        videos={details.videos}
        similar={details.similar}
        recommendations={details.recommendations}
        type="tv"
      />
    </div>
  );
};

export default TVDetails;