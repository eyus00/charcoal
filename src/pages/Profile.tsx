import React from 'react';
import { useLocation } from 'react-router-dom';
import { UserCircle, Bookmark } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import ContinueWatchingSection from '../components/home/ContinueWatchingSection';
import Watchlist from '../components/profile/Watchlist';

const Profile = () => {
  const location = useLocation();
  const {
    watchHistory,
    clearWatchHistory,
    removeFromWatchHistory,
    watchlist,
    removeFromWatchlist,
  } = useStore();

  // Handle section highlighting
  React.useEffect(() => {
    if (location.hash) {
      const element = document.querySelector(location.hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        // Add highlight animation
        element.classList.add('highlight-animation');
        // Remove the animation class after it completes
        setTimeout(() => {
          element.classList.remove('highlight-animation');
        }, 1000);
      }
    }
  }, [location.hash]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-8 md:space-y-12">
      {/* Profile Header */}
      <motion.div
        id="profile"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group/profile py-2 md:py-4"
      >
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-10 p-6 md:p-10 bg-white/[0.03] border border-white/5 rounded-[2rem] backdrop-blur-xl relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 blur-[80px] -z-10 rounded-full" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/5 blur-[60px] -z-10 rounded-full" />

          <div className="relative group/avatar">
            <div className="absolute -inset-1 bg-gradient-to-b from-accent/50 to-accent/30 rounded-3xl blur opacity-20 group-hover/avatar:opacity-40 transition-opacity" />
            <div className="relative w-24 h-24 md:w-32 md:h-32 bg-white/5 backdrop-blur-md flex items-center justify-center rounded-3xl border border-white/10 shadow-2xl">
              <UserCircle className="w-16 h-16 md:w-20 md:h-20 text-white/40 group-hover/avatar:text-accent transition-colors" />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-3 md:mb-4">
              <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none">Your Profile</h1>
              <div className="inline-flex self-center md:self-auto items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Active User</span>
              </div>
            </div>
            <p className="text-white/40 text-sm md:text-base font-medium max-w-xl leading-relaxed mb-6 md:mb-8">
              Track your watching history, manage your favorites, and pick up exactly where you left off.
            </p>

            {/* Quick Stats */}
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 md:gap-8 border-t border-white/5 pt-6 md:pt-8">
              <div className="flex flex-col md:flex-row items-center gap-1.5 md:gap-3 group/stat">
                <div className="p-2 bg-accent/10 rounded-lg md:rounded-xl border border-accent/20 text-accent group-hover/stat:bg-accent/20 transition-colors">
                  <Bookmark className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="text-center md:text-left">
                  <div className="text-xl md:text-2xl font-black text-white leading-none mb-1">{watchlist.length}</div>
                  <div className="text-[8px] md:text-[10px] text-white/40 uppercase font-black tracking-widest">Watchlist Items</div>
                </div>
              </div>

              <div className="h-8 w-[1px] bg-white/10 hidden md:block" />

              <div className="flex flex-col md:flex-row items-center gap-1.5 md:gap-3 group/stat">
                <div className="p-2 bg-blue-500/10 rounded-lg md:rounded-xl border border-blue-500/20 text-blue-400 group-hover/stat:bg-blue-500/20 transition-colors">
                  <UserCircle className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="text-center md:text-left">
                  <div className="text-xl md:text-2xl font-black text-white leading-none mb-1">{watchHistory.length}</div>
                  <div className="text-[8px] md:text-[10px] text-white/40 uppercase font-black tracking-widest">Titles Watched</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* History Section */}
      {watchHistory.length > 0 && (
        <div id="history" className="scroll-mt-24">
          <ContinueWatchingSection items={watchHistory} />
        </div>
      )}

      {/* Watchlist Section */}
      <div id="watchlist" className="scroll-mt-24">
        <Watchlist
          watchlist={watchlist}
          onRemoveFromWatchlist={removeFromWatchlist}
        />
      </div>
    </div>
  );
};

export default Profile;
