import React from 'react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';

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
          "absolute z-50 w-60 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden",
          position === 'top-right' && "right-0 bottom-full mb-3",
          position === 'top-left' && "left-0 bottom-full mb-3"
        )}
        ref={containerRef}
      >
        {!currentStatus ? (
          <div className="divide-y divide-white/10 py-2">
            <button
              onClick={() => onAdd('watching')}
              className="w-full px-5 py-4 text-left hover:bg-white/10 flex items-center gap-3 group transition-all"
            >
              <div className="w-3 h-3 rounded-full bg-blue-400 group-hover:scale-125 transition-transform" />
              <span className="text-sm font-bold text-white/90 group-hover:text-white uppercase tracking-wide">WATCHING</span>
            </button>
            <button
              onClick={() => onAdd('planned')}
              className="w-full px-5 py-4 text-left hover:bg-white/10 flex items-center gap-3 group transition-all"
            >
              <div className="w-3 h-3 rounded-full bg-purple-400 group-hover:scale-125 transition-transform" />
              <span className="text-sm font-bold text-white/90 group-hover:text-white uppercase tracking-wide">TO WATCH</span>
            </button>
            <button
              onClick={() => onAdd('completed')}
              className="w-full px-5 py-4 text-left hover:bg-white/10 flex items-center gap-3 group transition-all"
            >
              <div className="w-3 h-3 rounded-full bg-green-400 group-hover:scale-125 transition-transform" />
              <span className="text-sm font-bold text-white/90 group-hover:text-white uppercase tracking-wide">WATCHED</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {/* Current Status Display */}
            <div className="px-5 py-4 bg-white/5">
              <div className="flex items-center gap-3">
                <div className={cn("w-3 h-3 rounded-full", STATUS_CONFIG[currentStatus].dotColor)} />
                <span className="text-xs font-black uppercase tracking-widest text-white/90">
                  {STATUS_LABELS[currentStatus]}
                </span>
              </div>
            </div>

            {/* Change Status Options */}
            <div className="py-2">
              <button
                onClick={() => onAdd('watching')}
                className={cn(
                  "w-full px-5 py-4 text-left text-sm font-bold transition-all flex items-center gap-3 group uppercase tracking-wide",
                  currentStatus === 'watching'
                    ? "bg-blue-500/25 text-blue-300"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full transition-transform group-hover:scale-125",
                  currentStatus === 'watching' ? "bg-blue-400" : "bg-blue-400/40"
                )} />
                WATCHING
              </button>
              <button
                onClick={() => onAdd('planned')}
                className={cn(
                  "w-full px-5 py-4 text-left text-sm font-bold transition-all flex items-center gap-3 group uppercase tracking-wide",
                  currentStatus === 'planned'
                    ? "bg-purple-500/25 text-purple-300"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full transition-transform group-hover:scale-125",
                  currentStatus === 'planned' ? "bg-purple-400" : "bg-purple-400/40"
                )} />
                TO WATCH
              </button>
              <button
                onClick={() => onAdd('completed')}
                className={cn(
                  "w-full px-5 py-4 text-left text-sm font-bold transition-all flex items-center gap-3 group uppercase tracking-wide",
                  currentStatus === 'completed'
                    ? "bg-green-500/25 text-green-300"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full transition-transform group-hover:scale-125",
                  currentStatus === 'completed' ? "bg-green-400" : "bg-green-400/40"
                )} />
                WATCHED
              </button>
            </div>

            {/* Remove Option */}
            <div className="py-2">
              <button
                onClick={onRemove}
                className="w-full px-5 py-4 text-left text-sm font-bold text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-3 group uppercase tracking-wide"
              >
                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                REMOVE
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
};

export default WatchlistMenu;
