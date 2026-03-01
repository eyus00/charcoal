import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Film, Tv } from 'lucide-react';
import { cn } from '../../lib/utils';

const MobileNav = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { label: 'Explore', path: '/', icon: Sparkles },
    { label: 'Movies', path: '/movies', icon: Film },
    { label: 'TV Shows', path: '/tv', icon: Tv },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 bg-black/90 backdrop-blur-lg border-t border-white/10">
      <div className="grid grid-cols-3 h-16">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-colors duration-200',
                isActive(item.path)
                  ? 'text-accent'
                  : 'text-white/50 hover:text-white/70'
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium uppercase tracking-wide">{item.label}</span>
              {isActive(item.path) && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-accent rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default MobileNav;
