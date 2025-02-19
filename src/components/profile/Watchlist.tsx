import React from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Film, Tv, Star, Trash2 } from 'lucide-react';
import { WatchlistItem, WatchStatus } from '../../store/useStore';
import { getImageUrl } from '../../api/config';
import { cn } from '../../lib/utils';

interface Filter {
  id: string;
  label: string;
  value: WatchStatus | 'movie' | 'tv';
  type: 'status' | 'mediaType';
}

const FILTERS: Filter[] = [
  { id: 'watching', label: 'Currently Watching', value: 'watching', type: 'status' },
  { id: 'planned', label: 'Plan to Watch', value: 'planned', type: 'status' },
  { id: 'completed', label: 'Completed', value: 'completed', type: 'status' },
  { id: 'movie', label: 'Movies', value: 'movie', type: 'mediaType' },
  { id: 'tv', label: 'TV Shows', value: 'tv', type: 'mediaType' },
];

const STATUS_COLORS = {
  watching: 'bg-blue-500',
  planned: 'bg-purple-500',
  completed: 'bg-green-500',
};

const STATUS_LABELS = {
  watching: 'Watching',
  planned: 'Plan to Watch',
  completed: 'Completed',
};

interface WatchlistProps {
  watchlist: WatchlistItem[];
  onRemoveFromWatchlist: (id: number, mediaType: 'movie' | 'tv') => void;
}

const Watchlist: React.FC<WatchlistProps> = ({
  watchlist,
  onRemoveFromWatchlist,
}) => {
  const [activeFilters, setActiveFilters] = React.useState<Set<string>>(new Set());

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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bookmark className="w-5 h-5" />
          Watchlist
        </h2>
        <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {watchlist.length} items
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => toggleFilter(filter.id)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 rounded-full",
              activeFilters.has(filter.id)
                ? "bg-red-600 text-white"
                : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10"
            )}
          >
            {filter.type === 'mediaType' ? (
              filter.value === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />
            ) : (
              <div className={cn("w-2 h-2 rounded-full", STATUS_COLORS[filter.value as WatchStatus])} />
            )}
            {filter.label}
          </button>
        ))}
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-12 bg-light-surface dark:bg-dark-surface rounded-lg">
          <Bookmark className="w-12 h-12 text-light-text-secondary dark:text-dark-text-secondary mx-auto mb-3" />
          <p className="text-light-text-primary dark:text-dark-text-primary">Your watchlist is empty</p>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
            Add movies and TV shows to your watchlist to keep track of what you want to watch
          </p>
        </div>
      ) : filteredWatchlist.length === 0 ? (
        <div className="text-center py-12 bg-light-surface dark:bg-dark-surface rounded-lg">
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            No items match your filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[calc(2*300px+1rem)] overflow-y-auto scrollbar-thin pr-2">
          {filteredWatchlist.map((item) => (
            <Link
              key={`${item.mediaType}-${item.id}`}
              to={`/${item.mediaType}/${item.id}`}
              className="group relative"
            >
              <div className="relative overflow-hidden border border-border-light dark:border-border-dark hover:border-accent transition-colors">
                <div className="aspect-[2/3]">
                  <img
                    src={getImageUrl(item.posterPath, 'w500')}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
                  <div className={cn(
                    "inline-flex px-2 py-0.5 text-xs font-medium rounded-full text-white mb-2",
                    item.status === 'watching' && "bg-blue-500",
                    item.status === 'planned' && "bg-purple-500",
                    item.status === 'completed' && "bg-green-500"
                  )}>
                    {STATUS_LABELS[item.status]}
                  </div>
                  <h3 className="text-white font-medium truncate">{item.title}</h3>
                  <div className="flex items-center gap-2 text-white/90 text-sm mt-1">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                      <span>8.5</span>
                    </div>
                    <span>2023</span>
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveFromWatchlist(item.id, item.mediaType);
                }}
                className="absolute top-2 right-2 p-1 text-white/60 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Watchlist;