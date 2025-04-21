import { WatchHistoryItem } from '../store/useStore';

export const getResumeInfo = (
  mediaType: 'movie' | 'tv',
  id: number,
  watchHistory: WatchHistoryItem[]
) => {
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