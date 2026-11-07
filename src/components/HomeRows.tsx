import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Film, Play, Star, Tv } from 'lucide-react';
import Img from './Img';
import { Meta, usePrefetch } from './MediaCard';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { Bone } from './Skeletons';
import { cleanList, q, titleOf, typeOf, yearOf, type Details, type EpisodeRef, type MediaItem, type MediaType } from '../lib/tmdb';
import { cx, formatDate, isFuture, useInView } from '../lib/util';

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

/** Title, ★ rating · year · type, overview: shared by list-style cards. */
function CardText({ item, type }: { item: MediaItem; type: MediaType }) {
  return (
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
  );
}

const LIST_CARD = 'group flex w-[300px] shrink-0 snap-start gap-3.5 rounded-2xl bg-surface p-2.5 transition hover:bg-raised sm:w-[360px]';
const listSkeleton = (n: number, extra = '') =>
  Array.from({ length: n }, (_, i) => <Bone key={i} className={'h-[150px] w-[300px] shrink-0 rounded-2xl sm:h-[164px] sm:w-[360px] ' + extra} />);

// ---------- Top 10: big outlined rank number + list card ----------

function RankCard({ item, rank }: { item: MediaItem; rank: number }) {
  const t = typeOf(item);
  return (
    <Link to={`/${t}/${item.id}`} {...usePrefetch(t, item.id)} className="group flex shrink-0 snap-start items-center" role="listitem" aria-label={`${rank}. ${titleOf(item)}`}>
      <span
        aria-hidden
        className="-mr-3 w-[0.62em] shrink-0 text-center text-[96px] leading-none font-black tracking-tighter text-transparent select-none md:text-[120px]"
        style={{ WebkitTextStroke: '2px rgb(255 255 255 / 0.28)' }}
      >
        {rank}
      </span>
      <div className={cx(LIST_CARD, 'relative')}>
        <Img path={item.poster_path} kind="poster" sizes="96px" alt="" className="aspect-[2/3] w-[84px] shrink-0 rounded-xl sm:w-24" />
        <CardText item={item} type={t} />
      </div>
    </Link>
  );
}

export function Top10() {
  return (
    <LazyRow
      title="Top 10 today"
      query={q.trending('all', 'day')}
      limit={10}
      skeleton={listSkeleton(3, 'ml-14')}
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

// ---------- Airing this week: the latest / upcoming episode of each show ----------

const DAY = 86_400_000;
const dayOf = (d: string) => new Date(d + 'T00:00:00').getTime();

/** The episode worth showing: one airing in the next week, else the latest aired one. */
function pickEpisode(d: Details): EpisodeRef | null {
  const next = d.next_episode_to_air;
  if (next?.air_date && dayOf(next.air_date) - Date.now() < 7 * DAY) return next;
  return d.last_episode_to_air ?? next ?? null;
}

function airLabel(date?: string) {
  if (!date) return '';
  const days = Math.round((dayOf(date) - dayOf(new Date().toLocaleDateString('en-CA'))) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return 'Airs ' + new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' });
  return (days > 0 ? 'Airs ' : '') + formatDate(date);
}

/** Skip placeholder names like "Episode 5" or "November 10, 2026". */
const realName = (n?: string) => !!n && !/^Episode \d+$/i.test(n) && !(/\d{4}/.test(n) && !Number.isNaN(Date.parse(n)));

function AiringCard({ show }: { show: MediaItem }) {
  const { data } = useQuery(q.details('tv', show.id));
  const ep = data ? pickEpisode(data) : null;
  const upcoming = isFuture(ep?.air_date);
  const label = airLabel(ep?.air_date);
  const href = ep ? `/tv/${show.id}?episodes=${ep.season_number}` : `/tv/${show.id}`;
  return (
    <Link to={href} {...usePrefetch('tv', show.id)} className="group block w-[280px] shrink-0 snap-start sm:w-[320px]" role="listitem">
      <div className="relative overflow-hidden rounded-2xl">
        <Img
          path={ep?.still_path || show.backdrop_path}
          kind={ep?.still_path ? 'still' : 'backdrop'}
          sizes="(min-width: 640px) 320px, 280px"
          alt=""
          className="aspect-video"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {!upcoming && (
          <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
            <span className="grid size-11 place-items-center rounded-full bg-white text-black">
              <Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
            </span>
          </span>
        )}
        {label && (
          <span className={cx('absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-xs', upcoming ? 'bg-white font-medium text-black' : 'bg-black/60 backdrop-blur-sm')}>{label}</span>
        )}
        {ep?.runtime ? <span className="absolute right-2.5 bottom-2.5 rounded-full bg-black/60 px-2.5 py-1 text-xs backdrop-blur-sm">{ep.runtime}m</span> : null}
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="truncate text-[15px] font-medium text-white/95">
          {ep ? (
            <>
              <span className="text-muted">
                S{ep.season_number} · E{ep.episode_number}
              </span>
              {realName(ep.name) ? <> &nbsp;{ep.name}</> : null}
            </>
          ) : (
            <Bone className="mt-1 h-3.5 w-2/3" />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted">
          <Tv className="size-3.5 shrink-0 text-faint" aria-hidden />
          <span className="truncate">{titleOf(show)}</span>
        </div>
      </div>
    </Link>
  );
}

export function AiringThisWeek() {
  return (
    <LazyRow
      title="Airing this week"
      type="tv"
      limit={12}
      query={q.list('tv', 'on_the_air')}
      skeleton={Array.from({ length: 4 }, (_, i) => <Bone key={i} className="aspect-video w-[280px] shrink-0 rounded-2xl sm:w-[320px]" />)}
      render={(m) => <AiringCard key={m.id} show={m} />}
    />
  );
}

// ---------- Horizontal list cards: small poster + text ----------

function ListCard({ item, type }: { item: MediaItem; type: MediaType }) {
  return (
    <Link to={`/${type}/${item.id}`} {...usePrefetch(type, item.id)} className={LIST_CARD} role="listitem">
      <Img path={item.poster_path} kind="poster" sizes="96px" alt="" className="aspect-[2/3] w-[84px] shrink-0 rounded-xl sm:w-24" />
      <CardText item={item} type={type} />
    </Link>
  );
}

export function TopRated() {
  return (
    <LazyRow
      title="Critically acclaimed"
      type="movie"
      query={q.list('movie', 'top_rated')}
      skeleton={listSkeleton(3)}
      render={(m) => <ListCard key={m.id} item={m} type="movie" />}
    />
  );
}
