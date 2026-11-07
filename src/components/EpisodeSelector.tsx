import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Play, X } from 'lucide-react';
import Img from './Img';
import { ErrorBox } from './Grid';
import { Bone } from './Skeletons';
import { allSeasons, epLabel, regularSeasons } from '../lib/episodes';
import { percent, resumeTarget, useStore, type HistoryItem } from '../lib/store';
import { q, titleOf, type Details } from '../lib/tmdb';
import { cx, formatDate, isFuture } from '../lib/util';

interface Props {
  show: Details;
  /** Episode currently playing (player) — highlighted and scrolled into view. */
  current?: { season: number; episode: number };
  initialSeason?: number;
  onSeasonChange?: (season: number) => void;
  onClose: () => void;
  /** Navigate with replace (the selector's own history entry / the current episode is swapped out). */
  replace?: boolean;
  /** Called when an episode is chosen (e.g. close the player's selector). */
  onPick?: () => void;
}

/**
 * Episode picker (sheet on phones, dialog on desktop). Loads only the selected
 * season, prefetches a season when its tab is hovered, and scrolls the current
 * or resume episode into view.
 */
export default function EpisodeSelector({ show, current, initialSeason, onSeasonChange, onClose, replace, onPick }: Props) {
  const qc = useQueryClient();
  const history = useStore((s) => s.history);
  const seasons = allSeasons(show);
  const resume = resumeTarget(history, 'tv', show.id);
  const focus = current ?? (resume?.season !== undefined ? { season: resume.season, episode: resume.episode! } : undefined);
  const first = regularSeasons(show)[0]?.season_number ?? seasons[0]?.season_number ?? 1;
  const [season, setSeason] = useState(() =>
    initialSeason !== undefined && seasons.some((s) => s.season_number === initialSeason) ? initialSeason : (focus?.season ?? first),
  );
  const { data, isPending, isError, refetch } = useQuery(q.season(show.id, season));

  const progress = useMemo(() => {
    const map = new Map<number, HistoryItem>();
    for (const h of history) if (h.mediaType === 'tv' && h.id === show.id && h.season === season && !map.has(h.episode!)) map.set(h.episode!, h);
    return map;
  }, [history, show.id, season]);

  // lock page scroll, close on Escape
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // bring the relevant episode into view once the season has loaded
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!data || focus?.season !== season) return;
    list.current?.querySelector(`[data-ep="${focus.episode}"]`)?.scrollIntoView({ block: 'center' });
  }, [data, season, focus?.season, focus?.episode]);

  const pick = (n: number) => {
    setSeason(n);
    onSeasonChange?.(n);
    list.current?.scrollTo({ top: 0 });
  };
  const href = (s: number, e: number) => `/watch/tv/${show.id}?season=${s}&episode=${e}`;
  const cta = resume?.season !== undefined ? { s: resume.season, e: resume.episode!, label: resume.isNext ? 'Play' : 'Resume' } : { s: first, e: 1, label: 'Play' };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 md:items-center md:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${titleOf(show)} episodes`}
        className="flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl md:h-[84dvh] md:max-w-5xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 md:px-7 md:pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold md:text-xl">Episodes</h2>
            <p className="truncate text-sm text-muted">{titleOf(show)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-raised hover:bg-line">
            <X className="size-5" />
          </button>
        </div>

        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-5 pt-1 pb-4 md:px-7" role="tablist" aria-label="Seasons">
          {seasons.map((s) => (
            <button
              key={s.season_number}
              role="tab"
              aria-selected={s.season_number === season}
              onClick={() => pick(s.season_number)}
              onPointerEnter={() => qc.prefetchQuery(q.season(show.id, s.season_number))}
              className={cx(
                'h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition',
                s.season_number === season ? 'bg-white font-medium text-black' : 'bg-raised text-white/80 hover:bg-line hover:text-white',
              )}
            >
              {s.season_number === 0 ? 'Specials' : `Season ${s.season_number}`}
            </button>
          ))}
        </div>

        <div ref={list} className="flex-1 overflow-y-auto border-t border-line px-5 py-5 md:px-7">
          {isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i}>
                  <Bone className="aspect-video rounded-2xl" />
                  <Bone className="mt-3 h-4 w-3/4" />
                  <Bone className="mt-2 h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <ErrorBox onRetry={() => refetch()} message="Couldn’t load this season." />
          ) : !data.episodes.length ? (
            <p className="py-16 text-center text-muted">No episodes listed yet.</p>
          ) : (
            <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.episodes.map((ep) => {
                const h = progress.get(ep.episode_number);
                const pct = percent(h);
                const upcoming = isFuture(ep.air_date);
                const isCurrent = current?.season === season && current.episode === ep.episode_number;
                const left = h?.progress && !h.isCompleted ? Math.max(1, Math.round((h.progress.duration - h.progress.watched) / 60)) : 0;
                const body = (
                  <>
                    <div className="relative overflow-hidden rounded-2xl">
                      <Img path={ep.still_path} kind="still" sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw" alt="" className="aspect-video" imgClassName={upcoming ? 'opacity-40' : 'transition-transform duration-300 group-hover:scale-[1.03]'} />
                      {!upcoming && (
                        <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                          <span className="grid size-11 place-items-center rounded-full bg-white text-black">
                            <Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
                          </span>
                        </span>
                      )}
                      <span className="absolute top-2.5 left-2.5 flex gap-1.5 text-xs">
                        {isCurrent && <span className="rounded-full bg-white px-2.5 py-1 font-medium text-black">Now playing</span>}
                        {upcoming && <span className="rounded-full bg-black/60 px-2.5 py-1">Airs {formatDate(ep.air_date)}</span>}
                      </span>
                      <span className="absolute right-2.5 bottom-2.5 flex gap-1.5 text-xs">
                        {ep.runtime ? <span className="rounded-full bg-black/60 px-2.5 py-1">{ep.runtime}m</span> : null}
                        {h?.isCompleted ? (
                          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1">
                            <Check className="size-3.5" /> Watched
                          </span>
                        ) : left ? (
                          <span className="rounded-full bg-black/60 px-2.5 py-1">{left}m left</span>
                        ) : null}
                      </span>
                      {pct > 0 && !h?.isCompleted && (
                        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                          <span className="block h-full bg-white" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-sm text-muted tabular-nums">{ep.episode_number}</span>
                      <h3 className={cx('truncate text-[15px] font-medium', isCurrent && 'text-white')}>{ep.name}</h3>
                    </div>
                    {!upcoming && ep.air_date && <div className="text-[13px] text-faint">{formatDate(ep.air_date)}</div>}
                    {ep.overview && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{ep.overview}</p>}
                  </>
                );
                return upcoming ? (
                  <div key={ep.id} data-ep={ep.episode_number} aria-disabled className="cursor-not-allowed">
                    {body}
                  </div>
                ) : (
                  <Link key={ep.id} data-ep={ep.episode_number} to={href(season, ep.episode_number)} replace={replace} onClick={onPick} className="group block rounded-2xl" aria-current={isCurrent || undefined}>
                    {body}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {!current && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line px-5 py-4 md:px-7">
            <Link to={href(cta.s, cta.e)} replace={replace} onClick={onPick} className="flex h-12 items-center gap-2.5 rounded-full bg-white px-6 text-[15px] font-medium text-black transition hover:bg-white/90">
              <Play className="size-4 fill-current" strokeWidth={0} />
              {cta.label} {epLabel(cta.s, cta.e)}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
