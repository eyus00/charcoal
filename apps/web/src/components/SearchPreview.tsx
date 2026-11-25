import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Film, Radio, Sparkles, Tv } from 'lucide-react';
import { fetchAnimeList, listingState, matchesListing, type AnimeCard, type LiveListing } from '@charcoal/content';
import { FORMAT_LABEL } from '../lib/anilist';
import { webFetcher } from '../lib/content';
import { imageUrl } from '../lib/images';
import { localStart, useDirectory } from '../lib/sports';
import { cleanList, titleOf, tmdb, typeOf, yearOf, type MediaItem, type Page } from '../lib/tmdb';
import { cx } from '../lib/util';

/** How many of each kind fit in a preview. */
const EACH = 4;

/**
 * What a search would find, shown under the field while typing: movies and TV shows, anime, and
 * sports, whichever part of Charcoal you are in. The part you are in comes first. Enter (or "See
 * all") still opens that part's full results.
 */
export default function SearchPreview({ query, first, onPick, onAll }: { query: string; first: 'screen' | 'anime' | 'sports'; onPick: () => void; onAll: () => void }) {
  const titles = useQuery({
    queryKey: ['preview-titles', query],
    queryFn: async ({ signal }) => cleanList((await tmdb<Page<MediaItem>>('/search/multi', { query, include_adult: 'false' }, signal)).results).slice(0, EACH),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const anime = useQuery({
    queryKey: ['preview-anime', query],
    queryFn: async ({ signal }) => (await fetchAnimeList(webFetcher, { search: query, perPage: EACH }, signal)).items,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const directory = useDirectory();
  const now = Date.now();
  const sports = (directory.data?.listings ?? [])
    .filter((l) => matchesListing(l, query) && listingState(l, now) !== 'ended')
    .sort((a, b) => Number(listingState(b, now) === 'live') - Number(listingState(a, now) === 'live') || a.startsAt - b.startsAt)
    .slice(0, EACH);

  const sections = {
    screen: <Section key="screen" title="Movies and TV" loading={titles.isPending} empty={!titles.data?.length}>{titles.data?.map((m) => <TitleRow key={typeOf(m) + m.id} m={m} onPick={onPick} />)}</Section>,
    anime: <Section key="anime" title="Anime" loading={anime.isPending} empty={!anime.data?.length}>{anime.data?.map((a) => <AnimeRow key={a.id} a={a} onPick={onPick} />)}</Section>,
    sports: <Section key="sports" title="Sports" loading={directory.isPending} empty={!sports.length}>{sports.map((l) => <SportsRow key={l.id} l={l} now={now} onPick={onPick} />)}</Section>,
  };
  const order = [first, ...(['screen', 'anime', 'sports'] as const).filter((k) => k !== first)];
  const settled = !titles.isPending && !anime.isPending && !directory.isPending;
  const nothing = settled && !titles.data?.length && !anime.data?.length && !sports.length;

  return (
    <div
      data-testid="search-preview"
      className="toast-in absolute inset-x-0 top-full z-50 mt-2 max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain rounded-[18px] border border-transparent bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/5"
      // Keep focus in the input while picking.
      onPointerDown={(e) => e.preventDefault()}
    >
      {nothing ? <p className="px-3 py-4 text-center text-sm text-muted">Nothing found for “{query}”.</p> : order.map((k) => sections[k])}
      <button type="button" onClick={onAll} className="mt-1 flex h-10 w-full items-center justify-center rounded-xl text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
        See all results
      </button>
    </div>
  );
}

function Section({ title, loading, empty, children }: { title: string; loading: boolean; empty: boolean; children: React.ReactNode }) {
  // A kind with no match takes no room.
  if (!loading && empty) return null;
  return (
    <div role="group" aria-label={title}>
      <div className="px-3 pt-2 pb-1 text-xs text-faint">{title}</div>
      {loading ? <div className="skeleton mx-3 my-2 h-10 rounded-xl" /> : children}
    </div>
  );
}

const ROW = 'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06]';

function Thumb({ src, wide }: { src?: string; wide?: boolean }) {
  return (
    <span className={cx('shrink-0 overflow-hidden rounded-md bg-surface', wide ? 'h-9 w-16' : 'h-12 w-8')}>
      {src && <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />}
    </span>
  );
}

function Text({ title, meta, icon: Icon }: { title: string; meta: string; icon: typeof Film }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{meta}</span>
      </span>
      <Icon className="size-4 shrink-0 text-faint" strokeWidth={1.5} aria-hidden />
    </>
  );
}

function TitleRow({ m, onPick }: { m: MediaItem; onPick: () => void }) {
  const type = typeOf(m);
  return (
    <Link to={`/${type}/${m.id}`} onClick={onPick} className={ROW}>
      <Thumb src={imageUrl(m.poster_path, 'poster', 92)} />
      <Text title={titleOf(m)} meta={[type === 'movie' ? 'Movie' : 'TV show', yearOf(m)].filter(Boolean).join(' · ')} icon={type === 'movie' ? Film : Tv} />
    </Link>
  );
}

function AnimeRow({ a, onPick }: { a: AnimeCard; onPick: () => void }) {
  return (
    <Link to={`/anime/title/${a.id}`} onClick={onPick} className={ROW}>
      <Thumb src={a.cover} />
      <Text title={a.title} meta={[a.format && (FORMAT_LABEL[a.format] ?? a.format), a.year].filter(Boolean).join(' · ')} icon={Sparkles} />
    </Link>
  );
}

function SportsRow({ l, now, onPick }: { l: LiveListing; now: number; onPick: () => void }) {
  const start = l.channel ? null : localStart(l.startsAt, now);
  const when = l.channel ? 'Channel' : listingState(l, now) === 'live' ? 'Live now' : `${start!.day} ${start!.time}`;
  return (
    <Link to={`/sports/watch/${l.id}`} onClick={onPick} className={ROW}>
      <Thumb src={l.poster} wide />
      <Text title={l.title} meta={[when, l.league || l.sport].filter(Boolean).join(' · ')} icon={Radio} />
    </Link>
  );
}
