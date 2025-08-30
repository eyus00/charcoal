import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStore, WatchStatus } from '../store/useStore';
import { useTVDetails } from '../features/details/api/useTVDetails';
import DetailsBanner from '../features/details/components/DetailsBanner';
import RelatedContent from '../features/details/components/RelatedContent';
import TVEpisodeSelector from '../components/TVEpisodeSelector';
import { getVideoProgress } from '../lib/watch';

const TVDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { details, isLoading, contentRating, seasons } = useTVDetails(id);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, watchHistory } = useStore();
  const [isEpisodeSelectorOpen, setIsEpisodeSelectorOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';
  const watchlistItem = getWatchlistItem(Number(id), 'tv');
  const currentSeason = seasons?.find(s => s.season_number === selectedSeason);
  const currentEpisode = currentSeason?.episodes?.find(e => e.episode_number === selectedEpisode);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (seasons && seasons.length > 0) {
      setSelectedSeason(Number(season));
      setSelectedEpisode(Number(episode));
    }
  }, [seasons, season, episode]);
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

      <RelatedContent
        videos={details.videos}
        similar={details.similar}
        recommendations={details.recommendations}
        type="tv"
      />

      <TVEpisodeSelector
        isOpen={isEpisodeSelectorOpen}
        onClose={() => setIsEpisodeSelectorOpen(false)}
        seasons={seasons}
        tvId={Number(id)}
        title={details.name}
        selectedSeason={selectedSeason}
        selectedEpisode={selectedEpisode}
        onSeasonChange={setSelectedSeason}
        onEpisodeChange={setSelectedEpisode}
        currentSeason={currentSeason}
        currentEpisode={currentEpisode}
        getVideoProgress={getVideoProgress}
      />
    </div>
  );
};

export default TVDetails;