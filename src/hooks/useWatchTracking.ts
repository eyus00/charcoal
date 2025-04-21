import { useEffect, useRef } from 'react';
import { WatchHistoryItem, WatchStatus } from '../store/useStore';

const MINIMUM_WATCH_TIME = 30; // 30 seconds to count as "watched"
const COMPLETION_THRESHOLD = 0.9; // 90% completion to mark as completed
const NEAR_END_THRESHOLD = 0.95; // 95% watched to remove from continue watching

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
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Handle VidLink tracking
  useEffect(() => {
    const handlePlayerEvent = (event: MessageEvent) => {
      if (event.origin !== 'https://vidlink.pro') return;
      
      if (event.data?.type === 'MEDIA_DATA') {
        const mediaData = event.data.data;
        localStorage.setItem('vidLinkProgress', JSON.stringify(mediaData));
      }
      
      if (event.data?.type === 'PLAYER_EVENT' && title && posterPath) {
        const { event: eventType, currentTime, duration } = event.data.data;
        
        if (eventType === 'timeupdate' || eventType === 'pause' || eventType === 'ended') {
          const watched = Math.max(0, Math.min(currentTime, duration));
          const completionRatio = watched / duration;
          const isCompleted = completionRatio >= COMPLETION_THRESHOLD;

          // Only update if we have valid data and minimum watch time is met
          if (watched > MINIMUM_WATCH_TIME && duration > 0) {
            // Add to watch history
            onAddToHistory({
              id: Number(id),
              mediaType: mediaType as 'movie' | 'tv',
              title,
              posterPath,
              lastWatched: Date.now(),
              progress: {
                watched,
                duration
              },
              ...(mediaType === 'tv' && {
                season: Number(season),
                episode: Number(episode),
              }),
              isCompleted
            });

            // Update watchlist status based on completion
            if (isCompleted) {
              if (mediaType === 'movie') {
                onUpdateWatchlist(Number(id), 'movie', 'completed');
              } else if (mediaType === 'tv') {
                // For TV shows, only mark as completed if it's the last episode
                // For now, just mark as watching
                onUpdateWatchlist(Number(id), 'tv', 'watching');
              }
            } else if (completionRatio > 0.1) { // If they've watched more than 10%, mark as watching
              onUpdateWatchlist(Number(id), mediaType as 'movie' | 'tv', 'watching');
            }
          }
        }
      }
    };

    window.addEventListener('message', handlePlayerEvent);
    return () => window.removeEventListener('message', handlePlayerEvent);
  }, [title, posterPath, mediaType, id, season, episode, onAddToHistory, onUpdateWatchlist]);
};