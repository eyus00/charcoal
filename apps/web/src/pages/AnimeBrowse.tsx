import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Sparkles } from 'lucide-react';
import type { AnimeKind, AnimeSort } from '@charcoal/content';
import AnimeCard from '../components/AnimeCard';
import { ErrorBox, LoadMore } from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill } from '../components/Row';
import Segmented from '../components/Segmented';
import { CardSkeleton, GRID, GRID_SIZES, GridSkeleton } from '../components/Skeletons';
import { ANIME_SORTS, useAnimeList } from '../lib/anilist';
import type { AnimeAudio } from '../lib/anime';
import { actions, useStore } from '../lib/store';
import { useTitle } from '../lib/util';

const KINDS: { key: AnimeKind; label: string }[] = [
  { key: 'series', label: 'Series' },
  { key: 'film', label: 'Films' },
];
const AUDIO: { key: AnimeAudio; label: string }[] = [
  { key: 'sub', label: 'Sub' },
  { key: 'dub', label: 'Dub' },
];

/** Anime as series or films, from AniList: browsed by a sort, or searched by any of its names. */
export default function AnimeBrowse() {
  const [params, setParams] = useSearchParams();
  const kind: AnimeKind = params.get('type') === 'movie' ? 'film' : 'series';
  const sort: AnimeSort = ANIME_SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'popular';
  const query = (params.get('q') ?? '').trim();
  const audio = useStore((s) => s.settings.animeAudio);
  const name = kind === 'film' ? 'Films' : 'Series';
  useTitle(query ? `“${query}” · Anime` : `Anime ${name.toLowerCase()}`);

  const list = useAnimeList({ kind, sort, search: query });
  const items = useMemo(() => {
    const seen = new Set<number>();
    return (list.data?.pages.flatMap((p) => p.items) ?? []).filter((a) => !seen.has(a.id) && seen.add(a.id));
  }, [list.data]);

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="pb-10">
      <PageTitle
        title={query ? `“${query}”` : name}
        body={query ? `Anime ${name.toLowerCase()} matching your search, by English, romanised or Japanese name.` : 'Every entry AniList lists, one per season or film, the way anime sites number them.'}
        action={
          <div className="flex items-center gap-3 text-sm text-muted">
            <span aria-hidden>Audio</span>
            <Segmented value={audio} options={AUDIO} onChange={(v) => actions.updateSettings({ animeAudio: v })} label="Anime audio" />
          </div>
        }
      />
      <div className="mb-7 flex flex-wrap items-center gap-3 lg:gap-4">
        <Segmented value={kind} options={KINDS} onChange={(v) => set('type', v === 'film' ? 'movie' : 'tv', 'tv')} label="Show" />
        {/* A name search is ordered by how well it matches. */}
        {!query && (
          <div className="no-scrollbar scroll-row flex min-w-0 gap-2.5 overflow-x-auto" role="group" aria-label="Sort by">
            {ANIME_SORTS.map((s) => (
              <Pill key={s.key} on={sort === s.key} onClick={() => set('sort', s.key, 'popular')}>
                {s.label}
              </Pill>
            ))}
          </div>
        )}
      </div>

      {list.isPending ? (
        <GridSkeleton />
      ) : list.error && !items.length ? (
        <ErrorBox onRetry={() => list.refetch()} message={`Couldn’t load anime. ${list.error.message.replace(/\.$/, '')}.`} />
      ) : !items.length ? (
        query ? (
          <Empty icon={Sparkles} title={`No anime ${name.toLowerCase()} found for “${query}”`} body={`Try another spelling, the Japanese name, or look in ${kind === 'film' ? 'series' : 'films'}.`} />
        ) : (
          <Empty icon={Sparkles} title="No anime to show" body="Try another sort, or switch between series and films." />
        )
      ) : (
        <>
          <div className={GRID} data-testid="anime-grid">
            {items.map((a) => (
              <AnimeCard key={a.id} anime={a} sizes={GRID_SIZES} />
            ))}
            {list.isFetchingNextPage && Array.from({ length: 6 }, (_, i) => <CardSkeleton key={`s${i}`} />)}
          </div>
          {list.hasNextPage && <LoadMore onLoad={() => !list.isFetchingNextPage && list.fetchNextPage()} busy={list.isFetchingNextPage} />}
        </>
      )}
    </div>
  );
}
