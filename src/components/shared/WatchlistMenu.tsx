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
  watching: { color: 'bg-red-500', borderColor: 'border-red-500/40', dotColor: 'bg-red-400' },
  planned: { color: 'bg-orange-500', borderColor: 'border-orange-500/40', dotColor: 'bg-orange-400' },
  completed: { color: 'bg-red-600', borderColor: 'border-red-600/40', dotColor: 'bg-red-500' },
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
              onClick={(e) => {
                e.stopPropagation();
                onAdd('watching');
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-between transition-all font-bold uppercase tracking-wide",
                "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG.watching.dotColor)} />
                <span>Watching</span>
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd('planned');
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-between transition-all font-bold uppercase tracking-wide",
                "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG.planned.dotColor)} />
                <span>To Watch</span>
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd('completed');
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-between transition-all font-bold uppercase tracking-wide",
                "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG.completed.dotColor)} />
                <span>Watched</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd('watching');
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-between transition-all font-bold uppercase tracking-wide",
                currentStatus === 'watching'
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG.watching.dotColor)} />
                <span>Watching</span>
              </div>
              {currentStatus === 'watching' && <Check className="w-4 h-4 stroke-[3]" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd('planned');
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-between transition-all font-bold uppercase tracking-wide",
                currentStatus === 'planned'
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG.planned.dotColor)} />
                <span>To Watch</span>
              </div>
              {currentStatus === 'planned' && <Check className="w-4 h-4 stroke-[3]" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd('completed');
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-between transition-all font-bold uppercase tracking-wide",
                currentStatus === 'completed'
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG.completed.dotColor)} />
                <span>Watched</span>
              </div>
              {currentStatus === 'completed' && <Check className="w-4 h-4 stroke-[3]" />}
            </button>

            {/* Remove Option */}
            <div className="pt-2 border-t border-white/10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
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
