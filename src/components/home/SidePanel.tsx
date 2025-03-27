import React from 'react';
import { X, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import HomeUpdates from './HomeUpdates';
import { useStore } from '../../store/useStore';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  updates: any[];
}

const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onClose, updates }) => {
  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 w-[400px] bg-light-bg/95 dark:bg-dark-bg/95 backdrop-blur-md z-40 shadow-2xl transition-all duration-300",
          "border-l border-border-light dark:border-border-dark",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="h-full flex flex-col pt-[3.5rem]">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <div className="bg-light-surface dark:bg-dark-surface rounded-xl overflow-hidden">
                <HomeUpdates items={updates} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Panel Backdrop (mobile only) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
};

export default SidePanel;