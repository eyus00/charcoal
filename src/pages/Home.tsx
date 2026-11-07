import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Info, Play, Star, X } from 'lucide-react';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, RowHeader, Scroller } from '../components/Row';
import { Bone, POSTER_SIZES, RowSkeleton } from '../components/Skeletons';
import { genreName } from '../lib/filters';
import { epLabel } from '../lib/episodes';
import { actions, continueWatching, percent, useStore, watchUrl, type HistoryItem } from '../lib/store';
import { certificationOf, cleanList, logoOf, q, titleOf, typeOf, yearOf, type MediaItem, type MediaType } from '../lib/tmdb';
import { imageSrcSet, imageUrl } from '../lib/images';
import { cx, useInView, useTitle } from '../lib/util';

export default function Home() {
  useTitle();
  const history = useStore((s) => s.history);
  const watchlist = useStore((s) => s.watchlist);
  const resume = useMemo(() => continueWatching(history).slice(0, 20), [history]);
  const lastWatched = history[0];

  return (
    <div className="space-y-10 pb-6 md:space-y-12">
      <Hero />
      {resume.length > 0 && <ContinueRow items={resume} />}
      {lastWatched && <BecauseRow item={lastWatched} />}
      <LazyRow title="Trending this week" query={q.trending('all', 'week')} eager />
      {watchlist.length > 0 && (
        <section>
          <RowHeader title="Your bookmarks" to="/library?tab=bookmarks" />
          <Scroller label="Your bookmarks">
            {watchlist.slice(0, 20).map((w) => (
              <MediaCard
                key={w.mediaType + w.id}
                className={ROW_ITEM}
                sizes={POSTER_SIZES}
                type={w.mediaType}
                item={{ id: w.id, title: w.title, poster_path: w.posterPath, backdrop_path: null, overview: '', vote_average: w.ratingScore ?? 0, release_date: w.releaseDate }}
              />
            ))}
          </Scroller>
        </section>
      )}
      <LazyRow title="Popular movies" query={q.list('movie', 'popular')} type="movie" to="/movies" />
      <LazyRow title="Popular TV shows" query={q.list('tv', 'popular')} type="tv" to="/tv" />
      <LazyRow title="Top rated movies" query={q.list('movie', 'top_rated')} type="movie" to="/movies?sort=rating" />
      <LazyRow title="Top rated TV shows" query={q.list('tv', 'top_rated')} type="tv" to="/tv?sort=rating" />
    </div>
  );
}

// ---------- hero ----------

const HERO_SIZES = '(min-width: 1600px) 1600px, 100vw';

function Hero() {
  const { data, isError } = useQuery(q.trending('all', 'day'));
  const items = useMemo(() => cleanList(data?.results ?? []).filter((m) => m.backdrop_path).slice(0, 8), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % items.length);
    }, 9000);
    return () => clearInterval(t);
  }, [items.length, paused, index]);

  if (isError) return null;
  if (!items.length) {
    return (
      <div className="px-4 pt-4 md:px-8">
        <Bone className="aspect-[4/5] w-full rounded-2xl sm:aspect-[16/9] lg:aspect-[21/8]" />
      </div>
    );
  }

  const item = items[index % items.length];
  const next = items[(index + 1) % items.length];
  return (
    <section
      className="px-4 pt-4 md:px-8"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Trending today"
    >
      <div className="relative overflow-hidden rounded-2xl">
        <HeroSlide key={typeOf(item) + item.id} item={item} />
        {/* Warm the next slide's image so it doesn't pop in */}
        <img
          aria-hidden
          alt=""
          src={imageUrl(next.backdrop_path, 'backdrop', 780)}
          srcSet={imageSrcSet(next.backdrop_path, 'backdrop')}
          sizes={HERO_SIZES}
          className="pointer-events-none absolute size-px opacity-0"
        />
        <div className="absolute top-4 right-4 z-10 flex gap-1.5 sm:top-auto sm:bottom-4 md:right-8 md:bottom-8">
          {items.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setIndex(i)}
              aria-label={`Show ${titleOf(m)}`}
              aria-current={i === index}
              className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70')}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroSlide({ item }: { item: MediaItem }) {
  const type = typeOf(item);
  const { data: extras } = useQuery(q.heroExtras(type, item.id));
  const logo = logoOf(extras);
  const cert = extras ? certificationOf(extras) : null;
  const title = titleOf(item);
  const genres = (item.genre_ids ?? []).map((g) => genreName(type, g)).filter(Boolean).slice(0, 3);

  return (
    <div className="relative aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[21/8]">
      <div className="absolute inset-0">
        <Img path={item.backdrop_path} kind="backdrop" sizes={HERO_SIZES} alt="" priority className="size-full" imgClassName="object-[center_20%]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent sm:bg-gradient-to-r sm:from-bg/95 sm:via-bg/50" />
      <div className="absolute inset-x-0 bottom-0 flex max-w-2xl flex-col gap-3 p-5 sm:top-0 sm:justify-center md:p-10 lg:p-14">
        {logo ? (
          <img
            src={`https://image.tmdb.org/t/p/w500${logo}`}
            alt={title}
            className="max-h-20 w-auto max-w-[70%] self-start object-contain object-left drop-shadow-lg md:max-h-28"
          />
        ) : (
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{title}</h1>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
          <span>{type === 'movie' ? 'Movie' : 'TV Series'}</span>
          {yearOf(item) && <span>· {yearOf(item)}</span>}
          {item.vote_average > 0 && (
            <span className="flex items-center gap-1">
              · <Star className="size-3.5 fill-current text-amber-400" /> {item.vote_average.toFixed(1)}
            </span>
          )}
          {cert && <span className="rounded border border-white/30 px-1.5 text-xs">{cert}</span>}
          {genres.length > 0 && <span className="hidden sm:inline">· {genres.join(', ')}</span>}
        </div>
        <p className="line-clamp-2 max-w-xl text-sm text-white/75 md:line-clamp-3 md:text-base">{item.overview}</p>
        <div className="mt-1 flex gap-2">
          <Link
            to={type === 'movie' ? `/watch/movie/${item.id}` : `/watch/tv/${item.id}`}
            className="flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-black hover:bg-white/90"
          >
            <Play className="size-4 fill-current" /> Play
          </Link>
          <Link
            to={`/${type}/${item.id}`}
            className="flex h-11 items-center gap-2 rounded-lg bg-white/15 px-5 text-sm font-medium backdrop-blur-sm hover:bg-white/25"
          >
            <Info className="size-4" /> Details
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------- rows ----------

function LazyRow({
  title,
  query,
  type,
  to,
  eager,
}: {
  title: string;
  query: ReturnType<typeof q.trending> | ReturnType<typeof q.list>;
  type?: MediaType;
  to?: string;
  eager?: boolean;
}) {
  const [ref, inView] = useInView<HTMLElement>('400px');
  const { data, isError } = useQuery({ ...query, enabled: eager || inView });
  const items = useMemo(() => cleanList(data?.results ?? [], type), [data, type]);
  if (isError) return null;
  return (
    <section ref={ref}>
      <RowHeader title={title} to={to} />
      {data ? (
        <Scroller label={title}>
          {items.map((m) => (
            <MediaCard key={typeOf(m, type) + m.id} item={m} type={type} sizes={POSTER_SIZES} className={ROW_ITEM} showType={!type} />
          ))}
        </Scroller>
      ) : (
        <RowSkeleton />
      )}
    </section>
  );
}

function BecauseRow({ item }: { item: HistoryItem }) {
  const [ref, inView] = useInView<HTMLElement>('400px');
  const { data } = useQuery({ ...q.details(item.mediaType, item.id), enabled: inView });
  const items = useMemo(() => {
    const recs = data?.recommendations?.results.length ? data.recommendations.results : (data?.similar?.results ?? []);
    return cleanList(recs, item.mediaType).slice(0, 20);
  }, [data, item.mediaType]);
  if (data && !items.length) return null;
  return (
    <section ref={ref}>
      <RowHeader title={`Because you watched ${item.title}`} />
      {data ? (
        <Scroller label={`Because you watched ${item.title}`}>
          {items.map((m) => (
            <MediaCard key={m.id} item={m} type={typeOf(m, item.mediaType)} sizes={POSTER_SIZES} className={ROW_ITEM} />
          ))}
        </Scroller>
      ) : (
        <RowSkeleton />
      )}
    </section>
  );
}

function ContinueRow({ items }: { items: HistoryItem[] }) {
  return (
    <section>
      <RowHeader title="Continue watching" to="/library?tab=history" />
      <Scroller label="Continue watching">
        {items.map((h) => {
          const isNext = h.isCompleted && h.nextEpisode;
          const label =
            h.mediaType === 'tv'
              ? isNext
                ? `Next · ${epLabel(h.nextEpisode!.season, h.nextEpisode!.episode)}`
                : epLabel(h.season, h.episode)
              : h.progress
                ? `${Math.max(1, Math.round((h.progress.duration - h.progress.watched) / 60))}m left`
                : 'Movie';
          return (
            <div key={h.mediaType + h.id} className="group relative w-64 shrink-0 snap-start sm:w-72" role="listitem">
              <Link to={watchUrl(h)} className="block">
                <div className="relative">
                  <Img
                    path={h.backdropPath ?? h.posterPath}
                    kind={h.backdropPath ? 'backdrop' : 'poster'}
                    sizes="288px"
                    alt={h.title}
                    className="aspect-video rounded-lg ring-1 ring-white/5 transition group-hover:ring-white/30"
                  />
                  <div className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                    <Play className="size-10 fill-white text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                  </div>
                  {!isNext && percent(h) > 0 && (
                    <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
                      <div className="h-full bg-accent" style={{ width: `${percent(h)}%` }} />
                    </div>
                  )}
                </div>
                <div className="mt-2 truncate text-sm font-medium">{h.title}</div>
                <div className="truncate text-xs text-muted">
                  {label}
                  {h.episodeTitle && !isNext ? ` · ${h.episodeTitle}` : ''}
                </div>
              </Link>
              <button
                onClick={() => actions.removeHistory(h.mediaType, h.id)}
                aria-label={`Remove ${h.title} from continue watching`}
                className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </Scroller>
    </section>
  );
}
