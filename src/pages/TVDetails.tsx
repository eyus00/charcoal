import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video as VideoIcon, Flame } from 'lucide-react';
import { useStore, WatchStatus } from '../store/useStore';
import { useTVDetails } from '../api/hooks/useTVDetails';
import DetailsBanner from '../components/details/DetailsBanner';
import RelatedVideos from '../components/details/RelatedVideos';
import SimilarContent from '../components/details/SimilarContent';
import TVDetailsEpisodeSelector from '../components/details/TVDetailsEpisodeSelector';

const TVDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { details, isLoading, contentRating, seasons } = useTVDetails(id);
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, watchHistory } = useStore();

  const [isEpisodeSelectorOpen, setIsEpisodeSelectorOpen] = useState(false);

  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';

  const watchlistItem = getWatchlistItem(Number(id), 'tv');
  const resumeInfo = watchHistory.find(h => h.id === Number(id) && h.mediaType === 'tv');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (isLoading || !details) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

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

  const youtubeVideos = (details.videos?.results.filter(video =>
    video.site === 'YouTube' &&
    (video.type === 'Trailer' || video.type === 'Teaser' || video.type === 'Behind the Scenes')
  ) || []).slice(0, 7);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen space-y-12 pb-20"
    >
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

      {youtubeVideos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative px-4 md:px-0"
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="px-4 md:px-8 py-6 border-b border-white/10 flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-xl border border-accent/30">
                <VideoIcon className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Related Videos</h2>
              <span className="text-white/40 ml-auto font-mono text-sm">{youtubeVideos.length} Items</span>
            </div>
            <div className="p-4 md:p-8">
              <RelatedVideos videos={youtubeVideos} />
            </div>
          </div>
        </motion.div>
      )}

      {details.similar?.results && details.similar.results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative px-4 md:px-0"
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="px-4 md:px-8 py-6 border-b border-white/10 flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-xl border border-accent/30">
                <Flame className="w-5 h-5 text-accent" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Similar Titles</h2>
              <span className="text-white/40 ml-auto font-mono text-sm">{details.similar.results.length} Items</span>
            </div>
            <div className="p-4 md:p-8">
              <SimilarContent items={details.similar.results} mediaType="tv" />
            </div>
          </div>
        </motion.div>
      )}

      {/* Episode Selector Modal */}
      <TVDetailsEpisodeSelector
        isOpen={isEpisodeSelectorOpen}
        onClose={() => setIsEpisodeSelectorOpen(false)}
        seasons={seasons}
        tvId={id}
        currentSeason={season}
        currentEpisode={episode}
        resumeInfo={resumeInfo}
      />
    </motion.div>
  );
};

export default TVDetails;
