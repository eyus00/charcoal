import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, User, Clock, Bookmark, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import SearchBarFilterMenu from '../search/SearchBarFilterMenu';

const TopBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, filters } = useStore();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const hasActiveFilters =
    filters.selectedGenres.length > 0 ||
    filters.minRating > 0 ||
    (filters.yearRange[0] !== 1900 || filters.yearRange[1] !== new Date().getFullYear() + 2) ||
    (filters.mediaType !== 'all' && filters.mediaType !== undefined && filters.mediaType !== '');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsFilterMenuOpen(false);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { label: 'HOME', path: '/' },
    { label: 'MOVIES', path: '/movies' },
    { label: 'TV SHOWS', path: '/tv' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-5 pb-4 px-5 md:px-8 lg:px-12 pointer-events-none">
      <div className="w-full flex items-center justify-between gap-4 pointer-events-auto">
        {/* LEFT: Search */}
        <div className="flex-1 flex justify-start">
          <div className="w-48 md:w-64 lg:w-72 hidden md:block relative">
            <form
              onSubmit={handleSearch}
              className="relative"
            >
              <div
                className={cn(
                  "relative flex items-center gap-2.5 px-4 py-3 bg-white/6 backdrop-blur-xl rounded-full border transition-all duration-300 h-11 pr-2",
                  isSearchFocused || isFilterMenuOpen
                    ? "bg-white/12 border-white/25 shadow-xl shadow-black/20"
                    : "border-white/10 hover:bg-white/9 hover:border-white/20"
                )}
              >
                <Search className="w-4 h-4 text-white/60 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/45 font-medium min-w-0"
                />
                <button
                  type="button"
                  onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                  className={cn(
                    "p-1.5 rounded-full transition-all flex-shrink-0 active:scale-95",
                    hasActiveFilters
                      ? "bg-accent text-white shadow-lg shadow-accent/20"
                      : isFilterMenuOpen
                      ? "bg-accent text-white"
                      : "text-white/40 hover:bg-white/10 hover:text-white"
                  )}
                  title="Filters"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Quick Filter Menu */}
            <SearchBarFilterMenu
              isOpen={isFilterMenuOpen}
              onClose={() => setIsFilterMenuOpen(false)}
            />
          </div>
        </div>

        {/* CENTER: Navigation – remains the visual center */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-6">
          {navigationItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-semibold tracking-wider transition-all duration-300 h-11 flex items-center justify-center min-w-[110px]",
                  active
                    ? "text-white"
                    : "text-white/60 hover:text-white"
                )}
              >
                {item.label}
                {/* Minimal bottom indicator */}
                <span
                  className={cn(
                    "absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 transition-all duration-300",
                    active
                      ? "w-8 bg-accent"
                      : "w-0 bg-white/30"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        {/* RIGHT: Actions */}
        <div className="flex-1 flex justify-end">
          <div
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 bg-white/6 backdrop-blur-xl rounded-full border border-white/10 h-11",
              "hover:bg-white/9 hover:border-white/20 transition-all duration-300"
            )}
          >
            <button
              className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white relative hidden md:block"
            >
              <Bell className="w-4.5 h-4.5" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-red-500/40" />
            </button>

            <div className="h-6 w-px bg-white/15 mx-2 hidden md:block" />

            <Link
              to="/profile#history"
              className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
              title="Continue Watching"
            >
              <Clock className="w-4.5 h-4.5" />
            </Link>

            <Link
              to="/profile#watchlist"
              className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
              title="Watchlist"
            >
              <Bookmark className="w-4.5 h-4.5" />
            </Link>

            <Link
              to="/profile#profile"
              className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
              title="Profile"
            >
              <User className="w-4.5 h-4.5" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
