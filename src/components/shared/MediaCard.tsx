import React from 'react';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Movie, TVShow, getImageUrl } from '../../lib/tmdb';

interface MediaCardProps {
  media: Movie | TVShow;
  type: 'movie' | 'tv';
}

const MediaCard: React.FC<MediaCardProps> = ({ media, type }) => {
  const title = 'title' in media ? media.title : media.name;
  const releaseDate = 'release_date' in media ? media.release_date : media.first_air_date;
  
  // Add proper date validation
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const displayYear = !isNaN(year as number) ? year : '';

  return (
    <Link to={`/${type}/${media.id}`} className="block group">
      <div className="relative overflow-hidden rounded-lg border-2 border-transparent hover:border-red-600 dark:hover:border-red-500 transition-colors">
        <div className="aspect-[2/3]">
          <img
            src={getImageUrl(media.poster_path, 'w500')}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          <h3 className="text-white font-medium truncate">{title}</h3>
          <div className="flex items-center mt-1">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span className="text-white text-sm ml-1">
              {media.vote_average.toFixed(1)}
            </span>
            {displayYear && (
              <span className="text-white text-sm ml-2">{displayYear}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default MediaCard;