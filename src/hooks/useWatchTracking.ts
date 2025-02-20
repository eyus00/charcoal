import { useEffect, useRef } from 'react';
import { WatchHistoryItem, WatchStatus } from '../store/useStore';

const MINIMUM_WATCH_TIME = 30; // 30 seconds to count as "watched"
const TRACKING_INTERVAL = 10000; // Update every 10 seconds
const COMPLETION_THRESHOLD = 0.85; // 85% completion to mark as completed

interface UseWatchTrackingProps {
  mediaType: string;
  id: number;
  title: string | undefined;
  posterPath: string | undefined;
  season?: string | null;
  episode?: string | null;
  onAddToHistory: (item: WatchHistoryItem) => void;
  onUpdateWatchlist: (id: number, mediaType: 'movie' | 'tv', status: WatchStatus) => void;
}

export const useWatchTracking = ({
  mediaType,
  id,
  title,
  posterPath,
  season,
  episode,
  onAddToHistory,
  onUpdateWatchlist,
}: UseWatchTrackingProps) => {
  const watchTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());
  const isActiveRef = useRef(true);
  const trackingIntervalRef = useRef<number>();

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      isActiveRef.current = !document.hidden;
      
      if (!document.hidden) {
        lastUpdateRef.current = Date.now();
      } else {
        // Update watch time when tab becomes hidden
        const now = Date.now();
        const timeDiff = now - lastUpdateRef.current;
        watchTimeRef.current += Math.max(0, timeDiff);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Track active viewing time
  useEffect(() => {
    if (!title || !posterPath) return;

    const trackViewingTime = () => {
      if (isActiveRef.current) {
        const now = Date.now();
        const timeDiff = now - lastUpdateRef.current;
        watchTimeRef.current += timeDiff;
        lastUpdateRef.current = now;

        // Add to watch history if watched for more than minimum time
        if (watchTimeRef.current >= MINIMUM_WATCH_TIME * 1000) {
          onAddToHistory({
            id: Number(id),
            mediaType: mediaType as 'movie' | 'tv',
            title,
            posterPath,
            lastWatched: Date.now(),
            progress: {
              watched: watchTimeRef.current / 1000,
              duration: 0, // We don't know the total duration for non-VidLink sources
            },
            ...(mediaType === 'tv' && {
              season: Number(season),
              episode: Number(episode),
            }),
          });
        }
      }
    };

    // Start tracking interval
    trackingIntervalRef.current = window.setInterval(trackViewingTime, TRACKING_INTERVAL);

    // Cleanup
    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
      // Final update when component unmounts
      trackViewingTime();
    };
  }, [title, posterPath, mediaType, id, season, episode, onAddToHistory]);

  // Handle VidLink tracking
  useEffect(() => {
    const handlePlayerEvent = (event: MessageEvent) => {
      if (event.origin !== 'https://vidlink.pro') return;
      
      if (event.data?.type === 'MEDIA_DATA') {
        localStorage.setItem('vidLinkProgress', JSON.stringify(event.data.data));
      }
      
      if (event.data?.type === 'PLAYER_EVENT' && title && posterPath) {
        const { event: eventType, currentTime, duration } = event.data.data;
        
        if (eventType === 'timeupdate' || eventType === 'pause') {
          const vidLinkData = localStorage.getItem('vidLinkProgress');
          const progressData = vidLinkData ? JSON.parse(vidLinkData) : null;
          
          const showProgress = mediaType === 'tv' 
            ? progressData?.[Number(id)]?.show_progress?.[`s${season}e${episode}`]
            : progressData?.[Number(id)];

          if (showProgress?.progress) {
            const progress = showProgress.progress;
            const completionRatio = progress.watched / progress.duration;

            // Update watchlist status based on completion
            if (completionRatio >= COMPLETION_THRESHOLD) {
              if (mediaType === 'movie') {
                onUpdateWatchlist(Number(id), 'movie', 'completed');
              } else if (mediaType === 'tv') {
                // For TV shows, we only mark as completed if it's the last episode
                // This logic can be enhanced based on your needs
                onUpdateWatchlist(Number(id), 'tv', 'watching');
              }
            }

            onAddToHistory({
              id: Number(id),
              mediaType: mediaType as 'movie' | 'tv',
              title,
              posterPath,
              lastWatched: Date.now(),
              progress: showProgress.progress,
              ...(mediaType === 'tv' && {
                season: Number(season),
                episode: Number(episode),
              }),
            });
          }
        }
      }
    };

    window.addEventListener('message', handlePlayerEvent);
    return () => window.removeEventListener('message', handlePlayerEvent);
  }, [title, posterPath, mediaType, id, season, episode, onAddToHistory, onUpdateWatchlist]);
};