import type { ReactNode } from 'react';
import { cx } from '../lib/util';

/** Keyboard hint chip; desktop only (hidden below lg). */
export default function Kbd({ children, className, light }: { children: ReactNode; className?: string; light?: boolean }) {
  return (
    <kbd
      className={cx(
        'hidden min-w-5 items-center justify-center rounded-md px-1.5 py-px font-sans text-micro leading-4 font-medium lg:inline-flex',
        light ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60 ring-1 ring-white/10',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
