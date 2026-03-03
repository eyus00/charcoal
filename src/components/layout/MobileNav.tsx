import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Film, Tv, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';

const MobileNav = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Movies', path: '/movies', icon: Film },
    { label: 'TV Shows', path: '/tv', icon: Tv },
    { label: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div className="fixed bottom-6 left-4 right-4 md:hidden z-50">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl px-2">
        <div className="grid h-16 grid-cols-4">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 transition-all duration-300 relative',
                  active
                    ? 'text-accent scale-110'
                    : 'text-white/50 hover:text-white/70'
                )}
              >
                <Icon className={cn("w-5 h-5", active && "fill-current")} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                {active && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 bg-accent rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MobileNav;
