import React from 'react';
import { useMedia } from '../api/hooks/useMedia';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../api/services/genres';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
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
        <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-12 lg:space-y-16">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <HeroSection items={featuredItems} />
      </motion.div>

      {/* Continue Watching Section */}
      {watchHistory.length > 0 && (
        <ContinueWatchingSection items={watchHistory.slice(0, 15)} />
      )}

      {/* You Might Like Section */}
      <YouMightLike items={trendingMonth} />
    </div>
  );
}

export default Home;
