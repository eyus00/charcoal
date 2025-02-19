import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Grid, Film, Tv, Search, X, UserCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';

const MobileNav = () => {
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { searchQuery, setSearchQuery } = useStore();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchOpen(false);
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
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

      {/* Search Box */}
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
              className="w-full pl-4 pr-12 py-3 bg-light-surface dark:bg-dark-surface rounded-lg outline-none"
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

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-light-bg dark:bg-dark-bg border-t border-border-light dark:border-border-dark md:hidden z-40">
        <div className="grid grid-cols-5 h-full">
          <Link
            to="/"
            className={cn(
              "flex flex-col items-center justify-center gap-1",
              location.pathname === "/" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
            )}
          >
            <Grid className="w-6 h-6" />
            <span className="text-xs">Browse</span>
          </Link>
          
          <Link
            to="/movies"
            className={cn(
              "flex flex-col items-center justify-center gap-1",
              location.pathname === "/movies" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
            )}
          >
            <Film className="w-6 h-6" />
            <span className="text-xs">Movies</span>
          </Link>

          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex flex-col items-center justify-center gap-1 text-light-text-secondary dark:text-dark-text-secondary -mt-6"
          >
            <div className="w-14 h-14 bg-accent hover:bg-accent-hover rounded-full flex items-center justify-center shadow-lg">
              <Search className="w-7 h-7 text-white" />
            </div>
            <span className="text-xs mt-1">Search</span>
          </button>

          <Link
            to="/tv"
            className={cn(
              "flex flex-col items-center justify-center gap-1",
              location.pathname === "/tv" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
            )}
          >
            <Tv className="w-6 h-6" />
            <span className="text-xs">TV Shows</span>
          </Link>

          <Link
            to="/profile"
            className={cn(
              "flex flex-col items-center justify-center gap-1",
              location.pathname === "/profile" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
            )}
          >
            <UserCircle className="w-6 h-6" />
            <span className="text-xs">Profile</span>
          </Link>
        </div>
      </div>
    </>
  );
};

export default MobileNav;