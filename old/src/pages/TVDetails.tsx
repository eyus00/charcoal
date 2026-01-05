import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStore, WatchStatus } from '../store/useStore';
import { useTVDetails } from '../api/hooks/useTVDetails';
import DetailsBanner from '../components/shared/DetailsBanner';
import RelatedVideos from '../components/shared/RelatedVideos';
import SimilarContent from '../components/shared/SimilarContent';
import EpisodeSelector from '../components/shared/EpisodeSelector';

const TVDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { details, isLoading, contentRating, seasons } = useTVDetails(id);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, watchHistory } = useStore();
  const [isEpisodeSelectorOpen, setIsEpisodeSelectorOpen] = useState(false);

  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';
  const watchlistItem = getWatchlistItem(Number(id), 'tv');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (isLoading || !details) return <div>Loading...</div>;

  const year = new Date(details.first_air_date).getFullYear();

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

  const handlePlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsEpisodeSelectorOpen(true);
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
        watchHistory={watchHistory}
        onPlayClick={handlePlayClick}
        numberOfSeasons={details.number_of_seasons}
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
        type="tv"
      />

      <EpisodeSelector
        isOpen={isEpisodeSelectorOpen}
        onClose={() => setIsEpisodeSelectorOpen(false)}
        seasons={seasons}
        tvId={Number(id)}
        title={details.name}
        modalWidth="w-[600px]"
        hideTitle={true}
      />
    </div>
  );
};

export default TVDetails;