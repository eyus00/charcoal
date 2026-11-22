import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Maximize2, Play, Star, X } from 'lucide-react';
import Img from '../components/Img';
import Modal from '../components/Modal';
import { CertBadge } from '../components/MediaCard';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import BookmarkMenu from '../components/BookmarkMenu';
import { certificationOf, titleOf, type Details, type MediaType } from '../lib/tmdb';
import { cx, formatRuntime } from '../lib/util';

/** year · ★ rating · age rating · length: the same order everywhere. */
function Facts({ d, type, className }: { d: Details; type: MediaType; className?: string }) {
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const cert = certificationOf(d);
  const length =
    type === 'movie' ? formatRuntime(d.runtime ?? 0) : d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons === 1 ? '' : 's'}` : '';
  return (
    <div className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-white/80', className)}>
      {[year, d.vote_average > 0 ? 'rating' : '', cert ? 'cert' : '', length].filter(Boolean).map((t, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-white/35">·</span>}
          {t === 'cert' ? (
            <CertBadge>{cert}</CertBadge>
          ) : t === 'rating' ? (
            <span className="flex items-center gap-1 font-medium">
              <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
              {d.vote_average.toFixed(1)}
            </span>
          ) : (
            t
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * A quick look at a title's details.
 * - From the player's title block: a larger pop-up, so watching isn't interrupted.
 * - From a card (right-click / Shift-click, `anchor` given): a compact card beside it, like the
 *   watchlist menu. Phones always get a sheet from the bottom.
 * The expand button opens the full details page.
 */
export default function DetailsPeek({ d, type, detailsUrl, onClose, anchor }: { d: Details; type: MediaType; detailsUrl: string; onClose: () => void; anchor?: DOMRect }) {
  const title = titleOf(d);
  const wide = typeof window !== 'undefined' && window.innerWidth >= 640;
  if (anchor && wide) return <SidePeek d={d} type={type} detailsUrl={detailsUrl} onClose={onClose} anchor={anchor} />;

  return (
    <Modal label={`${title}: details`} onClose={onClose}>
      {/* Phones: a sheet from the bottom; larger screens: a centred card. */}
      <div className="fixed inset-0 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        {/* A small version of the details page: backdrop, then the same glass info card on it. */}
        <div
          className="toast-in relative max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* The backdrop sits on top; the info card only overlaps its lower edge. */}
          <div className="relative">
            <Img path={d.backdrop_path} kind="backdrop" sizes="(min-width: 640px) 768px, 100vw" alt="" className="aspect-video w-full sm:aspect-[16/8]" imgClassName="object-[70%_20%]" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/10 to-bg/20" />
          </div>

          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <Link to={detailsUrl} aria-label="Open the full details page" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
              <Maximize2 className="size-4" />
              <Tip label="Open full page" side="bottom" align="end" />
            </Link>
            <button type="button" onClick={onClose} aria-label="Close" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
              <X className="size-4" />
              <Tip label="Close" keys="Esc" side="bottom" align="end" />
            </button>
          </div>

          <div className="relative -mt-20 px-4 pb-4 sm:-mt-24 sm:px-6 sm:pb-6">
            <div className="max-w-xl rounded-3xl bg-black/35 p-5 ring-1 ring-white/10 backdrop-blur-xl md:p-7">
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
              <Facts d={d} type={type} className="mt-2 text-sm" />
              {d.genres.length > 0 && <p className="mt-1.5 text-sm text-white/70">{d.genres.map((g) => g.name).join(', ')}</p>}
              {d.overview && <p className="mt-4 line-clamp-5 text-body-sm leading-6 text-pretty text-white/80">{d.overview}</p>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const W = 340;

/** The compact peek, pinned beside the card it came from (portal, fixed position). */
function SidePeek({ d, type, detailsUrl, onClose, anchor }: { d: Details; type: MediaType; detailsUrl: string; onClose: () => void; anchor: DOMRect }) {
  const title = titleOf(d);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ left: -9999, top: 0 });

  // Beside the card: to its right if there's room, else to its left; top lined up with the card,
  // kept on screen. Very wide anchors (the Home banner) give the pointer's position instead.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 12;
    const left =
      anchor.right + gap + W <= vw - gap ? anchor.right + gap : anchor.left - gap - W >= gap ? anchor.left - gap - W : Math.max(gap, Math.min(anchor.left, vw - W - gap));
    const top = Math.max(gap, Math.min(anchor.top, vh - h - gap));
    setPos({ left, top });
  }, [anchor]);

  // Close on outside press, Escape, scroll or resize (it's pinned to where the card was).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('[role=menu]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const shut = () => onClose();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', shut, { passive: true, capture: true });
    window.addEventListener('resize', shut);
    requestAnimationFrame(() => ref.current?.focus());
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', shut, { capture: true });
      window.removeEventListener('resize', shut);
    };
  }, [onClose]);

  const roundBtn = cx(btn({ icon: true }), 'group/tip relative size-8! bg-black/55! backdrop-blur-md hover:bg-black/75!');
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${title}: details`}
      tabIndex={-1}
      style={{ ...pos, width: W }}
      className="toast-in fixed z-[60] overflow-hidden rounded-3xl bg-raised shadow-2xl ring-1 shadow-black/60 ring-white/10 outline-none"
    >
      <div className="relative">
        <Img path={d.backdrop_path} kind="backdrop" sizes="340px" alt="" className="aspect-video w-full" imgClassName="object-[70%_20%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/10 to-transparent" />
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          <Link to={detailsUrl} aria-label="Open the full details page" className={roundBtn}>
            <Maximize2 className="size-3.5" />
            <Tip label="Open full page" side="bottom" align="end" />
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className={roundBtn}>
            <X className="size-3.5" />
            <Tip label="Close" keys="Esc" side="bottom" align="end" />
          </button>
        </div>
      </div>
      <div className="relative -mt-6 px-4 pb-4">
        <h2 className="text-xl leading-tight font-semibold tracking-tight text-balance">{title}</h2>
        <Facts d={d} type={type} className="mt-1.5 text-xs" />
        {d.genres.length > 0 && <p className="mt-1 text-xs text-white/60">{d.genres.map((g) => g.name).join(', ')}</p>}
        {d.overview && <p className="mt-2.5 line-clamp-4 text-caption leading-5 text-pretty text-white/75">{d.overview}</p>}
        <div className="mt-3.5 flex gap-2">
          <Link to={`/watch/${type}/${d.id}`} className={cx(btn({ variant: 'primary' }), 'h-9 px-5 text-sm')}>
            <Play className="size-3.5 fill-current" strokeWidth={0} /> Watch
          </Link>
          <BookmarkMenu
            variant="round"
            size="md"
            className="shrink-0 [&>button]:size-9"
            item={{ id: d.id, mediaType: type, title, posterPath: d.poster_path, releaseDate: d.release_date || d.first_air_date, ratingScore: d.vote_average }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
