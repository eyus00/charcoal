import { cx } from '../lib/util';

/** "LIVE", the same everywhere: cards, the sports player and the live TV player. */
export default function LivePill({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-danger/20 px-2.5 text-micro font-semibold tracking-wide text-danger uppercase backdrop-blur-sm', className)}>
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-danger" /> Live
    </span>
  );
}
