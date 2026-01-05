import { useEffect, useRef } from 'react';
import { WatchHistoryItem, WatchStatus } from '../store/useStore';
import { getVideoProgress } from '../lib/watch';

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

  // Shared progress update handler
  const handleProgressUpdate = (currentTime: number, duration: number) => {
    if (!title || !posterPath) return;

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
          onUpdateWatchlist(Number(id), 'tv', 'watching');
        }
      } else if (completionRatio > 0.1) {
        onUpdateWatchlist(Number(id), mediaType as 'movie' | 'tv', 'watching');
      }

      // Store progress in a unified format for both players
      const progressData = {
        id: Number(id),
        mediaType,
        timestamp: watched,
        duration,
        progress: completionRatio,
        ...(mediaType === 'tv' && {
          season: Number(season),
          episode: Number(episode)
        }),
        isCompleted
      };

      localStorage.setItem('vidLinkProgress', JSON.stringify(progressData));
      localStorage.setItem('videasyProgress', JSON.stringify(progressData));
    }
  };

  // Handle VidLink and VIDEASY tracking
  useEffect(() => {
    const handlePlayerEvent = (event: MessageEvent) => {
      // Handle VidLink events
      if (event.origin === 'https://vidlink.pro') {
        if (event.data?.type === 'PLAYER_EVENT') {
          const { event: eventType, currentTime, duration } = event.data.data;
          
          if (eventType === 'timeupdate' || eventType === 'pause' || eventType === 'ended') {
            handleProgressUpdate(currentTime, duration);
          }
        }
      }

      // Handle VIDEASY events
      if (event.origin === 'https://player.videasy.net') {
        try {
          const data = JSON.parse(event.data);
          
          if (data && typeof data === 'object') {
            const { timestamp, duration, progress, type } = data;
            
            if (type === mediaType && timestamp !== undefined && duration) {
              handleProgressUpdate(timestamp, duration);
            }
          }
        } catch (e) {
          console.warn('Invalid VIDEASY message:', e);
        }
      }
    };

    window.addEventListener('message', handlePlayerEvent);
    return () => window.removeEventListener('message', handlePlayerEvent);
  }, [title, posterPath, mediaType, id, season, episode, onAddToHistory, onUpdateWatchlist]);

  // Check for existing progress on mount
  useEffect(() => {
    const progress = getVideoProgress();
    if (progress && progress.id === id && progress.mediaType === mediaType) {
      handleProgressUpdate(progress.timestamp, progress.duration);
    }
  }, []);
};