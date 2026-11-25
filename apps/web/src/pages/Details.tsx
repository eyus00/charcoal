import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, X } from 'lucide-react';
import EpisodeSelector from '../components/EpisodeSelector';
import Community from '../components/Community';
import { PlayTitleButton } from '../components/TitleActions';
import LibraryButton from '../components/LibraryButton';
import QualityTag from '../components/QualityTag';
import { Facts } from '../player/DetailsPeek';
import { seLabel } from '../components/AiringTile';
import { ErrorBox } from '../components/Grid';
import Kbd from '../components/Kbd';
import { DetailsSkeleton } from '../components/Skeletons';
import Modal from '../components/Modal';
import { btn } from '../components/Button';
import MediaCard, { CARD_IMAGE, CARD_LIFT, CornerArc } from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from '../components/Row';
import { imageSrcSet, imageUrl } from '../lib/images';
import { useAnime } from '../lib/anime';
import { cleanList, HttpError, q, titleOf, trailersOf, type Details as D, type MediaItem, type MediaType, type Video } from '../lib/tmdb';
import { cx, useKeys, useTitle } from '../lib/util';
import { BLEED } from '../components/Hero';
import NotFound from './NotFound';

export default function Details({ type }: { type: MediaType }) {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const { data, isPending, error, refetch } = useQuery({ ...q.details(type, id), enabled: valid });
  useTitle(data ? titleOf(data) : undefined);

  if (!valid || (error instanceof HttpError && error.status === 404)) return <NotFound />;
  if (error) return <ErrorBox onRetry={() => refetch()} />;
  if (isPending) return <DetailsSkeleton className={cx(BLEED, 'min-h-[92svh] md:min-h-[86svh]')} />;
  return <DetailsView key={type + id} d={data} type={type} />;
}

/** Poster on phones, backdrop on wider screens — the browser downloads only one. */
function Art({ d }: { d: D }) {
  const [loaded, setLoaded] = useState(false);
  // Already in the cache (e.g. arriving from the details sheet): show it at once, no fade.
  const img = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) setLoaded(true);
  }, []);
  const fallback = imageUrl(d.poster_path ?? d.backdrop_path, d.poster_path ? 'poster' : 'backdrop', 780);
  if (!fallback) return null;
  return (
    <picture>
      {d.backdrop_path && <source media="(min-width: 768px)" srcSet={imageSrcSet(d.backdrop_path, 'backdrop')} sizes="100vw" />}
      <img
        ref={img}
        src={fallback}
        srcSet={d.poster_path ? imageSrcSet(d.poster_path, 'poster') : undefined}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cx('absolute inset-0 size-full object-cover object-top transition-opacity duration-500 md:object-[70%_20%]', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </picture>
  );
}

function DetailsView({ d, type }: { d: D; type: MediaType }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const title = titleOf(d);
  const trailers = trailersOf(d);
  const [trailer, setTrailer] = useState<Video | null>(null);
  const recs = cleanList(d.recommendations?.results.length ? d.recommendations.results : (d.similar?.results ?? []), type).slice(0, 20);

  // Episode selector open state lives in the URL (?episodes=<season>[&ep=<n>]), so Back closes it.
  // `ep` highlights one episode and makes it the play button (Airing this week, new-episode card).
  const episodesParam = params.get('episodes');
  const epParam = Number(params.get('ep'));
  const selectedEp = episodesParam && epParam > 0 ? { season: Number(episodesParam), episode: epParam } : undefined;
  const openEpisodes = (at?: { season: number; episode: number }) => {
    const next = new URLSearchParams(params);
    next.set('episodes', at ? String(at.season) : '');
    if (at) next.set('ep', String(at.episode));
    else next.delete('ep');
    setParams(next, { state: { modal: true }, preventScrollReset: true });
  };
  // Desktop shortcuts: p = play / episodes, t = trailer (l = library, bound by LibraryButton).
  useKeys({
    p: () => (type === 'tv' ? openEpisodes() : navigate(`/watch/movie/${d.id}`)),
    t: () => trailers[0] && setTrailer(trailers[0]),
  });

  const closeEpisodes = useCallback(() => {
    if ((location.state as { modal?: boolean } | null)?.modal) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete('episodes');
      next.delete('ep');
      setParams(next, { replace: true, preventScrollReset: true });
    }
  }, [location.state, navigate, params, setParams]);
  const setEpisodesSeason = (n: number) => {
    const next = new URLSearchParams(params);
    next.set('episodes', String(n));
    setParams(next, { replace: true, state: location.state, preventScrollReset: true });
  };

  return (
    <div className="pb-10">
      <section className={cx(BLEED, 'relative flex min-h-[92svh] items-end overflow-hidden bg-surface md:min-h-[86svh]')}>
        <Art d={d} />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/50" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-bg/80 via-bg/20 to-transparent md:block" />

        <div className="relative w-full px-4 pb-6 md:px-8 md:pb-10 lg:px-10">
          {/* The next-episode card sits above the info card. */}
          {type === 'tv' && <NextEpisodeCard d={d} onOpen={openEpisodes} className="mb-3" />}
          <div className="relative max-w-xl rounded-3xl bg-black/35 p-5 ring-1 ring-white/10 backdrop-blur-xl md:p-7">
            {/* What quality is out there for it (WEB-DL, BluRay, CAM…), top-right of the card. */}
            <QualityTag d={d} type={type} className="absolute top-5 right-5 md:top-7 md:right-7" />
            <h1 className="pr-20 text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
            <OtherNames d={d} type={type} />
            <Facts d={d} type={type} genresClassName="mt-2 text-sm" className="mt-1.5 text-sm" />
            <Overview text={d.overview} title={title} />
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <PlayTitleButton id={d.id} type={type} kbd onEpisodes={() => openEpisodes()} />
              <LibraryButton hotkey item={{ id: d.id, mediaType: type, title, posterPath: d.poster_path, releaseDate: d.release_date || d.first_air_date, ratingScore: d.vote_average }} />
            </div>
          </div>
        </div>
      </section>

      {trailers.length > 0 && <Trailers videos={trailers} onPlay={setTrailer} />}
      <Community type={type} id={d.id} name={title} />
      {recs.length > 0 && <MoreLikeThis items={recs} type={type} />}
      {trailer && <TrailerModal video={trailer} onClose={() => setTrailer(null)} />}

      {type === 'tv' && episodesParam !== null && (
        <EpisodeSelector show={d} initialSeason={episodesParam ? Number(episodesParam) : undefined} onSeasonChange={setEpisodesSeason} selected={selectedEp} onClose={closeEpisodes} replace />
      )}
    </div>
  );
}

/**
 * What else the title is called: an anime's romanised and Japanese names (from AniList, by way of
 * the identity mapping), otherwise the original title when it isn't the one shown.
 */
function OtherNames({ d, type }: { d: D; type: MediaType }) {
  const anime = useAnime(type, d.id, d);
  const names = useMemo(() => {
    const shown = titleOf(d);
    const original = d.original_title ?? d.original_name;
    const all = anime.titles ? [anime.titles.romaji, anime.titles.native ?? original] : [original];
    return [...new Set(all)].filter((n): n is string => !!n && n !== shown);
  }, [d, anime.titles]);
  if (!names.length) return null;
  return (
    // One line: some anime have names a paragraph long. The whole of it is in the tooltip.
    <p className="mt-1.5 truncate text-sm text-white/70" aria-label="Also known as" data-testid="other-names" title={names.join(' · ')}>
      {names.join(' · ')}
    </p>
  );
}

function Trailers({ videos, onPlay }: { videos: Video[]; onPlay: (v: Video) => void }) {
  const { ref, scroll } = useRowScroll();
  return (
    <section className="mt-10">
      <SectionHeader
        title="Trailers & videos"
        action={
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-faint lg:flex">
              Play trailer <Kbd>T</Kbd>
            </span>
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      <Scroller label="Trailers and videos" scrollRef={ref}>
        {videos.map((v) => (
          <button key={v.key} onClick={() => onPlay(v)} title={v.name} className={cx('group w-64 shrink-0 snap-start text-left sm:w-80', CARD_LIFT)}>
            <div className={cx(CARD_IMAGE, 'aspect-video bg-surface')}>
              <img src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-12 place-items-center rounded-full bg-black/40 backdrop-blur-sm transition group-hover:bg-white group-hover:text-black">
                  <Play className="ml-0.5 size-5 fill-current" strokeWidth={0} />
                </span>
              </span>
            </div>
            <div className="relative pt-2 pr-2.5 pb-2">
              <div className="line-clamp-2 text-body-sm font-medium text-pretty text-white/90 transition-colors group-hover:text-white">{v.name}</div>
              <div className="text-caption text-muted">{v.type}</div>
              <CornerArc />
            </div>
          </button>
        ))}
      </Scroller>
    </section>
  );
}

function TrailerModal({ video, onClose }: { video: Video; onClose: () => void }) {
  return (
    <Modal label={video.name} onClose={onClose}>
      <div className="fixed inset-0 grid place-items-center bg-black/85 p-4" onClick={onClose}>
        {/* Width is capped by the height too, so the close button stays on screen in landscape and at high zoom. */}
        <div className="flex w-full max-w-[min(64rem,calc((100dvh-6rem)*16/9))] flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} aria-label="Close trailer" className={btn({ icon: true })}>
            <X className="size-5" />
          </button>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0`}
            title={video.name}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video w-full rounded-3xl bg-black"
          />
          <p className="w-full truncate text-sm text-white/70">{video.name}</p>
        </div>
      </div>
    </Modal>
  );
}

function MoreLikeThis({ items, type }: { items: MediaItem[]; type: MediaType }) {
  const { ref, scroll } = useRowScroll();
  return (
    <section className="mt-10">
      <SectionHeader title="More like this" action={<RowArrows onScroll={scroll} />} />
      <Scroller label="More like this" scrollRef={ref}>
        {items.map((m) => (
          <MediaCard key={m.id} item={m} type={type} sizes={ROW_SIZES} className={ROW_ITEM} />
        ))}
      </Scroller>
    </section>
  );
}

/**
 * The next episode, before it's out: the same release card as the Calendar (date pill, runtime,
 * frame + label when it's special), with a "Next episode" caption. Opens the episode list there.
 */
function NextEpisodeCard({ d, onOpen, className }: { d: D; onOpen: (at: { season: number; episode: number }) => void; className?: string }) {
  const next = d.next_episode_to_air;
  if (!next?.air_date) return null;
  const date = new Date(next.air_date + 'T00:00:00');
  const days = Math.round((date.getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  if (days < 0) return null; // shown from today onwards
  const when =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7 ? date.toLocaleDateString(undefined, { weekday: 'long' }) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const name = next.name && !/^(Episode \d+|TBA)$/i.test(next.name) ? next.name : '';
  return (
    // Small: a date badge and the episode. Opens the episode list with it highlighted.
    <button
      type="button"
      onClick={() => onOpen({ season: next.season_number, episode: next.episode_number })}
      className={cx('flex w-64 items-center gap-3.5 rounded-2xl bg-raised p-3.5 text-left shadow-2xl ring-1 shadow-black/50 ring-white/10 transition-colors hover:bg-line', className)}
    >
      <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 text-black">
        <span className="text-micro font-semibold tracking-wider uppercase">{date.toLocaleDateString(undefined, { month: 'short' })}</span>
        <span className="text-lg leading-6 font-semibold tabular-nums">{date.getDate()}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-micro font-medium tracking-wider text-muted uppercase">New episode</span>
        <span className="block truncate text-body-sm font-medium">{when}</span>
        <span className="block truncate text-xs text-white/60">
          {seLabel(next.season_number, next.episode_number)}
          {name ? ` ${name}` : ''}
        </span>
      </span>
    </button>
  );
}

/** Native share sheet on phones, otherwise copy the link. */

/**
 * Overview clamped to 3 lines (4 from md). When it doesn't fit, the text is cut at a word
 * boundary, trailing spaces and punctuation are dropped, and "… more" follows the last letter:
 * "Bay begins a… more". The cut is measured on a hidden copy and redone when the width changes.
 */
function Overview({ text, title }: { text: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null); // null = the full text fits
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const wrap = box.current;
    const p = probe.current;
    if (!wrap || !p || !text) return;
    const measure = () => {
      const lines = matchMedia('(min-width: 768px)').matches ? 4 : 3;
      const max = lines * parseFloat(getComputedStyle(p).lineHeight) + 1;
      const fits = (t: string, suffix: boolean) => {
        p.textContent = t;
        if (suffix) {
          const more = document.createElement('span');
          more.className = 'font-medium';
          more.textContent = '\u2026 more';
          p.append(more);
        }
        return p.offsetHeight <= max;
      };
      if (fits(text, false)) return setShown(null);
      // Word boundaries to try, longest first fitting wins (binary search).
      const cuts: number[] = [];
      for (let i = 1; i < text.length; i++) if (text[i] === ' ' && text[i - 1] !== ' ') cuts.push(i);
      const clean = (n: number) => text.slice(0, n).replace(/[\s.,;:!?\u2026\-\u2013\u2014(\[{"'\u201c\u2018]+$/u, '');
      let lo = 0;
      let hi = cuts.length - 1;
      let best = '';
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = clean(cuts[mid]);
        if (fits(t, true)) {
          best = t;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      setShown(best || clean(cuts[0] ?? text.length));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;
  const cls = 'text-body-sm leading-6 text-pretty text-white/80';
  return (
    <>
      <div ref={box} className="relative mt-4">
        {/* Hidden copy used only for measuring. */}
        <p ref={probe} aria-hidden className={cx(cls, 'pointer-events-none invisible absolute inset-x-0 top-0')} />
        <p className={cls}>
          {shown === null ? (
            text
          ) : (
            <>
              {shown}
              <span aria-hidden className="text-white/60">
                …{' '}
              </span>
              {/* Text link convention: brightens on hover, only the word itself. */}
              <button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Read the full overview" className="font-medium text-white/80 transition-colors hover:text-white">
                more
              </button>
            </>
          )}
        </p>
      </div>
      {open && <OverviewDialog title={title} text={text} onClose={() => setOpen(false)} />}
    </>
  );
}

function OverviewDialog({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <Modal label={`About ${title}`} onClose={onClose}>
      <div className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 md:p-8" onClick={onClose}>
        {/* Same look as the episode list (header, round close button, divider); a centred popup everywhere. */}
        <div className="toast-in flex max-h-[80dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-transparent bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 md:px-7 md:pt-6">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold md:text-xl">Overview</h2>
              <p className="truncate text-sm text-muted">{title}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className={btn({ icon: true })}>
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain border-t border-line px-5 py-5 md:px-7 md:pb-7">
            <p className="text-body-sm leading-relaxed text-white/80">{text}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
