import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

const ScrollHandle = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollStartPosition, setScrollStartPosition] = useState(0);

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

  return (
    <motion.button
      className={cn(
        "fixed right-4 bottom-24 md:bottom-8 z-30 transition-transform",
        isDragging ? "scale-110" : "scale-100",
        isDragging && "bg-red-600/90 backdrop-blur-sm rounded-full"
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Scroll handle"
      initial={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.1 }}
    >
      <motion.div
        className={cn(
          "w-12 h-12 flex items-center justify-center",
          isDragging ? "text-white" : "text-red-600"
        )}
      >
        <motion.div
          className={cn(
            "w-4 h-4 rounded-full",
            isDragging ? "border-2 border-current" : "border-[3px] border-current"
          )}
        >
          <motion.div
            className={cn(
              "w-1.5 h-1.5 rounded-full bg-current mx-auto",
              isDragging ? "mt-1" : "mt-[3px]"
            )}
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
      </motion.div>
    </motion.button>
  );
};

export default ScrollHandle;