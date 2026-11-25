import { useMemo } from 'react';
import { Link } from 'react-router';
import AnimeCard from '../components/AnimeCard';
import AnimeShelfRow from '../components/AnimeShelfRow';
import ContinueWatching from '../components/ContinueWatching';
import { ErrorBox } from '../components/Grid';
import Hero from '../components/Hero';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from '../components/Row';
import { RowSkeleton } from '../components/Skeletons';
import type { AnimeCard as AnimeEntry } from '@charcoal/content';
import { HOME_ROWS, useAnimeHome, type HomeRow } from '../lib/anilist';
import { ANIMATION_GENRE } from '../lib/anime';
import { useLanguageDiscover } from '../lib/browse';
import { continueWatching, useStore } from '../lib/store';
import { cleanList } from '../lib/tmdb';
import { useTitle } from '../lib/util';

const browseUrl = (row: HomeRow) => {
  const { kind, sort } = HOME_ROWS[row].query;
  const params = new URLSearchParams();
  if (kind === 'film') params.set('type', 'movie');
  if (sort !== 'popular') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/anime/browse?${qs}` : '/anime/browse';
};

/**
 * Anime's home. The rows are AniList's lists (every entry, the way anime sites list them). The
 * banner is the one thing still from TMDB: it needs wide artwork and a title page to open, and
 * shows series from the last year and a half that people are watching.
 */
export default function Anime() {
  useTitle('Anime');
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history.filter((h) => h.anime)).slice(0, 15), [history]);
  const featured = useLanguageDiscover({ language: 'ja', genre: ANIMATION_GENRE, type: 'tv', sort: 'popular', recentDays: 540 });
  const titles = useMemo(() => cleanList(featured.data?.pages[0]?.results ?? [], 'tv'), [featured.data]);
  const rows = useAnimeHome();
  return (
    <div className="space-y-10 pb-10 md:space-y-12">
      <Hero titles={titles} isError={featured.isError} label="New and popular anime" />
      {resume.length > 0 && <ContinueWatching items={resume} />}
      <AnimeShelfRow title={resume.length ? 'More to continue' : 'Continue watching'} show="watching" />
      {rows.error && !rows.data ? (
        <ErrorBox onRetry={() => rows.refetch()} message="Couldn’t load the anime lists. AniList didn’t answer; try again in a moment." />
      ) : (
        (Object.keys(HOME_ROWS) as HomeRow[]).map((row) => <AnimeRow key={row} row={row} items={rows.data?.[row]} />)
      )}
    </div>
  );
}

function AnimeRow({ row, items }: { row: HomeRow; items: AnimeEntry[] | undefined }) {
  const { title, query } = HOME_ROWS[row];
  const { ref, scroll } = useRowScroll();
  // A row with nothing in it simply isn't there.
  if (items && !items.length) return null;
  return (
    <section>
      <SectionHeader
        title={title}
        action={
          <div className="flex items-center gap-3">
            {/* "Airing" is a filter the browse page doesn't have: no list to open for it. */}
            {!('airing' in query) && (
              <Link to={browseUrl(row)} className="text-sm text-muted transition-colors hover:text-white">
                See all
              </Link>
            )}
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      {items ? (
        <Scroller label={title} scrollRef={ref}>
          {items.map((a) => (
            <AnimeCard key={a.id} anime={a} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
        </Scroller>
      ) : (
        <RowSkeleton />
      )}
    </section>
  );
}
