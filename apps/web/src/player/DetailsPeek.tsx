import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { Maximize2, Star, X } from 'lucide-react';
import Img from '../components/Img';
import Kbd from '../components/Kbd';
import { CertBadge } from '../components/MediaCard';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import BookmarkMenu from '../components/BookmarkMenu';
import { PlayTitleButton, ShareButton } from '../components/TitleActions';
import { peek } from '../lib/peek';
import { certificationOf, titleOf, type Details, type MediaType } from '../lib/tmdb';
import { cx, formatRuntime, isTypingTarget } from '../lib/util';

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

const bookmarkItem = (d: Details, type: MediaType) => ({
  id: d.id,
  mediaType: type,
  title: titleOf(d),
  posterPath: d.poster_path,
  releaseDate: d.release_date || d.first_air_date,
  ratingScore: d.vote_average,
});

/** D opens the full details page (not while typing). */
function useDetailsKey(detailsUrl: string) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'd' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      e.preventDefault();
      navigate(detailsUrl);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsUrl, navigate]);
}

/** The expand button: opens the full details page, with its key. */
function ExpandButton({ to, small }: { to: string; small?: boolean }) {
  return (
    <Link
      to={to}
      aria-label="Open the full details page (D)"
      className={cx(
        'group/tip relative flex items-center gap-1.5 rounded-full bg-black/55 pr-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/75',
        small ? 'h-8 pl-2.5' : 'h-10 pl-3',
      )}
    >
      <Maximize2 className={small ? 'size-3.5' : 'size-4'} />
      <Kbd className="bg-white/15 text-white/80 ring-0">D</Kbd>
      <Tip label="Open full page" side="bottom" align="end" />
    </Link>
  );
}

/**
 * A quick look at a title's details (see lib/peek).
 * - `mini` (hover, larger screens): a small card beside the card it came from.
 * - otherwise: a larger pop-up; on phones a bottom sheet you can swipe down to close or up to
 *   open the full page.
 * `play`: show the Play button (not in the player, where it's already playing). For TV it opens
 * the episode list via `onEpisodes`.
 */
export default function DetailsPeek({
  d,
  type,
  detailsUrl,
  onClose,
  mini,
  anchor,
  play = true,
  onEpisodes,
}: {
  d: Details;
  type: MediaType;
  detailsUrl: string;
  onClose: () => void;
  mini?: boolean;
  anchor?: DOMRect;
  play?: boolean;
  onEpisodes?: () => void;
}) {
  useDetailsKey(detailsUrl);
  const wide = typeof window !== 'undefined' && window.innerWidth >= 640;
  if (mini && anchor && wide) return <SidePeek d={d} type={type} detailsUrl={detailsUrl} onClose={onClose} anchor={anchor} onEpisodes={onEpisodes} />;
  return <MediumPeek d={d} type={type} detailsUrl={detailsUrl} onClose={onClose} play={play} onEpisodes={onEpisodes} />;
}

function MediumPeek({ d, type, detailsUrl, onClose, play, onEpisodes }: { d: Details; type: MediaType; detailsUrl: string; onClose: () => void; play: boolean; onEpisodes?: () => void }) {
  const title = titleOf(d);
  const navigate = useNavigate();
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // A plain overlay (not a native modal dialog) so the watchlist menu, which opens in its own
  // layer, still shows above it. Esc closes, focus moves in and comes back, the page doesn't scroll.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=menu]') && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Phones: drag the sheet down to close it, or up to open the full details page.
  useEffect(() => {
    const el = sheet.current;
    if (!el || matchMedia('(min-width: 640px)').matches) return;
    let start: { y: number; h: number; up: boolean } | null = null;
    let dy = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || el.scrollTop > 0) return;
      const y = e.touches[0].clientY;
      // Upward drags count from the picture / handle, so the text below can still scroll.
      start = { y, h: el.offsetHeight, up: y - el.getBoundingClientRect().top < 220 || el.scrollHeight <= el.clientHeight + 1 };
      dy = 0;
      el.style.transition = 'none';
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      dy = e.touches[0].clientY - start.y;
      if (dy > 0) {
        e.preventDefault();
        el.style.height = '';
        el.style.transform = `translateY(${dy}px)`;
      } else if (start.up) {
        e.preventDefault();
        el.style.transform = '';
        el.style.maxHeight = 'none';
        el.style.height = `${Math.min(window.innerHeight, start.h - dy)}px`;
      } else start = null;
    };
    const onEnd = () => {
      if (!start) return;
      start = null;
      el.style.transition = 'transform 220ms ease, height 220ms ease, border-radius 220ms ease';
      if (dy > 110) {
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => close.current(), 200);
      } else if (dy < -70) {
        el.style.maxHeight = 'none';
        el.style.height = `${window.innerHeight}px`;
        el.style.borderRadius = '0';
        window.setTimeout(() => navigate(detailsUrl), 200);
      } else {
        el.style.transform = '';
        el.style.height = '';
        el.style.maxHeight = '';
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [detailsUrl, navigate]);

  return createPortal(
    // Phones: a sheet from the bottom; larger screens: a centred card.
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`${title}: details`}
        tabIndex={-1}
        className="toast-in relative max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (phones). */}
        <div aria-hidden className="absolute top-2 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/50 sm:hidden" />

        {/* The backdrop sits on top; the info card only overlaps its lower edge. */}
        <div className="relative">
          <Img path={d.backdrop_path} kind="backdrop" sizes="(min-width: 640px) 768px, 100vw" alt="" className="aspect-video w-full sm:aspect-[16/8]" imgClassName="object-[70%_20%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/10 to-bg/20" />
        </div>

        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <ExpandButton to={detailsUrl} />
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
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {play && <PlayTitleButton id={d.id} type={type} onEpisodes={() => onEpisodes?.()} />}
              <BookmarkMenu variant="round" item={bookmarkItem(d, type)} />
              <ShareButton title={title} path={detailsUrl} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const W = 340;

/** The mini peek: pinned beside the card it came from; stays while the pointer is on it. */
function SidePeek({ d, type, detailsUrl, onClose, anchor, onEpisodes }: { d: Details; type: MediaType; detailsUrl: string; onClose: () => void; anchor: DOMRect; onEpisodes?: () => void }) {
  const title = titleOf(d);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ left: -9999, top: 0 });

  // Beside the card: to its right if there's room, else to its left; kept on screen.
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

  // Close on a press outside it (not its watchlist menu), Escape, scroll or resize.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('[role=menu]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=menu]') && onClose();
    const shut = () => !document.querySelector('[role=menu]') && onClose();
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
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${title}: details`}
      style={{ ...pos, width: W }}
      onPointerEnter={() => peek.hold()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !document.querySelector('[role=menu]') && peek.release()}
      className="toast-in fixed z-[60] overflow-hidden rounded-3xl bg-raised shadow-2xl ring-1 shadow-black/60 ring-white/10"
    >
      <div className="relative">
        <Img path={d.backdrop_path} kind="backdrop" sizes="340px" alt="" className="aspect-video w-full" imgClassName="object-[70%_20%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/10 to-transparent" />
        <div className="absolute top-2.5 right-2.5">
          <ExpandButton to={detailsUrl} small />
        </div>
      </div>
      <div className="relative -mt-6 px-4 pb-4">
        <h2 className="text-xl leading-tight font-semibold tracking-tight text-balance">{title}</h2>
        <Facts d={d} type={type} className="mt-1.5 text-xs" />
        {d.genres.length > 0 && <p className="mt-1 text-xs text-white/60">{d.genres.map((g) => g.name).join(', ')}</p>}
        {d.overview && <p className="mt-2.5 line-clamp-4 text-caption leading-5 text-pretty text-white/75">{d.overview}</p>}
        <div className="mt-3.5 flex items-center gap-2">
          <PlayTitleButton id={d.id} type={type} size="md" onEpisodes={() => onEpisodes?.()} />
          <BookmarkMenu variant="round" size="md" className="shrink-0 [&>button]:size-9" item={bookmarkItem(d, type)} />
          <ShareButton title={title} path={detailsUrl} size="md" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
