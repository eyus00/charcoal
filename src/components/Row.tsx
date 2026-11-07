import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Horizontal scroller: native scrolling + snap; arrows only on pointer devices. No scroll listeners. */
export function Scroller({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <div className="group/row relative">
      <div
        ref={ref}
        role="list"
        aria-label={label}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 md:scroll-px-8 md:px-8"
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
      className={`absolute top-0 bottom-10 z-10 hidden w-10 items-center justify-center bg-bg/70 text-white opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:flex ${side === 'left' ? 'left-0' : 'right-0'}`}
    >
      <Icon className="size-6" />
    </button>
  );
}

export function RowHeader({ title, to, action }: { title: string; to?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 px-4 md:px-8">
      <h2 className="text-lg font-semibold tracking-tight md:text-xl">{title}</h2>
      {action ?? (to && (
        <Link to={to} className="text-sm text-muted hover:text-white">
          See all
        </Link>
      ))}
    </div>
  );
}

export const ROW_ITEM = 'w-[34vw] shrink-0 snap-start sm:w-40 lg:w-[180px] 2xl:w-[200px]';
