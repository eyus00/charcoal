import { useCallback, useMemo } from 'react';
import { refine, useTaste, useTrending } from '../lib/recommend';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import EpisodeTile, { TILE, TileSkeleton } from './EpisodeTile';
import AiringTile, { AiringTileSkeleton } from './AiringTile';
import { startOfDay, useSchedule } from '../lib/schedule';
import { CARD_LIFT, Meta, usePrefetch } from './MediaCard';
import { ROW_BLEED, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import MediaCard from './MediaCard';
import { CardSkeleton } from './Skeletons';
import { cleanList, q, titleOf, typeOf, yearOf, type MediaItem, type MediaType } from '../lib/tmdb';
import { cx, useInView } from '../lib/util';

type Query = ReturnType<typeof q.trending> | ReturnType<typeof q.list>;

/** A titled, lazily-loaded horizontal row; `render` decides the card design. */
function LazyRow({
  title,
  query,
  type,
  limit = 20,
  skeleton,
  render,
  link,
  refine: refineFn,
  preset,
}: {
  link?: { to: string; label: string };
  /** Filter / re-rank the list (see lib/recommend). */
  refine?: (items: MediaItem[]) => MediaItem[];
  /** Items already at hand (no query). */
  preset?: MediaItem[] | null;
  title: string;
  query?: Query;
  type?: MediaType;
  limit?: number;
  skeleton: React.ReactNode;
  render: (m: MediaItem, i: number) => React.ReactNode;
}) {
  const [ref, inView] = useInView<HTMLElement>('500px');
  const { data: fetched, isError } = useQuery({ ...(query ?? { queryKey: ['none'], queryFn: () => null }), enabled: inView && !!query });
  const data = preset !== undefined ? (preset ? { results: preset } : undefined) : fetched;
  const items = useMemo(() => {
    const list = cleanList(data?.results ?? [], type).filter((m) => m.backdrop_path);
    return (refineFn ? refineFn(list) : list).slice(0, limit);
  }, [data, type, limit, refineFn]);
  const { ref: scrollRef, scroll } = useRowScroll();
  if (isError) return null;
  return (
    <section ref={ref}>
      <SectionHeader
        title={title}
        action={
          <div className="flex items-center gap-3">
            {link && (
              <Link to={link.to} className="text-sm text-muted transition-colors hover:text-white">
                {link.label}
              </Link>
            )}
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      {data ? (
        <Scroller label={title} scrollRef={scrollRef}>
          {items.map(render)}
        </Scroller>
      ) : (
        <div className={cx('flex gap-4 overflow-hidden', ROW_BLEED)}>{skeleton}</div>
      )}
    </section>
  );
}

// ---------- Top 10: landscape card with an outlined rank number on its bottom-right ----------

// Outlined digits need a font without overlapping contours: variable system fonts (SF on iPhones)
// draw stray lines inside the strokes, static Helvetica / Arial don't. The fill matches the page
// background so the part over the image reads like a cut-out.
const RANK_STYLE = {
  WebkitTextStroke: '2px rgb(255 255 255 / 0.85)',
  color: 'color-mix(in oklab, var(--color-bg) 55%, transparent)',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  textShadow: '0 4px 24px rgb(0 0 0 / 0.5)',
} as const;

function RankCard({ item, rank }: { item: MediaItem; rank: number }) {
  const t = typeOf(item);
  return (
    // Extra right margin leaves room for the number to leak past the card's edge.
    <div className={cx('group relative mr-3 shrink-0 snap-start md:mr-4', CARD_LIFT)}>
      <EpisodeTile
        still
        to={`/${t}/${item.id}`}
        type={t}
        title={`${rank}. ${titleOf(item)}`}
        linkProps={usePrefetch(t, item.id)}
        image={{ path: item.backdrop_path, kind: 'backdrop' }}
        playable={false}
        width="w-[248px] sm:w-[288px] lg:w-[312px]"
        primary={titleOf(item)}
        secondary={<Meta year={yearOf(item)} rating={item.vote_average} />}
      />
      {/* Bottom-right of the image, overlapping it and the card's edge. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 bottom-12 z-20 text-[96px] leading-[0.74] font-bold tracking-tighter select-none md:-right-4 md:text-[120px]"
        style={RANK_STYLE}
      >
        {rank}
      </span>
    </div>
  );
}

export function Top10() {
  const { items, isPending, isError } = useTrending();
  if (isError) return null;
  return (
    <LazyRow
      title="Top 10 today"
      preset={isPending ? null : items.map((r) => r.item)}
      limit={10}
      skeleton={Array.from({ length: 4 }, (_, i) => (
        <TileSkeleton key={i} className="mr-3 w-[248px] shrink-0 sm:w-[288px] md:mr-4 lg:w-[312px]" />
      ))}
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
  const taste = useTaste();
  const pick = useCallback((l: MediaItem[]) => refine(l, taste, 'movie'), [taste]);
  return (
    <LazyRow
      title="In theaters"
      type="movie"
      refine={pick}
      query={q.list('movie', 'now_playing')}
      skeleton={Array.from({ length: 4 }, (_, i) => (
        <TileSkeleton key={i} />
      ))}
      render={(m) => <TheaterTile key={m.id} item={m} />}
    />
  );
}

// ---------- Airing this week: the next episode of each notable show (lib/schedule) ----------

export function AiringThisWeek() {
  const [ref, inView] = useInView<HTMLElement>('500px');
  const start = useMemo(() => startOfDay(new Date()), []);
  const { items, isPending, isError } = useSchedule(start, 7, 8, inView);
  const { ref: scrollRef, scroll } = useRowScroll();
  // One card per show (its next episode); your shows first, then the most notable.
  const shows = useMemo(() => {
    const seen = new Set<number>();
    return items
      .filter((a) => a.kind === 'episode')
      .sort((a, b) => Number(b.yours) - Number(a.yours) || b.score - a.score)
      .filter((a) => !seen.has(a.id) && !!seen.add(a.id))
      .slice(0, 14);
  }, [items]);
  if (isError || (!isPending && !shows.length)) return null;
  return (
    <section ref={ref}>
      <SectionHeader
        title="Airing this week"
        action={
          <div className="flex items-center gap-3">
            <Link to="/calendar" className="text-sm text-muted transition-colors hover:text-white">
              Calendar
            </Link>
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      {isPending || !inView ? (
        <div className={cx('flex gap-4 overflow-hidden', ROW_BLEED)}>
          {Array.from({ length: 4 }, (_, i) => (
            <AiringTileSkeleton key={i} className={TILE} />
          ))}
        </div>
      ) : (
        <Scroller label="Airing this week" scrollRef={scrollRef}>
          {shows.map((a) => (
            <AiringTile key={a.key} a={a} className={TILE} />
          ))}
        </Scroller>
      )}
    </section>
  );
}

export function TopRated() {
  const taste = useTaste();
  const pick = useCallback((l: MediaItem[]) => refine(l, taste, 'movie', { popularity: 0.1 }), [taste]);
  return (
    <LazyRow
      title="Critically acclaimed"
      type="movie"
      refine={pick}
      query={q.list('movie', 'top_rated')}
      skeleton={Array.from({ length: 7 }, (_, i) => (
        <CardSkeleton key={i} className={ROW_ITEM} />
      ))}
      render={(m) => <MediaCard key={m.id} item={m} type="movie" sizes={ROW_SIZES} className={ROW_ITEM} />}
    />
  );
}
