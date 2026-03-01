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
    { label: 'Explore', path: '/', icon: '✨' },
    { label: 'Movies', path: '/movies', icon: '🎬' },
    { label: 'TV Shows', path: '/tv', icon: '📺' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-lg z-50 border-b border-white/5 px-3 md:px-6">
      <div className="h-full flex items-center justify-between gap-3 md:gap-8">

        {/* Left: Search Bar - Hidden on Mobile */}
        <form onSubmit={handleSearch} className="flex-shrink-0 w-48 md:w-64 hidden md:block">
          <div className={cn(
            "relative flex items-center gap-3 px-4 py-2.5 bg-white/5 rounded-xl border transition-all duration-200",
            isSearchFocused
              ? "bg-white/10 border-white/20 shadow-lg shadow-white/10"
              : "border-white/10 hover:bg-white/[0.07] hover:border-white/15"
          )}>
            <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search movies..."
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/40 font-medium"
            />
          </div>
        </form>

        {/* Center: Navigation - Hidden on Mobile */}
        <nav className="flex-1 flex items-center justify-center gap-1 hidden md:flex">
          {navigationItems.map((item) => {
            const isItemActive = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-200 rounded-lg group whitespace-nowrap",
                  isItemActive
                    ? "text-white"
                    : "text-white/60 hover:text-white/80"
                )}
              >
                {/* Background that flows seamlessly */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-lg transition-all duration-300",
                    isItemActive
                      ? "bg-white/10 shadow-lg shadow-white/10"
                      : "bg-transparent group-hover:bg-white/5"
                  )}
                />

                {/* Content */}
                <span className="relative flex items-center gap-2">
                  <span>{item.icon}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </span>

                {/* Active indicator line */}
                {isItemActive && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 bg-accent rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Actions */}
        <div className="flex-shrink-0 flex items-center gap-2 md:gap-3">
          {/* Notification Bell - Hidden on Mobile */}
          <button className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/15 transition-all duration-200 relative group hidden md:flex">
            <Bell className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Glassy Actions Enclosure */}
          <div className="flex items-center gap-1 md:gap-2 px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/[0.08] hover:border-white/15 transition-all duration-200 group">

            {/* Continue Watching */}
            <Link
              to="/profile#history"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              title="Continue Watching"
            >
              <Clock className="w-4 h-4" />
            </Link>

            {/* Watchlist */}
            <Link
              to="/profile#watchlist"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              title="Watchlist"
            >
              <Bookmark className="w-4 h-4" />
            </Link>

            {/* Divider - Hidden on Mobile */}
            <div className="h-5 w-px bg-white/10 hidden md:block" />

            {/* Profile */}
            <Link
              to="/profile"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              title="Profile"
            >
              <User className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
