import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Grid, Film, Tv, Search, X, Dumbbell } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { searchQuery, setSearchQuery } = useStore();

  const handleSearch = (e) => {
    if (e) {
      e.preventDefault();
    }
    if (searchQuery.trim()) {
      setIsSearchOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchToggle = () => {
    if (isSearchOpen && searchQuery.trim()) {
      handleSearch();
    } else {
      setIsSearchOpen(!isSearchOpen);
    }
  };

  return (
    <div className="fixed bottom-6 left-4 right-4 md:hidden z-50 pt-6">
      <div
        className={cn(
          'bg-light-bg dark:bg-dark-bg border-2 border-gray-400/50 dark:border-white/20 rounded-2xl backdrop-blur-md shadow-lg transition-all duration-200 relative'
        )}
      >
        {/* Search Field */}
        <div
          className={cn(
            'px-3 pt-3 transition-all duration-200',
            isSearchOpen ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
          )}
        >
          <form onSubmit={handleSearch}>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies, TV shows..."
                className="w-full pl-4 pr-10 py-2 bg-light-surface dark:bg-dark-surface rounded-lg outline-none text-light-text dark:text-dark-text text-sm"
                autoFocus={isSearchOpen}
              />
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full"
              >
                <X className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
              </button>
            </div>
          </form>
        </div>

        {/* Navigation Icons */}
        <div className="relative grid grid-cols-5 h-14 pt-0">
          <Link
            to="/"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              location.pathname === '/' ? 'text-red-600' : 'text-light-text-secondary dark:text-dark-text-secondary'
            )}
          >
            <Grid className="w-6 h-6" />
            <span className="text-[9px]">Browse</span>
          </Link>

          <Link
            to="/movies"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              location.pathname === '/movies' ? 'text-red-600' : 'text-light-text-secondary dark:text-dark-text-secondary'
            )}
          >
            <Film className="w-6 h-6" />
            <span className="text-[9px]">Movies</span>
          </Link>

          {/* Big Search Button - Center and on top */}
          <div className="relative col-span-1 flex items-center justify-center">
            <button
              onClick={handleSearchToggle}
              className="flex flex-col items-center justify-center gap-0.5 text-light-text-secondary dark:text-dark-text-secondary"
              style={{ position: 'absolute', top: '-24px', zIndex: 20 }}
            >
              <div
                className={cn(
                  'w-12 h-12 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-md border-2 border-gray-400/50 dark:border-white/20'
                )}
              >
                <Search className="w-6 h-6 text-white" />
              </div>
              <span className="text-[9px] mt-1">Search</span>
            </button>
          </div>

          <Link
            to="/tv"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              location.pathname === '/tv' ? 'text-red-600' : 'text-light-text-secondary dark:text-dark-text-secondary'
            )}
          >
            <Tv className="w-6 h-6" />
            <span className="text-[9px]">TV Shows</span>
          </Link>

          <Link
            to="/sports"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              location.pathname === '/sports' ? 'text-red-600' : 'text-light-text-secondary dark:text-dark-text-secondary'
            )}
          >
            <Dumbbell className="w-6 h-6" />
            <span className="text-[9px]">Sports</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MobileNav;
