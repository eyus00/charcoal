import { useCallback, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, CircleCheck, Clock3, PlayCircle, Trash2, type LucideIcon } from 'lucide-react';
import { actions, useStore, type WatchStatus } from '../lib/store';
import type { MediaType } from '../lib/tmdb';
import { cx, useDismiss, useKeys } from '../lib/util';

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: 'Watching',
  planned: 'To watch',
  completed: 'Watched',
};
export const STATUS_ICON: Record<WatchStatus, LucideIcon> = {
  watching: PlayCircle,
  planned: Clock3,
  completed: CircleCheck,
};
const STATUS_HINT: Record<WatchStatus, string> = {
  watching: 'In progress',
  planned: 'Saved for later',
  completed: 'Finished',
};
const STATUSES = Object.keys(STATUS_LABEL) as WatchStatus[];

/** Small status tag (icon + label) used on watchlist cards. */
export function StatusTag({ status }: { status: WatchStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-2 text-xs backdrop-blur-sm">
      <Icon className="size-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

interface Props {
  item: { id: number; mediaType: MediaType; title: string; posterPath: string | null; releaseDate?: string; ratingScore?: number };
  /** round: outlined circle (hero, details). full: labelled button. */
  variant?: 'round' | 'full';
  className?: string;
  /** Bind the "b" shortcut (one per page). */
  hotkey?: boolean;
}

/** Bookmark button + status menu (Watching / To watch / Watched / Remove). */
export default function BookmarkMenu({ item, variant = 'full', className, hotkey }: Props) {
  const watchlist = useStore((s) => s.watchlist);
  const current = watchlist.find((w) => w.id === item.id && w.mediaType === item.mediaType);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);

  const choose = (status: WatchStatus) => {
    actions.setBookmark({ ...item, status });
    setOpen(false);
  };
  // "b": quick add as "To watch", or remove if already saved.
  useKeys({ b: () => (current ? actions.removeBookmark(item.mediaType, item.id) : choose('planned')) }, !!hotkey);

  const Icon = current ? BookmarkCheck : Bookmark;
  return (
    <div ref={ref} className={cx('relative', className)} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `In watchlist: ${STATUS_LABEL[current.status]}` : 'Add to watchlist'}
        title={current ? STATUS_LABEL[current.status] : 'Add to watchlist'}
        className={cx(
          'flex items-center justify-center gap-2 transition active:scale-95',
          variant === 'round'
            ? cx('size-12 rounded-full', current ? 'bg-white text-black' : 'text-white ring-2 ring-white/70 hover:bg-white/15')
            : cx('h-12 rounded-full px-5 text-[15px] font-medium', current ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'),
        )}
      >
        <Icon className="size-5" />
        {variant === 'full' && (current ? STATUS_LABEL[current.status] : 'Watchlist')}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Watchlist"
          className={cx('absolute bottom-full z-50 mb-3 w-64 rounded-2xl bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/5', variant === 'round' ? 'right-0' : 'left-0')}
        >
          <div className="px-3 pt-2 pb-1.5 text-xs text-muted">{current ? 'In your watchlist' : 'Add to watchlist'}</div>
          {STATUSES.map((s) => {
            const SIcon = STATUS_ICON[s];
            const on = current?.status === s;
            return (
              <button
                key={s}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => choose(s)}
                className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition', on ? 'bg-white/10' : 'hover:bg-white/5')}
              >
                <SIcon className={cx('size-5 shrink-0', on ? 'text-white' : 'text-muted')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-tight">{STATUS_LABEL[s]}</span>
                  <span className="block text-xs leading-tight text-faint">{STATUS_HINT[s]}</span>
                </span>
                {on && <span className="size-2 rounded-full bg-white" aria-hidden />}
              </button>
            );
          })}
          {current && (
            <>
              <div className="mx-3 my-1 h-px bg-line" />
              <button
                role="menuitem"
                onClick={() => {
                  actions.removeBookmark(item.mediaType, item.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-300 transition hover:bg-red-500/10"
              >
                <Trash2 className="size-5 shrink-0" /> Remove from watchlist
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
