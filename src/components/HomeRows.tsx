import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Film, Star, Tv } from 'lucide-react';
import Img from './Img';
import { Meta, usePrefetch } from './MediaCard';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { Bone } from './Skeletons';
import { cleanList, q, titleOf, typeOf, yearOf, type MediaItem, type MediaType } from '../lib/tmdb';
import { useInView } from '../lib/util';

type Query = ReturnType<typeof q.trending> | ReturnType<typeof q.list>;

/** A titled, lazily-loaded horizontal row; `render` decides the card design. */
function LazyRow({
  title,
  query,
  type,
  limit = 20,
  skeleton,
  render,
}: {
  title: string;
  query: Query;
  type?: MediaType;
  limit?: number;
  skeleton: React.ReactNode;
  render: (m: MediaItem, i: number) => React.ReactNode;
}) {
  const [ref, inView] = useInView<HTMLElement>('500px');
  const { data, isError } = useQuery({ ...query, enabled: inView });
  const items = useMemo(() => cleanList(data?.results ?? [], type).filter((m) => m.backdrop_path).slice(0, limit), [data, type, limit]);
  const { ref: scrollRef, scroll } = useRowScroll();
  if (isError) return null;
  return (
    <section ref={ref}>
      <SectionHeader title={title} action={<RowArrows onScroll={scroll} />} />
      {data ? (
        <Scroller label={title} scrollRef={scrollRef}>
          {items.map(render)}
        </Scroller>
      ) : (
        <div className="flex gap-4 overflow-hidden">{skeleton}</div>
      )}
    </section>
  );
}

const TypeIcon = ({ type }: { type: MediaType }) =>
  type === 'tv' ? <Tv className="size-3.5 text-white/60" aria-label="TV show" /> : <Film className="size-3.5 text-white/60" aria-label="Movie" />;

// ---------- Top 10: big outlined rank numbers next to posters ----------

function RankCard({ item, rank }: { item: MediaItem; rank: number }) {
  const t = typeOf(item);
  return (
    <Link to={`/${t}/${item.id}`} {...usePrefetch(t, item.id)} className="group flex shrink-0 snap-start items-end" role="listitem" aria-label={`${rank}. ${titleOf(item)}`}>
      <span
        aria-hidden
        className="-mr-4 text-[110px] leading-[0.8] font-black tracking-tighter text-transparent select-none md:text-[140px]"
        style={{ WebkitTextStroke: '2px rgb(255 255 255 / 0.28)' }}
      >
        {rank}
      </span>
      <Img path={item.poster_path} kind="poster" sizes="160px" alt="" className="aspect-[2/3] w-[118px] rounded-2xl shadow-xl shadow-black/40 md:w-[150px]" imgClassName="transition-transform duration-300 group-hover:scale-[1.04]" />
    </Link>
  );
}

export function Top10() {
  return (
    <LazyRow
      title="Top 10 today"
      query={q.trending('all', 'day')}
      limit={10}
      skeleton={Array.from({ length: 6 }, (_, i) => <Bone key={i} className="aspect-[2/3] w-[118px] shrink-0 rounded-2xl md:w-[150px]" />)}
      render={(m, i) => <RankCard key={typeOf(m) + m.id} item={m} rank={i + 1} />}
    />
  );
}

// ---------- Landscape backdrop cards ----------

function WideCard({ item, type }: { item: MediaItem; type: MediaType }) {
  return (
    <Link to={`/${type}/${item.id}`} {...usePrefetch(type, item.id)} className="group relative block w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl sm:w-[340px]" role="listitem">
      <Img path={item.backdrop_path} kind="backdrop" sizes="(min-width: 640px) 340px, 280px" alt="" className="aspect-video" imgClassName="transition-transform duration-300 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-4 bottom-3.5">
        <div className="truncate text-[15px] font-medium">{titleOf(item)}</div>
        <Meta year={yearOf(item)} rating={item.vote_average} className="text-white/70" extra={<span className="ml-auto"><TypeIcon type={type} /></span>} />
      </div>
    </Link>
  );
}

const wideSkeleton = Array.from({ length: 4 }, (_, i) => <Bone key={i} className="aspect-video w-[280px] shrink-0 rounded-2xl sm:w-[340px]" />);

export function InTheaters() {
  return <LazyRow title="In theaters" type="movie" query={q.list('movie', 'now_playing')} skeleton={wideSkeleton} render={(m) => <WideCard key={m.id} item={m} type="movie" />} />;
}

export function AiringThisWeek() {
  return <LazyRow title="Airing this week" type="tv" query={q.list('tv', 'on_the_air')} skeleton={wideSkeleton} render={(m) => <WideCard key={m.id} item={m} type="tv" />} />;
}

// ---------- Horizontal list cards: small poster + text ----------

function ListCard({ item, type }: { item: MediaItem; type: MediaType }) {
  return (
    <Link
      to={`/${type}/${item.id}`}
      {...usePrefetch(type, item.id)}
      className="group flex w-[300px] shrink-0 snap-start gap-3.5 rounded-2xl bg-surface p-2.5 transition hover:bg-raised sm:w-[360px]"
      role="listitem"
    >
      <Img path={item.poster_path} kind="poster" sizes="96px" alt="" className="aspect-[2/3] w-[84px] shrink-0 rounded-xl sm:w-24" />
      <div className="min-w-0 flex-1 py-1">
        <div className="line-clamp-1 text-[15px] font-medium">{titleOf(item)}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
          <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
          <span className="font-medium text-star">{item.vote_average.toFixed(1)}</span>
          <span className="text-faint">·</span>
          {yearOf(item)}
          <span className="ml-auto">
            <TypeIcon type={type} />
          </span>
        </div>
        <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-muted">{item.overview}</p>
      </div>
    </Link>
  );
}

export function TopRated() {
  return (
    <LazyRow
      title="Critically acclaimed"
      type="movie"
      query={q.list('movie', 'top_rated')}
      skeleton={Array.from({ length: 3 }, (_, i) => <Bone key={i} className="h-[150px] w-[300px] shrink-0 rounded-2xl sm:w-[360px]" />)}
      render={(m) => <ListCard key={m.id} item={m} type="movie" />}
    />
  );
}
