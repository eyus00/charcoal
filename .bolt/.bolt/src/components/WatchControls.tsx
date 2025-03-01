import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface WatchControlsProps {
  mediaType: string;
  id: number;
  season?: number;
  episode?: number;
  totalEpisodes?: number;
  totalSeasons?: number;
}

const WatchControls: React.FC<WatchControlsProps> = ({
  mediaType,
  id,
  season,
  episode,
  totalEpisodes,
  totalSeasons,
}) => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = React.useState(true);
  let hideTimeout = React.useRef<number>();

  React.useEffect(() => {
    const handleMouseMove = () => {
      setIsVisible(true);
      if (hideTimeout.current) {
        window.clearTimeout(hideTimeout.current);
      }
      hideTimeout.current = window.setTimeout(() => {
        setIsVisible(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout.current) {
        window.clearTimeout(hideTimeout.current);
      }
    };
  }, []);

  const handlePrevious = () => {
    if (mediaType === 'tv' && episode && season) {
      if (episode > 1) {
        navigate(`/watch/tv/${id}?season=${season}&episode=${episode - 1}`);
      } else if (season > 1) {
        navigate(`/watch/tv/${id}?season=${season - 1}&episode=1`);
      }
    }
  };

  const handleNext = () => {
    if (mediaType === 'tv' && episode && season && totalEpisodes) {
      if (episode < totalEpisodes) {
        navigate(`/watch/tv/${id}?season=${season}&episode=${episode + 1}`);
      } else if (season < (totalSeasons || 1)) {
        navigate(`/watch/tv/${id}?season=${season + 1}&episode=1`);
      }
    }
  };

  if (mediaType !== 'tv') return null;

  return (
    <div className={cn(
      "fixed inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-300",
      isVisible ? "opacity-100" : "opacity-0"
    )}>
      <div className="container mx-auto px-4 flex items-center justify-between">
        <button
          onClick={handlePrevious}
          disabled={season === 1 && episode === 1}
          className={cn(
            "p-3 rounded-full bg-black/75 text-white pointer-events-auto transition-all",
            "hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={handleNext}
          disabled={season === totalSeasons && episode === totalEpisodes}
          className={cn(
            "p-3 rounded-full bg-black/75 text-white pointer-events-auto transition-all",
            "hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default WatchControls;