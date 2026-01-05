import { WatchHistoryItem } from '../store/useStore';

interface VideoProgress {
  id: number;
  mediaType: 'movie' | 'tv';
  timestamp: number;
  duration: number;
  progress?: number;
  season?: number;
  episode?: number;
  isCompleted?: boolean;
}

// Combine progress data from both sources
export const getVideoProgress = (): VideoProgress | null => {
  const vidLinkData = localStorage.getItem('vidLinkProgress');
  const videasyData = localStorage.getItem('videasyProgress');

  let vidLinkProgress: VideoProgress | null = null;
  let videasyProgress: VideoProgress | null = null;

  try {
    if (vidLinkData) {
      vidLinkProgress = JSON.parse(vidLinkData);
    }
    if (videasyData) {
      videasyProgress = JSON.parse(videasyData);
    }
  } catch (e) {
    console.warn('Error parsing progress data:', e);
    return null;
  }

  // Return the most recent progress
  if (vidLinkProgress && videasyProgress) {
    return vidLinkProgress.timestamp > videasyProgress.timestamp
      ? vidLinkProgress
      : videasyProgress;
  }

  return vidLinkProgress || videasyProgress;
};

export const getResumeInfo = (
  mediaType: 'movie' | 'tv',
  id: number,
  watchHistory: WatchHistoryItem[]
) => {
  // First check local storage for any recent progress
  const progress = getVideoProgress();
  if (progress && progress.id === id && progress.mediaType === mediaType) {
    return {
      season: progress.season,
      episode: progress.episode,
      progress: {
        watched: progress.timestamp,
        duration: progress.duration
      },
      isCompleted: progress.isCompleted
    };
  }

  // Fall back to watch history
  const historyItem = watchHistory.find(
    item => item.mediaType === mediaType && item.id === id
  );

  if (!historyItem) return null;

  return {
    season: historyItem.season,
    episode: historyItem.episode,
    progress: historyItem.progress,
    isCompleted: historyItem.isCompleted
  };
};