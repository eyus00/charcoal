import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayCircle, Tv, Star, Calendar, Download, ChevronDown, Magnet, Database } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';
import EpisodeSelector from '../components/EpisodeSelector';
import { useQueries } from '@tanstack/react-query';
import { mediaService } from '../api/services/media';
import { useStore, WatchStatus } from '../store/useStore';
import WatchlistButton from '../components/WatchlistButton';
import RelatedVideos from '../components/RelatedVideos';
import SimilarContent from '../components/SimilarContent';
import TorrentDownloader from '../components/TorrentDownloader';
import DriveBrowser from '../components/DriveBrowser';

const TVDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [isEpisodeSelectorOpen, setIsEpisodeSelectorOpen] = useState(false);
  const [isTorrentMenuOpen, setIsTorrentMenuOpen] = useState(false);
  const [isDriveBrowserOpen, setIsDriveBrowserOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const textRef = useRef<HTMLParagraphElement>(null);
  const { data: details, isLoading } = useMedia.useDetails('tv', Number(id));
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, watchHistory } = useStore();

  const watchlistItem = getWatchlistItem(Number(id), 'tv');
  const watchHistoryItem = watchHistory.find(
    item => item.id === Number(id) && item.mediaType === 'tv'
  );

  const seasonQueries = useQueries({
    queries: (details?.seasons ?? []).map(season => ({
      queryKey: ['season', id, season.season_number],
      queryFn: () => mediaService.getTVSeasonDetails(Number(id), season.season_number),
      enabled: !!details
    }))
  });

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const checkTextHeight = () => {
      if (textRef.current) {
        const lineHeight = parseInt(window.getComputedStyle(textRef.current).lineHeight);
        const threeLineHeight = lineHeight * 3;
        setNeedsExpansion(textRef.current.scrollHeight > threeLineHeight);
      }
    };

    checkTextHeight();
    window.addEventListener('resize', checkTextHeight);
    return () => window.removeEventListener('resize', checkTextHeight);
  }, [details?.overview]);

  // Set initial season and episode from watch history if available
  useEffect(() => {
    if (watchHistoryItem && watchHistoryItem.season && watchHistoryItem.episode) {
      setSelectedSeason(watchHistoryItem.season);
      setSelectedEpisode(watchHistoryItem.episode);
    }
  }, [watchHistoryItem]);

  const seasons = seasonQueries
    .filter(query => query.data)
    .map(query => query.data);

  const handleWatch = () => {
    setIsEpisodeSelectorOpen(true);
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setIsEpisodeSelectorOpen(false);
    navigate(`/watch/tv/${id}?season=${season}&episode=${episode}`);
  };

  const handleWatchlistAdd = (status: WatchStatus) => {
    if (!details) return;
    
    addToWatchlist({
      id: Number(id),
      mediaType: 'tv',
      title: details.name,
      posterPath: details.poster_path,
      addedAt: Date.now(),
      status,
    });
  };

  const handleWatchlistRemove = () => {
    removeFromWatchlist(Number(id), 'tv');
  };

  if (isLoading || !details) return <div>Loading...</div>;

  const year = new Date(details.first_air_date).getFullYear();

  return (
    <div className="min-h-screen">
      <div className="relative min-h-[90vh]">
        {/* Full-screen background */}
        <div className="absolute inset-0">
          <img
            src={getImageUrl(details.backdrop_path)}
            alt={details.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/90 to-black/40" />
        </div>

        {/* Content Container */}
        <div className="relative min-h-[90vh] flex flex-col">
          <div className="container mx-auto px-4 py-8 flex flex-col items-center md:items-start flex-grow">
            {/* Mobile Layout */}
            <div className="mt-auto w-full">
              {/* Centered Poster */}
              <div className="w-48 mx-auto mb-6 md:hidden">
                <img
                  src={getImageUrl(details.poster_path, 'w500')}
                  alt={details.name}
                  className="w-full border-2 border-white/10 shadow-2xl"
                />
              </div>

              {/* Info Section */}
              <div className="flex flex-col md:flex-row items-center md:items-end gap-8 pb-8">
                {/* Desktop Poster */}
                <div className="hidden md:block w-48">
                  <img
                    src={getImageUrl(details.poster_path, 'w500')}
                    alt={details.name}
                    className="w-full border-2 border-white/10 shadow-2xl"
                  />
                </div>

                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <Tv className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">TV Show</span>
                    </div>
                    <div className="w-px h-5 bg-white/20" />
                    <WatchlistButton
                      watchlistItem={watchlistItem}
                      onAdd={handleWatchlistAdd}
                      onRemove={handleWatchlistRemove}
                      darkMode={true}
                    />
                  </div>

                  <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
                    {details.name} <span className="text-gray-300">({year})</span>
                  </h1>
                  
                  <div className="flex items-center justify-center md:justify-start gap-4 mb-3">
                    <div className="flex items-center flex-shrink-0">
                      <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                      <span className="text-white ml-2 text-xl font-medium">
                        {details.vote_average.toFixed(1)}
                      </span>
                    </div>
                    {details.number_of_seasons > 0 && (
                      <div className="flex items-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-white" />
                        <span className="text-white ml-2">
                          {details.number_of_seasons} {details.number_of_seasons === 1 ? 'Season' : 'Seasons'}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6">
                    {details.genres?.map((genre) => (
                      <span key={genre.id} className="px-3 py-1 bg-white/10 rounded-full text-white text-sm backdrop-blur-sm whitespace-nowrap flex-shrink-0">
                        {genre.name}
                      </span>
                    ))}
                  </div>

                  <div className="relative mb-8">
                    <div className={cn(
                      "relative text-gray-100 text-base md:text-lg",
                      !isExpanded && "max-h-[4.5em] overflow-hidden"
                    )}>
                      <p ref={textRef} className="leading-relaxed">
                        {details.overview}
                      </p>
                      {needsExpansion && !isExpanded && (
                        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black to-transparent" />
                      )}
                    </div>
                    {needsExpansion && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-white/80 hover:text-white text-sm font-medium mt-2"
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      onClick={handleWatch}
                      className="w-full md:w-auto px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-red-600/20 hover:shadow-red-600/30 relative group"
                    >
                      <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      Watch Now
                    </button>

                    {/* Download Options */}
                    <div className="grid grid-cols-2 gap-2 md:w-auto">
                      <button
                        onClick={() => setIsTorrentMenuOpen(true)}
                        className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-300 backdrop-blur-sm"
                      >
                        <Magnet className="w-5 h-5" />
                        <span className="hidden md:inline">Torrent</span>
                      </button>
                      
                      <button
                        onClick={() => setIsDriveBrowserOpen(true)}
                        className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-300 backdrop-blur-sm"
                      >
                        <Database className="w-5 h-5" />
                        <span className="hidden md:inline">Drive</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Content Section */}
      <div className="bg-light-bg dark:bg-dark-bg py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-12">
            <RelatedVideos videos={details.videos?.results || []} />
            <SimilarContent 
              items={details.similar?.results || details.recommendations?.results || []} 
              type="tv" 
            />
          </div>
        </div>
      </div>

      <EpisodeSelector
        isOpen={isEpisodeSelectorOpen}
        onClose={() => setIsEpisodeSelectorOpen(false)}
        seasons={seasons}
        tvId={Number(id)}
        onEpisodeSelect={handleEpisodeSelect}
      />

      {/* Torrent Downloader */}
      <TorrentDownloader
        isOpen={isTorrentMenuOpen}
        onClose={() => setIsTorrentMenuOpen(false)}
        title={details.name}
        releaseYear={year.toString()}
        isShow={true}
        season={selectedSeason}
        episode={selectedEpisode}
      />

      {/* Drive Browser */}
      <DriveBrowser
        isOpen={isDriveBrowserOpen}
        onClose={() => setIsDriveBrowserOpen(false)}
        title={details.name}
        releaseYear={year.toString()}
        isShow={true}
        tvId={Number(id)}
        season={selectedSeason}
        episode={selectedEpisode}
      />
    </div>
  );
};

export default TVDetails;