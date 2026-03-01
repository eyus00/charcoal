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
  <div className="w-72 max-h-80 overflow-y-auto custom-scrollbar bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
    <div className="px-2 py-2 mb-2 text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">Subtitles</div>
    <div className="space-y-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
          currentSubtitle === null
            ? "bg-accent text-white shadow-lg shadow-accent/20"
            : "text-white/70 hover:bg-white/5 hover:text-white"
        )}
      >
        <span>Off</span>
        {currentSubtitle === null && <Check className="w-3.5 h-3.5 stroke-[3]" />}
      </button>
      {subtitles.map((sub, i) => (
        <button
          key={i}
          onClick={() => onSelect(sub)}
          className={cn(
            "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-all font-bold uppercase tracking-wide",
            currentSubtitle?.url === sub.url
              ? "bg-accent text-white shadow-lg shadow-accent/20"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          )}
        >
          <span>{sub.label}</span>
          {currentSubtitle?.url === sub.url && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>
      ))}
    </div>
  </div>
);

export default SubtitleSelector;
