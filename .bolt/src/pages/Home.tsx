import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { useMedia } from '../api/hooks/useMedia';
import { genreService } from '../api/services/genres';
import FeaturedSlider from '../components/home/FeaturedSlider';
import TrendingMonth from '../components/home/TrendingMonth';
import TrendingWeek from '../components/home/TrendingWeek';

const Home = () => {
  const [currentSlide, setCurrentSlide] = React.useState(0);

  // Use separate queries for movies and TV shows
  const { data: trendingMovies } = useMedia.useTrending('movie', 'day');
  const { data: trendingTVShows } = useMedia.useTrending('tv', 'day');
  const { data: trendingWeek } = useMedia.useCombinedTrending('week', 7);
  const { data: trendingMonth } = useMedia.useCombinedTrending('week', 10);
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: genreService.getAllGenres,
  });

  // Combine and process trending items
  const trendingToday = React.useMemo(() => {
    if (!trendingMovies || !trendingTVShows) return [];
    
    // Combine and sort by vote average
    const combined = [...trendingMovies, ...trendingTVShows]
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 10);
    
    return combined;
  }, [trendingMovies, trendingTVShows]);

  if (!trendingToday || !trendingWeek || !trendingMonth) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <h3 className="text-xl font-semibold mb-4">Trending Today</h3>
          <FeaturedSlider
            items={trendingToday}
            currentSlide={currentSlide}
            onPrevSlide={() => setCurrentSlide((prev) => (prev - 1 + trendingToday.length) % trendingToday.length)}
            onNextSlide={() => setCurrentSlide((prev) => (prev + 1) % trendingToday.length)}
            onSlideSelect={setCurrentSlide}
            genres={genres}
          />
        </div>

        <div className="col-span-12 lg:col-span-4">
          <TrendingMonth items={trendingMonth} genres={genres} />
        </div>
      </div>

      <TrendingWeek
        items={trendingWeek}
        genres={genres}
      />
    </div>
  );
};

export default Home;