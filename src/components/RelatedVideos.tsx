import React, { useRef, useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  thumbnail?: string;
}

interface RelatedVideosProps {
  videos: Video[];
}

const RelatedVideos: React.FC<RelatedVideosProps> = ({ videos }) => {
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
  }, [videos]);

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

  if (!videos || videos.length === 0) {
    return null;
  }

  // Sort videos to prioritize trailers
  const sortedVideos = [...videos].sort((a, b) => {
    // Prioritize trailers
    if (a.type === 'Trailer' && b.type !== 'Trailer') return -1;
    if (a.type !== 'Trailer' && b.type === 'Trailer') return 1;
    return 0;
  });

  return (
    <div className="relative">
      {/* Navigation Arrows */}
      <button
        onClick={() => scroll('left')}
        className={cn(
          "absolute left-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-4 transition-all duration-200",
          "hover:bg-black/80 hover:scale-110 hover:shadow-lg",
          showLeftArrow ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => scroll('right')}
        className={cn(
          "absolute right-0 top-1/2 z-10 p-2 bg-black/60 rounded-full text-white transform -translate-y-4 transition-all duration-200",
          "hover:bg-black/80 hover:scale-110 hover:shadow-lg",
          showRightArrow ? "opacity-80 hover:opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      
      {/* Scrollable Container */}
      <div 
        ref={containerRef}
        className="overflow-x-auto scrollbar-thin pb-4 -mx-2 px-2"
        onMouseDown={startDrag}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onMouseMove={onDrag}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex gap-4">
          {sortedVideos.map((video) => (
            <a
              key={video.id}
              href={`https://www.youtube.com/watch?v=${video.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex-shrink-0 w-[240px] relative overflow-hidden border border-border-light dark:border-border-dark hover:border-accent transition-colors"
              onClick={(e) => {
                if (isDragging) {
                  e.preventDefault();
                }
              }}
            >
              <div className="aspect-video relative">
                <img
                  src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                  alt={video.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center scale-0 group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 text-white fill-white ml-1" />
                  </div>
                </div>
                
                {/* Video type tag */}
                <div className={cn(
                  "absolute bottom-2 left-2 px-2 py-0.5 text-xs rounded",
                  video.type === 'Trailer' ? "bg-red-600 text-white" : 
                  "bg-black/60 text-white"
                )}>
                  {video.type}
                </div>
              </div>
              <div className="p-3">
                <h4 className="font-medium text-sm line-clamp-1">{video.name}</h4>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RelatedVideos;