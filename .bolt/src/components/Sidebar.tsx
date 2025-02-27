import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Grid, Film, Tv, UserCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

const Sidebar = () => {
  const { sidebarOpen } = useStore();
  const location = useLocation();

  return (
    <aside
      className={cn(
        'fixed left-0 top-12 bottom-0 w-48 bg-light-bg dark:bg-dark-bg border-r border-border-light dark:border-border-dark transition-transform duration-200 hidden md:block',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <nav className="py-2">
        <Link 
          to="/" 
          className={cn(
            "flex items-center px-3 py-1.5 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors",
            location.pathname === "/" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
          )}
        >
          <Grid className="w-4 h-4 mr-2.5" />
          Browse
        </Link>
        <Link 
          to="/movies" 
          className={cn(
            "flex items-center px-3 py-1.5 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors",
            location.pathname === "/movies" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
          )}
        >
          <Film className="w-4 h-4 mr-2.5" />
          Movies
        </Link>
        <Link 
          to="/tv" 
          className={cn(
            "flex items-center px-3 py-1.5 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors",
            location.pathname === "/tv" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
          )}
        >
          <Tv className="w-4 h-4 mr-2.5" />
          TV Shows
        </Link>
        <Link 
          to="/profile" 
          className={cn(
            "flex items-center px-3 py-1.5 hover:bg-light-surface dark:hover:bg-dark-surface transition-colors",
            location.pathname === "/profile" ? "text-accent" : "text-light-text-secondary dark:text-dark-text-secondary"
          )}
        >
          <UserCircle className="w-4 h-4 mr-2.5" />
          Profile
        </Link>
      </nav>
    </aside>
  );
};

export default Sidebar;