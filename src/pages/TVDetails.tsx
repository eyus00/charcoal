import React, { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Tv, Star, Calendar, Server, ChevronRight, Bookmark, Play } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';
import { useQueries } from '@tanstack/react-query';
import { mediaService } from '../api/services/media';
import { useStore, WatchStatus } from '../store/useStore';
import RelatedVideos from '../components/RelatedVideos';
import SimilarContent from '../components/SimilarContent';
import { SOURCES, getTvUrl } from '../lib/sources';
import { useWatchTracking } from '../hooks/useWatchTracking';
import SourcesMenu from '../components/watch/SourcesMenu';
import WatchlistMenu from '../components/WatchlistMenu';

const TVDetails = () => {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(Number(searchParams.get('season') || '1'));
  const [playerHeight, setPlayerHeight] = useState(0);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const { data: details, isLoading } = useMedia.useDetails('tv', Number(id));
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, addToWatchHistory } = useStore();

  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';

  const watchlistItem = getWatchlistItem(Number(id), 'tv');

  const seasonQueries = useQueries({
    queries: (details?.seasons ?? []).map(season => ({
      queryKey: ['season', id, season.season_number],
      queryFn: () => mediaService.getTVSeasonDetails(Number(id), season.season_number),
      enabled: !!details
    }))
  });

  const contentRatingQuery = useQueries({
    queries: [{
      queryKey: ['contentRating', id],
      queryFn: async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/tv/${id}?api_key=50404130561567acf3e0725aeb09ec5d&append_to_response=content_ratings`
        );
        const data = await response.json();
        const usRating = data.content_ratings?.results?.find(
          (r: any) => r.iso_3166_1 === 'US'
        )?.rating;
        return usRating || 'NR';
      }
    }]
  });

  const seasons = seasonQueries
    .filter(query => query.data)
    .map(query => query.data);

  const currentSeason = seasons?.find(s => s.season_number === Number(season));
  const contentRating = contentRatingQuery[0]?.data;

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

  useEffect(() => {
    const updatePlayerHeight = () => {
      if (playerRef.current) {
        setPlayerHeight(playerRef.current.offsetHeight);
      }
    };

    updatePlayerHeight();

    const observer = new ResizeObserver(() => {
      updatePlayerHeight();
    });

    if (playerRef.current) {
      observer.observe(playerRef.current);
    }

    window.addEventListener('resize', updatePlayerHeight);

    return () => {
      if (playerRef.current) {
        observer.unobserve(playerRef.current);
      }
      window.removeEventListener('resize', updatePlayerHeight);
    };
  }, []);

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
    setActiveMenu(null);
  };

  const handleWatchlistRemove = () => {
    removeFromWatchlist(Number(id), 'tv');
    setActiveMenu(null);
  };

  const handleEpisodeSelect = (season: number, episode: number) => {
    setSearchParams({ season: season.toString(), episode: episode.toString() });
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  const episodeSelectorHeight = playerHeight > 0 ? `${playerHeight}px` : '400px';
  // Reduced height for mobile to show fewer episodes (approx. 2-3 episodes)
  const mobileEpisodeSelectorHeight = playerHeight > 0 ? `${Math.min(playerHeight, 200)}px` : '200px';

  return (
    <div className="min-h-screen space-y-8">
      {/* Details Container */}
      <div 
        className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden relative"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0, 0, 0, 0.8), rgb(18, 18, 18) 100%), url(${getImageUrl(details.backdrop_path)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
            <div className="w-40 md:w-48 flex-shrink-0">
              <img
                src={getImageUrl(details.poster_path, 'w500')}
                alt={details.name}
                className="w-full rounded-lg border border-gray-400/50 dark:border-white/20"
              />
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex justify-center md:justify-start items-center gap-2 mb-2">
                <Tv className="w-5 h-5 text-white" />
              </div>

              <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
                {details.name} <span className="text-white/60">({year})</span>
              </h1>

              <div className="flex justify-center md:justify-start items-center gap-3 mb-3">
                <div className="flex items-center">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <span className="ml-1 text-white text-base">{details.vote_average.toFixed(1)}</span>
                </div>
                {details.number_of_seasons > 0 && (
                  <span className="text-white text-base">
                    {details.number_of_seasons} {details.number_of_seasons === 1 ? 'Season' : 'Seasons'}
                  </span>
                )}
                {contentRating && (
                  <span className="text-white text-sm px-2 py-0.5 border border-white/20 rounded">
                    {contentRating}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
                {details.genres?.map((genre) => (
                  <span key={genre.id} className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm rounded-full">
                    {genre.name}
                  </span>
                ))}
              </div>

              <div className="relative mb-3 max-w-2xl mx-auto md:mx-0">
                <div className={cn(
                  "relative text-sm md:text-base text-white/90",
                  !isExpanded && "max-h-[3.5em] overflow-hidden"
                )}>
                  <p ref={textRef} className="leading-relaxed">
                    {details.overview}
                  </p>
                  {needsExpansion && !isExpanded && (
                    <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-black to-transparent" />
                  )}
                </div>
                {needsExpansion && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-white/60 hover:text-white text-sm font-medium mt-1"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>

              <div className="flex justify-center md:justify-start items-center gap-2">
                <Link
                  to={`/watch/tv/${id}?season=${season}&episode=${episode}`}
                  className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center transition-colors shadow-lg border border-white/20"
                >
                  <Play className="w-5 h-5 text-white" />
                </Link>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveMenu(activeMenu === Number(id) ? null : Number(id));
                    }}
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-md border border-white/20",
                      watchlistItem
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-white/20 hover:bg-white/30"
                    )}
                  >
                    <Bookmark className={cn(
                      "w-5 h-5 transition-transform",
                      watchlistItem ? "text-white fill-white" : "text-white"
                    )} />
                  </button>

                  <WatchlistMenu
                    isOpen={activeMenu === Number(id)}
                    onClose={() => setActiveMenu(null)}
                    onAdd={handleWatchlistAdd}
                    onRemove={handleWatchlistRemove}
                    currentStatus={watchlistItem?.status}
                    position="top-left"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Player and Episode Selector Container */}
      <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Player */}
          <div className="flex-1 relative" ref={playerRef}>
            <div className="aspect-video">
              <iframe
                key={videoUrl}
                src={videoUrl}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>

            {/* Floating Source Button */}
            <button
              onClick={() => setIsSourcesOpen(true)}
              className="absolute top-4 right-4 px-4 py-2 bg-black/75 hover:bg-black/90 text-white rounded-lg backdrop-blur-sm flex items-center gap-2 transition-colors"
            >
              <Server className="w-4 h-4" />
              <span className="font-medium">Select Source</span>
            </button>
          </div>

          {/* Episode Selector (Desktop - Right Side) */}
          <div className="hidden md:block w-96 bg-light-bg dark:bg-dark-bg border-l border-gray-400/50 dark:border-white/20">
            <div style={{ height: episodeSelectorHeight }} className="flex flex-col">
              <div className="p-4 border-b border-border-light dark:border-border-dark">
                <div className="relative">
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      setSelectedSeason(Number(e.target.value));
                      handleEpisodeSelect(Number(e.target.value), 1);
                    }}
                    className="w-full appearance-none px-3 py-2 bg-light-surface dark:bg-dark-surface rounded focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
                  >
                    {seasons.map((season) => (
                      <option key={season.season_number} value={season.season_number}>
                        {season.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronRight className="w-5 h-5 rotate-90" />
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {currentSeason?.episodes.map((episode) => {
                  const duration = formatDuration(episode.runtime);
                  const isCurrent = Number(season) === selectedSeason && episode.episode_number === Number(searchParams.get('episode'));

                  return (
                    <button
                      key={episode.episode_number}
                      onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                      className={cn(
                        "w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 border-b border-border-light dark:border-border-dark text-left",
                        isCurrent && "bg-red-600/10 dark:bg-red-500/10"
                      )}
                    >
                      <div className="w-28 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden">
                        {episode.still_path ? (
                          <img
                            src={getImageUrl(episode.still_path, 'w300')}
                            alt={episode.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-light-surface dark:bg-dark-surface" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "font-medium truncate text-base",
                            isCurrent && "text-red-600 dark:text-red-500"
                          )}>
                            {episode.name}
                          </span>
                          {duration && (
                            <span className="px-2 py-0.5 bg-light-surface dark:bg-dark-surface rounded text-sm text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                              {duration}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                          {episode.overview}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Episode Selector (Mobile - Below Player) */}
        <div className="md:hidden border-t border-gray-400/50 dark:border-white/20">
          <div className="p-4 border-b border-border-light dark:border-border-dark">
            <div className="relative">
              <select
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(Number(e.target.value));
                  handleEpisodeSelect(Number(e.target.value), 1);
                }}
                className="w-full appearance-none px-3 py-2 bg-light-surface dark:bg-dark-surface rounded focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
              >
                {seasons.map((season) => (
                  <option key={season.season_number} value={season.season_number}>
                    {season.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </div>
            </div>
          </div>
          <div style={{ height: mobileEpisodeSelectorHeight }} className="overflow-y-auto scrollbar-thin p-4">
            {currentSeason?.episodes.map((episode) => {
              const duration = formatDuration(episode.runtime);
              const isCurrent = Number(season) === selectedSeason && episode.episode_number === Number(searchParams.get('episode'));

              return (
                <button
                  key={episode.episode_number}
                  onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                  className={cn(
                    "w-full p-4 hover:bg-light-surface dark:hover:bg-dark-surface flex gap-4 rounded-lg text-left",
                    isCurrent && "bg-red-600/10 dark:bg-red-500/10"
                  )}
                >
                  <div className="w-28 aspect-video bg-light-surface dark:bg-dark-surface flex-shrink-0 rounded overflow-hidden">
                    {episode.still_path ? (
                      <img
                        src={getImageUrl(episode.still_path, 'w300')}
                        alt={episode.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-light-surface dark:bg-dark-surface" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium truncate text-base",
                        isCurrent && "text-red-600 dark:text-red-500"
                      )}>
                        {episode.name}
                      </span>
                      {duration && (
                        <span className="px-2 py-0.5 bg-light-surface dark:bg-dark-surface rounded text-sm text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0">
                          {duration}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
                      {episode.overview}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sources Menu */}
      <SourcesMenu
        isOpen={isSourcesOpen}
        onClose={() => setIsSourcesOpen(false)}
        selectedSource={selectedSource}
        onSourceSelect={(source) => {
          setSelectedSource(source);
          setIsSourcesOpen(false);
        }}
      />

      {/* Videos Container */}
      {details.videos?.results.length > 0 && (
        <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <h2 className="text-xl font-semibold">Related Videos</h2>
          </div>
          <div className="p-6">
            <RelatedVideos videos={details.videos.results} />
          </div>
        </div>
      )}

      {/* Similar Content Container */}
      {(details.similar?.results.length > 0 || details.recommendations?.results.length > 0) && (
        <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <h2 className="text-xl font-semibold">You May Also Like</h2>
          </div>
          <div className="p-6">
            <SimilarContent 
              items={details.similar?.results || details.recommendations?.results || []} 
              type="tv" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TVDetails;