import { useState } from 'react';
import { Link } from 'react-router';
import AnimeCard from './AnimeCard';
import { Pill, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, useRowScroll } from './Row';
import { RowSkeleton } from './Skeletons';
import { HOME_ROWS, useAnimeHome, type HomeRow } from '../lib/anilist';
import { useInView } from '../lib/util';

const ORDER = Object.keys(HOME_ROWS) as HomeRow[];

/**
 * Anime on the home page, from AniList (every season, film and special, the way anime sites list
 * them): one row of posters, switched by pill like "Popular picks".
 */
export default function AnimeSection() {
  const [ref, inView] = useInView<HTMLElement>('500px');
  const rows = useAnimeHome(inView);
  const [row, setRow] = useState<HomeRow>('trending');
  const { ref: scrollRef, scroll } = useRowScroll();
  if (rows.isError) return null;
  const items = rows.data?.[row];
  const choose = (r: HomeRow) => {
    setRow(r);
    scrollRef.current?.scrollTo({ left: 0 });
  };
  return (
    <section ref={ref} data-testid="anime-section">
      <h2 className="mb-4 text-lg font-semibold tracking-tight md:text-xl">Anime</h2>
      <div className="mb-5 flex items-center gap-3">
        <div className="no-scrollbar scroll-row -ml-1 flex min-w-0 flex-1 gap-2.5 overflow-x-auto pr-10 pl-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]" role="group" aria-label="Anime">
          {ORDER.map((r) => (
            <Pill key={r} on={r === row} onClick={() => choose(r)}>
              {HOME_ROWS[r].title}
            </Pill>
          ))}
        </div>
        <RowArrows onScroll={scroll} />
      </div>
      {!items ? (
        <RowSkeleton />
      ) : (
        <Scroller label="Anime" scrollRef={scrollRef}>
          {items.map((a) => (
            <AnimeCard key={a.id} anime={a} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
          <Link
            to={row === 'films' ? '/discover?region=anime&type=movie' : '/discover?region=anime'}
            className="grid aspect-[2/3] w-[156px] shrink-0 snap-start place-items-center self-start rounded-2xl bg-surface text-body-sm text-muted transition hover:bg-raised hover:text-white sm:w-[190px] lg:w-[216px]"
          >
            See all
          </Link>
        </Scroller>
      )}
    </section>
  );
}
