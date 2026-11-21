import Kbd from './Kbd';
import { cx } from '../lib/util';

/**
 * Charcoal's tooltip: a small label (and its key) that appears on hover or keyboard focus. Put it
 * inside an element with `group/tip relative`. Touch screens never show it (hover is real-hover only).
 *
 *   <button className="group/tip relative …">…<Tip label="Close player" keys="Esc" /></button>
 */
export function Tip({
  label,
  keys,
  side = 'top',
  align = 'center',
  hidden,
}: {
  label: string;
  keys?: string;
  side?: 'top' | 'bottom';
  /** Which edge it lines up with: start/end keep it on screen for buttons near an edge. */
  align?: 'start' | 'center' | 'end';
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute z-50 flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1 text-xs font-normal whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/5 transition-opacity delay-100 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100',
        side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'start' ? 'left-0' : 'right-0',
      )}
    >
      {label}
      {keys && <Kbd>{keys}</Kbd>}
    </span>
  );
}

/** "Pause (K)" → ["Pause", "K"]. */
export function splitKeys(label: string): [string, string | undefined] {
  const m = label.match(/^(.*?)\s*\(([^)]{1,12})\)$/);
  return m ? [m[1], m[2]] : [label, undefined];
}
