import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, RotateCcw, Star, X, Youtube } from 'lucide-react';
import BookmarkMenu from '../components/BookmarkMenu';
import EpisodeList, { SeasonPicker } from '../components/EpisodeList';
import { ErrorBox } from '../components/Grid';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, RowHeader, Scroller } from '../components/Row';
import { Bone, POSTER_SIZES } from '../components/Skeletons';
import { allSeasons, epLabel, regularSeasons } from '../lib/episodes';
import { findProgress, percent, resumeTarget, useStore } from '../lib/store';
import { certificationOf, cleanList, HttpError, logoOf, q, titleOf, trailersOf, yearOf, type Details as D, type MediaType, type Video } from '../lib/tmdb';
import { formatClock, formatDate, formatRuntime, useTitle } from '../lib/util';
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
  const runtime = type === 'movie' ? formatRuntime(d.runtime) : formatRuntime(d.episode_run_time?.[0]);
  const studio = type === 'tv' ? d.networks?.[0]?.name : d.production_companies?.[0]?.name;

  return (
    <div className="pb-10">
      {/* Banner */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 -z-10 h-[70vh] max-h-[720px] overflow-hidden">
          <Img path={d.backdrop_path} kind="backdrop" sizes="100vw" alt="" priority className="size-full" imgClassName="object-[center_20%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/80 to-transparent" />
        </div>
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 pt-[28vh] md:flex-row md:items-end md:gap-10 md:px-8 md:pt-[24vh]">
          <Img
            path={d.poster_path}
            kind="poster"
            sizes="(min-width: 768px) 260px, 140px"
            alt={title}
            priority
            className="hidden aspect-[2/3] w-[260px] shrink-0 rounded-xl shadow-2xl ring-1 ring-white/10 md:block"
          />
          <div className="min-w-0 max-w-3xl space-y-4">
            {logo ? (
              <img src={`https://image.tmdb.org/t/p/w500${logo}`} alt={title} className="max-h-24 w-auto max-w-[80%] object-contain object-left md:max-h-32" />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{title}</h1>
            )}
            {logo && <h1 className="sr-only">{title}</h1>}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/80">
              {yearOf(d) && <span>{yearOf(d)}</span>}
              {runtime && <span>· {runtime}</span>}
              {type === 'tv' && d.number_of_seasons ? <span>· {d.number_of_seasons} season{d.number_of_seasons > 1 ? 's' : ''}</span> : null}
              {d.vote_average > 0 && (
                <span className="flex items-center gap-1">
                  · <Star className="size-3.5 fill-current text-amber-400" /> {d.vote_average.toFixed(1)}
                </span>
              )}
              {cert && <span className="rounded border border-white/30 px-1.5 text-xs">{cert}</span>}
            </div>
            {d.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {d.genres.map((g) => (
                  <span key={g.id} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/85">
                    {g.name}
                  </span>
                ))}
              </div>
            )}
            {d.tagline && <p className="text-sm text-white/60 italic">{d.tagline}</p>}
            <Overview text={d.overview} />
            <div className="flex flex-wrap gap-2">
              <PlayActions d={d} type={type} />
              <BookmarkMenu
                item={{ id: d.id, mediaType: type, title, posterPath: d.poster_path, releaseDate: d.release_date || d.first_air_date, ratingScore: d.vote_average }}
              />
              {trailers[0] && (
                <button onClick={() => setTrailer(trailers[0])} className="flex h-11 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-medium hover:bg-white/15">
                  <Youtube className="size-4" /> Trailer
                </button>
              )}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              {d.status && <Fact k="Status" v={d.status} />}
              {(d.release_date || d.first_air_date) && <Fact k={type === 'movie' ? 'Released' : 'First aired'} v={formatDate(d.release_date || d.first_air_date)} />}
              {studio && <Fact k={type === 'tv' ? 'Network' : 'Studio'} v={studio} />}
              {d.original_language && <Fact k="Language" v={d.original_language.toUpperCase()} />}
            </dl>
          </div>
        </div>
      </section>

      <div className="mt-12 space-y-12">
        {type === 'tv' && <Episodes d={d} />}

        {trailers.length > 0 && (
          <section>
            <RowHeader title="Trailers & videos" />
            <Scroller label="Trailers and videos">
              {trailers.map((v) => (
                <button key={v.key} onClick={() => setTrailer(v)} className="group w-64 shrink-0 snap-start text-left sm:w-72">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-surface ring-1 ring-white/5 group-hover:ring-white/30">
                    <img src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                    <Play className="absolute inset-0 m-auto size-10 fill-white text-white opacity-90 drop-shadow" />
                  </div>
                  <div className="mt-2 line-clamp-1 text-sm">{v.name}</div>
                  <div className="text-xs text-muted">{v.type}</div>
                </button>
              ))}
            </Scroller>
          </section>
        )}

        {cast.length > 0 && (
          <section>
            <RowHeader title="Cast" />
            <Scroller label="Cast">
              {cast.map((c) => (
                <div key={c.id} className="w-24 shrink-0 snap-start sm:w-28" role="listitem">
                  <Img path={c.profile_path} kind="profile" sizes="112px" alt={c.name} className="aspect-square rounded-full" />
                  <div className="mt-2 line-clamp-2 text-center text-xs font-medium">{c.name}</div>
                  {c.character && <div className="line-clamp-1 text-center text-xs text-muted">{c.character}</div>}
                </div>
              ))}
            </Scroller>
          </section>
        )}

        {recs.length > 0 && (
          <section>
            <RowHeader title="More like this" />
            <Scroller label="More like this">
              {recs.map((m) => (
                <MediaCard key={m.id} item={m} type={type} sizes={POSTER_SIZES} className={ROW_ITEM} showType={false} />
              ))}
            </Scroller>
          </section>
        )}
      </div>

      {trailer && <TrailerModal video={trailer} onClose={() => setTrailer(null)} />}
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-1.5">
    <dt>{k}</dt>
    <dd className="text-white/80">{v}</dd>
  </div>
);

function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 280;
  return (
    <div className="max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
      <p className={!open && long ? 'line-clamp-4' : undefined}>{text}</p>
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
  const r = resumeTarget(history, type, d.id);
  const base = 'flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold';

  if (type === 'movie') {
    const p = findProgress(history, 'movie', d.id);
    const resumable = p && !p.isCompleted && percent(p) > 1;
    return (
      <>
        <Link to={`/watch/movie/${d.id}`} className={`${base} bg-white text-black hover:bg-white/90`}>
          <Play className="size-4 fill-current" />
          {resumable ? `Resume ${formatClock(p.progress!.watched)}` : 'Play'}
        </Link>
        {resumable && (
          <Link to={`/watch/movie/${d.id}?t=0`} className={`${base} bg-white/10 font-medium hover:bg-white/15`}>
            <RotateCcw className="size-4" /> Start over
          </Link>
        )}
      </>
    );
  }

  const first = regularSeasons(d)[0]?.season_number ?? 1;
  const s = r?.season ?? first;
  const e = r?.episode ?? 1;
  const label = r ? `${r.isNext ? 'Play' : 'Resume'} ${epLabel(s, e)}` : `Play ${epLabel(s, e)}`;
  return (
    <Link to={`/watch/tv/${d.id}?season=${s}&episode=${e}`} className={`${base} bg-white text-black hover:bg-white/90`}>
      <Play className="size-4 fill-current" /> {label}
    </Link>
  );
}

function Episodes({ d }: { d: D }) {
  const [params, setParams] = useSearchParams();
  const history = useStore((s) => s.history);
  const seasons = allSeasons(d);
  const r = resumeTarget(history, 'tv', d.id);
  const fallback = r?.season ?? regularSeasons(d)[0]?.season_number ?? seasons[0]?.season_number ?? 1;
  const fromUrl = Number(params.get('season'));
  const season = seasons.some((s) => s.season_number === fromUrl) ? fromUrl : fallback;

  if (!seasons.length) return null;
  return (
    <section className="mx-auto max-w-[1600px] px-4 md:px-8">
      <div className="mb-3 flex items-center justify-between gap-4">
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
      <div className="max-w-4xl">
        <EpisodeList tvId={d.id} season={season} current={r?.season !== undefined ? { season: r.season, episode: r.episode! } : undefined} />
      </div>
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
    <div role="dialog" aria-modal="true" aria-label={video.name} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close trailer" className="absolute -top-11 right-0 grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-5" />
        </button>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0`}
          title={video.name}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-xl bg-black"
        />
      </div>
    </div>
  );
}

function DetailsSkeleton() {
  const stable = useMemo(() => [0, 1, 2], []);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 pt-[28vh] md:flex-row md:items-end md:gap-10 md:px-8 md:pt-[24vh]">
      <Bone className="hidden aspect-[2/3] w-[260px] shrink-0 rounded-xl md:block" />
      <div className="w-full max-w-3xl space-y-4">
        <Bone className="h-12 w-2/3" />
        <Bone className="h-4 w-1/3" />
        {stable.map((i) => (
          <Bone key={i} className="h-4 w-full" />
        ))}
        <div className="flex gap-2">
          <Bone className="h-11 w-32 rounded-lg" />
          <Bone className="h-11 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
