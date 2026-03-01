import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { BackendSource } from '../../../api/player-types';

const formatQuality = (quality: string): string => {
  if (!quality) return 'Auto';
  const lower = quality.toLowerCase();

  if (lower === 'unknown' || lower === '') return 'SD';
  if (lower.includes('up to hd') || lower === 'hd' || (lower.includes('hd') && !lower.match(/\d/))) return 'HD';

  const cleanQuality = lower.replace(/[^0-9]/g, '');

  if (cleanQuality.includes('2160') || lower.includes('4k')) return '4K';
  if (cleanQuality.includes('1440') || lower.includes('2k')) return '2K';
  if (cleanQuality.includes('1080')) return '1080p';
  if (cleanQuality.includes('720')) return '720p';
  if (cleanQuality.includes('480')) return '480p';
  if (cleanQuality.includes('360')) return '360p';

  if (cleanQuality) return `${cleanQuality}p`;

  return 'SD';
};

interface QualitySelectorProps {
  sources: BackendSource[];
  currentSource: BackendSource | null;
  onSelect: (src: BackendSource) => void;
}

const QualitySelector: React.FC<QualitySelectorProps> = ({
  sources,
  currentSource,
  onSelect
}) => {
  const groupedSources = useMemo(() => {
    const groups: Record<string, BackendSource[]> = {};
    sources.forEach(src => {
      const q = formatQuality(src.quality);
      if (!groups[q]) groups[q] = [];
      groups[q].push(src);
    });

    const sortOrder = ['HD', '1080p', '4K', '2K', '720p', '480p', '360p', 'SD'];

    return Object.keys(groups)
      .sort((a, b) => {
        const indexA = sortOrder.indexOf(a);
        const indexB = sortOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        const valA = parseInt(a) || 0;
        const valB = parseInt(b) || 0;
        return valB - valA;
      })
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {} as Record<string, BackendSource[]>);
  }, [sources]);

  return (
    <div className="w-72 max-h-80 overflow-y-auto custom-scrollbar bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
      <div className="px-2 py-2 mb-2 text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">Available Qualities</div>
      <div className="space-y-3">
        {Object.entries(groupedSources).map(([quality, items]) => (
          <div key={quality} className="space-y-1.5 p-1 bg-white/[0.03] rounded-xl border border-white/5">
            <div className="px-3 py-1 text-xs font-bold text-white/40 flex items-center justify-between">
              <span>{quality}</span>
              <span className="text-[10px] opacity-50">{items.length} {items.length > 1 ? 'Sources' : 'Source'}</span>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {items.map((src, i) => (
                <button
                  key={`${quality}-${i}`}
                  onClick={() => onSelect(src)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-all group relative overflow-hidden",
                    currentSource?.url === src.url
                      ? "bg-accent text-white font-bold shadow-lg shadow-accent/20"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3 relative z-10">
                    <span className="opacity-40 font-mono">#{i + 1}</span>
                    <span className="uppercase text-[10px] tracking-widest">{src.type}</span>
                  </div>
                  <div className="flex items-center gap-2 relative z-10">
                    {currentSource?.url === src.url && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { QualitySelector, formatQuality };
