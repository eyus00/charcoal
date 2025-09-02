import React from 'react';
import { useMedia } from '../api/hooks/useMedia';
import MediaCard from '../components/shared/MediaCard';

const TVShows = () => {
  const { data } = useMedia.usePopular('tv');

  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Popular TV Shows</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {data.results.map((show) => (
          <MediaCard key={show.id} media={show} type="tv" />
        ))}
      </div>
    </div>
  );
};

export default TVShows;