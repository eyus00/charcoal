import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, PlayCircle, Film, Video, Bookmark, Plus, Check } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';
import { useStore, WatchStatus } from '../store/useStore';

const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const { data: details, isLoading } = useMedia.useDetails('movie', Number(id));
  const { addToWatchlist, removeFromWatchlist, getWatchlistItem } = useStore();

  const watchlistItem = getWatchlistItem(Number(id), 'movie');

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
    setIsWatchlistOpen(false);
  };

  const handleWatchlistRemove = () => {
    removeFromWatchlist(Number(id), 'movie');
    setIsWatchlistOpen(false);
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
                    <div className="relative">
                      {watchlistItem ? (
                        <button
                          onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                          className="p-1.5 bg-white/10 hover:bg-white/20 transition-colors"
                        >
                          <Bookmark className="w-5 h-5 text-white fill-white" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
                          className="p-1.5 hover:bg-white/10 transition-colors"
                        >
                          <Bookmark className="w-5 h-5 text-white" />
                        </button>
                      )}

                      {/* Watchlist Dropdown */}
                      {isWatchlistOpen && (
                        <div className="absolute top-full mt-1 right-0 w-48 bg-white shadow-lg py-2 z-50">
                          {!watchlistItem ? (
                            <>
                              <button
                                onClick={() => handleWatchlistAdd('watching')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                              >
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                Currently Watching
                              </button>
                              <button
                                onClick={() => handleWatchlistAdd('planned')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                              >
                                <div className="w-2 h-2 rounded-full bg-purple-500" />
                                Plan to Watch
                              </button>
                              <button
                                onClick={() => handleWatchlistAdd('completed')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                              >
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                Completed
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="px-4 py-1.5">
                                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                                  Current Status
                                </div>
                                <div className="text-sm font-medium capitalize mt-0.5">
                                  {watchlistItem.status === 'planned' ? 'Plan to Watch' : watchlistItem.status}
                                </div>
                              </div>
                              <div className="h-px bg-gray-200 my-1" />
                              <button
                                onClick={() => handleWatchlistAdd('watching')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                Set as Watching
                              </button>
                              <button
                                onClick={() => handleWatchlistAdd('planned')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                Set as Plan to Watch
                              </button>
                              <button
                                onClick={() => handleWatchlistAdd('completed')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                Set as Completed
                              </button>
                              <div className="h-px bg-gray-200 my-1" />
                              <button
                                onClick={handleWatchlistRemove}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100"
                              >
                                Remove from Watchlist
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
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
                    <p className={cn(
                      "text-gray-100 text-base md:text-lg leading-relaxed",
                      !isExpanded && "line-clamp-3"
                    )}>
                      {details.overview}
                    </p>
                    {details.overview.split(' ').length > 60 && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-white/80 hover:text-white text-sm mt-2 block mx-auto md:mx-0"
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      onClick={handleWatch}
                      className="w-full md:w-auto px-8 py-3 bg-red-600 text-white flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
                    >
                      <PlayCircle className="w-5 h-5" />
                      Watch Now
                    </button>
                    <a
                      href={`https://www.youtube.com/watch?v=${details.videos?.results?.[0]?.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full md:w-auto px-8 py-3 bg-white/10 text-white flex items-center justify-center gap-2 hover:bg-white/20 transition-colors backdrop-blur-sm"
                    >
                      <Video className="w-5 h-5" />
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