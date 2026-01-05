import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

const ScrollToTop = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollStartPosition, setScrollStartPosition] = useState(0);

  const checkVisibility = useCallback(() => {
    const scrolled = window.scrollY;
    const viewportHeight = window.innerHeight;
    const contentHeight = document.documentElement.scrollHeight;

    // Show button if we've scrolled down AND there's more content above
    setIsVisible(scrolled > viewportHeight * 0.3 && scrolled < contentHeight - viewportHeight);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', checkVisibility);
    // Initial check
    checkVisibility();
    return () => window.removeEventListener('scroll', checkVisibility);
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
    window.scrollTo(0, scrollStartPosition + deltaY * 2);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <button
      className={cn(
        "fixed right-4 bottom-24 md:bottom-8 z-30 bg-red-600/90 backdrop-blur-sm text-white p-3 rounded-full shadow-lg transition-all duration-300 transform",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0 pointer-events-none",
        isDragging && "scale-110"
      )}
      onClick={scrollToTop}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Scroll to top"
    >
      <ChevronUp className="w-6 h-6" />
    </button>
  );
};

export default ScrollToTop;