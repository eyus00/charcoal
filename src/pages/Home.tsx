import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight, Film, Play, Sparkles, Star, Tv } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import ContinueWatching from '../components/ContinueWatching';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, Scroller, SectionHeader } from '../components/Row';
import { Bone, RowSkeleton } from '../components/Skeletons';
import { genreName } from '../lib/filters';
import { imageSrcSet, imageUrl } from '../lib/images';
import { continueWatching, useStore } from '../lib/store';
import { certificationOf, cleanList, logoOf, q, titleOf, typeOf, yearOf, type MediaItem } from '../lib/tmdb';
import { cx, useTitle } from '../lib/util';

export default function Home() {
  useTitle();
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history).slice(0, 15), [history]);

  return (
    <div className="space-y-8 md:space-y-14">
      <Hero />
      {resume.length > 0 && <ContinueWatching items={resume} />}
      <YouMightLike />
    </div>
  );
}

// ---------- hero ----------

const HERO_SIZES = '(min-width: 1280px) 1280px, 100vw';

function Hero() {
  const { data, isError } = useQuery(q.trending('all', 'day'));
  // Same pick as before: today's trending movies + shows, best rated first.
  const items = useMemo(
    () =>
      cleanList(data?.results ?? [])
        .filter((m) => m.backdrop_path)
        .sort((a, b) => b.vote_average - a.vote_average)
        .slice(0, 10),
    [data],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = (d: number) => setIndex((i) => (i + d + items.length) % items.length);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setTimeout(() => !document.hidden && setIndex((i) => (i + 1) % items.length), 8000);
    return () => clearTimeout(t);
  }, [items.length, paused, index]);

  if (isError) return null;
  if (!items.length) return <Bone className="h-[380px] w-full rounded-[1.5rem] md:h-[500px] md:rounded-[2rem] lg:h-[600px]" />;

  const next = items[(index + 1) % items.length];
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="group/hero relative h-[380px] w-full overflow-hidden rounded-[1.5rem] bg-black shadow-2xl md:h-[500px] md:rounded-[2rem] lg:h-[600px]"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {items.map((m, i) => (
        <HeroSlide key={typeOf(m) + m.id} item={m} active={i === index} />
      ))}
      {/* warm the next backdrop */}
      <img aria-hidden alt="" src={imageUrl(next.backdrop_path, 'backdrop', 780)} srcSet={imageSrcSet(next.backdrop_path, 'backdrop')} sizes={HERO_SIZES} className="pointer-events-none absolute size-px opacity-0" />

      <button onClick={() => go(-1)} aria-label="Previous" className="absolute top-1/2 left-6 z-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/20 opacity-0 shadow-2xl backdrop-blur-md transition group-hover/hero:opacity-100 hover:scale-110 hover:bg-accent/40 md:flex">
        <ChevronLeft className="size-6" />
      </button>
      <button onClick={() => go(1)} aria-label="Next" className="absolute top-1/2 right-6 z-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/20 opacity-0 shadow-2xl backdrop-blur-md transition group-hover/hero:opacity-100 hover:scale-110 hover:bg-accent/40 md:flex">
        <ChevronRight className="size-6" />
      </button>
      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2.5 rounded-full border border-white/5 bg-black/20 px-4 py-2 backdrop-blur-md md:bottom-8">
        {items.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setIndex(i)}
            aria-label={`Show ${titleOf(m)}`}
            aria-current={i === index}
            className={cx('h-1 rounded-full transition-all duration-500 md:h-1.5', i === index ? 'w-6 bg-accent md:w-8' : 'w-1 bg-white/20 hover:bg-white/40 md:w-1.5')}
          />
        ))}
      </div>
    </section>
  );
}

function HeroSlide({ item, active }: { item: MediaItem; active: boolean }) {
  const navigate = useNavigate();
  const type = typeOf(item);
  // Logo + age rating for the visible slide only (one small request each, cached).
  const { data: extras } = useQuery({ ...q.heroExtras(type, item.id), enabled: active });
  const logo = logoOf(extras);
  const cert = extras ? certificationOf(extras) : null;
  const title = titleOf(item);
  const genres = (item.genre_ids ?? []).map((g) => genreName(type, g)).filter(Boolean) as string[];
  const [seen, setSeen] = useState(active);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);
  if (!seen) return null; // don't download slides nobody has reached yet

  return (
    <div
      aria-hidden={!active}
      className={cx('absolute inset-0 cursor-pointer transition-[opacity,transform] duration-700 ease-out', active ? 'z-10 scale-100 opacity-100' : 'pointer-events-none z-0 scale-105 opacity-0')}
      onClick={() => navigate(`/${type}/${item.id}`)}
    >
      <Img path={item.backdrop_path} kind="backdrop" sizes={HERO_SIZES} alt="" priority={active} className="absolute! inset-0 size-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-end px-5 pt-10 pb-16 md:p-10 lg:p-14">
        <div className="max-w-3xl">
          <div className="mb-4 flex items-center gap-3 md:mb-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-gradient-to-r from-accent/90 to-accent/70 px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase shadow-lg shadow-accent/30 md:px-4 md:text-xs">
              {type === 'movie' ? <Film className="size-3.5" /> : <Tv className="size-3.5" />}
              <span className="hidden md:inline">{type === 'movie' ? 'Movie' : 'TV Series'}</span>
            </span>
            {cert && <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-bold text-white/80 uppercase md:text-xs">{cert}</span>}
          </div>

          <div className="mb-4 md:mb-6">
            {logo ? (
              <img src={`https://image.tmdb.org/t/p/w500${logo}`} alt={title} className="h-16 max-w-[80%] object-contain object-left drop-shadow-[0_0_30px_rgba(0,0,0,0.5)] md:h-24 lg:h-32" />
            ) : (
              <h2 className="text-4xl leading-none font-black tracking-tight drop-shadow-2xl md:text-6xl lg:text-7xl">{title}</h2>
            )}
          </div>

          <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:gap-6">
            <div className="flex items-center gap-4 md:gap-6">
              {item.vote_average > 0 && (
                <span className="flex items-center gap-2 font-bold">
                  <span className="rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-1.5">
                    <Star className="size-4 fill-yellow-400 text-yellow-400" />
                  </span>
                  {item.vote_average.toFixed(1)}
                </span>
              )}
              {yearOf(item) && (
                <span className="flex items-center gap-2 font-bold">
                  <span className="rounded-lg border border-green-400/20 bg-green-400/10 p-1.5">
                    <Calendar className="size-4 text-green-400" />
                  </span>
                  {yearOf(item)}
                </span>
              )}
            </div>
            {genres.length > 0 && <div className="hidden h-4 w-px bg-white/20 md:block" />}
            <div className="flex max-h-[26px] flex-wrap gap-2 overflow-hidden md:max-h-none">
              {genres.map((g) => (
                <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium whitespace-nowrap text-white/70 md:px-3 md:text-xs">
                  {g}
                </span>
              ))}
            </div>
          </div>

          <p className="mb-8 hidden max-w-2xl text-sm leading-relaxed text-white/60 md:line-clamp-3 md:text-base">{item.overview}</p>

          <div className="flex items-center gap-4">
            <Link
              to={`/watch/${type}/${item.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-3 rounded-xl border border-white/20 bg-accent px-6 py-3 shadow-xl shadow-accent/20 transition hover:bg-accent-hover active:scale-95 md:rounded-2xl md:px-8 md:py-4"
            >
              <Play className="size-5 fill-current md:size-6" />
              <span className="text-sm font-bold tracking-wider uppercase md:text-base">Play</span>
            </Link>
            <BookmarkMenu
              variant="icon"
              item={{ id: item.id, mediaType: type, title, posterPath: item.poster_path, releaseDate: item.release_date || item.first_air_date, ratingScore: item.vote_average }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- you might like ----------

function YouMightLike() {
  const { data, isError } = useQuery(q.trending('all', 'week'));
  const items = useMemo(() => cleanList(data?.results ?? []).slice(0, 20), [data]);
  if (isError) return null;
  return (
    <section>
      <SectionHeader icon={Sparkles} title="You Might Like" subtitle="Top picks for you today" />
      {data ? (
        <Scroller label="You might like">
          {items.map((m) => (
            <MediaCard key={typeOf(m) + m.id} item={m} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
        </Scroller>
      ) : (
        <RowSkeleton />
      )}
    </section>
  );
}
