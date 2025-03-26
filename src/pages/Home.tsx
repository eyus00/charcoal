import React, { useState } from 'react';
import { useMedia } from '../api/hooks/useMedia';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../api/services/genres';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import HeroSection from '../components/home/HeroSection';
import YouMightLike from '../components/home/YouMightLike';
import HomeUpdates from '../components/home/HomeUpdates';
import HomeContinueWatching from '../components/home/HomeContinueWatching';
import { useStore } from '../store/useStore';

const Home = () => {
  const { data: trendingMovies } = useMedia.useTrending('movie', 'day');
  const { data: trendingTVShows } = useMedia.useTrending('tv', 'day');
  const { data: trendingMonth } = useMedia.useCombinedTrending('week', 10);
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  const { watchHistory } = useStore();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Combine and process trending items for featured slider
  const featuredItems = React.useMemo(() => {
    if (!trendingMovies || !trendingTVShows) return [];
    
    // Combine and sort by vote average
    const combined = [...trendingMovies, ...trendingTVShows]
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 10);
    
    return combined;
  }, [trendingMovies, trendingTVShows]);

  if (!trendingMonth || !featuredItems) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-light-text-secondary dark:text-dark-text-secondary">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main Content */}
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <HeroSection items={featuredItems} />
        </div>

        {/* You Might Like Section */}
        <div className="bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <YouMightLike items={trendingMonth} />
        </div>

        {/* Mobile Panel Toggle Button */}
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className={cn(
            "fixed right-0 top-1/2 -translate-y-1/2 z-30 md:hidden",
            "bg-red-600 text-white p-2 rounded-l-lg shadow-lg transition-transform",
            isPanelOpen && "translate-x-[300px]"
          )}
        >
          {isPanelOpen ? (
            <ChevronRight className="w-6 h-6" />
          ) : (
            <ChevronLeft className="w-6 h-6" />
          )}
        </button>

        {/* Mobile Side Panel */}
        <div
          className={cn(
            "fixed right-0 top-0 bottom-0 w-[300px] bg-light-bg dark:bg-dark-bg z-20 shadow-xl transition-transform md:hidden",
            "border-l border-border-light dark:border-border-dark",
            isPanelOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="h-full overflow-y-auto pt-16 pb-20">
            <div className="p-4 space-y-4">
              {/* Updates Section */}
              <div className="h-[400px]">
                <HomeUpdates items={trendingMonth} />
              </div>

              {/* Continue Watching Section */}
              <div className="h-[400px]">
                <HomeContinueWatching watchHistory={watchHistory} />
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Side Sections */}
        <div className="hidden md:grid md:grid-cols-2 gap-8">
          {/* Updates Section */}
          <div className="h-[400px]">
            <HomeUpdates items={trendingMonth} />
          </div>

          {/* Continue Watching Section */}
          <div className="h-[400px]">
            <HomeContinueWatching watchHistory={watchHistory} />
          </div>
        </div>
      </div>

      {/* Panel Backdrop */}
      {isPanelOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setIsPanelOpen(false)}
        />
      )}
    </div>
  );
};

export default Home;