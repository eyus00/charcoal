import React from 'react';
import MediaCard from '../../../components/MediaCard';
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

  const trailers = videos?.results.filter(video => 
    video.site === 'YouTube' && 
    (video.type === 'Trailer' || video.type === 'Teaser')
  ) || [];

  const similarItems = similar?.results || recommendations?.results || [];

  return (
    <>
      {trailers.length > 0 && (
        <div className="bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <div className="p-3 border-b border-border-light dark:border-border-dark">
            <h2 className="text-xl font-semibold">Related Videos</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trailers.slice(0, 6).map((video) => (
                <a
                  key={video.id}
                  href={`https://www.youtube.com/watch?v=${video.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <div className="relative aspect-video bg-light-surface dark:bg-dark-surface rounded-lg overflow-hidden border border-border-light dark:border-border-dark hover:border-red-500 transition-colors">
                    <img
                      src={`https://img.youtube.com/vi/${video.key}/hqdefault.jpg`}
                      alt={video.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <h3 className="mt-2 text-sm font-medium line-clamp-2">{video.name}</h3>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {similarItems.length > 0 && (
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
      )}
    </>
  );
};

export default RelatedContent;