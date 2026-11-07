import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, RotateCcw, Star, X } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import EpisodeSelector from '../components/EpisodeSelector';
import { ErrorBox } from '../components/Grid';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from '../components/Row';
import { epLabel } from '../lib/episodes';
import { imageSrcSet, imageUrl } from '../lib/images';
import { findProgress, percent, resumeTarget, useStore } from '../lib/store';
import { certificationOf, cleanList, HttpError, q, titleOf, trailersOf, yearOf, type Details as D, type MediaItem, type MediaType, type Video } from '../lib/tmdb';
import { cx, formatClock, formatRuntime, useTitle } from '../lib/util';
import { BLEED } from './Home';
import NotFound from './NotFound';

export default function Details({ type }: { type: MediaType }) {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const { data, isPending, error, refetch } = useQuery({ ...q.details(type, id), enabled: valid });
  useTitle(data ? titleOf(data) : undefined);

  if (!valid || (error instanceof HttpError && error.status === 404)) return <NotFound />;
  if (error) return <ErrorBox onRetry={() => refetch()} />;
  if (isPending) return <div className={cx(BLEED, 'skeleton h-[92svh] md:h-[86svh]')} />;
  return <DetailsView key={type + id} d={data} type={type} />;
}

/** Poster on phones, backdrop on wider screens — the browser downloads only one. */
function Art({ d }: { d: D }) {
  const [loaded, setLoaded] = useState(false);
  const fallback = imageUrl(d.poster_path ?? d.backdrop_path, d.poster_path ? 'poster' : 'backdrop', 780);
  if (!fallback) return null;
  return (
    <picture>
      {d.backdrop_path && <source media="(min-width: 768px)" srcSet={imageSrcSet(d.backdrop_path, 'backdrop')} sizes="100vw" />}
      <img
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
  const cert = certificationOf(d);
  const trailers = trailersOf(d);
  const [trailer, setTrailer] = useState<Video | null>(null);
  const recs = cleanList(d.recommendations?.results.length ? d.recommendations.results : (d.similar?.results ?? []), type).slice(0, 20);
  const length = type === 'movie' ? formatRuntime(d.runtime) : d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? 's' : ''}` : '';

  // Episode selector open state lives in the URL (?episodes=<season>), so Back closes it.
  const episodesParam = params.get('episodes');
  const openEpisodes = () => {
    const next = new URLSearchParams(params);
    next.set('episodes', '');
    setParams(next, { state: { modal: true }, preventScrollReset: true });
  };
  const closeEpisodes = useCallback(() => {
    if ((location.state as { modal?: boolean } | null)?.modal) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete('episodes');
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
          <div className="relative max-w-xl rounded-3xl bg-black/35 p-5 ring-1 ring-white/10 backdrop-blur-xl md:p-7">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{title}</h1>
            {d.genres.length > 0 && <p className="mt-1.5 text-sm text-white/70">{d.genres.map((g) => g.name).join(', ')}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/80">
              {d.vote_average > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
                  {d.vote_average.toFixed(1)}
                </span>
              )}
              {[yearOf(d), length, cert].filter(Boolean).map((x) => (
                <span key={x} className="flex items-center gap-2.5">
                  <span className="text-white/30">|</span>
                  {x}
                </span>
              ))}
            </div>
            <Overview text={d.overview} />
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <PlayActions d={d} type={type} onEpisodes={openEpisodes} />
              <BookmarkMenu variant="round" item={{ id: d.id, mediaType: type, title, posterPath: d.poster_path, releaseDate: d.release_date || d.first_air_date, ratingScore: d.vote_average }} />
            </div>
          </div>
        </div>
      </section>

      {trailers.length > 0 && <Trailers videos={trailers} onPlay={setTrailer} />}
      {recs.length > 0 && <MoreLikeThis items={recs} type={type} />}
      {trailer && <TrailerModal video={trailer} onClose={() => setTrailer(null)} />}

      {type === 'tv' && episodesParam !== null && (
        <EpisodeSelector
          show={d}
          initialSeason={episodesParam ? Number(episodesParam) : undefined}
          onSeasonChange={setEpisodesSeason}
          onClose={closeEpisodes}
          replace
        />
      )}
    </div>
  );
}

function Trailers({ videos, onPlay }: { videos: Video[]; onPlay: (v: Video) => void }) {
  const { ref, scroll } = useRowScroll();
  return (
    <section className="mt-10">
      <SectionHeader title="Trailers & videos" action={<RowArrows onScroll={scroll} />} />
      <Scroller label="Trailers and videos" scrollRef={ref}>
        {videos.map((v) => (
          <button key={v.key} onClick={() => onPlay(v)} className="group w-64 shrink-0 snap-start text-left sm:w-80" role="listitem">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface">
              <img src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-12 place-items-center rounded-full bg-black/40 backdrop-blur-sm transition group-hover:bg-white group-hover:text-black">
                  <Play className="ml-0.5 size-5 fill-current" strokeWidth={0} />
                </span>
              </span>
            </div>
            <div className="mt-2.5 truncate text-[15px] font-medium">{v.name}</div>
            <div className="text-[13px] text-muted">{v.type}</div>
          </button>
        ))}
      </Scroller>
    </section>
  );
}

function TrailerModal({ video, onClose }: { video: Video; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={video.name} className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close trailer" className="absolute -top-12 right-0 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-5" />
        </button>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0`}
          title={video.name}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-3xl bg-black"
        />
      </div>
    </div>
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

function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 220;
  return (
    <p className={cx('mt-4 text-[15px] leading-relaxed text-white/80', !open && long && 'line-clamp-3 md:line-clamp-4')}>
      {text}{' '}
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="text-white/50 hover:text-white">
          {open ? 'less' : 'more'}
        </button>
      )}
    </p>
  );
}

const PRIMARY = 'flex h-12 items-center gap-2.5 rounded-full bg-white px-6 text-[15px] font-medium text-black transition hover:bg-white/90 active:scale-95';
const SECONDARY = 'flex h-12 items-center gap-2 rounded-full px-5 text-[15px] ring-1 ring-white/40 transition hover:bg-white/10 hover:ring-white/70';

function PlayActions({ d, type, onEpisodes }: { d: D; type: MediaType; onEpisodes: () => void }) {
  const history = useStore((s) => s.history);
  if (type === 'movie') {
    const p = findProgress(history, 'movie', d.id);
    const resumable = p && !p.isCompleted && percent(p) > 1;
    return (
      <>
        <Link to={`/watch/movie/${d.id}`} className={PRIMARY}>
          <Play className="size-4 fill-current" strokeWidth={0} />
          {resumable ? `Resume ${formatClock(p.progress!.watched)}` : 'Watch now'}
        </Link>
        {resumable && (
          <Link to={`/watch/movie/${d.id}?t=0`} className={SECONDARY}>
            <RotateCcw className="size-4" /> Start over
          </Link>
        )}
      </>
    );
  }
  const r = resumeTarget(history, 'tv', d.id);
  const label = r?.season !== undefined ? `${r.isNext ? 'Play' : 'Resume'} ${epLabel(r.season, r.episode)}` : 'Watch now';
  // Opens the episode selector; its footer button resumes / plays.
  return (
    <button onClick={onEpisodes} className={PRIMARY} aria-haspopup="dialog">
      <Play className="size-4 fill-current" strokeWidth={0} />
      {label}
    </button>
  );
}
