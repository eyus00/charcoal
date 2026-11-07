import { useCallback, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Check, Trash2 } from 'lucide-react';
import { actions, useStore, type WatchStatus } from '../lib/store';
import type { MediaType } from '../lib/tmdb';
import { cx, useDismiss } from '../lib/util';

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: 'Watching',
  planned: 'To watch',
  completed: 'Watched',
};
export const STATUS_DOT: Record<WatchStatus, string> = {
  watching: 'bg-accent',
  planned: 'bg-sky-400',
  completed: 'bg-emerald-400',
};

interface Props {
  item: { id: number; mediaType: MediaType; title: string; posterPath: string | null; releaseDate?: string; ratingScore?: number };
  className?: string;
}

export default function BookmarkMenu({ item, className }: Props) {
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
    <div ref={ref} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => (current ? setOpen((o) => !o) : choose('planned'))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(
          'flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors',
          current ? 'bg-white/15 text-white hover:bg-white/20' : 'bg-white/10 text-white hover:bg-white/15',
        )}
      >
        {current ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
        {current ? STATUS_LABEL[current.status] : 'Bookmark'}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-30 mt-2 w-48 rounded-lg border border-line bg-raised p-1 shadow-xl">
          {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={current?.status === s}
              onClick={() => choose(s)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <span className={cx('size-2 rounded-full', STATUS_DOT[s])} />
              {STATUS_LABEL[s]}
              {current?.status === s && <Check className="ml-auto size-4" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              actions.removeBookmark(item.mediaType, item.id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-white/10"
          >
            <Trash2 className="size-4" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}
