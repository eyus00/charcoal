import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Film, Tv, Trash2, Star } from 'lucide-react';
import { WatchlistItem, WatchStatus } from '../../store/useStore';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface WatchlistProps {
  watchlist: WatchlistItem[];
  onRemoveFromWatchlist: (id: number, mediaType: 'movie' | 'tv') => void;
}

interface Filter {
  id: string;
  label: string;
  value: WatchStatus | 'movie' | 'tv';
  type: 'status' | 'mediaType';
}

const FILTERS: Filter[] = [
  { id: 'watching', label: 'Watching', value: 'watching', type: 'status' },
  { id: 'planned', label: 'To Watch', value: 'planned', type: 'status' },
  { id: 'completed', label: 'Watched', value: 'completed', type: 'status' },
  { id: 'movie', label: 'Movies', value: 'movie', type: 'mediaType' },
  { id: 'tv', label: 'TV Shows', value: 'tv', type: 'mediaType' },
];

const STATUS_COLORS = {
  watching: { icon: 'bg-red-500' },
  planned: { icon: 'bg-orange-500' },
  completed: { icon: 'bg-red-600' },
};

const STATUS_LABELS = {
  watching: 'Watching',
  planned: 'To Watch',
  completed: 'Watched',
};

const Watchlist: React.FC<WatchlistProps> = ({
  watchlist,
  onRemoveFromWatchlist,
}) => {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = (filterId: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(filterId)) {
      newFilters.delete(filterId);
    } else {
      newFilters.add(filterId);
    }
    setActiveFilters(newFilters);
  };

  const filteredWatchlist = watchlist.filter(item => {
    const statusFilters = FILTERS.filter(f => f.type === 'status' && activeFilters.has(f.id)).map(f => f.value);
    const mediaFilters = FILTERS.filter(f => f.type === 'mediaType' && activeFilters.has(f.id)).map(f => f.value);

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(item.status as WatchStatus);
    const matchesMedia = mediaFilters.length === 0 || mediaFilters.includes(item.mediaType);

    return matchesStatus && matchesMedia;
  });


  return (
    <div className="mb-12">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bookmark className="w-5 h-5" />
          Watchlist
        </h2>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-12 bg-dark-surface rounded-lg">
          <Bookmark className="w-12 h-12 text-dark-text-secondary mx-auto mb-3" />
          <p className="text-dark-text-secondary">
            Your watchlist is empty
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => toggleFilter(filter.id)}
                className={cn(
                  "px-3 py-2 text-xs font-semibold rounded-full transition-all border flex items-center gap-2 uppercase tracking-wider",
                  activeFilters.has(filter.id)
                    ? "bg-accent text-white border-accent shadow-lg shadow-accent/20"
                    : "bg-dark-surface border-border-dark text-dark-text-secondary hover:border-accent"
                )}
              >
                {filter.type === 'mediaType' ? (
                  filter.value === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />
                ) : (
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    filter.value === 'watching' && "bg-red-400",
                    filter.value === 'planned' && "bg-orange-400",
                    filter.value === 'completed' && "bg-red-500"
                  )} />
                )}
                {filter.label}
              </button>
            ))}
          </div>

          {filteredWatchlist.length === 0 ? (
            <div className="text-center py-12 bg-dark-surface rounded-lg">
              <p className="text-dark-text-secondary">No items match your filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[calc(3*144px+2*1rem)] overflow-y-auto scrollbar-thin pr-2">
              {filteredWatchlist.map((item) => {
                const itemKey = `${item.mediaType}-${item.id}`;
                const statusConfig = STATUS_COLORS[item.status];

                return (
                  <div
                    key={itemKey}
                    className="group flex gap-4 bg-dark-bg border-border-dark hover:border-accent transition-colors relative"
                  >
                    {/* Remove button - Absolute positioned */}
                    <button
                      onClick={() => onRemoveFromWatchlist(item.id, item.mediaType)}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 z-10"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>

                    <div className="w-24 flex-shrink-0 relative">
                      <img
                        src={getImageUrl(item.posterPath, 'w185')}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
                        <div className="flex items-center gap-2 text-xs">
                          {item.ratingScore && (
                            <div className="flex items-center gap-0.5">
                              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                              <span className="text-white">{item.ratingScore.toFixed(1)}</span>
                            </div>
                          )}
                          {item.releaseDate && (
                            <span className="text-white">{new Date(item.releaseDate).getFullYear()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 py-3 pr-4">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{item.title}</h3>
                        <div className="flex items-center gap-2 text-sm text-dark-text-secondary mt-1">
                          <span className="capitalize">{item.mediaType}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", statusConfig.icon)} />
                        <span className="text-xs text-dark-text-secondary font-medium">
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Watchlist;
