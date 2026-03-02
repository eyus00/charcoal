import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Film, Tv, Play, Info } from 'lucide-react';
import { motion } from 'framer-motion';
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
      "group flex flex-col gap-4 rounded-[2rem] transition-all text-left border relative overflow-hidden p-2",
      "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10 hover:shadow-2xl hover:shadow-black/50 transition-all duration-500",
      className
    )}>
      {/* Poster Card */}
      <Link
        to={`/${type}/${media.id}`}
        className="relative w-full aspect-[2/3] rounded-[1.5rem] overflow-hidden flex-shrink-0 shadow-lg cursor-pointer"
      >
        <img
          src={getImageUrl(media.poster_path, 'w500')}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Gradients & Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-500" />
        
        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 scale-150 group-hover:scale-100">
          <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center shadow-xl shadow-accent/40">
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          </div>
        </div>

        {/* Year Badge - Top Left */}
        {displayYear && (
          <div className="absolute top-3 left-3 transform -translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-100">
            <div className="px-3 py-1 bg-black/60 backdrop-blur-md text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/10 shadow-xl">
              {displayYear}
            </div>
          </div>
        )}
        
        {/* Rating Badge - Top Right */}
        {media.vote_average > 0 && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-md text-white rounded-xl border border-white/10 shadow-lg">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              <span className="text-[11px] font-black tracking-tighter">{media.vote_average.toFixed(1)}</span>
            </div>
          </div>
        )}

        {/* Info Badge - Bottom Left */}
        <div className="absolute bottom-3 left-3 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-150">
          <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 text-white hover:bg-white/20 transition-colors">
            <Info className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* Info Area */}
      <div className="px-3 pb-2 flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <Link
            to={`/${type}/${media.id}`}
            className="font-bold text-sm md:text-base leading-tight text-white group-hover:text-accent transition-colors block truncate"
          >
            {title}
          </Link>
          <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">
            {displayYear} {type === 'tv' ? 'Series' : 'Movie'}
          </p>
        </div>
        <div className="flex-shrink-0 p-2 bg-white/5 rounded-xl border border-white/10 group-hover:border-white/20 transition-colors">
          {type === 'tv' ? (
            <Tv className="w-3.5 h-3.5 text-white/40 group-hover:text-white/80 transition-colors" />
          ) : (
            <Film className="w-3.5 h-3.5 text-white/40 group-hover:text-white/80 transition-colors" />
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaCard;
