import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check } from 'lucide-react';
import { actions, getState, useStore, type WatchStatus } from '../lib/store';
import { toast } from './Toast';
import type { MediaType } from '../lib/tmdb';
import { cx, useKeys } from '../lib/util';

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: 'Watching',
  planned: 'To watch',
  completed: 'Watched',
};
/** Each status gets its own shade of blue (text / tinted background / ring). */
export const STATUS_TONE: Record<WatchStatus, { text: string; bg: string; ring: string }> = {
  watching: { text: 'text-watching', bg: 'bg-watching', ring: 'ring-watching/40' },
  planned: { text: 'text-planned', bg: 'bg-planned', ring: 'ring-planned/40' },
  completed: { text: 'text-completed', bg: 'bg-completed', ring: 'ring-completed/40' },
};
const STATUSES = Object.keys(STATUS_LABEL) as WatchStatus[];
const MENU_W = 192;
const MENU_H = 156;

/** The status's colour as a small dot (used instead of icons everywhere). */
export function StatusDot({ status, className }: { status: WatchStatus; className?: string }) {
  return <span aria-hidden className={cx('size-2 shrink-0 rounded-full', STATUS_TONE[status].bg, className)} />;
}

/** Small status tag (dot + label) used on watchlist cards. */
export function StatusTag({ status }: { status: WatchStatus }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-2 text-xs backdrop-blur-sm">
      <StatusDot status={status} />
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
  // The menu renders in a portal with fixed coordinates, so no parent can clip it or stack above
  // it (the hero clips its overflow and its preview cards sit on top). It opens on the side with
  // room, lined up with the button's left or right edge.
  const [pos, setPos] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const place = () => {
    const r = ref.current!.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topLimit = vw >= 768 ? 92 : 76; // the sticky search bar
    const bottomLimit = vw >= 1024 ? 0 : 80; // the phone bottom bar
    const above = r.top - topLimit;
    const below = vh - bottomLimit - r.bottom;
    const up = above >= MENU_H + 12 || above > below;
    const left = Math.max(12, Math.min(r.left, vw - MENU_W - 12));
    setPos(up ? { left, bottom: vh - r.top + 10 } : { left, top: r.bottom + 10 });
  };
  const toggle = () => {
    if (!open) place();
    setOpen((o) => !o);
  };
  // Close on outside press, Escape, scroll or resize (the menu is pinned to where the button was).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const shut = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', shut, { passive: true, capture: true });
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', shut, { capture: true });
      window.removeEventListener('resize', shut);
    };
  }, [open]);

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
      {open &&
        createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Watchlist status"
          style={{ position: 'fixed', ...pos }}
          className="z-[120] w-48 space-y-0.5 rounded-2xl bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          {STATUSES.map((s) => {
            const on = current?.status === s;
            return (
              <button
                key={s}
                role="menuitemcheckbox"
                aria-checked={on}
                title={on ? 'Tap again to remove from watchlist' : undefined}
                onClick={() => choose(s)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                  on ? 'bg-white font-medium text-black' : 'text-white/85 hover:bg-white/[0.06] hover:text-white',
                )}
              >
                <StatusDot status={s} />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {on && <Check className="size-4" />}
              </button>
            );
          })}
        </div>,
          document.body,
        )}
    </div>
  );
}
