import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx, scrollBehavior } from '../lib/util';
import { btn } from './Button';
import { Tip } from './Tip';

/**
 * Rows run edge to edge: they extend past the page padding to the screen edge, while the first
 * card (and every snap point) still lines up with the page content.
 */
/** Runs a row to the page edges. Also a size container: its cards size themselves to it (row-item). */
export const ROW_BLEED = 'row-fit -mx-4 px-4 scroll-px-4 [--row-pad:16px] md:-mx-8 md:px-8 md:scroll-px-8 md:[--row-pad:32px] lg:-mx-10 lg:px-10 lg:scroll-px-10 lg:[--row-pad:40px]';
const INSET = 'row-fit -mx-1 px-1 [--row-pad:4px]';

/** Horizontal scroller with native scrolling + snap. Arrows live in the header (see RowArrows). */
/** A row in a page's right-hand column: runs to the page's right edge only (full width on phones). */
const END_BLEED = 'row-fit -mx-4 px-4 scroll-px-4 [--row-pad:16px] md:-mx-8 md:px-8 md:scroll-px-8 md:[--row-pad:32px] lg:-ml-1 lg:pl-1 lg:scroll-pl-1 lg:-mr-10 lg:pr-10 lg:[--row-pad:4px]';

export function Scroller({
  children,
  label,
  scrollRef,
  bleed = true,
  gap = 'gap-4',
}: {
  children: ReactNode;
  label: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  bleed?: boolean | 'end';
  gap?: string;
}) {
  return (
    <div
      ref={scrollRef}
      role="group"
      aria-label={label}
      // Inside a padded card (e.g. the Profile panels) there is no page edge to run to.
      className={cx('no-scrollbar scroll-row flex snap-x overflow-x-auto overscroll-x-contain', gap, bleed === 'end' ? END_BLEED : bleed ? ROW_BLEED : INSET)}
    >
      {children}
    </div>
  );
}

export function useRowScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: scrollBehavior() });
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
    <button type="button" onClick={onClick} aria-label={label} className={cx(btn({ icon: true }), 'group/tip relative', className)}>
      {children}
      <Tip label={label} align="end" />
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

/**
 * A card in a row: sized to the row (see .row-item in index.css) so a whole number of cards fit
 * and the next one always shows a clear part at the edge, whatever the window or sidebar.
 */
export const ROW_ITEM = 'row-item shrink-0 snap-start';
export const ROW_SIZES = '(min-width: 1024px) 216px, (min-width: 640px) 190px, 156px';
