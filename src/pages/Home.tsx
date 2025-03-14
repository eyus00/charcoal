import React from 'react';
import { useMedia } from '../api/hooks/useMedia';
import { useQuery } from '@tanstack/react-query';
import { genreService } from '../api/services/genres';
import FeaturedSlider from '../components/home/FeaturedSlider';
import TrendingMonth from '../components/home/TrendingMonth';
import TrendingWeek from '../components/home/TrendingWeek';

const Home = () => {
  const { data: trendingMovies } = useMedia.useTrending('movie', 'day');
  const { data: trendingTVShows } = useMedia.useTrending('tv', 'day');
  const { data: trendingMonth } = useMedia.useCombinedTrending('week', 10);
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

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
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <h3 className="text-xl font-semibold mb-4">Trending Today</h3>
          <FeaturedSlider
            items={featuredItems}
            genres={genres}
          />
        </div>

        <div className="lg:col-span-4">
          <h3 className="text-xl font-semibold mb-4">Trending This Week</h3>
          <div className="bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark h-[calc(100%-2rem)]">
            <TrendingWeek items={trendingMonth} genres={genres} />
          </div>
        </div>
      </div>

      <TrendingMonth items={trendingMonth} genres={genres} />
    </div>
  );
};

export default Home;