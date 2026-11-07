import { useCallback, useRef, useState } from 'react';
import { Bookmark, Check, Trash2 } from 'lucide-react';
import { actions, useStore, type WatchStatus } from '../lib/store';
import type { MediaType } from '../lib/tmdb';
import { cx, useDismiss } from '../lib/util';

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: 'Watching',
  planned: 'To Watch',
  completed: 'Watched',
};
export const STATUS_DOT: Record<WatchStatus, string> = {
  watching: 'bg-accent',
  planned: 'bg-sky-400',
  completed: 'bg-emerald-400',
};
const STATUSES = Object.keys(STATUS_LABEL) as WatchStatus[];

interface Props {
  item: { id: number; mediaType: MediaType; title: string; posterPath: string | null; releaseDate?: string; ratingScore?: number };
  /** round: outlined circle (hero). full: labelled button (details). */
  variant?: 'round' | 'full';
  className?: string;
}

/** Bookmark button + status menu (Watching / To Watch / Watched / Remove), as in the original app. */
export default function BookmarkMenu({ item, variant = 'full', className }: Props) {
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

  return (
    <div ref={ref} className={cx('relative', className)} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `Bookmarked: ${STATUS_LABEL[current.status]}` : 'Add to watchlist'}
        className={cx(
          'flex items-center justify-center gap-2 transition active:scale-95',
          variant === 'round'
            ? cx('size-12 rounded-full border-2', current ? 'border-accent bg-accent text-black' : 'border-white/70 text-white hover:bg-white/15')
            : cx('h-12 rounded-2xl px-5 text-[15px] font-medium', current ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'),
        )}
      >
        <Bookmark className={cx('size-5', current && 'fill-current')} />
        {variant === 'full' && (current ? STATUS_LABEL[current.status] : 'Watchlist')}
      </button>
      {open && (
        <div
          role="menu"
          className={cx('absolute bottom-full z-50 mb-3 w-52 space-y-0.5 rounded-2xl bg-raised p-2 shadow-2xl shadow-black/50', variant === 'round' ? 'right-0' : 'left-0')}
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={current?.status === s}
              onClick={() => choose(s)}
              className={cx(
                'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition',
                current?.status === s ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10 hover:text-white',
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cx('size-2.5 rounded-full', STATUS_DOT[s])} />
                {STATUS_LABEL[s]}
              </span>
              {current?.status === s && <Check className="size-4 " />}
            </button>
          ))}
          {current && (
            <div className="mt-1 border-t border-line pt-1">
              <button
                role="menuitem"
                onClick={() => {
                  actions.removeBookmark(item.mediaType, item.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-red-300 transition hover:bg-red-500/15"
              >
                Remove <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
