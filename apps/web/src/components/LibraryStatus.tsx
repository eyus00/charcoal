import type { WatchStatus } from '../lib/store';
import { LIBRARY_LABEL } from '../lib/library';
import { cx } from '../lib/util';

/** Each library status gets its own shade of blue (as a dot). */
export const STATUS_BG: Record<WatchStatus, string> = {
  watching: 'bg-watching',
  planned: 'bg-planned',
  completed: 'bg-completed',
};

/** The status's colour as a small dot (used instead of icons everywhere). */
export function StatusDot({ status, className }: { status: WatchStatus; className?: string }) {
  return <span aria-hidden className={cx('size-2 shrink-0 rounded-full', STATUS_BG[status], className)} />;
}

/** Small status tag (dot + label) on library cards: Unwatched / Watching / Watched. */
export function StatusTag({ status }: { status: WatchStatus }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/75 py-1 pr-2.5 pl-2 text-xs">
      <StatusDot status={status} />
      {LIBRARY_LABEL[status]}
    </span>
  );
}
