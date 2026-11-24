import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { Maximize2, Star, X } from 'lucide-react';
import Img from '../components/Img';
import Kbd from '../components/Kbd';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import { PlayTitleButton } from '../components/TitleActions';
import LibraryButton from '../components/LibraryButton';
import { useQuery } from '@tanstack/react-query';
import { dateLabel, seLabel } from '../components/AiringTile';
import { peek, type PeekEpisode } from '../lib/peek';
import { q, titleOf, type Details, type MediaType } from '../lib/tmdb';
import { percent, resumeTarget, useStore } from '../lib/store';
import { imageSrcSet, imageUrl } from '../lib/images';
import { cx, formatRuntime, isTypingTarget } from '../lib/util';

/** Genres, then year · ★ rating · length: the same as the details page (no age rating). */
export function Facts({ d, type, className, genresClassName }: { d: Details; type: MediaType; className?: string; genresClassName?: string }) {
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const length = type === 'movie' ? formatRuntime(d.runtime ?? 0) : d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons === 1 ? '' : 's'}` : '';
  return (
    <>
      {d.genres.length > 0 && <p className={cx('text-white/70', genresClassName)}>{d.genres.map((g) => g.name).join(', ')}</p>}
      <div className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-white/80', className)}>
        {[year, d.vote_average > 0 ? 'rating' : '', length].filter(Boolean).map((t, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-white/35">·</span>}
            {t === 'rating' ? (
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
    </>
  );
}

const libraryItem = (d: Details, type: MediaType) => ({
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
        'group/tip relative flex shrink-0 items-center gap-1.5 rounded-full bg-black/55 pl-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/75',
        small ? 'h-8 pr-2.5' : 'h-10 pr-3',
      )}
    >
      <Kbd className="bg-white/15 text-white/80 ring-0">D</Kbd>
      <Maximize2 className={small ? 'size-3.5' : 'size-4'} />
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
  episode,
}: {
  d: Details;
  type: MediaType;
  detailsUrl: string;
  onClose: () => void;
  mini?: boolean;
  anchor?: DOMRect;
  play?: boolean;
  onEpisodes?: (selected?: PeekEpisode) => void;
  /** From an episode card: the mini peek shows that episode's card on its corner. */
  episode?: PeekEpisode;
}) {
  useDetailsKey(detailsUrl);
  const wide = typeof window !== 'undefined' && window.innerWidth >= 640;
  if (mini && anchor && wide) return <SidePeek d={d} type={type} detailsUrl={detailsUrl} onClose={onClose} anchor={anchor} onEpisodes={onEpisodes} episode={type === 'tv' ? episode : undefined} />;
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

  // Phones: drag down to close; drag up and the sheet becomes the details page itself. Its banner
  // grows (the info card stays at the bottom), the landscape image fades into the page's portrait
  // poster, and at full height it's laid out exactly like the page's hero, which then replaces it.
  // The page's code is preloaded and its data cached, so the swap is invisible.
  const hero = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sheet.current;
    const h0 = hero.current;
    if (!el || !h0 || matchMedia('(min-width: 640px)').matches) return;
    void import('../pages/Details');
    const full = () => window.innerHeight;
    const collapsed = el.offsetHeight;
    const heroBase = h0.offsetHeight;
    el.style.height = `${collapsed}px`;
    el.style.overflow = 'hidden';
    // At full height the card sits where the page's does: its bottom 8svh + 24px above the screen's.
    const pad = (r: number) => 40 + r * (window.innerHeight * 0.08 + 24 - 40);
    const set = (h: number) => {
      const r = Math.max(0, Math.min(1, (h - collapsed) / Math.max(1, full() - collapsed)));
      el.style.height = `${h}px`;
      if (info.current) info.current.style.paddingBottom = `${pad(r)}px`;
      h0.style.height = `${heroBase + (h - collapsed) - (pad(r) - pad(0))}px`;
      el.style.setProperty('--reveal', String(r));
    };
    let start: { y: number; h: number } | null = null;
    let dy = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      start = { y: e.touches[0].clientY, h: el.offsetHeight };
      dy = 0;
      el.style.transition = h0.style.transition = 'none';
      if (info.current) info.current.style.transition = 'none';
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      dy = e.touches[0].clientY - start.y;
      e.preventDefault();
      if (dy > 0) {
        el.style.transform = `translateY(${dy}px)`;
      } else {
        el.style.transform = '';
        el.style.maxHeight = 'none';
        set(Math.min(full(), start.h - dy));
        el.style.borderRadius = el.offsetHeight >= full() - 2 ? '0' : '';
      }
    };
    const onEnd = () => {
      if (!start) return;
      start = null;
      const ease = '260ms cubic-bezier(0.22, 0.8, 0.2, 1)';
      el.style.transition = `transform 220ms ease, height ${ease}, border-radius ${ease}`;
      h0.style.transition = `height ${ease}`;
      if (info.current) info.current.style.transition = `padding ${ease}`;
      if (dy > 110) {
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => close.current(), 200);
      } else if (dy < -60) {
        el.style.maxHeight = 'none';
        el.style.borderRadius = '0';
        set(full());
        // In a transition: the sheet stays on screen until the page can render (no blank
        // loading frame in between, even for a split second).
        window.setTimeout(() => {
          window.scrollTo(0, 0);
          startTransition(() => navigate(detailsUrl));
        }, 270);
      } else {
        el.style.transform = '';
        el.style.maxHeight = '';
        el.style.borderRadius = '';
        set(collapsed);
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

  // What the phone details page shows behind its hero: the poster, same file and sizes (so it's
  // already loaded when the page takes over).
  const poster = imageUrl(d.poster_path ?? d.backdrop_path, d.poster_path ? 'poster' : 'backdrop', 780);
  const posterSet = d.poster_path ? imageSrcSet(d.poster_path, 'poster') : undefined;
  const fadeOut = { opacity: 'calc(1 - var(--reveal, 0))' } as React.CSSProperties;
  const fadeIn = { opacity: 'var(--reveal, 0)' } as React.CSSProperties;

  return createPortal(
    // Phones: a sheet from the bottom; larger screens: a centred card.
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`${title}: details`}
        tabIndex={-1}
        className="toast-in relative flex max-h-[90dvh] w-full flex-col overflow-y-auto overscroll-contain rounded-t-3xl bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:block sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (phones). */}
        <div aria-hidden style={fadeOut} className="absolute top-2 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/50 sm:hidden" />

        {/* The banner. On phones it grows as the sheet is dragged up (see above). */}
        <div ref={hero} className="relative aspect-video shrink-0 overflow-hidden sm:aspect-[16/8]">
          <Img path={d.backdrop_path} kind="backdrop" sizes="(min-width: 640px) 768px, 100vw" alt="" className="absolute! inset-0 size-full" imgClassName="object-[70%_20%]" />
          {poster && <img aria-hidden src={poster} srcSet={posterSet} sizes="100vw" alt="" decoding="async" style={fadeIn} className="absolute inset-0 size-full object-cover object-top sm:hidden" />}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/10 to-bg/20" style={fadeOut} />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/50 sm:hidden" style={fadeIn} />
        </div>

        <div className="absolute top-3 right-3 z-10 flex gap-2" style={fadeOut}>
          <div className="hidden sm:block">
            <ExpandButton to={detailsUrl} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
            <X className="size-4" />
            <Tip label="Close" keys="Esc" side="bottom" align="end" />
          </button>
        </div>

        {/* The info card: overlaps the banner's lower edge; at full height it sits where the page's does. */}
        <div ref={info} className="relative -mt-20 px-4 pb-10 sm:-mt-24 sm:px-6 sm:pb-6">
          <div className="max-w-xl rounded-3xl bg-black/35 p-5 ring-1 ring-white/10 backdrop-blur-xl md:p-7">
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
            <Facts d={d} type={type} genresClassName="mt-2 text-sm" className="mt-1.5 text-sm" />
            {d.overview && <p className="mt-4 line-clamp-3 text-body-sm leading-6 text-pretty text-white/80 sm:line-clamp-5">{d.overview}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {play && <PlayTitleButton id={d.id} type={type} onEpisodes={() => onEpisodes?.()} />}
              <LibraryButton item={libraryItem(d, type)} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const W = 340;
const GAP = 12;
/** The episode card on the mini peek's corner: its width and how far it hangs out. */
const EW = 272;
const OUT_X = 150;
const OUT_Y = 40;

/**
 * The mini peek: pinned beside the card it came from; stays while the pointer is on it. For a show
 * it carries one episode card on its bottom-right corner, hanging over the edge: the episode the
 * card was for, else the one you're on, else the latest. Clicking it opens the episode list there.
 * Placed to the card's right if there's room, else its left, else centred; re-measured as its
 * content loads so it never runs off screen.
 */
function SidePeek({
  d,
  type,
  detailsUrl,
  onClose,
  anchor,
  onEpisodes,
  episode,
}: {
  d: Details;
  type: MediaType;
  detailsUrl: string;
  onClose: () => void;
  anchor: DOMRect;
  onEpisodes?: (selected?: PeekEpisode) => void;
  episode?: PeekEpisode;
}) {
  const title = titleOf(d);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ left: -9999, top: 0 });
  const history = useStore((s) => s.history);
  const resume = type === 'tv' ? resumeTarget(history, 'tv', d.id) : null;
  const last = d.last_episode_to_air;
  const ep: (PeekEpisode & { why: 'card' | 'resume' | 'latest' }) | null =
    type !== 'tv'
      ? null
      : episode
        ? { ...episode, why: 'card' }
        : resume?.season !== undefined
          ? { season: resume.season, episode: resume.episode!, why: 'resume' }
          : last
            ? { season: last.season_number, episode: last.episode_number, why: 'latest' }
            : null;
  const outX = ep ? OUT_X : 0;
  const outY = ep ? OUT_Y : 0;

  useLayoutEffect(() => {
    const place = () => {
      const h = Math.min((ref.current?.offsetHeight ?? 420) + outY, window.innerHeight - GAP * 2);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const total = W + outX;
      const left = anchor.right + GAP + total <= vw - GAP ? anchor.right + GAP : anchor.left - GAP - total >= GAP ? anchor.left - GAP - total : Math.max(GAP, (vw - total) / 2);
      const top = Math.max(GAP, Math.min(anchor.top, vh - h - GAP));
      setPos({ left, top });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [anchor, outX, outY]);

  // Close on a press outside it (not its watchlist menu), Escape, scroll or resize.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.parentElement?.contains(t) && !t.closest?.('[role=menu],[role=listbox]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=menu]') && onClose();
    const shut = (e: Event) => !ref.current?.parentElement?.contains(e.target as Node) && !document.querySelector('[role=menu]') && onClose();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', shut, { passive: true, capture: true });
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', shut, { capture: true });
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-label={`${title}: details`}
      style={{ ...pos, width: W, marginBottom: outY }}
      onPointerEnter={() => peek.hold()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !document.querySelector('[role=menu]') && peek.release()}
      className="toast-in fixed z-[60]"
    >
      <div ref={ref} className="max-h-[calc(100dvh-46px)] overflow-y-auto overscroll-contain rounded-3xl bg-raised shadow-2xl ring-1 shadow-black/60 ring-white/10">
        <div className="relative">
          <Img path={d.backdrop_path} kind="backdrop" sizes="340px" alt="" className="aspect-video w-full" imgClassName="object-[70%_20%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-raised via-raised/10 to-transparent" />
          <div className="absolute top-2.5 right-2.5">
            <ExpandButton to={detailsUrl} small />
          </div>
        </div>
        <div className={cx('relative -mt-6 px-4', ep ? 'pb-14' : 'pb-4')}>
          <h2 className="text-xl leading-tight font-semibold tracking-tight text-balance">{title}</h2>
          <Facts d={d} type={type} genresClassName="mt-1.5 text-xs" className="mt-1 text-xs" />
          {d.overview && <p className="mt-2.5 line-clamp-4 text-caption leading-5 text-pretty text-white/75">{d.overview}</p>}
          <div className="mt-3.5 flex items-center gap-2">
            <PlayTitleButton id={d.id} type={type} size="md" onEpisodes={() => onEpisodes?.()} />
            <LibraryButton item={libraryItem(d, type)} size="md" className="size-9!" />
          </div>
        </div>
      </div>
      {ep && (
        <PeekEpisodeCard
          show={d}
          start={ep}
          resume={resume && !resume.isNext && resume.season !== undefined ? { season: resume.season, episode: resume.episode!, pct: percent(resume.item) } : undefined}
          onOpen={(sel) => onEpisodes?.(sel)}
        />
      )}
    </div>,
    document.body,
  );
}

/**
 * The episode card on the mini peek's corner (see SidePeek): still, name, date · length · rating and
 * the synopsis. The wheel steps to the previous / next episode (across seasons); a click opens
 * the episode list on the one shown.
 */
function PeekEpisodeCard({ show, start, resume, onOpen }: { show: Details; start: PeekEpisode; resume?: PeekEpisode & { pct: number }; onOpen: (sel: PeekEpisode) => void }) {
  const [at, setAt] = useState<{ season: number; episode: number }>({ season: start.season, episode: start.episode });
  const { data: season } = useQuery(q.season(show.id, at.season));
  const list = season?.episodes ?? [];
  // -1: the last episode of the season (stepping back into it).
  const idx = at.episode === -1 ? list.length - 1 : list.findIndex((x) => x.episode_number === at.episode);
  const e = idx >= 0 ? list[idx] : undefined;
  const number = e?.episode_number ?? at.episode;
  const seasons = (show.seasons ?? [])
    .map((x) => x.season_number)
    .filter((n) => n > 0 || at.season === 0)
    .sort((a, b) => a - b);
  const ref = useRef<HTMLButtonElement>(null);
  const step = useRef<(dir: 1 | -1) => void>(() => {});
  step.current = (dir) => {
    if (!list.length) return;
    const next = idx + dir;
    if (next >= 0 && next < list.length) return setAt({ season: at.season, episode: list[next].episode_number });
    const si = seasons.indexOf(at.season) + dir;
    if (si < 0 || si >= seasons.length) return;
    setAt({ season: seasons[si], episode: dir > 0 ? 1 : -1 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (Math.abs(ev.deltaY) < 4 || ev.timeStamp - last < 220) return;
      last = ev.timeStamp;
      step.current(ev.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const name = e?.name && !/^episode \d+$/i.test(e.name) ? e.name : '';
  const air = e?.air_date;
  const airAt = air ? new Date(`${air}T00:00:00`).getTime() : 0;
  const upcoming = airAt > Date.now();
  const facts = [air ? dateLabel(airAt) : '', !upcoming && e?.runtime ? formatRuntime(e.runtime) : '', !upcoming && e?.vote_average ? `★ ${e.vote_average.toFixed(1)}` : ''].filter(Boolean);
  const pct = resume && resume.season === at.season && resume.episode === number ? resume.pct : 0;
  const pos = list.length ? `${idx + 1} / ${list.length}` : '';
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen({ season: at.season, episode: number })}
      onKeyDown={(k) => (k.key === 'ArrowDown' || k.key === 'ArrowUp') && (k.preventDefault(), step.current(k.key === 'ArrowDown' ? 1 : -1))}
      style={{ width: EW, right: -OUT_X, bottom: -OUT_Y }}
      aria-label={`${seLabel(at.season, number)}${name ? ` ${name}` : ''}: open the episode list. Scroll or use the arrow keys for the previous or next episode.`}
      className="absolute overflow-hidden rounded-2xl bg-raised text-left shadow-[0_22px_50px_rgba(0,0,0,0.75)] ring-1 ring-white/15 focus-visible:outline-2 focus-visible:outline-white"
    >
      <div className="relative">
        <Img key={`${at.season}-${number}`} path={e?.still_path ?? show.backdrop_path} kind="still" sizes="272px" alt="" className="aspect-video w-full" />
        {pos && <span className="absolute top-2 right-2 rounded-full bg-black/75 px-2 py-0.5 text-[11px] text-white/85 tabular-nums">{pos}</span>}
        {pct > 0 && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="block h-full bg-white" style={{ width: `${Math.max(4, pct)}%` }} />
          </span>
        )}
      </div>
      <div key={`${at.season}-${number}`} className="fade-in px-3.5 pt-2.5 pb-3">
        <p className="truncate text-sm font-semibold text-white">
          {seLabel(at.season, number)}
          {name ? ` ${name}` : ''}
        </p>
        {facts.length > 0 && <p className="mt-0.5 truncate text-xs text-muted">{facts.join(' · ')}</p>}
        {e ? (
          e.overview ? (
            <p className="mt-1.5 line-clamp-3 text-xs leading-[1.1rem] text-white/70">{e.overview}</p>
          ) : (
            <p className="mt-1.5 text-xs text-faint">No synopsis yet.</p>
          )
        ) : (
          <div className="mt-2 space-y-1.5">
            <div className="skeleton h-2.5 w-full rounded" />
            <div className="skeleton h-2.5 w-4/5 rounded" />
          </div>
        )}
      </div>
    </button>
  );
}
