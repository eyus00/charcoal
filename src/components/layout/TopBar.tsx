import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, User, History, Bookmark, SlidersHorizontal } from 'lucide-react';
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
    <header className="fixed top-4 left-0 right-0 z-50 px-4 md:px-8 lg:px-12 pointer-events-none">
      <div className="mx-auto max-w-7xl w-full flex items-center justify-between gap-4 pointer-events-auto bg-black/40 backdrop-blur-xl rounded-full border border-white/10 px-4 py-1.5 md:py-2 shadow-2xl">
        {/* LEFT: Search & Brand */}
        <div className="flex-1 flex justify-start items-center gap-3">
          <Link to="/" className="text-accent font-black text-xl tracking-tighter md:hidden">
            C
          </Link>
          <div className="w-full max-w-[200px] md:w-64 lg:w-72 relative">
            <form
              onSubmit={handleSearch}
              className="relative"
            >
              <div
                className={cn(
                  "relative flex items-center gap-2.5 px-3 md:px-4 py-2 bg-white/6 rounded-full border transition-all duration-300 h-9 md:h-11 pr-2",
                  isSearchFocused || isFilterMenuOpen
                    ? "bg-white/12 border-white/25 shadow-xl shadow-black/20"
                    : "border-white/10 hover:bg-white/9 hover:border-white/20"
                )}
              >
                <Search className="w-3.5 h-3.5 md:w-4 md:h-4 text-white/60 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent outline-none text-xs md:text-sm text-white placeholder-white/45 font-medium min-w-0"
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
                  <SlidersHorizontal className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </button>
              </div>
            </form>

            <SearchBarFilterMenu
              isOpen={isFilterMenuOpen}
              onClose={() => setIsFilterMenuOpen(false)}
            />
          </div>
        </div>

        {/* CENTER: Navigation */}
        <nav className="hidden md:flex items-center gap-2 lg:gap-4">
          {navigationItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-4 py-2 text-xs lg:text-sm font-semibold tracking-wider transition-all duration-300 h-10 flex items-center justify-center min-w-[90px] lg:min-w-[110px]",
                  active
                    ? "text-white"
                    : "text-white/60 hover:text-white"
                )}
              >
                {item.label}
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
        <div className="flex-1 flex justify-end items-center gap-1 md:gap-2">
          <button
            className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white relative hidden sm:block"
          >
            <Bell className="w-4 h-4 md:w-4.5 md:h-4.5" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-red-500/40" />
          </button>

          <div className="h-5 w-px bg-white/15 mx-1 hidden md:block" />

          <Link
            to="/profile#history"
            className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
            title="Continue Watching"
          >
            <History className="w-4 h-4 md:w-4.5 md:h-4.5" />
          </Link>

          <Link
            to="/profile#watchlist"
            className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
            title="Watchlist"
          >
            <Bookmark className="w-4 h-4 md:w-4.5 md:h-4.5" />
          </Link>

          <Link
            to="/profile#profile"
            className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
            title="Profile"
          >
            <User className="w-4 h-4 md:w-4.5 md:h-4.5" />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
