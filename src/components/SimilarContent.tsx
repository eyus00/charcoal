import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie, TVShow } from '../api/types';
import { getImageUrl } from '../api/config';
import { cn } from '../lib/utils';

interface SimilarContentProps {
  items: (Movie | TVShow)[];
  type: 'movie' | 'tv';
}

const SimilarContent: React.FC<SimilarContentProps> = ({ items, type }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const checkScroll = () => {
      if (!containerRef.current) return;
      
      setShowLeftArrow(containerRef.current.scrollLeft > 0);
      setShowRightArrow(
        containerRef.current.scrollLeft < 
        containerRef.current.scrollWidth - containerRef.current.clientWidth - 10
      );
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      checkScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
    };
  }, [items]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    
    const scrollAmount = containerRef.current.clientWidth * 0.8;
    const newScrollLeft = direction === 'left' 
      ? containerRef.current.scrollLeft - scrollAmount 
      : containerRef.current.scrollLeft + scrollAmount;
    
    containerRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });
  };

  // Drag to scroll
  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (containerRef.current?.offsetLeft || 0));
    setScrollLeft(containerRef.current?.scrollLeft || 0);
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  const onDrag = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    
    const x = e.pageX - (containerRef.current.offsetLeft || 0);
    const walk = (x - startX) * 2;
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className={cn(
          "absolute left-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-4 transition-all duration-200",
          "hover:bg-black/80 hover:scale-110",
          showLeftArrow ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => scroll('right')}
        className={cn(
          "absolute right-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-4 transition-all duration-200",
          "hover:bg-black/80 hover:scale-110",
          showRightArrow ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      
      {/* Scrollable Container */}
      <div 
        ref={containerRef}
        className="overflow-x-auto scrollbar-thin -mx-2 px-2"
        onMouseDown={startDrag}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onMouseMove={onDrag}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex gap-3">
          {items.map((item) => {
            const title = 'title' in item ? item.title : item.name;
            const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
            const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
            
            return (
              <Link 
                key={item.id} 
                to={`/${type}/${item.id}`}
                className="group flex-shrink-0 w-[160px] border border-border-light dark:border-border-dark overflow-hidden hover:border-accent transition-colors"
                onClick={(e) => {
                  if (isDragging) {
                    e.preventDefault();
                  }
                }}
              >
                <div className="aspect-[2/3] relative">
                  <img
                    src={getImageUrl(item.poster_path, 'w342')}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
                    <h4 className="text-white font-medium text-sm truncate">{title}</h4>
                    <div className="flex items-center mt-1">
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-white text-xs ml-1">
                        {item.vote_average.toFixed(1)}
                      </span>
                      {year && (
                        <span className="text-white text-xs ml-2">{year}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SimilarContent;