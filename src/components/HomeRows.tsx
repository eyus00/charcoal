import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Img from './Img';
import EpisodeTile, { Chip, TileSkeleton } from './EpisodeTile';
import { Meta, TypeIcon, usePrefetch } from './MediaCard';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { Bone } from './Skeletons';
import { genreName } from '../lib/filters';
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

const genresOf = (m: MediaItem, t: MediaType, n = 2) =>
  (m.genre_ids ?? []).map((g) => genreName(t, g)).filter(Boolean).slice(0, n).join(', ');

/** Title, genres, a 3-line overview, then "year · ★ rating" with the type icon bottom-right. */
function CardText({ item, type }: { item: MediaItem; type: MediaType }) {
  const genres = genresOf(item, type);
  return (
    <div className={cx(LIST_INFO, 'flex min-w-0 flex-1 flex-col px-3.5 py-3')}>
      <div className="line-clamp-1 text-[15px] leading-5 font-medium">{titleOf(item)}</div>
      {genres && <div className="mt-0.5 truncate text-xs text-faint">{genres}</div>}
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-[18px] text-muted">{item.overview}</p>
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
      <span aria-hidden className="-mr-3 w-[0.62em] shrink-0 text-center text-[104px] leading-none font-black tracking-tighter text-transparent select-none md:text-[124px]" style={OUTLINE}>
        {rank}
      </span>
      <div className={LIST_CARD}>
        <Img path={item.poster_path} kind="poster" sizes="104px" alt="" className={LIST_POSTER} />
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
      skeleton={listSkeleton(4, 'ml-12')}
      render={(m, i) => <RankCard key={typeOf(m) + m.id} item={m} rank={i + 1} />}
    />
  );
}

// ---------- Top 10, as a vertical chart (xl side column) ----------

export function Top10Chart() {
  const { data, isError } = useQuery(q.trending('all', 'day'));
  const items = useMemo(() => cleanList(data?.results ?? []).filter((m) => m.backdrop_path).slice(0, 10), [data]);
  if (isError) return null;
  const [first, ...rest] = items;
  return (
    <section aria-label="Top 10 today">
      <SectionHeader title="Top 10 today" />
      {!first ? (
        <div className="space-y-3">
          <Bone className="aspect-video rounded-2xl" />
          {Array.from({ length: 5 }, (_, i) => <Bone key={i} className="h-[88px] rounded-2xl" />)}
        </div>
      ) : (
        <ol className="space-y-1">
          <li>
            <ChartLead item={first} />
          </li>
          {rest.map((m, i) => (
            <li key={typeOf(m) + m.id}>
              <ChartRow item={m} rank={i + 2} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ChartLead({ item }: { item: MediaItem }) {
  const t = typeOf(item);
  return (
    <Link to={`/${t}/${item.id}`} {...usePrefetch(t, item.id)} className="group relative mb-2 block overflow-hidden rounded-2xl" aria-label={`1. ${titleOf(item)}`}>
      <Img path={item.backdrop_path} kind="backdrop" sizes="340px" alt="" className="aspect-video" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
        <span aria-hidden className="text-[72px] leading-[0.75] font-black tracking-tighter text-transparent" style={{ WebkitTextStroke: '2px rgb(255 255 255 / 0.7)' }}>
          1
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{titleOf(item)}</div>
          <Meta year={yearOf(item)} rating={item.vote_average} className="text-white/70" extra={<TypeIcon type={t} className="text-white/60" />} />
        </div>
      </div>
    </Link>
  );
}

function ChartRow({ item, rank }: { item: MediaItem; rank: number }) {
  const t = typeOf(item);
  return (
    <Link to={`/${t}/${item.id}`} {...usePrefetch(t, item.id)} className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/[0.04]" aria-label={`${rank}. ${titleOf(item)}`}>
      <span aria-hidden className="w-9 shrink-0 text-center text-[34px] leading-none font-black tracking-tighter text-transparent" style={OUTLINE}>
        {rank}
      </span>
      <Img path={item.poster_path} kind="poster" sizes="48px" alt="" className="aspect-[2/3] w-12 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{titleOf(item)}</div>
        <div className="truncate text-xs text-faint">{genresOf(item, t) || (t === 'tv' ? 'Series' : 'Movie')}</div>
        <Meta year={yearOf(item)} rating={item.vote_average} className="mt-1" extra={<TypeIcon type={t} />} />
      </div>
    </Link>
  );
}

// ---------- Coming soon: a short release calendar ----------

export function ComingSoon() {
  const [ref, inView] = useInView<HTMLElement>('400px');
  const { data, isError } = useQuery({ ...q.upcoming(), enabled: inView });
  const items = useMemo(
    () =>
      cleanList(data?.results ?? [], 'movie')
        .filter((m) => isFuture(m.release_date))
        .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
        .slice(0, 7),
    [data],
  );
  if (isError || (data && !items.length)) return null;
  return (
    <section ref={ref} aria-label="Coming soon">
      <SectionHeader title="Coming soon" />
      <ul className="grid gap-1 md:grid-cols-2 xl:grid-cols-1">
        {!data
          ? Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-[72px] rounded-2xl" />)
          : items.map((m) => (
              <li key={m.id}>
                <SoonRow item={m} />
              </li>
            ))}
      </ul>
    </section>
  );
}

function SoonRow({ item }: { item: MediaItem }) {
  const d = new Date((item.release_date ?? '') + 'T00:00:00');
  return (
    <Link to={`/movie/${item.id}`} {...usePrefetch('movie', item.id)} className="group flex items-center gap-3.5 rounded-2xl p-2 transition hover:bg-white/[0.04]">
      <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-surface py-1.5 ring-1 ring-white/[0.06]">
        <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
        <span className="text-lg leading-6 font-semibold tabular-nums">{d.getDate()}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{titleOf(item)}</div>
        <div className="truncate text-xs text-faint">{genresOf(item, 'movie') || 'Movie'}</div>
      </div>
      <Img path={item.poster_path} kind="poster" sizes="40px" alt="" className="aspect-[2/3] w-10 shrink-0 rounded-md" />
    </Link>
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
