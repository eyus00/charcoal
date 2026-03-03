import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Film, Tv, SlidersHorizontal, User } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import SearchBarFilterMenu from '../search/SearchBarFilterMenu';

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, filters } = useStore();
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;

  const hasActiveFilters =
    filters.selectedGenres.length > 0 ||
    filters.minRating > 0 ||
    (filters.yearRange[0] !== 1900 || filters.yearRange[1] !== new Date().getFullYear() + 2) ||
    (filters.mediaType !== 'all' && filters.mediaType !== undefined && filters.mediaType !== '');

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchPanelOpen(false);
      setIsFilterMenuOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchClick = () => {
    // If panel is closed, open it
    if (!isSearchPanelOpen) {
      setIsSearchPanelOpen(true);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    // If panel is open and there's text, trigger search
    else if (searchQuery.trim()) {
      handleSearch();
    }
    // If panel is open and empty, close it
    else {
      setIsSearchPanelOpen(false);
    }
  };

  const handleClosePanel = () => {
    setIsSearchPanelOpen(false);
    setIsFilterMenuOpen(false);
  };

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking the search panel or any button within the nav
      if (
        searchPanelRef.current &&
        !searchPanelRef.current.contains(target)
      ) {
        // Check if the click is outside the entire mobile nav container
        const navContainer = document.querySelector('[data-mobile-nav]');
        if (navContainer && !navContainer.contains(target)) {
          handleClosePanel();
        }
      }
    };

    if (isSearchPanelOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isSearchPanelOpen]);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" data-mobile-nav>
      {/* SEARCH PANEL - Floating above nav bar with rounded corners */}
      {isSearchPanelOpen && (
        <div
          ref={searchPanelRef}
          className="fixed left-0 right-0 bottom-24 mx-5 bg-white/6 backdrop-blur-xl rounded-full border border-white/10 animate-in slide-in-from-bottom-2"
        >
          <form onSubmit={(e) => handleSearch(e)} className="relative">
            <div className={cn(
              "relative flex items-center gap-2.5 px-4 py-3 bg-white/6 backdrop-blur-xl rounded-full border transition-all duration-300 h-11 pr-2",
              "bg-white/12 border-white/25 shadow-xl shadow-black/20"
            )}>
              <Search className="w-4 h-4 text-white/60 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/45 font-medium min-w-0"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleClosePanel();
                  }
                }}
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

            {/* Quick Filter Menu */}
            <SearchBarFilterMenu
              isOpen={isFilterMenuOpen}
              onClose={() => setIsFilterMenuOpen(false)}
            />
          </form>
        </div>
      )}

      {/* NAVIGATION BAR - Floating bottom bar with NEW ORDER */}
      <div className="mx-5 mb-5 bg-white/6 backdrop-blur-xl rounded-full border border-white/10 px-2 py-2">
        <div className="flex items-center justify-around gap-1">
          {/* HOME */}
          <Link
            to="/"
            className={cn(
              'flex items-center justify-center py-2 px-4 rounded-full transition-colors duration-200',
              isActive('/')
                ? 'text-accent'
                : 'text-white/50 hover:text-white/70'
            )}
            title="Home"
          >
            <Home className="w-5 h-5" />
          </Link>

          {/* MOVIES */}
          <Link
            to="/movies"
            className={cn(
              'flex items-center justify-center py-2 px-4 rounded-full transition-colors duration-200',
              isActive('/movies')
                ? 'text-accent'
                : 'text-white/50 hover:text-white/70'
            )}
            title="Movies"
          >
            <Film className="w-5 h-5" />
          </Link>

          {/* SEARCH - Large circular button */}
          <button
            onClick={handleSearchClick}
            className="flex items-center justify-center p-3 rounded-full bg-accent text-white hover:bg-accent/90 transition-all shadow-lg shadow-accent/30 active:scale-95 mx-2"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* TV SHOWS */}
          <Link
            to="/tv"
            className={cn(
              'flex items-center justify-center py-2 px-4 rounded-full transition-colors duration-200',
              isActive('/tv')
                ? 'text-accent'
                : 'text-white/50 hover:text-white/70'
            )}
            title="TV Shows"
          >
            <Tv className="w-5 h-5" />
          </Link>

          {/* PROFILE */}
          <Link
            to="/profile#profile"
            className={cn(
              'flex items-center justify-center py-2 px-4 rounded-full transition-colors duration-200',
              isActive('/profile')
                ? 'text-accent'
                : 'text-white/50 hover:text-white/70'
            )}
            title="Profile"
          >
            <User className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MobileNav;
