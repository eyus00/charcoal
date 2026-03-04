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
    <div className="max-w-6xl mx-auto p-3 sm:p-4 md:p-6">
      {/* Profile Header */}
      <div id="profile" className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-8 sm:mb-12 rounded-lg border border-transparent">
        <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-dark-surface flex items-center justify-center rounded-lg">
          <UserCircle className="w-12 h-12 sm:w-16 sm:h-16 text-dark-text-secondary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2">Your Profile</h1>
          <p className="text-sm sm:text-base text-dark-text-secondary">
            Track your watching history and manage your preferences
          </p>
        </div>
      </div>

      {/* History Section */}
      {watchHistory.length > 0 && (
        <div id="history" className="mb-12 scroll-mt-20 px-2">
          <ContinueWatchingSection items={watchHistory} />
        </div>
      )}

      {/* Watchlist Section */}
      <div id="watchlist" className="scroll-mt-20">
        <Watchlist
          watchlist={watchlist}
          onRemoveFromWatchlist={removeFromWatchlist}
        />
      </div>
    </div>
  );
};

export default Profile;
