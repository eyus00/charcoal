import React from 'react';
import { UserCircle, Moon, Sun } from 'lucide-react';
import { useStore } from '../store/useStore';
import ContinueWatching from '../components/profile/ContinueWatching';
import Watchlist from '../components/profile/Watchlist';

const Profile = () => {
  const {
    watchHistory,
    clearWatchHistory,
    removeFromWatchHistory,
    watchlist,
    removeFromWatchlist,
    darkMode,
    toggleDarkMode,
  } = useStore();

  return (
    <div className="max-w-6xl mx-auto">
      {/* Profile Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 bg-light-surface dark:bg-dark-surface flex items-center justify-center rounded-lg">
            <UserCircle className="w-16 h-16 text-light-text-secondary dark:text-dark-text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Your Profile</h1>
            <p className="text-light-text-secondary dark:text-dark-text-secondary">
              Track your watching history and manage your preferences
            </p>
          </div>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded transition-colors"
        >
          {darkMode ? (
            <Sun className="w-6 h-6" />
          ) : (
            <Moon className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Continue Watching Section */}
      <ContinueWatching
        watchHistory={watchHistory}
        onClearHistory={clearWatchHistory}
        onRemoveFromHistory={removeFromWatchHistory}
      />

      {/* Watchlist Section */}
      <Watchlist
        watchlist={watchlist}
        onRemoveFromWatchlist={removeFromWatchlist}
      />
    </div>
  );
};

export default Profile;