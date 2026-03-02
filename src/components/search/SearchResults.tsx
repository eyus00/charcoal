import React from 'react';
import { Movie, TVShow } from '../../api/types';
import MediaCard from '../shared/MediaCard';
import { motion } from 'framer-motion';

interface SearchResultsProps {
  results: (Movie | TVShow)[];
  isLoading: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-8">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="animate-pulse space-y-4">
            <div className="aspect-[2/3] bg-white/5 rounded-[2rem] border border-white/5" />
            <div className="space-y-2 px-2">
              <div className="h-4 bg-white/5 rounded-full w-3/4" />
              <div className="h-3 bg-white/5 rounded-full w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-y-10 gap-x-6 md:gap-x-8">
      {results.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
        >
          <MediaCard
            media={item}
            type={'title' in item ? 'movie' : 'tv'}
            className="w-full"
          />
        </motion.div>
      ))}
    </div>
  );
};

export default SearchResults;
