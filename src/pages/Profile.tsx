import React from 'react';
import { useLocation } from 'react-router-dom';
import { UserCircle } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* Profile Header */}
      <div id="profile" className="flex items-center justify-between mb-8 md:mb-12 rounded-2xl border border-white/5 bg-white/[0.02] p-4 md:p-8 backdrop-blur-sm">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="w-16 h-16 md:w-28 md:h-28 bg-accent/10 flex items-center justify-center rounded-xl md:rounded-3xl border border-accent/20">
            <UserCircle className="w-10 h-10 md:w-16 md:h-16 text-accent" />
          </div>
          <div>
            <h1 className="text-xl md:text-4xl font-black text-white tracking-tight mb-1 md:mb-2">Your Profile</h1>
            <p className="text-white/40 text-[10px] md:text-sm font-medium max-w-[200px] md:max-w-md leading-relaxed">
              Track your watching history and manage your preferences
            </p>
          </div>
        </div>
      </div>

      {/* History Section */}
      {watchHistory.length > 0 && (
        <div id="history" className="mb-10 md:mb-16 scroll-mt-24">
          <ContinueWatchingSection items={watchHistory} />
        </div>
      )}

      {/* Watchlist Section */}
      <div id="watchlist" className="scroll-mt-24 mb-10 md:mb-16">
        <Watchlist
          watchlist={watchlist}
          onRemoveFromWatchlist={removeFromWatchlist}
        />
      </div>
    </div>
  );
};

export default Profile;
