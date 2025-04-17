import React from 'react';
import { useMedia } from '../api/hooks/useMedia';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../api/services/genres';
import { useStore } from '../store/useStore';
import HeroSection from '../components/home/HeroSection';
import YouMightLike from '../components/home/YouMightLike';
import ContinueWatchingSection from '../components/home/ContinueWatchingSection';

const Home = () => {
  const { data: trendingMovies } = useMedia.useTrending('movie', 'day');
  const { data: trendingTVShows } = useMedia.useTrending('tv', 'day');
  const { data: trendingMonth } = useMedia.useCombinedTrending('week', 10);
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });
  const { watchHistory } = useStore();

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
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
        <HeroSection items={featuredItems} />
      </div>

      {/* Continue Watching Section */}
      {watchHistory.length > 0 && (
        <ContinueWatchingSection items={watchHistory.slice(0, 10)} />
      )}

      {/* You Might Like Section */}
      <div className="bg-white/20 dark:bg-white/5 backdrop-blur-md border-2 border-gray-400/50 dark:border-white/20 rounded-2xl overflow-hidden">
        <YouMightLike items={trendingMonth} />
      </div>
    </div>
  );
}

export default Home;