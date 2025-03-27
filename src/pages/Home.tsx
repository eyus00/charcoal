import React from 'react';
import { useMedia } from '../api/hooks/useMedia';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../api/services/genres';
import { cn } from '../lib/utils';
import HeroSection from '../components/home/HeroSection';
import YouMightLike from '../components/home/YouMightLike';
import SidePanel from '../components/home/SidePanel';
import { useStore } from '../store/useStore';

const Home = () => {
  const { data: trendingMovies } = useMedia.useTrending('movie', 'day');
  const { data: trendingTVShows } = useMedia.useTrending('tv', 'day');
  const { data: trendingMonth } = useMedia.useCombinedTrending('week', 10);
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });
  const { sidePanelOpen, setSidePanelOpen } = useStore();

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
      <div className={cn(
        "space-y-8 transition-all duration-300",
        sidePanelOpen ? "mr-[400px]" : "mr-0"
      )}>
        {/* Hero Section */}
        <div className="bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <HeroSection items={featuredItems} />
        </div>

        {/* You Might Like Section */}
        <div className="bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
          <YouMightLike items={trendingMonth} />
        </div>
      </div>

      {/* Side Panel */}
      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        updates={trendingMonth}
      />
    </div>
  );
};

export default Home;