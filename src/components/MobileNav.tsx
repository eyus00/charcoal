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

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchClick = () => {
    if (!isSearchOpen) {
      setIsSearchOpen(true);
    } else if (searchQuery.trim()) {
      handleSearch();
    }
  };

  return (
    <>
      {/* Search Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200",
          isSearchOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsSearchOpen(false)}
      />

      {/* Search Box Popup */}
      <div
        className={cn(
          "fixed left-4 right-4 bottom-24 bg-light-bg dark:bg-dark-bg rounded-lg shadow-lg z-50 transition-all duration-200",
          isSearchOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
        )}
      >
        <form onSubmit={handleSearch} className="p-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies, TV shows..."
              className="w-full pl-4 pr-12 py-3 bg-light-surface dark:bg-dark-surface rounded-lg outline-none text-light-text dark:text-dark-text"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setIsSearchOpen(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>

      {/* Floating Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 bg-light-bg dark:bg-dark-bg border-t-2 border-gray-400/50 dark:border-white/20">
        <div className="relative grid grid-cols-5 h-16">
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

          {/* Search Button */}
          <button
            onClick={handleSearchClick}
            className="flex flex-col items-center justify-center gap-0.5 text-light-text-secondary dark:text-dark-text-secondary"
          >
            <div className="w-12 h-12 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-md border-2 border-gray-400/50 dark:border-white/20 -mt-6">
              <Search className="w-6 h-6 text-white" />
            </div>
            <span className="text-[9px] mt-1">Search</span>
          </button>

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
    </>
  );
};

export default MobileNav;