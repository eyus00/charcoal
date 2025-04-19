import React from 'react';
import { Menu, Search, UserCircle, Moon, Sun } from 'lucide-react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { cn } from '../lib/utils';

const Layout = () => {
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, sidebarOpen, setSidebarOpen, darkMode, toggleDarkMode } = useStore();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-light-bg dark:bg-dark-bg z-50 border-b border-border-light dark:border-border-dark">
        <div className="h-full flex items-center justify-between px-4 gap-4">
          {/* Left Section: Menu Toggle and Logo */}
          <div className="flex items-center gap-4">
            {/* Menu Toggle - Hidden on Mobile */}
            <div className="p-1 bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-md hidden md:flex">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-md transition-colors"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>

            {/* Logo */}
            <Link to="/" className="text-xl font-bold">
              Charcoal
            </Link>
          </div>

          {/* Search Bar - Centered, Hidden on Mobile */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-auto hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies, TV shows..."
                className="w-full pl-10 pr-4 py-1.5 bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-full outline-none focus:border-accent text-sm transition-colors duration-200"
              />
            </div>
          </form>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1.5 p-1 bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-md">
            <button
              onClick={toggleDarkMode}
              className="p-1.5 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-md transition-colors"
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <div className="w-px h-4 bg-border-light dark:bg-border-dark" />
            <Link
              to="/profile"
              className="p-1.5 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded-md transition-colors"
            >
              <UserCircle className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main
        className={cn(
          "min-h-screen pt-20 pb-24 md:pb-8 transition-all duration-200 relative",
          sidebarOpen ? "md:ml-56" : "md:ml-0"
        )}
        style={{ zIndex: 0 }}
      >
        <div className="px-4 md:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};

export default Layout;
