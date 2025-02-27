import React from 'react';
import { Movie, TVShow } from '../../api/types';
import MediaCard from '../MediaCard';

interface SearchResultsProps {
  results: (Movie | TVShow)[];
  isLoading: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[2/3] bg-gray-200 rounded mb-2" />
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12 bg-light-surface dark:bg-dark-surface rounded-lg">
        <p className="text-light-text-primary dark:text-dark-text-primary">No results found</p>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {results.map((item) => (
        <MediaCard
          key={item.id}
          media={item}
          type={'title' in item ? 'movie' : 'tv'}
        />
      ))}
    </div>
  );
};

export default SearchResults;