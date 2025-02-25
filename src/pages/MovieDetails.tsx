import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayCircle, Film, Video, RotateCcw, Star } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';
import { useStore, WatchStatus } from '../store/useStore';
import WatchlistButton from '../components/WatchlistButton';

const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const { data: details, isLoading } = useMedia.useDetails('movie', Number(id));
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem, watchHistory } = useStore();

  const watchlistItem = getWatchlistItem(Number(id), 'movie');
  const watchHistoryItem = watchHistory.find(
    item => item.id === Number(id) && item.mediaType === 'movie'
  );

  const watchProgress = watchHistoryItem?.progress
    ? Math.round((watchHistoryItem.progress.watched / watchHistoryItem.progress.duration) * 100)
    : 0;

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

  if (isLoading || !details) return <div>Loading...</div>;

  const year = new Date(details.release_date).getFullYear();

  const handleWatch = () => {
    navigate(`/watch/movie/${id}`);
  };

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

  const handleWatchlistRemove = () => {
    removeFromWatchlist(Number(id), 'movie');
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    return minutes >= 60 
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  // Take only the first 2 genres for mobile/tablet
  const displayedGenres = window.innerWidth < 768 ? details.genres?.slice(0, 2) : details.genres;

  return (
    <div className="min-h-screen">
      <div className="relative min-h-screen">
        {/* Full-screen background */}
        <div className="absolute inset-0">
          <img
            src={getImageUrl(details.backdrop_path)}
            alt={details.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/90 to-black/40" />
        </div>

        {/* Content Container */}
        <div className="relative min-h-screen">
          <div className="container mx-auto px-4 py-8 flex flex-col items-center md:items-start min-h-screen">
            {/* Mobile Layout */}
            <div className="mt-auto w-full">
              {/* Centered Poster */}
              <div className="w-48 mx-auto mb-6 md:hidden">
                <img
                  src={getImageUrl(details.poster_path, 'w500')}
                  alt={details.title}
                  className="w-full border-2 border-white/10 shadow-2xl"
                />
              </div>

              {/* Info Section */}
              <div className="flex flex-col md:flex-row items-center md:items-end gap-8 pb-8">
                {/* Desktop Poster */}
                <div className="hidden md:block w-48">
                  <img
                    src={getImageUrl(details.poster_path, 'w500')}
                    alt={details.title}
                    className="w-full border-2 border-white/10 shadow-2xl"
                  />
                </div>

                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <Film className="w-5 h-5 text-white" />
                      <span className="text-white font-medium">Movie</span>
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
                    {details.title} <span className="text-gray-300">({year})</span>
                  </h1>
                  
                  <div className="flex flex-nowrap items-center justify-center md:justify-start gap-4 mb-6 overflow-hidden">
                    <div className="flex items-center flex-shrink-0">
                      <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                      <span className="text-white ml-2 text-xl font-medium">
                        {details.vote_average.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex flex-nowrap overflow-hidden gap-2">
                      {displayedGenres?.map((genre) => (
                        <span key={genre.id} className="px-3 py-1 bg-white/10 rounded-full text-white text-sm backdrop-blur-sm whitespace-nowrap flex-shrink-0">
                          {genre.name}
                        </span>
                      ))}
                    </div>
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
                    <div className="relative flex-1 md:flex-none">
                      <button
                        onClick={handleWatch}
                        className="w-full md:w-auto"
                      >
                        <div className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-red-600/20 hover:shadow-red-600/30">
                          {watchHistoryItem ? (
                            <>
                              <RotateCcw className="w-5 h-5 group-hover:scale-110 transition-transform" />
                              <span>Resume</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                              <span>Watch Now</span>
                            </>
                          )}
                        </div>
                        {watchProgress > 0 && (
                          <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/10 rounded-b-md overflow-hidden">
                            <div 
                              className="absolute inset-y-0 left-0 bg-white/30 transition-all duration-300"
                              style={{ width: `${watchProgress}%` }}
                            />
                          </div>
                        )}
                      </button>
                      {details.runtime > 0 && (
                        <div className="absolute inset-x-0 text-center mt-1">
                          <span className="text-xs text-white/60">
                            {formatDuration(details.runtime)}
                          </span>
                        </div>
                      )}
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${details.videos?.results?.[0]?.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full md:w-auto px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-300 backdrop-blur-sm group"
                    >
                      <Video className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      Watch Trailer
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieDetails;