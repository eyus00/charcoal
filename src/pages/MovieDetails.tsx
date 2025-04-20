import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore, WatchStatus } from '../store/useStore';
import { SOURCES, getMovieUrl } from '../lib/sources';
import { useWatchTracking } from '../hooks/useWatchTracking';
import { useMovieDetails } from '../features/details/api/useMovieDetails';
import DetailsBanner from '../features/details/components/DetailsBanner';
import PlayerSection from '../features/details/components/PlayerSection';
import RelatedContent from '../features/details/components/RelatedContent';

const MovieDetails = () => {
  const { id } = useParams();
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const { details, isLoading, contentRating } = useMovieDetails(id);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, addToWatchHistory } = useStore();

  const watchlistItem = getWatchlistItem(Number(id), 'movie');

  useWatchTracking({
    mediaType: 'movie',
    id: Number(id),
    title: details?.title,
    posterPath: details?.poster_path,
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

  const year = new Date(details.release_date).getFullYear();
  const videoUrl = getMovieUrl(selectedSource, Number(id));

  const handleWatchlistAdd = (status: WatchStatus) => {
    addToWatchlist({
      id: Number(id),
      mediaType: 'movie',
      title: details.title,
      posterPath: details.poster_path,
      addedAt: Date.now(),
      status,
    });
  };

  return (
    <div className="min-h-screen space-y-8">
      <DetailsBanner
        type="movie"
        title={details.title}
        year={year}
        overview={details.overview}
        posterPath={details.poster_path}
        backdropPath={details.backdrop_path}
        rating={details.vote_average}
        runtime={details.runtime}
        contentRating={contentRating}
        genres={details.genres}
        watchlistItem={watchlistItem}
        onWatchlistAdd={handleWatchlistAdd}
        onWatchlistRemove={() => removeFromWatchlist(Number(id), 'movie')}
        id={id!}
      />

      <PlayerSection
        videoUrl={videoUrl}
        selectedSource={selectedSource}
        onSourceSelect={setSelectedSource}
      />

      <RelatedContent
        videos={details.videos}
        similar={details.similar}
        recommendations={details.recommendations}
        type="movie"
      />
    </div>
  );
};

export default MovieDetails;