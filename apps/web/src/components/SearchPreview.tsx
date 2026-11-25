import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Star } from 'lucide-react';
import { fetchAnimeList, type AnimeCard } from '@charcoal/content';
import { FORMAT_LABEL } from '../lib/anilist';
import { webFetcher } from '../lib/content';
import { imageUrl } from '../lib/images';
import { cleanList, titleOf, tmdb, typeOf, yearOf, type MediaItem, type Page } from '../lib/tmdb';
import { cx } from '../lib/util';
import Kbd from './Kbd';

/** One thing found, whichever catalogue it came from. */
interface Found {
  key: string;
  to: string;
  title: string;
  kind: string;
  year?: string;
  rating?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const LIMIT = 9;

function fromTmdb(m: MediaItem): Found {
  const type = typeOf(m);
  return {
    key: type + m.id,
    to: `/${type}/${m.id}`,
    title: titleOf(m),
    kind: type === 'movie' ? 'Movie' : 'TV show',
    year: yearOf(m) || undefined,
    rating: m.vote_average || undefined,
    poster: imageUrl(m.poster_path, 'poster', 185),
    backdrop: imageUrl(m.backdrop_path, 'backdrop', 300),
    overview: m.overview || undefined,
  };
}
const fromAniList = (a: AnimeCard): Found => ({
  key: `anilist${a.id}`,
  to: `/anime/title/${a.id}`,
  title: a.title,
  kind: `Anime · ${a.format ? (FORMAT_LABEL[a.format] ?? a.format) : 'Series'}`,
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
export default function SearchPreview({ query, onPick, onAll }: { query: string; onPick: () => void; onAll: () => void }) {
  const navigate = useNavigate();
  const titles = useQuery({
    queryKey: ['preview-titles', query],
    queryFn: async ({ signal }) => cleanList((await tmdb<Page<MediaItem>>('/search/multi', { query, include_adult: 'false' }, signal)).results),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const anime = useQuery({
    queryKey: ['preview-anime', query],
    queryFn: async ({ signal }) => (await fetchAnimeList(webFetcher, { search: query, perPage: 8 }, signal)).items,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const found = useMemo(() => {
    const main = (titles.data ?? []).slice(0, 7);
    const have = new Set(main.flatMap((m) => [norm(titleOf(m)), norm(m.original_title ?? m.original_name)]).filter(Boolean));
    const extra = (anime.data ?? []).filter((a) => !have.has(norm(a.title)) && !have.has(norm(a.romaji)) && !have.has(norm(a.native)));
    return [...main.map(fromTmdb), ...extra.map(fromAniList)].slice(0, LIMIT);
  }, [titles.data, anime.data]);
  const loading = titles.isPending && anime.isPending;

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
      className="toast-in absolute top-full right-0 z-50 mt-2 max-h-[min(78vh,40rem)] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-transparent bg-raised p-3 shadow-2xl ring-1 shadow-black/50 ring-white/5 max-md:left-0 max-md:w-auto"
      // Keep focus in the input while picking.
      onPointerDown={(e) => e.preventDefault()}
    >
      {loading ? (
        <div className="space-y-3" aria-hidden>
          <div className="skeleton h-28 rounded-2xl" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
            ))}
          </div>
        </div>
      ) : !top ? (
        <p className="px-3 py-8 text-center text-sm text-muted">Nothing found for “{query}”.</p>
      ) : (
        <>
          <Link
            to={top.to}
            onClick={onPick}
            role="option"
            aria-selected={marked === 0}
            data-result={top.key}
            className={cx('flex gap-4 rounded-2xl p-2.5 transition-colors', marked === 0 ? 'bg-white/10' : 'hover:bg-white/[0.06]')}
          >
            <span className="aspect-[2/3] w-[88px] shrink-0 overflow-hidden rounded-xl bg-surface">
              {top.poster && <img src={top.poster} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1 py-1">
              <span className="text-micro font-semibold tracking-wider text-muted uppercase">Top result</span>
              <span className="mt-1 block truncate text-xl leading-tight font-semibold tracking-tight">{top.title}</span>
              <Meta f={top} className="mt-1" />
              {top.overview && <span className="mt-2 line-clamp-2 text-caption text-pretty text-muted">{top.overview}</span>}
            </span>
          </Link>
          {rest.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 sm:grid-cols-4">
              {rest.map((f, i) => (
                <Link
                  key={f.key}
                  to={f.to}
                  onClick={onPick}
                  role="option"
                  aria-selected={marked === i + 1}
                  data-result={f.key}
                  className={cx('group block rounded-2xl p-2 transition-colors', marked === i + 1 ? 'bg-white/10' : 'hover:bg-white/[0.06]')}
                >
                  <span className="block aspect-[2/3] overflow-hidden rounded-xl bg-surface">
                    {f.poster && <img src={f.poster} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium">{f.title}</span>
                  <span className="block truncate text-xs text-muted">{[f.kind.split(' · ')[0], f.year].filter(Boolean).join(' · ')}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      <button type="button" onClick={onAll} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
        All results for “{query}” <ArrowRight className="size-4" strokeWidth={1.5} />
        <Kbd className="ml-1">Enter</Kbd>
      </button>
    </div>
  );
}

function Meta({ f, className }: { f: Found; className?: string }) {
  return (
    <span className={cx('flex flex-wrap items-center gap-x-2 text-sm text-white/75', className)}>
      <span>{f.kind}</span>
      {f.year && (
        <>
          <span className="text-white/35">·</span>
          <span>{f.year}</span>
        </>
      )}
      {f.rating ? (
        <>
          <span className="text-white/35">·</span>
          <span className="flex items-center gap-1 font-medium text-white/90">
            <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
            {f.rating.toFixed(1)}
          </span>
        </>
      ) : null}
    </span>
  );
}
