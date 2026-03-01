import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { BackendSubtitle } from '../../../api/player-types';

interface SubtitleSelectorProps {
  subtitles: BackendSubtitle[];
  currentSubtitle: BackendSubtitle | null;
  onSelect: (sub: BackendSubtitle | null) => void;
}

const SubtitleSelector: React.FC<SubtitleSelectorProps> = ({
  subtitles,
  currentSubtitle,
  onSelect
}) => (
  <div className="w-56 max-h-72 overflow-y-auto custom-scrollbar bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-2 shadow-2xl">
    <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-white/40 font-bold">Subtitles</div>
    <div className="space-y-1">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all",
          currentSubtitle === null 
            ? "bg-accent/20 text-accent font-semibold" 
            : "text-white/70 hover:bg-white/5 hover:text-white"
        )}
      >
        <span>Off</span>
        {currentSubtitle === null && <Check className="w-4 h-4" />}
      </button>
      {subtitles.map((sub, i) => (
        <button
          key={i}
          onClick={() => onSelect(sub)}
          className={cn(
            "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all",
            currentSubtitle?.url === sub.url 
              ? "bg-accent/20 text-accent font-semibold" 
              : "text-white/70 hover:bg-white/5 hover:text-white"
          )}
        >
          <span>{sub.label}</span>
          {currentSubtitle?.url === sub.url && <Check className="w-4 h-4" />}
        </button>
      ))}
    </div>
  </div>
);

export default SubtitleSelector;
