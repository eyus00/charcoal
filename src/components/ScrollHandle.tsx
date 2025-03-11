import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

const ScrollHandle = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollStartPosition, setScrollStartPosition] = useState(0);
  const [showArrow, setShowArrow] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);

  const checkVisibility = useCallback(() => {
    const scrolled = window.scrollY;
    const viewportHeight = window.innerHeight;
    const contentHeight = document.documentElement.scrollHeight;
    const scrollPercentage = (scrolled / (contentHeight - viewportHeight)) * 100;

    // Only show on mobile
    if (window.innerWidth >= 768) {
      setIsVisible(false);
      return;
    }

    // Show if there's content below the viewport
    setIsVisible(scrolled > 0 || contentHeight > viewportHeight);
    
    // Show arrow when scrolled down more than 30%
    setShowArrow(scrollPercentage > 30);
    
    // Near bottom when scrolled more than 90%
    setIsNearBottom(scrollPercentage > 90);
  }, []);

  useEffect(() => {
    checkVisibility();
    window.addEventListener('scroll', checkVisibility);
    window.addEventListener('resize', checkVisibility);
    
    // Initial check after content loads
    setTimeout(checkVisibility, 500);
    
    return () => {
      window.removeEventListener('scroll', checkVisibility);
      window.removeEventListener('resize', checkVisibility);
    };
  }, [checkVisibility]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setScrollStartPosition(window.scrollY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const touch = e.touches[0];
    const deltaY = startY - touch.clientY;
    window.scrollTo({
      top: scrollStartPosition + deltaY * 2,
      behavior: 'auto'
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const scrollToTop = () => {
    if (!isDragging) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          className={cn(
            "fixed right-4 bottom-24 md:hidden z-30 transition-all duration-500",
            "bg-red-600/90 backdrop-blur-sm rounded-full shadow-lg",
            isDragging && "scale-110 bg-red-700/90"
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={scrollToTop}
          aria-label="Scroll handle"
        >
          <motion.div
            className="w-12 h-12 flex items-center justify-center text-white"
            animate={{
              rotate: showArrow ? 0 : 180
            }}
            transition={{ duration: 0.5 }}
          >
            {isNearBottom || (showArrow && !isDragging) ? (
              <ChevronUp className="w-6 h-6" />
            ) : (
              <motion.div
                className="w-4 h-4 rounded-full relative"
                initial={false}
                animate={{
                  scale: isDragging ? 0.8 : 1,
                  borderWidth: isDragging ? 2 : 3
                }}
                style={{ borderColor: 'currentColor' }}
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-current mx-auto"
                  style={{ marginTop: isDragging ? 4 : 3 }}
                  animate={{
                    y: [0, 6, 0],
                    opacity: [1, 0.5, 1]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              </motion.div>
            )}
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default ScrollHandle;