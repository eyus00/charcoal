import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import ContinueWatching from '../components/ContinueWatching';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { Pill, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, useRowScroll } from '../components/Row';
import { Bone, RowSkeleton } from '../components/Skeletons';
import { EMPTY_FILTERS, GENRES, genreName } from '../lib/filters';
import { imageSrcSet, imageUrl } from '../lib/images';
import { continueWatching, useStore } from '../lib/store';
import { certificationOf, cleanList, q, titleOf, typeOf, yearOf, type MediaItem } from '../lib/tmdb';
import { cx, formatRuntime, useTitle } from '../lib/util';
import { useDiscover } from './Catalog';

export default function Home() {
  useTitle();
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history).slice(0, 15), [history]);
  return (
    <div className="space-y-8 md:space-y-10">
      <Hero />
      {/* On wide screens Continue Watching lives in the sidebar */}
      {resume.length > 0 && <ContinueWatching items={resume} className="lg:hidden" />}
      <Browse />
    </div>
  );
}

// ---------- hero ----------

const HERO_SIZES = '(min-width: 1280px) 1100px, 100vw';

function Hero() {
  const { data, isError } = useQuery(q.trending('all', 'day'));
  const items = useMemo(() => cleanList(data?.results ?? []).filter((m) => m.backdrop_path).slice(0, 8), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setTimeout(() => !document.hidden && setIndex((i) => (i + 1) % items.length), 8000);
    return () => clearTimeout(t);
  }, [items.length, paused, index]);

  if (isError) return null;
  if (!items.length) return <Bone className="aspect-[4/5] w-full rounded-3xl sm:aspect-[16/9] lg:aspect-auto lg:h-[460px]" />;

  const at = (n: number) => items[(index + n) % items.length];
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Trending today"
      className="flex gap-3"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-3xl bg-surface sm:aspect-[16/9] lg:aspect-auto lg:h-[460px]">
        {items.map((m, i) => (
          <HeroSlide key={typeOf(m) + m.id} item={m} active={i === index} />
        ))}
        <div className="absolute top-5 right-5 z-20 flex gap-1.5">
          {items.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setIndex(i)}
              aria-label={`Show ${titleOf(m)}`}
              aria-current={i === index}
              className={cx('size-1.5 rounded-full transition', i === index ? 'bg-white' : 'bg-white/35 hover:bg-white/70')}
            />
          ))}
        </div>
      </div>
      {/* peek at what's next */}
      {[1, 2].map((n) => {
        const m = at(n);
        return (
          <button
            key={n}
            onClick={() => setIndex((index + n) % items.length)}
            aria-label={`Show ${titleOf(m)}`}
            className={cx(
              'relative hidden shrink-0 self-center overflow-hidden rounded-3xl bg-surface opacity-80 transition hover:opacity-100 md:block',
              n === 1 ? 'h-[88%] w-24 lg:h-[404px] xl:w-28' : 'h-[76%] w-12 lg:h-[350px] xl:w-16',
            )}
          >
            <img src={imageUrl(m.poster_path, 'poster', 185)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          </button>
        );
      })}
      {/* warm the next backdrop */}
      <img aria-hidden alt="" src={imageUrl(at(1).backdrop_path, 'backdrop', 780)} srcSet={imageSrcSet(at(1).backdrop_path, 'backdrop')} sizes={HERO_SIZES} className="pointer-events-none fixed size-px opacity-0" />
    </section>
  );
}

function HeroSlide({ item, active }: { item: MediaItem; active: boolean }) {
  const navigate = useNavigate();
  const type = typeOf(item);
  const { data: extras } = useQuery({ ...q.heroExtras(type, item.id), enabled: active });
  const [seen, setSeen] = useState(active);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);
  if (!seen) return null; // don't download slides nobody has reached yet

  const title = titleOf(item);
  const genre = item.genre_ids?.map((g) => genreName(type, g)).find(Boolean);
  const length =
    type === 'movie'
      ? formatRuntime(extras?.runtime).replace(/(\d+)m$/, '$1min')
      : extras?.number_of_seasons
        ? `${extras.number_of_seasons} season${extras.number_of_seasons > 1 ? 's' : ''}`
        : '';
  const cert = extras ? certificationOf(extras) : null;
  const pills = [length, genre, type === 'movie' ? 'Movie' : 'Series', yearOf(item), cert].filter(Boolean) as string[];

  return (
    <div
      aria-hidden={!active}
      className={cx('absolute inset-0 cursor-pointer transition-opacity duration-700', active ? 'z-10 opacity-100' : 'pointer-events-none opacity-0')}
      onClick={() => navigate(`/${type}/${item.id}`)}
    >
      <div className="absolute inset-0">
        <Img path={item.backdrop_path} kind="backdrop" sizes={HERO_SIZES} alt="" priority={active} className="size-full" imgClassName="object-[center_25%]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/30" />

      <div className="absolute top-5 left-5 flex max-w-[calc(100%-9rem)] flex-wrap gap-2 sm:max-w-[75%]">
        {pills.map((p, i) => (
          <span key={p} className={cx('rounded-full bg-black/35 px-3.5 py-1.5 text-sm text-white/90 backdrop-blur-md', i > 2 && 'hidden sm:inline')}>
            {p}
          </span>
        ))}
      </div>

      <div className="absolute inset-x-5 bottom-5 flex items-end gap-4">
        <Link
          to={`/watch/${type}/${item.id}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Play ${title}`}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-white/25 backdrop-blur-md transition hover:scale-105 hover:bg-accent hover:text-black"
        >
          <Play className="ml-1 size-6 fill-current" strokeWidth={0} />
        </Link>
        <div className="min-w-0 flex-1 pb-0.5">
          <h2 className="truncate text-xl font-semibold md:text-2xl">{title}</h2>
          <p className="line-clamp-1 text-sm text-white/75 md:text-[15px]">{item.overview}</p>
        </div>
        <BookmarkMenu
          variant="round"
          item={{ id: item.id, mediaType: type, title, posterPath: item.poster_path, releaseDate: item.release_date || item.first_air_date, ratingScore: item.vote_average }}
        />
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
      <div className="mb-5 flex items-center gap-3">
        <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-2.5 overflow-x-auto px-1" role="tablist" aria-label="Categories">
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
            to={cat === 'trending' ? '/search' : `/search?genres=${cat}`}
            className="grid w-[140px] shrink-0 snap-start place-items-center rounded-2xl bg-surface text-[15px] text-muted transition hover:bg-raised hover:text-white sm:w-[170px] lg:w-[190px]"
          >
            See all
          </Link>
        </Scroller>
      )}
    </section>
  );
}
