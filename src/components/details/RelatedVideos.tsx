import React, { useRef, useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight, ExternalLink, Video as VideoIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

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
      container.addEventListener('scroll', checkScroll, { passive: true });
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

  // Sort videos to prioritize trailers and limit to 7
  const sortedVideos = [...videos]
    .sort((a, b) => {
      if (a.type === 'Trailer' && b.type !== 'Trailer') return -1;
      if (a.type !== 'Trailer' && b.type === 'Trailer') return 1;
      return 0;
    })
    .slice(0, 7);

  return (
    <div className="relative group/container py-2 md:py-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 md:mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-2.5 bg-accent/10 rounded-lg md:rounded-xl border border-accent/20">
            <VideoIcon className="w-5 h-5 md:w-6 md:h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-black text-white tracking-tight">Related Videos</h2>
            <p className="text-white/40 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-0.5">{videos.length} Videos Available</p>
          </div>
        </div>
      </div>

      {/* Navigation Arrows - hidden on mobile, shown on desktop */}
      <AnimatePresence>
        {showLeftArrow && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scroll('left')}
            className="hidden md:flex absolute left-2 md:left-4 top-1/2 z-20 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRightArrow && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scroll('right')}
            className="hidden md:flex absolute right-2 md:right-4 top-1/2 z-20 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-full items-center justify-center transition-all hover:bg-accent/40 hover:border-accent/60 hover:scale-110 shadow-2xl"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Scrollable Container - responsive sizing and touch-friendly */}
      <div
        ref={containerRef}
        className="overflow-x-auto scrollbar-none px-2 py-2 md:py-4"
        onMouseDown={startDrag}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onMouseMove={onDrag}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'auto' }}
      >
        <div className="flex gap-4 md:gap-6">
          {sortedVideos.map((video, index) => (
            <motion.a
              key={video.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              href={`https://www.youtube.com/watch?v=${video.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group flex-shrink-0 w-[220px] md:w-[300px] flex flex-col gap-2 md:gap-3 p-2 md:p-3 rounded-2xl md:rounded-2xl transition-all text-left border relative overflow-hidden",
                "bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10 hover:scale-[1.02] duration-300"
              )}
              onClick={(e) => {
                if (isDragging) {
                  e.preventDefault();
                }
              }}
            >
              {/* Thumbnail Area */}
              <div className="w-full aspect-video bg-white/5 rounded-xl overflow-hidden relative flex-shrink-0 shadow-lg">
                <img
                  src={`https://img.youtube.com/vi/${video.key}/maxresdefault.jpg`}
                  alt={video.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`;
                  }}
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors duration-300" />

                {/* Play Icon - responsive sizing */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-12 md:w-16 h-12 md:h-16 bg-accent rounded-full flex items-center justify-center shadow-2xl border-2 border-white/20">
                    <Play className="w-7 md:w-10 h-7 md:h-10 text-white fill-current ml-1" />
                  </div>
                </div>

                {/* Type Tag */}
                <div className="absolute bottom-2 left-2">
                  <div
                    className={cn(
                      "px-2 py-1 bg-black/60 backdrop-blur-md text-white rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wider border border-white/10 shadow-sm",
                      video.type === 'Trailer' && "bg-accent/80 border-accent/40 text-white"
                    )}
                  >
                    {video.type}
                  </div>
                </div>
              </div>

              {/* Info Area */}
              <div className="px-1 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <h4 className="font-bold text-xs md:text-sm leading-tight text-white line-clamp-1 flex-1">
                    {video.name}
                  </h4>
                  <ExternalLink className="w-3.5 md:w-4 h-3.5 md:h-4 text-white/60 flex-shrink-0" />
                </div>
                <div className="flex items-center justify-between text-[8px] md:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                  <span className="line-clamp-1">{video.site}</span>
                  {video.official && (
                    <span className="text-green-400 flex-shrink-0">Official</span>
                  )}
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>

      <style>{`
        .scrollbar-none {
          scrollbar-width: none;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default RelatedVideos;
