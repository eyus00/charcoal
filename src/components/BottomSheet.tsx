import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && sheetRef.current) {
      sheetRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Bottom Sheet */}
      <div 
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl max-h-[80vh] overflow-hidden animate-slide-up"
        tabIndex={-1}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-12 h-1 bg-gray-600 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
          {children}
        </div>
      </div>
    </div>
  );
};