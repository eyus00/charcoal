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
  watching: 'bg-red-500',
  planned: 'bg-orange-500',
  completed: 'bg-green-500',
};
const STATUSES = Object.keys(STATUS_LABEL) as WatchStatus[];

interface Props {
  item: { id: number; mediaType: MediaType; title: string; posterPath: string | null; releaseDate?: string; ratingScore?: number };
  /** icon: square bookmark button (hero). full: labelled button (details). */
  variant?: 'icon' | 'full';
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
          'flex items-center justify-center gap-2 border transition active:scale-95',
          variant === 'icon' ? 'size-11 rounded-xl hover:scale-105 md:size-14 md:rounded-2xl' : 'h-11 rounded-xl px-4 text-sm font-bold',
          current ? 'border-red-500/40 bg-red-500/20 text-red-400' : 'border-white/10 bg-white/5 text-white hover:bg-white/10',
        )}
      >
        <Bookmark className={cx('size-5', variant === 'icon' && 'md:size-6', current && 'fill-current')} />
        {variant === 'full' && (current ? STATUS_LABEL[current.status] : 'Watchlist')}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-3 w-56 space-y-1 rounded-2xl border border-white/10 bg-black/90 p-3 shadow-[0_0_40px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={current?.status === s}
              onClick={() => choose(s)}
              className={cx(
                'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold tracking-wide uppercase transition',
                current?.status === s ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white/70 hover:bg-white/5 hover:text-white',
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cx('size-2.5 rounded-full', STATUS_DOT[s])} />
                {STATUS_LABEL[s]}
              </span>
              {current?.status === s && <Check className="size-4 stroke-[3]" />}
            </button>
          ))}
          {current && (
            <div className="mt-1 border-t border-white/10 pt-2">
              <button
                role="menuitem"
                onClick={() => {
                  actions.removeBookmark(item.mediaType, item.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-bold tracking-wide text-red-400 uppercase transition hover:bg-red-500/20"
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
