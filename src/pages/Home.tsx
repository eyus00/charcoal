import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import ContinueWatching from '../components/ContinueWatching';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { Pill, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, useRowScroll } from '../components/Row';
import { RowSkeleton } from '../components/Skeletons';
import { EMPTY_FILTERS, GENRES, genreName } from '../lib/filters';
import { imageSrcSet, imageUrl } from '../lib/images';
import { continueWatching, useStore } from '../lib/store';
import { cleanList, q, titleOf, typeOf, yearOf, type MediaItem } from '../lib/tmdb';
import { cx, useTitle } from '../lib/util';
import { useDiscover } from '../lib/browse';

export default function Home() {
  useTitle();
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history).slice(0, 15), [history]);
  return (
    <div className="space-y-10 md:space-y-12">
      <Hero />
      {resume.length > 0 && <ContinueWatching items={resume} />}
      <Browse />
    </div>
  );
}

// ---------- hero (full-bleed, sits under the floating top bar) ----------

/** Pull full-bleed sections under the top bar (its height: 76px on phones, 92px from md). */
export const BLEED = '-mx-4 -mt-[76px] md:-mx-8 md:-mt-[92px] lg:-mx-10';
const HERO_SIZES = '100vw';
const SWIPE_PX = 50;

function Hero() {
  const navigate = useNavigate();
  const { data, isError } = useQuery(q.trending('all', 'day'));
  const items = useMemo(() => cleanList(data?.results ?? []).filter((m) => m.backdrop_path).slice(0, 8), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState(0);
  const drag = useRef<{ x: number; y: number; id: number; axis?: 'x' | 'y' } | null>(null);
  const go = (d: number) => setIndex((i) => (i + d + items.length) % items.length);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setTimeout(() => !document.hidden && setIndex((i) => (i + 1) % items.length), 9000);
    return () => clearTimeout(t);
  }, [items.length, paused, index]);

  if (isError) return null;
  const frame = cx(BLEED, 'relative h-[78svh] min-h-[520px] max-h-[820px] overflow-hidden');
  if (!items.length) return <div className={cx(frame, 'skeleton')} />;

  const item = items[index];
  const next = items[(index + 1) % items.length];

  // Swipe/drag: horizontal movement switches slides; a tap (no movement) opens details.
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis && Math.abs(dx) + Math.abs(dy) > 8) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.axis === 'x') setDragX(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragX(0);
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (d.axis === 'x' && Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
    else if (!d.axis) navigate(`/${typeOf(item)}/${item.id}`);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Trending today"
      tabIndex={0}
      className={cx(frame, 'cursor-pointer touch-pan-y outline-none select-none')}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => ((drag.current = null), setDragX(0))}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/${typeOf(item)}/${item.id}`);
      }}
    >
      <div className="absolute inset-0" style={dragX ? { transform: `translateX(${dragX * 0.25}px)` } : undefined}>
        {items.map((m, i) => (
          <HeroSlide key={typeOf(m) + m.id} item={m} active={i === index} />
        ))}
      </div>
      <img aria-hidden alt="" src={imageUrl(next.backdrop_path, 'backdrop', 780)} srcSet={imageSrcSet(next.backdrop_path, 'backdrop')} sizes={HERO_SIZES} className="pointer-events-none absolute size-px opacity-0" />
      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center gap-1.5 md:bottom-8">
        {items.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setIndex(i)}
            aria-label={`Show ${titleOf(m)}`}
            aria-current={i === index}
            className="grid h-6 place-items-center px-0.5"
          >
            <span className={cx('block h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40')} />
          </button>
        ))}
      </div>
    </section>
  );
}

function HeroSlide({ item, active }: { item: MediaItem; active: boolean }) {
  const type = typeOf(item);
  const [seen, setSeen] = useState(active);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);
  if (!seen) return null; // don't download slides nobody has reached yet

  const title = titleOf(item);
  const genres = (item.genre_ids ?? []).map((g) => genreName(type, g)).filter(Boolean).slice(0, 2) as string[];
  return (
    <div aria-hidden={!active} className={cx('absolute inset-0 transition-opacity duration-700', active ? 'z-10 opacity-100' : 'pointer-events-none opacity-0')}>
      <div className="absolute inset-0">
        <Img path={item.backdrop_path} kind="backdrop" sizes={HERO_SIZES} alt="" priority={active} className="size-full" imgClassName="object-[70%_20%] pointer-events-none" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-bg/40" />

      <div className="absolute inset-x-0 bottom-20 px-4 md:bottom-24 md:px-8 lg:px-10">
        <div className="max-w-2xl">
          <p className="text-sm text-white/70">{[yearOf(item), genres.join(', '), type === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join('  ·  ')}</p>
          <h2 className="mt-3 line-clamp-2 text-4xl leading-[0.95] font-light tracking-tight uppercase md:text-6xl xl:text-7xl">{title}</h2>
          <p className="mt-4 line-clamp-2 max-w-lg text-[15px] text-white/70">{item.overview}</p>
          <div className="mt-6 flex items-center gap-3">
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

const CATEGORIES = ['trending', 'action', 'adventure', 'comedy', 'crime', 'drama', 'fantasy', 'horror', 'scifi', 'animation', 'mystery', 'romance', 'thriller', 'documentary', 'family'];

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
        <div className="no-scrollbar scroll-row -mx-1 flex min-w-0 flex-1 gap-2.5 overflow-x-auto px-1" role="tablist" aria-label="Categories">
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
            className="grid w-[140px] shrink-0 snap-start place-items-center self-start aspect-[2/3] rounded-2xl bg-surface text-[15px] text-muted transition hover:bg-raised hover:text-white sm:w-[170px] lg:w-[190px]"
          >
            See all
          </Link>
        </Scroller>
      )}
    </section>
  );
}
