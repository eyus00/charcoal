import React from 'react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { Trash2, Check } from 'lucide-react';

interface WatchlistMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (status: 'watching' | 'planned' | 'completed') => void;
  onRemove: () => void;
  currentStatus?: 'watching' | 'planned' | 'completed';
  containerRef?: React.RefObject<HTMLDivElement>;
  position?: 'top-right' | 'top-left';
}

const STATUS_CONFIG = {
  watching: { color: 'bg-blue-500', borderColor: 'border-blue-500/40', dotColor: 'bg-blue-400' },
  planned: { color: 'bg-purple-500', borderColor: 'border-purple-500/40', dotColor: 'bg-purple-400' },
  completed: { color: 'bg-green-500', borderColor: 'border-green-500/40', dotColor: 'bg-green-400' },
};

const STATUS_LABELS = {
  watching: 'WATCHING',
  planned: 'TO WATCH',
  completed: 'WATCHED',
};

const WatchlistMenu: React.FC<WatchlistMenuProps> = ({
  isOpen,
  onClose,
  onAdd,
  onRemove,
  currentStatus,
  containerRef,
  position = 'top-right',
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -5 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -5 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "absolute z-50 w-56 max-h-72 overflow-y-auto custom-scrollbar bg-black/90 backdrop-blur-2xl rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.7)] border border-white/10 p-3",
          position === 'top-right' && "right-0 bottom-full mb-3",
          position === 'top-left' && "left-0 bottom-full mb-3"
        )}
        ref={containerRef}
      >
        {!currentStatus ? (
          <div className="space-y-2">
            <button
              onClick={() => onAdd('watching')}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
                "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span>Watching</span>
            </button>
            <button
              onClick={() => onAdd('planned')}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
                "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span>To Watch</span>
            </button>
            <button
              onClick={() => onAdd('completed')}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
                "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span>Watched</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => onAdd('watching')}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
                currentStatus === 'watching'
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span>Watching</span>
              {currentStatus === 'watching' && <Check className="w-4 h-4 stroke-[3]" />}
            </button>
            <button
              onClick={() => onAdd('planned')}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
                currentStatus === 'planned'
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span>To Watch</span>
              {currentStatus === 'planned' && <Check className="w-4 h-4 stroke-[3]" />}
            </button>
            <button
              onClick={() => onAdd('completed')}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
                currentStatus === 'completed'
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span>Watched</span>
              {currentStatus === 'completed' && <Check className="w-4 h-4 stroke-[3]" />}
            </button>

            {/* Remove Option */}
            <div className="pt-2 border-t border-white/10">
              <button
                onClick={onRemove}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-red-400 hover:bg-red-500/20 transition-all flex items-center justify-between uppercase tracking-wide"
              >
                <span>Remove</span>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
};

export default WatchlistMenu;
