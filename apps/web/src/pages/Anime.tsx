import { useMemo } from 'react';
import { Link } from 'react-router';
import ContinueWatching from '../components/ContinueWatching';
import Hero from '../components/Hero';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from '../components/Row';
import { RowSkeleton } from '../components/Skeletons';
import { ANIMATION_GENRE } from '../lib/anime';
import { useLanguageDiscover, type LanguageBrowse } from '../lib/browse';
import { continueWatching, useStore } from '../lib/store';
import { cleanList, type MediaType } from '../lib/tmdb';
import { useInView, useTitle } from '../lib/util';

type RowQuery = Pick<LanguageBrowse, 'type' | 'sort' | 'airing' | 'recentDays' | 'byVotes'>;

const browseUrl = ({ type, sort }: RowQuery) => {
  const params = new URLSearchParams();
  if (type === 'movie') params.set('type', 'movie');
  if (sort !== 'popular') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/anime/browse?${qs}` : '/anime/browse';
};

/** The banner: series from the last year and a half that people are watching now. */
const FEATURED: RowQuery = { type: 'tv', sort: 'popular', recentDays: 540 };

/** What the rows below the banner show, top to bottom. `all` links to the same list on the browse page. */
const ROWS: { title: string; query: RowQuery; all?: boolean }[] = [
  { title: 'Airing this week', query: { type: 'tv', sort: 'popular', airing: true, byVotes: true } },
  { title: 'New this season', query: { type: 'tv', sort: 'popular', recentDays: 120 } },
  { title: 'Popular series', query: { type: 'tv', sort: 'popular', byVotes: true }, all: true },
  { title: 'Top rated series', query: { type: 'tv', sort: 'rating' }, all: true },
  { title: 'Popular films', query: { type: 'movie', sort: 'popular' }, all: true },
  { title: 'Top rated films', query: { type: 'movie', sort: 'rating' }, all: true },
];

const useAnimeList = (query: RowQuery, enabled = true) => useLanguageDiscover({ language: 'ja', genre: ANIMATION_GENRE, ...query }, enabled);
const firstPage = (data: ReturnType<typeof useAnimeList>['data'], type: MediaType) => cleanList(data?.pages[0]?.results ?? [], type);

/** Anime's home: what is popular now, what you were watching, and rows into the catalogue. */
export default function Anime() {
  useTitle('Anime');
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history.filter((h) => h.anime)).slice(0, 15), [history]);
  const featured = useAnimeList(FEATURED);
  const titles = useMemo(() => firstPage(featured.data, 'tv'), [featured.data]);
  return (
    <div className="space-y-10 pb-10 md:space-y-12">
      <Hero titles={titles} isError={featured.isError} label="New and popular anime" />
      {resume.length > 0 && <ContinueWatching items={resume} />}
      {ROWS.map((row) => (
        <AnimeRow key={row.title} {...row} />
      ))}
    </div>
  );
}

/** A row of posters, asked for only once it is near the screen. */
function AnimeRow({ title, query, all }: (typeof ROWS)[number]) {
  const [ref, inView] = useInView<HTMLElement>('500px');
  const list = useAnimeList(query, inView);
  const items = useMemo(() => firstPage(list.data, query.type).slice(0, 20), [list.data, query.type]);
  const { ref: scrollRef, scroll } = useRowScroll();
  // A row that failed or has nothing in it (a quiet week) simply isn't there.
  if (list.isError || (list.data && !items.length)) return null;
  return (
    <section ref={ref}>
      <SectionHeader
        title={title}
        action={
          <div className="flex items-center gap-3">
            {all && (
              <Link to={browseUrl(query)} className="text-sm text-muted transition-colors hover:text-white">
                See all
              </Link>
            )}
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      {list.data ? (
        <Scroller label={title} scrollRef={scrollRef}>
          {items.map((m) => (
            <MediaCard key={m.id} item={m} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
        </Scroller>
      ) : (
        <RowSkeleton />
      )}
    </section>
  );
}
