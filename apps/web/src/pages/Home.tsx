import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Clapperboard } from 'lucide-react';
import ContinueWatching from '../components/ContinueWatching';
import Hero from '../components/Hero';
import { AiringThisWeek, InTheaters, Top10, TopRated } from '../components/HomeRows';
import { ForYouRow } from '../components/TraktRows';
import MediaCard from '../components/MediaCard';
import { Pill, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, useRowScroll } from '../components/Row';
import { RowSkeleton } from '../components/Skeletons';
import { EMPTY_FILTERS, GENRES } from '../lib/filters';
import { continueWatching, useStore } from '../lib/store';
import { cleanList, typeOf } from '../lib/tmdb';
import { useTitle } from '../lib/util';
import { useDiscover } from '../lib/browse';
import { refine, useTaste, useTrending } from '../lib/recommend';

export default function Home() {
  useTitle();
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history).slice(0, 15), [history]);
  // Trending now, from TMDB + Trakt, filtered and ranked for you (lib/recommend).
  const trending = useTrending();
  const titles = useMemo(() => trending.items.map((r) => r.item), [trending.items]);
  return (
    <div className="space-y-10 md:space-y-12">
      <Hero titles={titles} isError={trending.isError} label="Trending today" />
      {resume.length > 0 && <ContinueWatching items={resume} />}
      <ForYouRow />
      <Top10 />
      <Browse />
      <IndianCinema />
      <AiringThisWeek />
      <InTheaters />
      <TopRated />
    </div>
  );
}

// ---------- Indian cinema: in the sidebar on wide screens, a card here below them ----------

function IndianCinema() {
  return (
    <Link to="/indian" className="group flex items-center gap-3.5 rounded-2xl bg-surface p-4 transition-colors hover:bg-raised lg:hidden">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 transition-colors group-hover:bg-white group-hover:text-black">
        <Clapperboard className="size-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium">Indian cinema</span>
        <span className="block truncate text-caption text-muted">Hindi, Tamil, Telugu, Malayalam and more</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-faint" strokeWidth={1.5} />
    </Link>
  );
}

// ---------- genre pills + poster row ----------

const CATEGORIES = ['trending', 'action', 'comedy', 'drama', 'scifi', 'horror', 'animation'];

function Browse() {
  const [params, setParams] = useSearchParams();
  const cat = CATEGORIES.includes(params.get('cat') ?? '') ? params.get('cat')! : 'trending';
  const { ref, scroll } = useRowScroll();
  const trending = useTrending();
  const taste = useTaste();
  const discover = useDiscover({ ...EMPTY_FILTERS, genres: [cat] }, cat !== 'trending');
  // Genre tabs: TMDB's popular titles in that genre, filtered and re-ranked for you.
  const items = useMemo(
    () => (cat === 'trending' ? trending.items.map((r) => r.item) : refine(cleanList(discover.data?.pages[0]?.results ?? []), taste)).slice(0, 20),
    [cat, trending.items, discover.data, taste],
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
        <div
          className="no-scrollbar scroll-row -ml-1 flex min-w-0 flex-1 gap-2.5 overflow-x-auto pr-10 pl-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
          role="group"
          aria-label="Categories"
        >
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
            className="grid w-[156px] shrink-0 snap-start place-items-center self-start aspect-[2/3] rounded-2xl bg-surface text-body-sm text-muted transition hover:bg-raised hover:text-white sm:w-[190px] lg:w-[216px]"
          >
            See all
          </Link>
        </Scroller>
      )}
    </section>
  );
}
