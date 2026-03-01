import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, User, Clock, Bookmark } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';

const TopBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery } = useStore();
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { label: 'EXPLORE', path: '/' },
    { label: 'MOVIES', path: '/movies' },
    { label: 'TV SHOWS', path: '/tv' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-5 pb-4 px-5 md:px-8 pointer-events-none">
      <div className="mx-auto flex items-center justify-center gap-8 md:gap-10 lg:gap-12 pointer-events-auto">
        {/* LEFT: Search */}
        <form
          onSubmit={handleSearch}
          className="flex-shrink-0 w-64 md:w-72 lg:w-80 hidden md:block"
        >
          <div
            className={cn(
              "relative flex items-center gap-3 px-4 py-3 bg-white/6 backdrop-blur-xl rounded-full border transition-all duration-300 h-11",
              isSearchFocused
                ? "bg-white/12 border-white/25 shadow-xl shadow-black/20"
                : "border-white/10 hover:bg-white/9 hover:border-white/20"
            )}
          >
            <Search className="w-4.5 h-4.5 text-white/60 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search movies, shows..."
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/45 font-medium"
            />
          </div>
        </form>

        {/* CENTER: Navigation – this block is now the visual center */}
        <nav className="hidden md:flex items-center gap-3 lg:gap-5">
          {navigationItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-5 py-2.5 text-sm font-semibold tracking-wider transition-all duration-300 rounded-full h-11 flex items-center justify-center min-w-[110px]",
                  active
                    ? "bg-white/12 backdrop-blur-xl border border-white/20 text-white shadow-lg shadow-black/15"
                    : "text-white/75 hover:text-white hover:bg-white/8 border border-transparent"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* RIGHT: Actions */}
        <div
          className={cn(
            "flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white/6 backdrop-blur-xl rounded-full border border-white/10 h-11",
            "hover:bg-white/9 hover:border-white/20 transition-all duration-300"
          )}
        >
          <button
            className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white relative hidden md:block"
          >
            <Bell className="w-4.5 h-4.5" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-red-500/40" />
          </button>

          <div className="h-6 w-px bg-white/15 mx-1.5 hidden md:block" />

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
            to="/profile"
            className="p-2 rounded-full hover:bg-white/12 transition-colors text-white/70 hover:text-white"
            title="Profile"
          >
            <User className="w-4.5 h-4.5" />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
