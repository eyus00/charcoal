import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Sparkles } from 'lucide-react';
import Grid from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill } from '../components/Row';
import Segmented from '../components/Segmented';
import { ANIMATION_GENRE, looksLikeAnime, type AnimeAudio } from '../lib/anime';
import { useLanguageDiscover, useLanguageSearch } from '../lib/browse';
import { SORTS, type SortKey } from '../lib/filters';
import { actions, useStore } from '../lib/store';
import { cleanList, type MediaType } from '../lib/tmdb';
import { useTitle } from '../lib/util';

const TYPES: { key: MediaType; label: string }[] = [
  { key: 'tv', label: 'Series' },
  { key: 'movie', label: 'Films' },
];
const AUDIO: { key: AnimeAudio; label: string }[] = [
  { key: 'sub', label: 'Sub' },
  { key: 'dub', label: 'Dub' },
];

const JAPANESE = ['ja'];

/** Anime as series or films: TMDB's animation made in Japanese, browsed or searched by name. */
export default function AnimeBrowse() {
  const [params, setParams] = useSearchParams();
  const type: MediaType = params.get('type') === 'movie' ? 'movie' : 'tv';
  const sort: SortKey = SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'popular';
  const query = (params.get('q') ?? '').trim();
  const audio = useStore((s) => s.settings.animeAudio);
  const kind = type === 'movie' ? 'Films' : 'Series';
  useTitle(query ? `“${query}” · Anime` : `Anime ${kind.toLowerCase()}`);

  // Series: "Popular" counts ratings (see LanguageBrowse.byVotes); the home page's row is the same list.
  const browse = useLanguageDiscover({ language: 'ja', type, sort, genre: ANIMATION_GENRE, byVotes: type === 'tv' }, !query);
  const search = useLanguageSearch(query, type, JAPANESE);
  const list = query ? search : browse;
  const items = useMemo(() => {
    const all = cleanList(list.data?.pages.flatMap((p) => p.results) ?? [], type);
    // A name search covers everything Japanese; only the animation is anime.
    return query ? all.filter(looksLikeAnime) : all;
  }, [list.data, type, query]);

  // A search can fill whole pages with live-action titles: keep going until something shows.
  const searchedEmpty = !!query && items.length === 0 && !!list.hasNextPage && (list.data?.pages.length ?? 0) < 5;
  const { isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (searchedEmpty && !isFetchingNextPage) fetchNextPage();
  }, [searchedEmpty, isFetchingNextPage, fetchNextPage]);

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="pb-10">
      <PageTitle
        title={query ? `“${query}”` : kind}
        body={query ? `Anime ${kind.toLowerCase()} matching your search.` : 'Episodes are matched to their AniList entries, so sources that number anime their own way are searched too.'}
        action={
          <div className="flex items-center gap-3 text-sm text-muted">
            <span aria-hidden>Audio</span>
            <Segmented value={audio} options={AUDIO} onChange={(v) => actions.updateSettings({ animeAudio: v })} label="Anime audio" />
          </div>
        }
      />
      <div className="mb-7 flex flex-wrap items-center gap-3 lg:gap-4">
        <Segmented value={type} options={TYPES} onChange={(v) => set('type', v, 'tv')} label="Show" />
        {/* A name search is ordered by how well it matches. */}
        {!query && (
          <div className="no-scrollbar scroll-row flex min-w-0 gap-2.5 overflow-x-auto" role="group" aria-label="Sort by">
            {SORTS.map((s) => (
              <Pill key={s.key} on={sort === s.key} onClick={() => set('sort', s.key, 'popular')}>
                {s.label}
              </Pill>
            ))}
          </div>
        )}
      </div>

      <Grid
        items={items}
        type={type}
        loading={list.isPending || searchedEmpty}
        error={list.error}
        onRetry={() => list.refetch()}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => !list.isFetchingNextPage && list.fetchNextPage()}
        empty={
          query ? (
            <Empty icon={Sparkles} title={`No anime ${kind.toLowerCase()} found for “${query}”`} body={`Try another spelling, the Japanese name, or look in ${type === 'movie' ? 'series' : 'films'}.`} />
          ) : (
            <Empty icon={Sparkles} title="No anime to show" body="Try another sort, or switch between series and films." />
          )
        }
      />
    </div>
  );
}
