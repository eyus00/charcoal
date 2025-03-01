import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayCircle, Film, RotateCcw, Star, Clock, Download, FolderOpen, ChevronDown, Database, Magnet } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';
import { useStore, WatchStatus } from '../store/useStore';
import WatchlistButton from '../components/WatchlistButton';
import RelatedVideos from '../components/RelatedVideos';
import SimilarContent from '../components/SimilarContent';
import TorrentDownloader from '../components/TorrentDownloader';
import DriveBrowser from '../components/DriveBrowser';

const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [isTorrentMenuOpen, setIsTorrentMenuOpen] = useState(false);
  const [isDriveBrowserOpen, setIsDriveBrowserOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
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

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        downloadMenuRef.current && 
        !downloadMenuRef.current.contains(event.target as Node)
      ) {
        setIsDownloadMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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

  return (
    <div className="min-h-screen">
      <div className="relative min-h-[90vh]">
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
        <div className="relative min-h-[90vh] flex flex-col">
          <div className="container mx-auto px-4 py-8 flex flex-col items-center md:items-start flex-grow">
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
                  
                  <div className="flex items-center justify-center md:justify-start gap-4 mb-3">
                    <div className="flex items-center flex-shrink-0">
                      <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                      <span className="text-white ml-2 text-xl font-medium">
                        {details.vote_average.toFixed(1)}
                      </span>
                    </div>
                    {details.runtime > 0 && (
                      <div className="flex items-center flex-shrink-0">
                        <Clock className="w-5 h-5 text-white" />
                        <span className="text-white ml-2">
                          {formatDuration(details.runtime)}
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
                    </div>
                    
                    <div className="relative" ref={downloadMenuRef}>
                      <button
                        onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                        className="w-full md:w-auto px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-md flex items-center justify-center gap-2 transition-all duration-300 backdrop-blur-sm"
                      >
                        <Download className="w-5 h-5" />
                        <span>Download</span>
                        <ChevronDown className={cn(
                          "w-4 h-4 transition-transform ml-1",
                          isDownloadMenuOpen && "transform rotate-180"
                        )} />
                      </button>
                      
                      {isDownloadMenuOpen && (
                        <div className="absolute z-10 mt-2 w-48 bg-black/80 backdrop-blur-md rounded-lg shadow-lg overflow-hidden right-0 md:left-0">
                          <button
                            onClick={() => {
                              setIsTorrentMenuOpen(true);
                              setIsDownloadMenuOpen(false);
                            }}
                            className="w-full px-4 py-3 text-white hover:bg-white/10 transition-colors flex items-center gap-3"
                          >
                            <Magnet className="w-5 h-5 text-red-500" />
                            <span>Torrent Files</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsDriveBrowserOpen(true);
                              setIsDownloadMenuOpen(false);
                            }}
                            className="w-full px-4 py-3 text-white hover:bg-white/10 transition-colors flex items-center gap-3"
                          >
                            <Database className="w-5 h-5 text-blue-500" />
                            <span>Drive Browser</span>
                          </button>
                        </div>
                      )}
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
              type="movie" 
            />
          </div>
        </div>
      </div>

      {/* Torrent Downloader */}
      <TorrentDownloader
        isOpen={isTorrentMenuOpen}
        onClose={() => setIsTorrentMenuOpen(false)}
        title={details.title}
        releaseYear={year.toString()}
        isShow={false}
      />

      {/* Drive Browser */}
      <DriveBrowser
        isOpen={isDriveBrowserOpen}
        onClose={() => setIsDriveBrowserOpen(false)}
        title={details.title}
        releaseYear={year.toString()}
        isShow={false}
        movieId={Number(id)}
      />
    </div>
  );
};

export default MovieDetails;