import { useCallback, useRef, useState } from 'react';
import { Bookmark, Check, CircleCheck, Clock3, Eye, type LucideIcon } from 'lucide-react';
import { actions, getState, useStore, type WatchStatus } from '../lib/store';
import { toast } from './Toast';
import type { MediaType } from '../lib/tmdb';
import { cx, useDismiss, useKeys } from '../lib/util';

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: 'Watching',
  planned: 'To watch',
  completed: 'Watched',
};
export const STATUS_ICON: Record<WatchStatus, LucideIcon> = {
  watching: Eye,
  planned: Clock3,
  completed: CircleCheck,
};
/** Each status gets its own shade of blue (text / tinted background / ring). */
export const STATUS_TONE: Record<WatchStatus, { text: string; bg: string; ring: string }> = {
  watching: { text: 'text-watching', bg: 'bg-watching/15', ring: 'ring-watching/40' },
  planned: { text: 'text-planned', bg: 'bg-planned/15', ring: 'ring-planned/40' },
  completed: { text: 'text-completed', bg: 'bg-completed/15', ring: 'ring-completed/40' },
};
const STATUSES = Object.keys(STATUS_LABEL) as WatchStatus[];
const MENU_W = 192;
const MENU_H = 156;

/** Small status tag (icon + label) used on watchlist cards. */
export function StatusTag({ status }: { status: WatchStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-2 text-xs backdrop-blur-sm">
      <Icon className={cx('size-3.5', STATUS_TONE[status].text)} />
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
  // Where the menu opens: above or below, and which edge it lines up with, so it stays in view.
  const [place, setPlace] = useState<{ up: boolean; alignRight: boolean }>({ up: true, alignRight: false });
  const ref = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const topLimit = window.innerWidth >= 768 ? 92 : 76; // the sticky search bar
      const bottomLimit = window.innerWidth >= 1024 ? 0 : 72; // the phone bottom bar
      const above = r.top - topLimit;
      const below = window.innerHeight - bottomLimit - r.bottom;
      setPlace({
        up: above >= MENU_H + 12 || above > below,
        alignRight: r.left + MENU_W > window.innerWidth - 12,
      });
    }
    setOpen((o) => !o);
  };
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);

  const remove = () => {
    const before = getState().watchlist;
    actions.removeBookmark(item.mediaType, item.id);
    toast(`Removed “${item.title}” from your watchlist`, { label: 'Undo', run: () => actions.restore({ watchlist: before }) });
  };
  const save = (status: WatchStatus) => {
    actions.setBookmark({ ...item, status });
    toast(`${current ? 'Moved to' : 'Added to'} ${STATUS_LABEL[status]}`);
  };
  // Picking the current status again removes the title from the watchlist.
  const choose = (status: WatchStatus) => {
    if (current?.status === status) remove();
    else save(status);
    setOpen(false);
  };
  // "b": quick add as "To watch", or remove if already saved.
  useKeys({ b: () => (current ? remove() : save('planned')) }, !!hotkey);

  return (
    <div ref={ref} className={cx('relative', className)} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `In watchlist: ${STATUS_LABEL[current.status]}` : 'Add to watchlist'}
        title={(current ? STATUS_LABEL[current.status] : 'Add to watchlist') + (hotkey ? ' (B)' : '')}
        className={cx(
          'flex items-center justify-center gap-2 transition active:scale-95',
          variant === 'round'
            ? cx('size-12 rounded-full', current ? 'bg-white text-black' : 'text-white ring-2 ring-white/70 hover:bg-white/15')
            : cx('h-12 rounded-full px-5 text-[15px] font-medium', current ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'),
        )}
      >
        <Bookmark className={current ? 'size-4 fill-current' : 'size-[18px]'} />
        {variant === 'full' && (current ? STATUS_LABEL[current.status] : 'Watchlist')}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Watchlist status"
          className={cx(
            'absolute z-50 w-48 space-y-0.5 rounded-2xl bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/5',
            place.up ? 'bottom-full mb-3' : 'top-full mt-3',
            place.alignRight ? 'right-0' : 'left-0',
          )}
        >
          {STATUSES.map((s) => {
            const SIcon = STATUS_ICON[s];
            const tone = STATUS_TONE[s];
            const on = current?.status === s;
            return (
              <button
                key={s}
                role="menuitemcheckbox"
                aria-checked={on}
                title={on ? 'Tap again to remove from watchlist' : undefined}
                onClick={() => choose(s)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition',
                  on ? cx(tone.bg, 'text-white ring-1 ring-inset', tone.ring) : 'text-white/85 hover:bg-white/[0.06] hover:text-white',
                )}
              >
                <SIcon className={cx('size-4 shrink-0', tone.text)} />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {on && <Check className={cx('size-4', tone.text)} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
