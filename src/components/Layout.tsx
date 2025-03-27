import React from 'react';
import { Menu, Search, Mail, UserCircle } from 'lucide-react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { cn } from '../lib/utils';
import SidePanel from './home/SidePanel';

const Layout = () => {
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, sidebarOpen, setSidebarOpen, sidePanelOpen, setSidePanelOpen } = useStore();

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
        <div className="h-full flex items-center px-4 gap-4">
          {/* Menu Toggle - Hidden on Mobile */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-lg hidden md:block"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link to="/" className="text-xl font-bold">
            Charcoal
          </Link>

          {/* Search Bar - Hidden on Mobile */}
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
          <div className="flex items-center gap-2 ml-auto">
            {/* Notifications */}
            <button
              onClick={() => setSidePanelOpen(!sidePanelOpen)}
              className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-lg relative"
            >
              <Mail className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* Profile */}
            <Link
              to="/profile"
              className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-lg flex items-center gap-2"
            >
              <UserCircle className="w-5 h-5" />
              <span className="hidden md:block">Profile</span>
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

      {/* Side Panel */}
      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        updates={[]}
      />

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};

export default Layout;