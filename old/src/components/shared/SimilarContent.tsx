import React from 'react';
import MediaCard from './MediaCard';
import { Movie, TVShow } from '../../api/types';

interface SimilarContentProps {
  similar?: {
    results: (Movie | TVShow)[];
  };
  recommendations?: {
    results: (Movie | TVShow)[];
  };
  type: 'movie' | 'tv';
}

const SimilarContent: React.FC<SimilarContentProps> = ({
  similar,
  recommendations,
  type,
}) => {
  const similarItems = similar?.results || recommendations?.results || [];

  if (similarItems.length === 0) {
    return null;
  }

  return (
    <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-semibold">You May Also Like</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {similarItems.slice(0, 10).map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              type={'title' in item ? 'movie' : 'tv'}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SimilarContent;