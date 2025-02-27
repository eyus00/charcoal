import React from 'react';
import { Menu, Search, Moon, Sun } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

const Layout = () => {
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, sidebarOpen, setSidebarOpen } = useStore();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary transition-colors duration-200">
      {/* Header - Hidden on Mobile */}
      <header className="fixed top-0 left-0 right-0 h-12 border-b border-border-light dark:border-border-dark bg-light-bg dark:bg-dark-bg z-50 hidden md:flex items-center px-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-lg -ml-1.5"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <form onSubmit={handleSearch} className="flex-1 mx-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies, TV shows..."
              className="w-full pl-9 pr-3 py-1.5 bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark outline-none focus:border-accent rounded text-sm transition-colors duration-200"
            />
          </div>
        </form>
      </header>

      {/* Sidebar - Hidden on Mobile */}
      <Sidebar />

      {/* Main Content */}
      <main
        className={`min-h-screen transition-all duration-200 md:pt-12 pb-24 md:pb-0 ${
          sidebarOpen ? 'md:ml-48' : 'md:ml-0'
        }`}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};

export default Layout;