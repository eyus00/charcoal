import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

/** Horizontal scroller: native scrolling + snap, glassy arrows on hover. No scroll listeners. */
export function Scroller({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className="group/row relative">
      <div
        ref={ref}
        role="list"
        aria-label={label}
        className="no-scrollbar flex snap-x gap-4 overflow-x-auto overscroll-x-contain px-1 py-2 md:gap-6 md:py-3"
      >
        {children}
      </div>
      <ArrowButton side="left" onClick={() => scroll(-1)} />
      <ArrowButton side="right" onClick={() => scroll(1)} />
    </div>
  );
}

function ArrowButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
      className={`absolute top-1/2 z-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 shadow-2xl backdrop-blur-md transition group-hover/row:opacity-100 hover:scale-110 hover:border-accent/60 hover:bg-accent/40 focus-visible:opacity-100 md:size-14 [@media(hover:hover)]:flex ${side === 'left' ? 'left-3' : 'right-3'}`}
    >
      <Icon className="size-6 md:size-7" />
    </button>
  );
}

/** Original section header: icon tile, bold title, small caps subtitle. */
export function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: LucideIcon; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 px-1 md:mb-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-accent/20 bg-accent/10 p-2 md:rounded-xl md:p-2.5">
          <Icon className="size-5 text-accent md:size-6" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-white md:text-3xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[10px] font-bold tracking-widest text-white/40 uppercase md:text-xs">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export const ROW_ITEM = 'w-[150px] shrink-0 snap-start md:w-[220px]';
export const ROW_SIZES = '(min-width: 768px) 210px, 140px';
