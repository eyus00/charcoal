import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Grid, Film, Tv, Clock, Bookmark, Settings, User } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';

const Sidebar = () => {
  const { sidebarOpen } = useStore();
  const location = useLocation();
  const hash = location.hash;

  const menuItems = [
    {
      title: 'Browse',
      items: [
        { icon: Grid, label: 'Discover', path: '/' },
        { icon: Film, label: 'Movies', path: '/movies' },
        { icon: Tv, label: 'TV Shows', path: '/tv' },
      ],
    },
    {
      title: 'Profile',
      items: [
        { icon: User, label: 'User', path: '/profile', hash: '#profile' },
        { icon: Clock, label: 'History', path: '/profile', hash: '#history' },
        { icon: Bookmark, label: 'Watchlist', path: '/profile', hash: '#watchlist' },
      ],
    },
    {
      title: 'General',
      items: [
        { icon: Settings, label: 'Settings', path: '/settings' },
      ],
    },
  ];

  const isActive = (path: string, itemHash?: string) => {
    if (itemHash) {
      return location.pathname === path && (hash === itemHash || (itemHash === '#profile' && !hash));
    }
    return location.pathname === path && !hash;
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-14 bottom-0 w-56 bg-light-bg dark:bg-dark-bg border-r border-border-light dark:border-border-dark transition-transform duration-200 hidden md:block overflow-y-auto',
        'z-40',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="py-4">
        {menuItems.map((section, index) => (
          <div
            key={index}
            className={cn(
              index !== 0 && 'mt-4 pt-4 border-t border-border-light/30 dark:border-border-dark/30'
            )}
          >
            <h3 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mb-2 px-4">
              {section.title}
            </h3>
            <nav>
              {section.items.map((item, itemIndex) => (
                <Link
                  key={itemIndex}
                  to={item.path + (item.hash || '')}
                  className={cn(
                    'flex items-center gap-3 py-2 pl-4 pr-2 transition-colors relative group w-full',
                    isActive(item.path, item.hash)
                      ? 'text-accent bg-red-50 dark:bg-red-500/10 border-l-2 border-red-600 dark:border-red-500'
                      : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary hover:bg-light-surface dark:hover:bg-dark-surface border-l-2 border-transparent'
                  )}
                >
                  <item.icon
                    className={cn(
                      'w-5 h-5 transition-colors',
                      isActive(item.path, item.hash)
                        ? 'text-accent'
                        : 'text-light-text-secondary dark:text-dark-text-secondary group-hover:text-light-text-primary dark:group-hover:text-dark-text-primary'
                    )}
                  />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;