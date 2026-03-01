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
    { label: 'Explore', path: '/' },
    { label: 'Movies', path: '/movies' },
    { label: 'TV Shows', path: '/tv' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-lg z-50 border-b border-white/5">
      <div className="h-full flex items-center justify-center gap-6 px-6">

        {/* Left: Search Bar - Hidden on Mobile */}
        <form onSubmit={handleSearch} className="flex-shrink-0 w-56 hidden md:block">
          <div className={cn(
            "relative flex items-center gap-3 px-4 py-2.5 bg-white/5 rounded-2xl border transition-all duration-200 h-10",
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
        <nav className="flex items-center gap-2 hidden md:flex">
          {navigationItems.map((item) => {
            const isItemActive = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all duration-200 rounded-lg group whitespace-nowrap h-10 flex items-center",
                  isItemActive
                    ? "text-accent"
                    : "text-white/60 hover:text-white/80"
                )}
              >
                {/* Background that flows seamlessly */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-lg transition-all duration-300 -z-10",
                    isItemActive
                      ? "bg-white/10 shadow-lg shadow-white/10"
                      : "bg-transparent group-hover:bg-white/5"
                  )}
                />

                {/* Content */}
                <span className="relative">{item.label}</span>

                {/* Active indicator line */}
                {isItemActive && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 bg-accent rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Actions Enclosure */}
        <div className="flex-shrink-0 flex items-center gap-0 px-1.5 py-1.5 rounded-xl md:rounded-xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/[0.08] hover:border-white/15 transition-all duration-200 h-10">

          {/* Notification Bell - Hidden on Mobile */}
          <button className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white relative group hidden md:flex items-center justify-center">
            <Bell className="w-4 h-4" />
            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-white/10 hidden md:block" />

          {/* Continue Watching */}
          <Link
            to="/profile#history"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white flex items-center justify-center"
            title="Continue Watching"
          >
            <Clock className="w-4 h-4" />
          </Link>

          {/* Watchlist */}
          <Link
            to="/profile#watchlist"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white flex items-center justify-center"
            title="Watchlist"
          >
            <Bookmark className="w-4 h-4" />
          </Link>

          {/* Profile */}
          <Link
            to="/profile#profile"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white flex items-center justify-center"
            title="Profile"
          >
            <User className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
