import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { CARD_IMAGE, CARD_INFO, CARD_TITLE, CornerArc, Meta, TypeIcon } from './MediaCard';
import { fetchAnimeList, type AnimeCard } from '@charcoal/content';
import { FORMAT_LABEL } from '../lib/anilist';
import { webFetcher } from '../lib/content';
import { imageUrl } from '../lib/images';
import { cleanList, titleOf, tmdb, typeOf, yearOf, type MediaItem, type MediaType, type Page } from '../lib/tmdb';
import { cx } from '../lib/util';
import Kbd from './Kbd';

/** One thing found, whichever catalogue it came from. */
interface Found {
  key: string;
  to: string;
  title: string;
  kind: string;
  type: MediaType;
  year?: string;
  rating?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const LIMIT = 7;

function fromTmdb(m: MediaItem): Found {
  const type = typeOf(m);
  return {
    key: type + m.id,
    to: `/${type}/${m.id}`,
    title: titleOf(m),
    kind: type === 'movie' ? 'Movie' : 'TV show',
    type,
    year: yearOf(m) || undefined,
    rating: m.vote_average || undefined,
    poster: imageUrl(m.poster_path, 'poster', 185),
    backdrop: imageUrl(m.backdrop_path, 'backdrop', 780),
    overview: m.overview || undefined,
  };
}
const fromAniList = (a: AnimeCard): Found => ({
  key: `anilist${a.id}`,
  to: `/anime/title/${a.id}`,
  title: a.title,
  kind: `Anime · ${a.format ? (FORMAT_LABEL[a.format] ?? a.format) : 'Series'}`,
  type: a.format === 'MOVIE' ? 'movie' : 'tv',
  year: a.year ? String(a.year) : undefined,
  rating: a.score,
  poster: a.cover,
  backdrop: a.banner,
});

/**
 * What a search finds, under the field while typing: one list of movies, shows and anime, best
 * match first and large, the rest as posters. TMDB and AniList are both asked; an anime both
 * have is shown once (TMDB's, which has the full title page), and AniList adds the ones TMDB
 * lacks. Arrow keys move through it, Enter opens the one marked (or the full results).
 */
export default function SearchPreview({ query, onPick, onAll, onCount }: { query: string; onPick: () => void; onAll: () => void; onCount?: (query: string, count: number) => void }) {
  const navigate = useNavigate();
  const titles = useQuery({
    queryKey: ['preview-titles', query],
    queryFn: async ({ signal }) => cleanList((await tmdb<Page<MediaItem>>('/search/multi', { query, include_adult: 'false' }, signal)).results),
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const anime = useQuery({
    queryKey: ['preview-anime', query],
    queryFn: async ({ signal }) => (await fetchAnimeList(webFetcher, { search: query, perPage: 8 }, signal)).items,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const found = useMemo(() => {
    const main = (titles.data ?? []).slice(0, 7);
    const have = new Set(main.flatMap((m) => [norm(titleOf(m)), norm(m.original_title ?? m.original_name)]).filter(Boolean));
    const extra = (anime.data ?? []).filter((a) => !have.has(norm(a.title)) && !have.has(norm(a.romaji)) && !have.has(norm(a.native)));
    return [...main.map(fromTmdb), ...extra.map(fromAniList)].slice(0, LIMIT);
  }, [titles.data, anime.data]);
  // The skeleton only before the very first answer; after that the last results stay while the next load.
  const loading = !found.length && (titles.isPending || anime.isPending);
  const busy = titles.isPlaceholderData || anime.isPlaceholderData || titles.isFetching;
  // Tell the field whether there's anything (Enter with nothing found shakes instead of opening results).
  const settled = !titles.isPlaceholderData && !anime.isPlaceholderData && !titles.isPending && !anime.isPending;
  useEffect(() => {
    if (settled) onCount?.(query, found.length);
  }, [settled, query, found.length, onCount]);

  // Arrow keys mark a result; Enter opens it. With none marked, Enter is the field's own (full results).
  const [marked, setMarked] = useState(-1);
  useEffect(() => setMarked(-1), [query]);
  const state = useRef({ found, marked });
  state.current = { found, marked };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { found: list, marked: at } = state.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!list.length) return;
        e.preventDefault();
        setMarked(e.key === 'ArrowDown' ? (at + 1) % list.length : at <= 0 ? list.length - 1 : at - 1);
      } else if (e.key === 'Enter' && at >= 0 && list[at]) {
        e.preventDefault();
        e.stopPropagation();
        onPick();
        navigate(list[at].to);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [navigate, onPick]);

  const [top, ...rest] = found;
  return (
    <div
      data-testid="search-preview"
      role="listbox"
      aria-label="Search results"
      aria-busy={busy}
      className="toast-in absolute top-full right-0 z-50 mt-2 max-h-[min(78vh,36rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-transparent bg-raised p-3 shadow-2xl ring-1 shadow-black/50 ring-white/5 max-md:left-0 max-md:w-auto"
      // Keep focus in the input while picking.
      onPointerDown={(e) => e.preventDefault()}
    >
      {loading ? (
        <PreviewSkeleton />
      ) : !top ? (
        <p className="px-3 py-6 text-center text-sm text-muted">No matches for “{query}”</p>
      ) : (
        // While the next search loads, these results stay (dimmed a touch) instead of flashing.
        // The best match on the left, the rest beside it (stacked on phones).
        <div className={cx('grid gap-3 transition-opacity duration-150 sm:grid-cols-[15rem_minmax(0,1fr)]', busy && 'opacity-70')}>
          <TopResult f={top} marked={marked === 0} onPick={onPick} />
          {rest.length > 0 && (
            <div className="grid grid-cols-3 content-start gap-x-2.5 gap-y-3">
              {rest.map((f, i) => (
                <ResultCard key={f.key} f={f} marked={marked === i + 1} onPick={onPick} />
              ))}
            </div>
          )}
        </div>
      )}
      {(loading || top) && (
        <button
          type="button"
          onClick={onAll}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          All results for “{query}” <ArrowRight className="size-4" strokeWidth={1.5} />
          <Kbd className="ml-1">Enter</Kbd>
        </button>
      )}
    </div>
  );
}

/** The best match, like the hover preview: its banner, the title over it, the facts and a line of story. */
function TopResult({ f, marked, onPick }: { f: Found; marked: boolean; onPick: () => void }) {
  return (
    <Link
      to={f.to}
      onClick={onPick}
      role="option"
      aria-selected={marked}
      data-result={f.key}
      className={cx('group block self-start overflow-hidden rounded-2xl bg-surface ring-1 transition', marked ? 'ring-white/40' : 'ring-white/[0.06] hover:ring-white/15')}
    >
      <span className="relative block aspect-video overflow-hidden">
        {f.backdrop || f.poster ? (
          <img src={f.backdrop ?? f.poster} alt="" referrerPolicy="no-referrer" className="size-full object-cover object-[70%_25%] transition duration-200 group-hover:brightness-110" />
        ) : (
          <span className="skeleton block size-full" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
      </span>
      <span className="relative -mt-8 block px-3.5 pb-3.5">
        <span className="line-clamp-2 block text-lg leading-tight font-semibold tracking-tight">{f.title}</span>
        <Meta year={f.year} rating={f.rating} className="mt-1.5" extra={<TypeIcon type={f.type} />} />
        {f.overview && <span className="mt-2 line-clamp-4 block text-caption text-pretty text-white/70">{f.overview}</span>}
      </span>
    </Link>
  );
}

/** Every other match as the app's poster card: poster, title, then year · rating with the type icon. */
function ResultCard({ f, marked, onPick }: { f: Found; marked: boolean; onPick: () => void }) {
  return (
    <Link to={f.to} onClick={onPick} role="option" aria-selected={marked} data-result={f.key} className="group relative block">
      <span className={cx(CARD_IMAGE, 'block aspect-[2/3] bg-surface', marked && 'ring-2 ring-white/70')}>
        {f.poster && <img src={f.poster} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />}
      </span>
      <span className={cx(CARD_INFO, 'block')}>
        <span className={cx(CARD_TITLE, 'block')}>{f.title}</span>
        <Meta year={f.year} rating={f.rating} className="mt-0.5" extra={<TypeIcon type={f.type} />} />
        <CornerArc />
      </span>
    </Link>
  );
}

/** The panel's shape while the first results load: the banner card, then poster cards. */
function PreviewSkeleton() {
  return (
    <div aria-hidden className="grid gap-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="self-start overflow-hidden rounded-2xl bg-surface">
        <div className="skeleton aspect-video" />
        <div className="space-y-2 px-4 pt-2 pb-4">
          <div className="skeleton h-5 w-1/2 rounded-md" />
          <div className="skeleton h-3 w-1/4 rounded" />
          <div className="skeleton h-3 w-5/6 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 content-start gap-x-2.5 gap-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3] rounded-2xl" />
            <div className="skeleton mt-2.5 h-3.5 w-4/5 rounded" />
            <div className="skeleton mt-1.5 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
