import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../lib/util';

/** Horizontal scroller with native scrolling + snap. Arrows live in the header (see RowArrows). */
export function Scroller({ children, label, scrollRef }: { children: ReactNode; label: string; scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={scrollRef} role="list" aria-label={label} className="no-scrollbar scroll-row -mx-1 flex snap-x gap-4 overflow-x-auto overscroll-x-contain px-1">
      {children}
    </div>
  );
}

export function useRowScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return { ref, scroll };
}

export function RowArrows({ onScroll }: { onScroll: (dir: 1 | -1) => void }) {
  return (
    <div className="hidden shrink-0 gap-2 md:flex">
      <SquareButton label="Scroll left" onClick={() => onScroll(-1)}>
        <ChevronLeft className="size-5" />
      </SquareButton>
      <SquareButton label="Scroll right" onClick={() => onScroll(1)}>
        <ChevronRight className="size-5" />
      </SquareButton>
    </div>
  );
}

export function SquareButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cx('grid size-10 place-items-center rounded-full bg-surface text-white/80 transition hover:bg-raised hover:text-white', className)}>
      {children}
    </button>
  );
}

/** Plain section title with optional link/actions on the right. */
export function SectionHeader({ title, to, action }: { title: string; to?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight md:text-xl">{title}</h2>
      {action ??
        (to && (
          <Link to={to} className="text-sm text-muted hover:text-white">
            See all
          </Link>
        ))}
    </div>
  );
}

/** Rounded pill: selected = white on dark text. */
export function Pill({ on, onClick, children, className }: { on?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition',
        on ? 'bg-white font-medium text-black' : 'bg-surface text-white/85 hover:bg-raised hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export const ROW_ITEM = 'w-[156px] shrink-0 snap-start sm:w-[190px] lg:w-[216px]';
export const ROW_SIZES = '(min-width: 1024px) 216px, (min-width: 640px) 190px, 156px';
