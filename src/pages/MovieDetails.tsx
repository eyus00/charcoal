import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Film, Star, Clock, Server, Bookmark, Play } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';
import { useQueries } from '@tanstack/react-query';
import { mediaService } from '../api/services/media';
import { useStore, WatchStatus } from '../store/useStore';
import RelatedVideos from '../components/RelatedVideos';
import SimilarContent from '../components/SimilarContent';
import { SOURCES, getMovieUrl } from '../lib/sources';
import { useWatchTracking } from '../hooks/useWatchTracking';
import SourcesMenu from '../components/watch/SourcesMenu';
import WatchlistMenu from '../components/WatchlistMenu';

const MovieDetails = () => {
  const { id } = useParams();
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [selectedSource, setSelectedSource] = useState(SOURCES[0].id);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [playerHeight, setPlayerHeight] = useState(0);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const { data: details, isLoading } = useMedia.useDetails('movie', Number(id));
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, addToWatchHistory } = useStore();

  const watchlistItem = getWatchlistItem(Number(id), 'movie');

  const contentRatingQuery = useQueries({
    queries: [{
      queryKey: ['contentRating', id],
      queryFn: async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${id}?api_key=50404130561567acf3e0725aeb09ec5d&append_to_response=content_ratings`
        );
        const data = await response.json();
        const usRating = data.content_ratings?.results?.find(
          (r: any) => r.iso_3166_1 === 'US'
        )?.rating;
        return usRating || 'NR';
      }
    }]
  });

  const contentRating = contentRatingQuery[0]?.data;

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
    setActiveMenu(null);
  };

  const handleWatchlistRemove = () => {
    removeFromWatchlist(Number(id), 'movie');
    setActiveMenu(null);
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

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
                alt={details.title}
                className="w-full rounded-lg border border-gray-400/50 dark:border-white/20"
              />
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex justify-center md:justify-start items-center gap-2 mb-2">
                <Film className="w-5 h-5 text-white" />
                <span className="font-medium text-white">Movie</span>
              </div>

              <h1 className="text-2xl md:text-3xl font-bold mb-2 text-white">
                {details.title} <span className="text-white/60">({year})</span>
              </h1>

              <div className="flex justify-center md:justify-start items-center gap-3 mb-3">
                <div className="flex items-center">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <span className="ml-1 text-white text-base">{details.vote_average.toFixed(1)}</span>
                </div>
                {details.runtime > 0 && (
                  <div className="flex items-center text-white">
                    <Clock className="w-5 h-5" />
                    <span className="ml-2">{formatDuration(details.runtime)}</span>
                  </div>
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
                  to={`/watch/movie/${id}`}
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

      {/* Player Container */}
      <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
        <div className="flex-1 relative" ref={playerRef}>
          <div className="aspect-video">
            <iframe
              key={videoUrl}
              src={videoUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
            {/* Floating Source Button */}
            <button
              onClick={() => setIsSourcesOpen(true)}
              className="absolute top-4 right-4 px-4 py-2 bg-black/75 hover:bg-black/90 text-white rounded-lg backdrop-blur-sm flex items-center gap-2 transition-colors"
            >
              <Server className="w-4 h-4" />
              <span className="font-medium">Select Source</span>
            </button>
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
              type="movie" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MovieDetails;