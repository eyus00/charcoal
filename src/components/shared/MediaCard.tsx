import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Film, Tv } from 'lucide-react';
import { Movie, TVShow } from '../../api/types';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface MediaCardProps {
  media: Movie | TVShow;
  type: 'movie' | 'tv';
  className?: string;
}

const MediaCard: React.FC<MediaCardProps> = ({ media, type, className }) => {
  const title = 'title' in media ? media.title : media.name;
  const releaseDate = 'release_date' in media ? media.release_date : media.first_air_date;

  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const displayYear = !isNaN(year as number) ? year : '';

  return (
    <div className={cn(
      "group flex flex-col gap-3 rounded-2xl transition-all text-left border relative overflow-hidden",
      "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10 hover:scale-[1.02] duration-300",
      className
    )}>
      {/* Poster Card */}
      <Link
        to={`/${type}/${media.id}`}
        className="relative w-full aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 shadow-lg cursor-pointer"
      >
        <img
          src={getImageUrl(media.poster_path, 'w342')}
          alt={title}
          className="w-full h-full object-cover"
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors duration-300" />
        {/* Year Badge - Top Left */}
        {displayYear && (
          <div className="absolute top-2 left-2">
            <div className="px-2 py-1 bg-black/50 backdrop-blur-md text-white rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/10">
              {displayYear}
            </div>
          </div>
        )}
        {/* Rating Badge - Top Right */}
        {media.vote_average > 0 && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-md text-white rounded-lg border border-white/10">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] font-bold">{media.vote_average.toFixed(1)}</span>
            </div>
          </div>
        )}
      </Link>

      {/* Info Area - single line title with badge */}
      <div className="px-2 pb-2 flex items-center justify-between gap-2 min-w-0">
        <Link
          to={`/${type}/${media.id}`}
          className="font-bold text-sm leading-tight text-white line-clamp-1"
        >
          {title}
        </Link>
        <div className="flex-shrink-0 p-1 bg-white/5 rounded-lg border border-white/10">
          {type === 'tv' ? (
            <Tv className="w-3 h-3 text-white/60" />
          ) : (
            <Film className="w-3 h-3 text-white/60" />
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaCard;
