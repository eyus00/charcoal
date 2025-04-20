import React from 'react';
import RelatedVideos from '../../../components/RelatedVideos';
import SimilarContent from '../../../components/SimilarContent';
import { Movie, TVShow } from '../../../api/types';

interface RelatedContentProps {
  videos?: {
    results: {
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
    }[];
  };
  similar?: {
    results: (Movie | TVShow)[];
  };
  recommendations?: {
    results: (Movie | TVShow)[];
  };
  type: 'movie' | 'tv';
}

const RelatedContent: React.FC<RelatedContentProps> = ({
  videos,
  similar,
  recommendations,
  type,
}) => {
  if (!videos?.results.length && !similar?.results.length && !recommendations?.results.length) {
    return null;
  }

  return (
    <>
      {videos?.results.length > 0 && (
        <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <h2 className="text-xl font-semibold">Related Videos</h2>
          </div>
          <div className="p-6">
            <RelatedVideos videos={videos.results} />
          </div>
        </div>
      )}

      {(similar?.results.length > 0 || recommendations?.results.length > 0) && (
        <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <h2 className="text-xl font-semibold">You May Also Like</h2>
          </div>
          <div className="p-6">
            <SimilarContent 
              items={similar?.results || recommendations?.results || []} 
              type={type}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default RelatedContent;