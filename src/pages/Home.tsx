import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Film, Pause, Play, Star, Tv } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import ContinueWatching from '../components/ContinueWatching';
import { AiringThisWeek, InTheaters, Top10, TopRated } from '../components/HomeRows';
import Img from '../components/Img';
import Kbd from '../components/Kbd';
import MediaCard from '../components/MediaCard';
import { Pill, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, useRowScroll } from '../components/Row';
import { RowSkeleton } from '../components/Skeletons';
import { EMPTY_FILTERS, GENRES, genreName } from '../lib/filters';
import { imageUrl } from '../lib/images';
import { continueWatching, useStore } from '../lib/store';
import { cleanList, q, titleOf, typeOf, yearOf, type MediaItem } from '../lib/tmdb';
import { cx, useKeys, useTitle } from '../lib/util';
import { useDiscover } from '../lib/browse';

export default function Home() {
  useTitle();
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history).slice(0, 15), [history]);
  return (
    <div className="space-y-10 md:space-y-12">
      <Hero />
      {resume.length > 0 && <ContinueWatching items={resume} />}
      <Top10 />
      <Browse />
      <AiringThisWeek />
      <InTheaters />
      <TopRated />
    </div>
  );
}

// ---------- hero (full-bleed, sits under the floating top bar) ----------

/** Pull full-bleed sections under the top bar (76px on phones, 92px from md). */
export const BLEED = '-mx-4 -mt-[76px] md:-mx-8 md:-mt-[92px] lg:-mx-10';
const HERO_SIZES = '100vw';
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Hero() {
  const navigate = useNavigate();
  const { data, isError } = useQuery(q.trending('all', 'day'));
  const items = useMemo(() => cleanList(data?.results ?? []).filter((m) => m.backdrop_path).slice(0, 8), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // The user's own pause (button); hover and keyboard focus pause it temporarily.
  const [stopped, setStopped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; id: number; axis?: 'x' | 'y'; lastX: number; lastT: number; v: number } | null>(null);
  // A tap on a preview card is a click, but a swipe that starts on one moves the hero too.
  const swiped = useRef(false);
  const go = (d: number) => setIndex((i) => (i + d + items.length) % items.length);
  useKeys({ ArrowLeft: () => go(-1), ArrowRight: () => go(1) }, items.length > 1);

  useEffect(() => {
    if (items.length < 2 || paused || stopped || dragging || REDUCED_MOTION) return;
    const t = setTimeout(() => !document.hidden && setIndex((i) => (i + 1) % items.length), 9000);
    return () => clearTimeout(t);
  }, [items.length, paused, dragging, index]);

  if (isError) return null;
  const frame = cx(BLEED, 'relative h-[78svh] min-h-[520px] max-h-[820px] overflow-hidden');
  if (!items.length) return <div className={cx(frame, 'skeleton')} />;

  const n = items.length;
  const item = items[index];
  const offsetOf = (i: number) => {
    let o = (i - index + n) % n;
    if (o > n / 2) o -= n;
    return o;
  };

  // Drag: the track follows the finger; release snaps to the neighbour (distance or flick) or back.
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a,button:not([data-swipe])')) return;
    swiped.current = false;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, lastX: e.clientX, lastT: performance.now(), v: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis && Math.abs(dx) + Math.abs(dy) > 8) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (d.axis !== 'x') return;
    const now = performance.now();
    d.v = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    setDragX(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const width = frameRef.current?.offsetWidth ?? 400;
    setDragging(false);
    setDragX(0);
    if (d.axis === 'x') {
      swiped.current = true;
      if (Math.abs(dx) > width * 0.18 || Math.abs(d.v) > 0.45) go(dx < 0 ? 1 : -1);
    } else if (!d.axis && !(e.target as HTMLElement).closest('[data-swipe]')) navigate(`/${typeOf(item)}/${item.id}`);
  };

  return (
    <section
      ref={frameRef}
      aria-roledescription="carousel"
      aria-label="Trending today"
      className={cx(frame, 'cursor-pointer touch-pan-y select-none')}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setPaused(false)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => ((drag.current = null), setDragging(false), setDragX(0))}
    >
      {items.map((m, i) => {
        const o = offsetOf(i);
        if (Math.abs(o) > 1) return null; // only the current slide and its neighbours exist
        return (
          <div
            key={typeOf(m) + m.id}
            inert={o !== 0}
            className="absolute inset-0 will-change-transform"
            style={{
              transform: `translateX(calc(${o * 100}% + ${dragX}px))`,
              transition: dragging ? 'none' : 'transform 650ms cubic-bezier(0.22, 0.8, 0.2, 1)',
            }}
          >
            <HeroSlide item={m} active={o === 0} />
          </div>
        );
      })}

      <div className="absolute inset-x-0 bottom-5 z-20 flex items-end justify-between gap-4 px-4 md:bottom-7 md:px-8 lg:px-10">
        <div className="flex items-center gap-0.5 pb-1">
          {!REDUCED_MOTION && (
            <button
              onClick={() => setStopped((v) => !v)}
              aria-label={stopped ? 'Play slideshow' : 'Pause slideshow'}
              title={stopped ? 'Play slideshow' : 'Pause slideshow'}
              className="mr-1.5 grid size-7 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {stopped ? <Play className="ml-px size-3.5 fill-current" strokeWidth={0} /> : <Pause className="size-3.5 fill-current" strokeWidth={0} />}
            </button>
          )}
          {items.map((m, i) => (
            <button key={m.id} onClick={() => setIndex(i)} aria-label={`Show ${titleOf(m)}`} aria-current={i === index} className="grid h-6 place-items-center px-0.5">
              <span className={cx('block h-1.5 rounded-full transition-[width,background-color] duration-500', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40')} />
            </button>
          ))}
          <Kbd className="ml-3">← →</Kbd>
        </div>
        {/* previous · current · next — a sliding track that glides on every change */}
        <div className="relative h-[92px] w-[176px] shrink-0 md:h-[104px] md:w-[206px]">
          {items.map((m, i) => {
            const o = offsetOf(i);
            const visible = Math.abs(o) <= 1;
            return (
              <button
                key={m.id}
                tabIndex={visible ? 0 : -1}
                aria-hidden={!visible}
                data-swipe
                draggable={false}
                onClick={() => {
                  if (swiped.current) return void (swiped.current = false);
                  if (o === 0) navigate(`/${typeOf(m)}/${m.id}`);
                  else go(o);
                }}
                aria-label={o === 0 ? `Open ${titleOf(m)}` : `${o < 0 ? 'Previous' : 'Next'}: ${titleOf(m)}`}
                className={cx(
                  'absolute bottom-1 left-1/2 h-[84px] w-14 overflow-hidden rounded-xl bg-surface transition-[transform,opacity,box-shadow] duration-[650ms] ease-[cubic-bezier(0.22,0.8,0.2,1)] md:h-24 md:w-16',
                  o === 0 ? 'ring-2 ring-white' : 'ring-0',
                  !visible && 'pointer-events-none',
                )}
                style={{
                  transform: `translateX(calc(-50% + ${Math.max(-2, Math.min(2, o))} * var(--hero-step))) scale(${o === 0 ? 1 : 0.82})`,
                  transformOrigin: 'bottom center',
                  opacity: visible ? (o === 0 ? 1 : 0.6) : 0,
                }}
              >
                <img src={imageUrl(m.poster_path, 'poster', 92)} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Text rises in when its slide becomes active. */
// Tailwind 4 translate utilities set the `translate` property, so that is what transitions.
const RISE = 'transition-[translate,opacity,filter] duration-500 ease-out';
const SHOWN = 'translate-y-0 opacity-100 blur-none';
const HIDDEN = 'translate-y-3 opacity-0 blur-[4px] delay-0!';

function HeroSlide({ item, active }: { item: MediaItem; active: boolean }) {
  const type = typeOf(item);
  // `shown` flips a frame after `active`, so text animates in even on first mount.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return setShown(false);
    let r2 = 0;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))));
    return () => (cancelAnimationFrame(r1), cancelAnimationFrame(r2));
  }, [active]);

  const title = titleOf(item);
  const genres = (item.genre_ids ?? []).map((g) => genreName(type, g)).filter(Boolean).slice(0, 2) as string[];
  const TypeIcon = type === 'movie' ? Film : Tv;
  return (
    <div className="absolute inset-0">
      <Img path={item.backdrop_path} kind="backdrop" sizes={HERO_SIZES} alt="" priority={active} className="absolute! inset-0 size-full" imgClassName="object-[70%_20%] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-bg/40" />

      <div className="absolute inset-x-0 bottom-32 px-4 md:bottom-36 md:px-8 lg:px-10">
        <div className="max-w-2xl">
          <span className={cx(RISE, shown ? SHOWN : HIDDEN, 'inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/85 backdrop-blur-sm')}>
            <TypeIcon className="size-3.5" />
            {type === 'movie' ? 'Movie' : 'TV show'}
          </span>
          <p className={cx(RISE, shown ? SHOWN : HIDDEN, 'mt-3 flex flex-wrap items-center gap-x-2 text-sm text-white/75')}>
            {[genres.join(', '), yearOf(item)].filter(Boolean).map((t, k) => (
              <span key={k} className="contents">
                {k > 0 && <span className="text-white/40">·</span>}
                <span>{t}</span>
              </span>
            ))}
            {item.vote_average > 0 && (
              <>
                <span className="text-white/40">·</span>
                <span className="flex items-center gap-1 font-medium text-white/90">
                  <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
                  {item.vote_average.toFixed(1)}
                </span>
              </>
            )}
          </p>
          <h2 className={cx(RISE, shown ? SHOWN : HIDDEN, 'delay-100')}>
            <span className="mt-3 line-clamp-2 text-4xl leading-[1.1] font-light tracking-tight uppercase md:text-6xl xl:text-7xl">{title}</span>
          </h2>
          <p className={cx(RISE, shown ? SHOWN : HIDDEN, 'mt-4 line-clamp-2 max-w-lg text-[15px] text-pretty text-white/70 delay-200')}>{item.overview}</p>
          <div className={cx(RISE, shown ? SHOWN : HIDDEN, 'mt-6 flex items-center gap-3 delay-300')}>
            <Link to={`/watch/${type}/${item.id}`} className="flex h-12 items-center gap-2.5 rounded-full bg-white px-6 text-[15px] font-medium text-black transition hover:bg-white/90">
              <Play className="size-4 fill-current" strokeWidth={0} /> Watch now
            </Link>
            <BookmarkMenu
              variant="round"
              item={{ id: item.id, mediaType: type, title, posterPath: item.poster_path, releaseDate: item.release_date || item.first_air_date, ratingScore: item.vote_average }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- genre pills + poster row ----------

const CATEGORIES = ['trending', 'action', 'comedy', 'drama', 'scifi', 'horror', 'animation'];

function Browse() {
  const [params, setParams] = useSearchParams();
  const cat = CATEGORIES.includes(params.get('cat') ?? '') ? params.get('cat')! : 'trending';
  const { ref, scroll } = useRowScroll();
  const trending = useQuery({ ...q.trending('all', 'week'), enabled: cat === 'trending' });
  const discover = useDiscover({ ...EMPTY_FILTERS, genres: [cat] }, cat !== 'trending');
  const items = useMemo(
    () => cleanList(cat === 'trending' ? (trending.data?.results ?? []) : (discover.data?.pages[0]?.results ?? [])).slice(0, 20),
    [cat, trending.data, discover.data],
  );
  const loading = cat === 'trending' ? trending.isPending : discover.isPending;

  const choose = (c: string) => {
    const next = new URLSearchParams(params);
    if (c === 'trending') next.delete('cat');
    else next.set('cat', c);
    setParams(next, { replace: true, preventScrollReset: true });
    ref.current?.scrollTo({ left: 0 });
  };

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold tracking-tight md:text-xl">Popular picks</h2>
      <div className="mb-5 flex items-center gap-3">
        <div className="no-scrollbar scroll-row -ml-1 flex min-w-0 flex-1 gap-2.5 overflow-x-auto pr-10 pl-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]" role="group" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <Pill key={c} on={c === cat} onClick={() => choose(c)}>
              {c === 'trending' ? 'Trending' : GENRES.find((g) => g.slug === c)!.name}
            </Pill>
          ))}
        </div>
        <RowArrows onScroll={scroll} />
      </div>
      {loading ? (
        <RowSkeleton />
      ) : (
        <Scroller label="Titles" scrollRef={ref}>
          {items.map((m) => (
            <MediaCard key={typeOf(m) + m.id} item={m} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
          <Link
            to={cat === 'trending' ? '/discover' : `/discover?genres=${cat}`}
            className="grid w-[156px] shrink-0 snap-start place-items-center self-start aspect-[2/3] rounded-2xl bg-surface text-[15px] text-muted transition hover:bg-raised hover:text-white sm:w-[190px] lg:w-[216px]"
          >
            See all
          </Link>
        </Scroller>
      )}
    </section>
  );
}
