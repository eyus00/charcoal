import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Img from './Img';
import EpisodeTile, { Chip, TileSkeleton } from './EpisodeTile';
import { Meta, TypeIcon, usePrefetch } from './MediaCard';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { Bone } from './Skeletons';
import { cleanList, q, titleOf, typeOf, yearOf, type Details, type EpisodeRef, type MediaItem, type MediaType } from '../lib/tmdb';
import { cx, formatDate, formatRuntime, isFuture, useInView } from '../lib/util';

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

/** Title, a short overview, then "year · ★ rating" with the type icon bottom-right. */
function CardText({ item, type, big }: { item: MediaItem; type: MediaType; big?: boolean }) {
  return (
    <div className={cx(LIST_INFO, 'flex min-w-0 flex-1 flex-col px-3.5 py-3', big && 'lg:px-4 lg:py-3.5')}>
      <div className={cx('line-clamp-1 text-[15px] leading-5 font-medium', big && 'lg:text-base lg:leading-6')}>{titleOf(item)}</div>
      <p className={cx('mt-1.5 line-clamp-4 text-[13px] leading-[18px] text-muted', big && 'lg:line-clamp-5 lg:text-sm lg:leading-5')}>{item.overview}</p>
      <Meta year={yearOf(item)} rating={item.vote_average} className="mt-auto pt-2" extra={<TypeIcon type={type} />} />
    </div>
  );
}

// Poster on the left, bordered info area on the right (the poster itself has no border).
const LIST_CARD = 'group flex w-[304px] shrink-0 snap-start sm:w-[336px]';
const LIST_POSTER = 'aspect-[2/3] w-[104px] shrink-0 rounded-l-2xl';
const LIST_INFO = 'rounded-r-2xl border border-l-0 border-white/[0.08] transition group-hover:border-white/20';
const listSkeleton = (n: number, extra = '') =>
  Array.from({ length: n }, (_, i) => <Bone key={i} className={'h-[156px] w-[304px] shrink-0 rounded-2xl sm:w-[336px] ' + extra} />);

// ---------- Top 10, as a row (below xl): big outlined rank number + list card ----------

const OUTLINE = { WebkitTextStroke: '2px rgb(255 255 255 / 0.28)' } as const;

function RankCard({ item, rank }: { item: MediaItem; rank: number }) {
  const t = typeOf(item);
  return (
    <Link to={`/${t}/${item.id}`} {...usePrefetch(t, item.id)} className="group flex shrink-0 snap-start items-center" role="listitem" aria-label={`${rank}. ${titleOf(item)}`}>
      <span aria-hidden className="-mr-3 w-[0.62em] shrink-0 text-center text-[104px] leading-none font-black tracking-tighter text-transparent select-none md:text-[124px] lg:-mr-4 lg:text-[160px]" style={OUTLINE}>
        {rank}
      </span>
      {/* Bigger on desktop: the Top 10 is the home page's showcase row. */}
      <div className={cx(LIST_CARD, 'lg:w-[408px]')}>
        <Img path={item.poster_path} kind="poster" sizes="(min-width: 1024px) 136px, 104px" alt="" className={cx(LIST_POSTER, 'lg:w-[136px]')} />
        <CardText item={item} type={t} big />
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
      skeleton={listSkeleton(4, 'ml-12 lg:h-[204px] lg:w-[408px]')}
      render={(m, i) => <RankCard key={typeOf(m) + m.id} item={m} rank={i + 1} />}
    />
  );
}

// ---------- Landscape backdrop cards ----------

function TheaterTile({ item }: { item: MediaItem }) {
  return (
    <EpisodeTile
      to={`/movie/${item.id}`}
      type="movie"
      linkProps={usePrefetch('movie', item.id)}
      image={{ path: item.backdrop_path, kind: 'backdrop' }}
      playable={false}
      primary={titleOf(item)}
      secondary={<Meta year={yearOf(item)} rating={item.vote_average} />}
    />
  );
}

export function InTheaters() {
  return (
    <LazyRow
      title="In theaters"
      type="movie"
      query={q.list('movie', 'now_playing')}
      skeleton={Array.from({ length: 4 }, (_, i) => <TileSkeleton key={i} />)}
      render={(m) => <TheaterTile key={m.id} item={m} />}
    />
  );
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

function AiringCard({ show }: { show: MediaItem }) {
  const { data } = useQuery(q.details('tv', show.id));
  const ep = data ? pickEpisode(data) : null;
  const upcoming = isFuture(ep?.air_date);
  const label = airLabel(ep?.air_date);
  return (
    <EpisodeTile
      to={ep ? `/tv/${show.id}?episodes=${ep.season_number}` : `/tv/${show.id}`}
      type="tv"
      linkProps={usePrefetch('tv', show.id)}
      image={{ path: ep?.still_path || show.backdrop_path, kind: ep?.still_path ? 'still' : 'backdrop' }}
      playable={!upcoming}
      topLeft={label && <Chip light={upcoming}>{label}</Chip>}
      bottomRight={ep?.runtime ? <Chip>{formatRuntime(ep.runtime)}</Chip> : null}
      primary={
        ep ? (
          <>
            <span className="text-muted">
              S{ep.season_number} · E{ep.episode_number}
            </span>
            {ep.name ? <> &nbsp;{ep.name}</> : null}
          </>
        ) : (
          <Bone className="mt-1 h-3.5 w-2/3" />
        )
      }
      secondary={titleOf(show)}
    />
  );
}

export function AiringThisWeek() {
  return (
    <LazyRow
      title="Airing this week"
      type="tv"
      limit={12}
      query={q.list('tv', 'on_the_air')}
      skeleton={Array.from({ length: 4 }, (_, i) => <TileSkeleton key={i} />)}
      render={(m) => <AiringCard key={m.id} show={m} />}
    />
  );
}

// ---------- Horizontal list cards: small poster + text ----------

function ListCard({ item, type }: { item: MediaItem; type: MediaType }) {
  return (
    <Link to={`/${type}/${item.id}`} {...usePrefetch(type, item.id)} className={LIST_CARD} role="listitem">
      <Img path={item.poster_path} kind="poster" sizes="104px" alt="" className={LIST_POSTER} />
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
      skeleton={listSkeleton(4)}
      render={(m) => <ListCard key={m.id} item={m} type="movie" />}
    />
  );
}
