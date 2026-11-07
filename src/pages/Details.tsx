import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, RotateCcw, Star, X } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import EpisodeList, { SeasonPicker } from '../components/EpisodeList';
import { ErrorBox } from '../components/Grid';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from '../components/Row';
import { Bone } from '../components/Skeletons';
import { allSeasons, epLabel, regularSeasons } from '../lib/episodes';
import { findProgress, percent, resumeTarget, useStore } from '../lib/store';
import { certificationOf, cleanList, HttpError, logoOf, q, titleOf, trailersOf, yearOf, type Details as D, type MediaType, type Video } from '../lib/tmdb';
import { cx, formatClock, formatDate, formatRuntime, useTitle } from '../lib/util';
import NotFound from './NotFound';

export default function Details({ type }: { type: MediaType }) {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const { data, isPending, error, refetch } = useQuery({ ...q.details(type, id), enabled: valid });
  useTitle(data ? titleOf(data) : undefined);

  if (!valid || (error instanceof HttpError && error.status === 404)) return <NotFound />;
  if (error) return <ErrorBox onRetry={() => refetch()} />;
  if (isPending) return <DetailsSkeleton />;
  return <DetailsView key={type + id} d={data} type={type} />;
}

function DetailsView({ d, type }: { d: D; type: MediaType }) {
  const [trailer, setTrailer] = useState<Video | null>(null);
  const title = titleOf(d);
  const logo = logoOf(d);
  const cert = certificationOf(d);
  const trailers = trailersOf(d);
  const cast = (d.credits?.cast ?? []).slice(0, 20);
  const recs = cleanList(d.recommendations?.results.length ? d.recommendations.results : (d.similar?.results ?? []), type).slice(0, 20);
  const length =
    type === 'movie'
      ? formatRuntime(d.runtime)
      : d.number_of_seasons
        ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? 's' : ''}`
        : '';
  const pills = [length, ...d.genres.slice(0, 3).map((g) => g.name), type === 'movie' ? 'Movie' : 'Series', yearOf(d), cert].filter(Boolean) as string[];
  const studio = type === 'tv' ? d.networks?.[0]?.name : d.production_companies?.[0]?.name;
  const facts = [
    d.vote_average > 0 && { k: 'Rating', v: <span className="flex items-center gap-1.5"><Star className="size-4 fill-current text-star" strokeWidth={0} />{d.vote_average.toFixed(1)}<span className="text-sm text-muted">/ 10</span></span> },
    (d.release_date || d.first_air_date) && { k: type === 'movie' ? 'Released' : 'First aired', v: formatDate(d.release_date || d.first_air_date) },
    d.status && { k: 'Status', v: d.status },
    studio && { k: type === 'tv' ? 'Network' : 'Studio', v: studio },
    type === 'tv' && d.number_of_episodes && { k: 'Episodes', v: d.number_of_episodes },
    d.original_language && { k: 'Language', v: d.original_language.toUpperCase() },
  ].filter(Boolean) as { k: string; v: React.ReactNode }[];

  return (
    <div className="space-y-8 pb-10 md:space-y-10">
      <section className="relative min-h-[520px] overflow-hidden rounded-3xl bg-surface md:min-h-[480px]">
        <div className="absolute inset-0">
          <Img path={d.backdrop_path} kind="backdrop" sizes="(min-width: 1280px) 1100px, 100vw" alt="" priority className="size-full" imgClassName="object-[center_20%]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent" />
        <div className="absolute top-5 left-5 flex max-w-[85%] flex-wrap gap-2">
          {pills.map((p) => (
            <span key={p} className="rounded-full bg-black/35 px-3.5 py-1.5 text-sm text-white/90 backdrop-blur-md">
              {p}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-5 bottom-5 max-w-2xl space-y-4 md:inset-x-8 md:bottom-8">
          {logo ? (
            <>
              <img src={`https://image.tmdb.org/t/p/w500${logo}`} alt={title} className="max-h-24 w-auto max-w-[75%] object-contain object-left md:max-h-28" />
              <h1 className="sr-only">{title}</h1>
            </>
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{title}</h1>
          )}
          {d.tagline && <p className="text-[15px] text-white/60 italic">{d.tagline}</p>}
          <Overview text={d.overview} />
          <div className="flex flex-wrap gap-2.5">
            <PlayActions d={d} type={type} />
            <BookmarkMenu item={{ id: d.id, mediaType: type, title, posterPath: d.poster_path, releaseDate: d.release_date || d.first_air_date, ratingScore: d.vote_average }} />
            {trailers[0] && (
              <button onClick={() => setTrailer(trailers[0])} className="h-12 rounded-2xl bg-white/10 px-5 text-[15px] font-medium hover:bg-white/15">
                Trailer
              </button>
            )}
          </div>
        </div>
      </section>

      {facts.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {facts.map((f) => (
            <div key={f.k} className="rounded-2xl bg-surface px-4 py-3.5">
              <div className="text-sm text-muted">{f.k}</div>
              <div className="mt-1 truncate text-[15px] font-medium">{f.v}</div>
            </div>
          ))}
        </section>
      )}

      {type === 'tv' && <Episodes d={d} />}

      {trailers.length > 0 && (
        <Row title="Trailers & videos">
          {trailers.map((v) => (
            <button key={v.key} onClick={() => setTrailer(v)} className="group w-64 shrink-0 snap-start text-left sm:w-72" role="listitem">
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface">
                <img src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                <span className="absolute bottom-3 left-3 grid size-9 place-items-center rounded-full bg-white/25 backdrop-blur-sm group-hover:bg-accent group-hover:text-black">
                  <Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
                </span>
              </div>
              <div className="mt-2.5 truncate text-[15px] font-medium">{v.name}</div>
              <div className="text-[13px] text-muted">{v.type}</div>
            </button>
          ))}
        </Row>
      )}

      {cast.length > 0 && (
        <Row title="Cast">
          {cast.map((c) => (
            <div key={c.id} className="w-28 shrink-0 snap-start" role="listitem">
              <Img path={c.profile_path} kind="profile" sizes="112px" alt={c.name} className="aspect-square rounded-2xl" />
              <div className="mt-2 truncate text-sm font-medium">{c.name}</div>
              {c.character && <div className="truncate text-[13px] text-muted">{c.character}</div>}
            </div>
          ))}
        </Row>
      )}

      {recs.length > 0 && (
        <Row title="More like this">
          {recs.map((m) => (
            <MediaCard key={m.id} item={m} type={type} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
        </Row>
      )}

      {trailer && <TrailerModal video={trailer} onClose={() => setTrailer(null)} />}
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  const { ref, scroll } = useRowScroll();
  return (
    <section>
      <SectionHeader title={title} action={<RowArrows onScroll={scroll} />} />
      <Scroller label={title} scrollRef={ref}>
        {children}
      </Scroller>
    </section>
  );
}

function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 240;
  return (
    <div className="text-[15px] leading-relaxed text-white/80">
      <p className={!open && long ? 'line-clamp-3' : undefined}>{text}</p>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-sm text-white hover:underline">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

function PlayActions({ d, type }: { d: D; type: MediaType }) {
  const history = useStore((s) => s.history);
  const primary = 'flex h-12 items-center gap-2.5 rounded-2xl bg-accent px-6 text-[15px] font-medium text-black transition hover:bg-accent-hover active:scale-95';
  if (type === 'movie') {
    const p = findProgress(history, 'movie', d.id);
    const resumable = p && !p.isCompleted && percent(p) > 1;
    return (
      <>
        <Link to={`/watch/movie/${d.id}`} className={primary}>
          <Play className="size-4 fill-current" strokeWidth={0} />
          {resumable ? `Resume ${formatClock(p.progress!.watched)}` : 'Play'}
        </Link>
        {resumable && (
          <Link to={`/watch/movie/${d.id}?t=0`} className="flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-5 text-[15px] font-medium hover:bg-white/15">
            <RotateCcw className="size-4" /> Start over
          </Link>
        )}
      </>
    );
  }
  const r = resumeTarget(history, 'tv', d.id);
  const s = r?.season ?? regularSeasons(d)[0]?.season_number ?? 1;
  const e = r?.episode ?? 1;
  return (
    <Link to={`/watch/tv/${d.id}?season=${s}&episode=${e}`} className={primary}>
      <Play className="size-4 fill-current" strokeWidth={0} /> {r && !r.isNext ? 'Resume' : 'Play'} {epLabel(s, e)}
    </Link>
  );
}

function Episodes({ d }: { d: D }) {
  const [params, setParams] = useSearchParams();
  const history = useStore((s) => s.history);
  const seasons = allSeasons(d);
  const r = resumeTarget(history, 'tv', d.id);
  const fallback = r?.season ?? regularSeasons(d)[0]?.season_number ?? seasons[0]?.season_number ?? 1;
  const raw = params.get('season');
  const fromUrl = raw === null || raw === '' ? NaN : Number(raw); // Number(null) is 0 = Specials
  const season = seasons.some((s) => s.season_number === fromUrl) ? fromUrl : fallback;
  if (!seasons.length) return null;
  return (
    <section className="rounded-3xl bg-surface p-3 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-4 px-2 pt-1">
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">Episodes</h2>
        <SeasonPicker
          seasons={seasons}
          value={season}
          onChange={(n) => {
            const next = new URLSearchParams(params);
            next.set('season', String(n));
            setParams(next, { replace: true, preventScrollReset: true });
          }}
        />
      </div>
      <EpisodeList tvId={d.id} season={season} current={r?.season !== undefined ? { season: r.season, episode: r.episode! } : undefined} />
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
        <button onClick={onClose} aria-label="Close trailer" className="absolute -top-12 right-0 grid size-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20">
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

function DetailsSkeleton() {
  return (
    <div className="space-y-8">
      <Bone className="h-[520px] w-full rounded-3xl md:h-[480px]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className={cx('h-[74px] rounded-2xl', i > 3 && 'hidden xl:block')} />
        ))}
      </div>
    </div>
  );
}
