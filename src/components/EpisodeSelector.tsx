import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Play, SkipBack, SkipForward, X } from 'lucide-react';
import Img from './Img';
import Modal from './Modal';
import { btn } from './Button';
import { Chip } from './EpisodeTile';
import Kbd from './Kbd';
import { CARD_INFO } from './MediaCard';
import { ErrorBox } from './Grid';
import { Bone } from './Skeletons';
import { allSeasons, epLabel, regularSeasons } from '../lib/episodes';
import { percent, resumeTarget, useStore, type HistoryItem } from '../lib/store';
import { q, titleOf, type Details } from '../lib/tmdb';
import { airsLabel, cx, formatDate, formatRuntime, isFuture, isTypingTarget } from '../lib/util';

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
  /** Player: jump to the previous / next episode from inside the list. */
  prev?: (() => void) | null;
  next?: (() => void) | null;
  /** An episode to highlight, scroll to and offer as the play button (e.g. from "Airing this week"). */
  selected?: { season: number; episode: number };
}

/**
 * Episode picker (sheet on phones, dialog on desktop). Loads only the selected
 * season, prefetches a season when its tab is hovered, and scrolls the current
 * or resume episode into view.
 */
/** Ring around the episode opened from elsewhere (Airing this week, the new-episode card). */
const SELECTED = 'ring-2 ring-white/80 ring-offset-4 ring-offset-surface';

export default function EpisodeSelector({ show, current, initialSeason, onSeasonChange, onClose, replace, onPick, prev, next, selected }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const history = useStore((s) => s.history);
  const seasons = allSeasons(show);
  const resume = resumeTarget(history, 'tv', show.id);
  const focus = selected ?? current ?? (resume?.season !== undefined ? { season: resume.season, episode: resume.episode! } : undefined);
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

  // Keys: Esc closes, ←/→ switch season, P plays the resume / first episode.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
    const at = seasons.findIndex((x) => x.season_number === season);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const nextSeason = seasons[at + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (!nextSeason) return;
      e.preventDefault();
      pick(nextSeason.season_number);
    } else if (current && e.key === 'P' && prev) {
      e.preventDefault();
      prev();
    } else if (current && e.key === 'N' && next) {
      e.preventDefault();
      next();
    } else if ((e.key === 'p' || e.key === 'P') && !current && !selUnaired) {
      e.preventDefault();
      onPick?.();
      navigate(href(cta.s, cta.e), { replace });
    }
  };
  // Season and play keys (Modal handles Escape, focus and scroll lock).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // bring the relevant episode into view once the season has loaded
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!data || focus?.season !== season) return;
    list.current?.querySelector(`[data-ep="${focus.episode}"]`)?.scrollIntoView({ block: 'center' });
  }, [data, season, focus?.season, focus?.episode]);

  // keep the selected season's tab visible (long-running shows have dozens)
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabs.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [season]);

  const pick = (n: number) => {
    setSeason(n);
    onSeasonChange?.(n);
    list.current?.scrollTo({ top: 0 });
  };
  const href = (s: number, e: number) => `/watch/tv/${show.id}?season=${s}&episode=${e}`;
  // Title page: a click selects an episode (ring) and the footer button plays it; clicking the
  // selected card again plays it too. Starts on the episode passed in, else the resume point.
  // In the player the list is a quick switcher, so a click plays straight away.
  // Only an episode opened from elsewhere (Airing this week, the new-episode card) is selected;
  // clicking a card always plays it.
  const sel = selected ?? null;
  const selEp = sel && sel.season === season ? data?.episodes.find((x) => x.episode_number === sel.episode) : undefined;
  const selUnaired = !!selEp && isFuture(selEp.air_date);
  const resumeCta = resume?.season !== undefined ? { s: resume.season, e: resume.episode!, label: resume.isNext ? 'Play' : 'Resume' } : null;
  const cta =
    sel && !selUnaired
      ? { s: sel.season, e: sel.episode, label: resumeCta && resumeCta.s === sel.season && resumeCta.e === sel.episode ? resumeCta.label : 'Play' }
      : (resumeCta ?? { s: first, e: 1, label: 'Play' });

  return (
    <Modal label={`${titleOf(show)} episodes`} onClose={onClose}>
    <div className="fixed inset-0 flex items-end justify-center bg-black/70 md:items-center md:p-8" onClick={onClose}>
      <div
        className="toast-in flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-transparent bg-surface shadow-2xl md:h-[84dvh] md:max-w-5xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 md:px-7 md:pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold md:text-xl">Episodes</h2>
            <p className="truncate text-sm text-muted">{titleOf(show)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className={btn({ icon: true })}>
            <X className="size-5" />
          </button>
        </div>

        <div ref={tabs} className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-5 pt-1 pb-4 md:px-7" role="group" aria-label="Seasons">
          {seasons.map((s) => (
            <button
              key={s.season_number}
              aria-pressed={s.season_number === season}
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

        <div ref={list} className="flex-1 overflow-y-auto overscroll-contain border-t border-line px-5 py-5 md:px-7">
          {isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i}>
                  <Bone className="aspect-video rounded-b-none rounded-t-2xl" />
                  <div className="h-[112px] rounded-b-2xl border border-t-0 border-white/[0.08] p-3.5">
                    <Bone className="h-4 w-3/4" />
                    <Bone className="mt-2 h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <ErrorBox onRetry={() => refetch()} message="Couldn’t load this season." />
          ) : !data.episodes.length ? (
            <p className="py-16 text-center text-muted">No episodes listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.episodes.map((ep) => {
                const h = progress.get(ep.episode_number);
                const pct = percent(h);
                const upcoming = isFuture(ep.air_date);
                const isCurrent = current?.season === season && current.episode === ep.episode_number;
                const isSelected = sel?.season === season && sel.episode === ep.episode_number;
                const watched = h?.progress && !h.isCompleted ? Math.max(1, Math.round(h.progress.watched / 60)) : 0;
                const body = (
                  <>
                    <div className="relative overflow-hidden rounded-t-2xl">
                      {ep.still_path ? (
                        <Img path={ep.still_path} kind="still" sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw" alt="" className="aspect-video" imgClassName={upcoming ? 'opacity-50' : undefined} />
                      ) : (
                        // No still yet (usually upcoming): the show's backdrop, blurred, with a short note.
                        <div className="relative aspect-video overflow-hidden bg-white/[0.04]">
                          {show.backdrop_path && (
                            <Img path={show.backdrop_path} kind="backdrop" sizes="300px" alt="" className="absolute! inset-0 scale-110 opacity-40 blur-lg" />
                          )}
                          <span className="absolute inset-0 grid place-items-center text-caption text-white/70">{upcoming ? 'Not out yet' : 'No image'}</span>
                        </div>
                      )}
                      {/* Play hint: in the player any card plays; on the title page only the selected one does. */}
                      {!upcoming && (
                        <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                          <span className="grid size-11 place-items-center rounded-full bg-white text-black">
                            <Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
                          </span>
                        </span>
                      )}
                      {(isCurrent || upcoming) && (
                        <span className="absolute top-2.5 left-2.5">
                          {isCurrent ? <Chip light>Now playing</Chip> : <Chip>{airsLabel(ep.air_date)}</Chip>}
                        </span>
                      )}
                      {h?.isCompleted ? (
                        <span className="absolute bottom-2.5 left-2.5">
                          <Chip>
                            <Check className="size-3.5" /> Watched
                          </Chip>
                        </span>
                      ) : watched ? (
                        <span className="absolute bottom-2.5 left-2.5">
                          <Chip light>{formatRuntime(watched)}</Chip>
                        </span>
                      ) : null}
                      {ep.runtime ? (
                        <span className="absolute right-2.5 bottom-2.5">
                          <Chip>{formatRuntime(ep.runtime)}</Chip>
                        </span>
                      ) : null}
                      {pct > 0 && !h?.isCompleted && (
                        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                          <span className="block h-full bg-white" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </div>
                    <div className={cx(CARD_INFO, 'min-h-[112px] flex-1 px-3.5 pt-2.5 pb-3', (isCurrent || isSelected) && 'border-white/30')}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-muted tabular-nums">{ep.episode_number}</span>
                        <h3 className={cx('line-clamp-2 min-w-0 text-body-sm font-medium text-balance', upcoming ? 'text-white/70' : 'text-white/95')}>{ep.name}</h3>
                      </div>
                      {!upcoming && ep.air_date && <div className="text-caption text-faint">{formatDate(ep.air_date)}</div>}
                      {ep.overview ? (
                        <p className="mt-1.5 text-caption leading-[1.4] text-pretty text-muted">{ep.overview}</p>
                      ) : (
                        // No synopsis yet: blurred stand-in text with a short note (reads as "not available", not "loading").
                        <div className="relative mt-1.5">
                          <p aria-hidden className="text-caption leading-[1.4] text-muted blur-[3px] select-none">
                            The story for this episode hasn't been shared yet, check back closer to the air date.
                          </p>
                          <span className="absolute inset-0 grid place-items-center text-caption text-white/70">{upcoming ? 'Synopsis coming soon' : 'No synopsis'}</span>
                        </div>
                      )}
                    </div>
                  </>
                );
                return upcoming ? (
                  <div key={ep.id} data-ep={ep.episode_number} aria-disabled className={cx('flex flex-col rounded-2xl', isSelected && SELECTED)}>
                    {body}
                  </div>
                ) : (
                  <Link key={ep.id} data-ep={ep.episode_number} to={href(season, ep.episode_number)} replace={replace} onClick={onPick} className={cx('group flex flex-col rounded-2xl', isSelected && SELECTED)} aria-current={isCurrent || undefined}>
                    {body}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className={cx('flex shrink-0 items-center gap-3 border-t border-line px-5 py-4 md:px-7', current && !prev && !next && 'hidden lg:flex')}>
          <div className="hidden items-center gap-4 text-xs text-faint lg:flex">
            {seasons.length > 1 && (
              <span className="flex items-center gap-1.5">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> Season
              </span>
            )}
            {current && prev && (
              <span className="flex items-center gap-1.5">
                <Kbd>Shift P</Kbd> Previous
              </span>
            )}
            {current && next && (
              <span className="flex items-center gap-1.5">
                <Kbd>Shift N</Kbd> Next
              </span>
            )}
            {!current && !selUnaired && (
              <span className="flex items-center gap-1.5">
                <Kbd>P</Kbd> {cta.label}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd> Close
            </span>
          </div>
          {/* Player: previous / next episode, where the details page has its play button. */}
          {current && (prev || next) && (
            <div className="ml-auto flex items-center gap-2.5">
              <button
                onClick={() => prev?.()}
                disabled={!prev}
                className={btn({ size: 'lg' })}
              >
                <SkipBack className="size-4 fill-current" />
                Previous
              </button>
              <button
                onClick={() => next?.()}
                disabled={!next}
                className={btn({ variant: 'primary', size: 'lg' })}
              >
                <SkipForward className="size-4 fill-current" />
                Next

              </button>
            </div>
          )}
          {!current &&
            (selUnaired && sel ? (
              // The selected episode isn't out yet: nothing to play, just say when it will be.
              <span className={cx(btn({ size: 'lg' }), 'pointer-events-none ml-auto cursor-default text-white/70')}>
                <CalendarClock className="size-4" strokeWidth={1.5} />
                {epLabel(sel.season, sel.episode)} · {airsLabel(selEp?.air_date).replace(/^Airs /, 'Out ')}
              </span>
            ) : (
              <Link to={href(cta.s, cta.e)} replace={replace} onClick={onPick} className={cx(btn({ variant: 'primary', size: 'lg' }), 'ml-auto')}>
                <Play className="size-4 fill-current" strokeWidth={0} />
                {cta.label} {epLabel(cta.s, cta.e)}
              </Link>
            ))}
        </div>
      </div>
    </div>
    </Modal>
  );
}
