import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore, WatchStatus } from '../store/useStore';
import { useMovieDetails } from '../features/details/api/useMovieDetails';
import DetailsBanner from '../features/details/components/DetailsBanner';
import RelatedVideos from '../components/RelatedVideos';
import SimilarContent from '../components/SimilarContent';

const MovieDetails = () => {
  const { id } = useParams();
  const { details, isLoading, contentRating } = useMovieDetails(id);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, watchHistory } = useStore();

  const watchlistItem = getWatchlistItem(Number(id), 'movie');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (isLoading || !details) return <div>Loading...</div>;

  const year = new Date(details.release_date).getFullYear();

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
        watchHistory={watchHistory}
      />

      {details.videos?.results && (
        <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <h2 className="text-xl font-semibold">Related Videos</h2>
          </div>
          <div className="p-6">
            <RelatedVideos
              videos={details.videos.results.filter(video => 
                video.site === 'YouTube' && 
                (video.type === 'Trailer' || video.type === 'Teaser')
              )}
            />
          </div>
        </div>
      )}

      <SimilarContent
        similar={details.similar}
        recommendations={details.recommendations}
        type="movie"
      />
    </div>
  );
};

export default MovieDetails;