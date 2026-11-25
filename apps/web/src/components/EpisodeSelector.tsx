import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Play, SkipBack, SkipForward, X } from 'lucide-react';
import Img from './Img';
import Modal from './Modal';
import { btn } from './Button';
import { Chip } from './EpisodeTile';
import LibraryButton from './LibraryButton';
import { useSwipeToClose } from '../lib/swipe';
import { NoSynopsis, Synopsis } from './Synopsis';
import { Frame, ReminderBell, dateLabel, seLabel } from './AiringTile';
import Kbd from './Kbd';
import { ErrorBox } from './Grid';
import { Bone } from './Skeletons';
import { allSeasons, epLabel, regularSeasons } from '../lib/episodes';
import { percent, resumeTarget, useStore, type HistoryItem } from '../lib/store';
import { q, titleOf, type Details, type Episode } from '../lib/tmdb';
import { cx, formatDate, formatRuntime, isFuture, isTypingTarget } from '../lib/util';

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
/** Blurred stand-in synopses, varied in length so the cards don't look identical. */

/** Where you left a show's episode list (season, scroll), so it reopens there. */
type Position = { season: number; scroll: number };
const POS_KEY = 'charcoal:episode-positions';
function readPosition(id: number): Position | undefined {
  try {
    return (JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') as Record<string, Position>)[id];
  } catch {
    return undefined;
  }
}
function savePosition(id: number, p: Position) {
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') as Record<string, Position & { at?: number }>;
    all[id] = { ...p, at: Date.now() };
    // Keep the 50 most recent shows.
    const kept = Object.fromEntries(
      Object.entries(all)
        .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
        .slice(0, 50),
    );
    localStorage.setItem(POS_KEY, JSON.stringify(kept));
  } catch {
    /* storage blocked */
  }
}

/** An episode's synopsis: three lines, then "more" opens it whole in a popup. */

/** What's special about an upcoming episode (shown as the card's frame label). */
function releaseLabel(ep: Episode) {
  if (ep.episode_type === 'finale' || ep.episode_type === 'mid_season') return 'Finale';
  if (ep.episode_number === 1) return ep.season_number <= 1 ? 'Premiere' : 'New season';
  return undefined;
}

/** Ring around the episode opened from elsewhere (Airing this week, the new-episode card). */
/** On a phone's small still, the corner chips are the small ones the player's picker uses. */
const PHONE_CHIPS = 'max-sm:[&>span.absolute>span]:px-1.5 max-sm:[&>span.absolute>span]:py-px max-sm:[&>span.absolute>span]:text-micro max-sm:[&>span.top-2\\.5]:top-1 max-sm:[&>span.left-2\\.5]:left-1 max-sm:[&>span.bottom-2\\.5]:bottom-1 max-sm:[&>span.right-2\\.5]:right-1';
const SELECTED = 'ring-2 ring-white/80 ring-offset-4 ring-offset-surface';

export default function EpisodeSelector({ show, current, initialSeason, onSeasonChange, onClose, replace, onPick, prev, next, selected }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const history = useStore((s) => s.history);
  const sheet = useRef<HTMLDivElement>(null);
  useSwipeToClose(sheet, onClose, 767);
  const seasons = allSeasons(show);
  const resume = resumeTarget(history, 'tv', show.id);
  // Where it opens: an episode asked for (or playing), else where you left the list last time,
  // else where you'd resume, else the latest release (not season 1 of a long-running show).
  const remembered = useRef(readPosition(show.id)).current;
  const latest = show.last_episode_to_air ? { season: show.last_episode_to_air.season_number, episode: show.last_episode_to_air.episode_number } : undefined;
  const focus = selected ?? current ?? (resume?.season !== undefined ? { season: resume.season, episode: resume.episode! } : undefined) ?? (remembered ? undefined : latest);
  const first = regularSeasons(show)[0]?.season_number ?? seasons[0]?.season_number ?? 1;
  const [season, setSeason] = useState(() =>
    initialSeason !== undefined && seasons.some((s) => s.season_number === initialSeason)
      ? initialSeason
      : !selected && !current && remembered && seasons.some((s) => s.season_number === remembered.season)
        ? remembered.season
        : (focus?.season ?? first),
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

  // Bring the relevant episode into view once the season has loaded; or, reopening, where you were.
  const list = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (!restored.current && !selected && !current && remembered?.season === season) {
      restored.current = true;
      list.current?.scrollTo({ top: remembered.scroll });
      return;
    }
    restored.current = true;
    if (focus?.season !== season) return;
    list.current?.querySelector(`[data-ep="${focus.episode}"]`)?.scrollIntoView({ block: 'center' });
  }, [data, season, focus?.season, focus?.episode]);
  // Remember the season and scroll position for next time (per show).
  // (Tracked as you scroll: by the time the list unmounts it's out of the page and reads 0.)
  const seasonRef = useRef(season);
  seasonRef.current = season;
  const scrollRef = useRef(0);
  useEffect(() => {
    const el = list.current;
    const onScroll = () => (scrollRef.current = el?.scrollTop ?? 0);
    el?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el?.removeEventListener('scroll', onScroll);
      savePosition(show.id, { season: seasonRef.current, scroll: scrollRef.current });
    };
  }, [show.id]);

  // keep the selected season's tab visible (long-running shows have dozens)
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabs.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [season]);

  const pick = (n: number) => {
    setSeason(n);
    onSeasonChange?.(n);
    list.current?.scrollTo({ top: 0 });
    scrollRef.current = 0;
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
          ref={sheet}
          className="toast-in relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-transparent bg-surface shadow-2xl md:h-[84dvh] md:max-w-5xl md:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/25 md:hidden" />
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 md:px-7 md:pt-6">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold md:text-xl">{titleOf(show)}</h2>
                <p className="truncate text-sm text-muted">Episodes</p>
              </div>
              {/* The library button right after the show's name, as on its page. */}
              <LibraryButton
                size="md"
                className="ml-1"
                item={{ id: show.id, mediaType: 'tv', title: titleOf(show), posterPath: show.poster_path, releaseDate: show.first_air_date, ratingScore: show.vote_average }}
              />
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
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex gap-3 p-1.5 sm:block sm:p-0">
                    <Bone className="aspect-video w-[46%] shrink-0 rounded-xl sm:w-auto sm:rounded-2xl" />
                    <div className="flex-1 sm:h-[112px] sm:pt-3">
                      <Bone className="h-4 w-3/4" />
                      <Bone className="mt-2 h-3 w-1/3" />
                      <Bone className="mt-3 h-3 w-full sm:hidden" />
                      <Bone className="mt-1.5 h-3 w-4/5 sm:hidden" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <ErrorBox onRetry={() => refetch()} message="Couldn’t load this season." />
            ) : !data.episodes.length ? (
              <p className="py-16 text-center text-muted">No episodes listed yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {data.episodes.map((ep) => {
                  const h = progress.get(ep.episode_number);
                  const pct = percent(h);
                  const upcoming = isFuture(ep.air_date);
                  const isCurrent = current?.season === season && current.episode === ep.episode_number;
                  const isSelected = sel?.season === season && sel.episode === ep.episode_number;
                  const watched = h?.progress && !h.isCompleted ? Math.max(1, Math.round(h.progress.watched / 60)) : 0;
                  const body = (
                    <>
                      {/* Phones: the player's small picker, a little larger (still left, text right, both starting at the same line); larger screens: a card. */}
                      <div className="w-[46%] shrink-0 self-start sm:w-full sm:self-stretch">
                        <Frame label={upcoming ? releaseLabel(ep) : undefined} bg="bg-surface">
                          <div className={cx('relative overflow-hidden rounded-xl sm:rounded-2xl', isCurrent && !isSelected && 'ring-2 ring-white/70', PHONE_CHIPS)}>
                            {ep.still_path ? (
                              <Img
                                path={ep.still_path}
                                kind="still"
                                sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
                                alt=""
                                className="aspect-video"
                                imgClassName={upcoming ? 'opacity-50' : undefined}
                              />
                            ) : (
                              // No still yet (usually upcoming): a calm placeholder; the tag says when it airs.
                              <div className="grid aspect-video place-items-center bg-white/[0.04]">
                                <CalendarClock className="size-6 text-faint" strokeWidth={1.5} />
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
                            {isCurrent && (
                              <span className="absolute top-2.5 left-2.5">
                                <Chip light>Now playing</Chip>
                              </span>
                            )}
                            {/* Not out yet: nothing to play; the bell reminds you of this one. */}
                            {upcoming && ep.air_date && (
                              <span className="absolute top-2 right-2">
                                <ReminderBell
                                  a={{
                                    key: `tv-${show.id}-${season}-${ep.episode_number}`,
                                    kind: 'episode',
                                    type: 'tv',
                                    id: show.id,
                                    title: titleOf(show),
                                    at: new Date(`${ep.air_date}T00:00:00`).getTime(),
                                    yours: false,
                                    score: 0,
                                  }}
                                  ep={{ season, number: ep.episode_number, name: ep.name }}
                                />
                              </span>
                            )}
                            {/* Watched / how far you got (white, bottom-left), runtime (bottom-right): as in Continue watching. */}
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
                        </Frame>
                      </div>
                      <div className="relative min-w-0 flex-1 py-0.5 sm:min-h-[112px] sm:pt-2 sm:pr-2.5 sm:pb-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm text-muted tabular-nums">{ep.episode_number}</span>
                          <h3 className={cx('line-clamp-1 min-w-0 text-sm font-medium sm:line-clamp-2 sm:text-body-sm sm:text-balance', upcoming ? 'text-white/70' : 'text-white/95')}>{ep.name}</h3>
                        </div>
                        <div className="text-xs text-faint sm:text-caption">
                          {upcoming ? (ep.air_date ? dateLabel(new Date(`${ep.air_date}T00:00:00`).getTime()) : 'Date TBA') : ep.air_date ? formatDate(ep.air_date) : ''}
                        </div>
                        {/* Phones: two plain lines, as in the player's picker. */}
                        {ep.overview && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted sm:hidden">{ep.overview}</p>}
                        <div className="hidden sm:block">
                          {ep.overview ? <Synopsis text={ep.overview} title={`${seLabel(season, ep.episode_number)} ${ep.name}`} /> : <NoSynopsis n={ep.episode_number} upcoming={upcoming} />}
                        </div>
                      </div>
                    </>
                  );
                  return upcoming ? (
                    <div key={ep.id} data-ep={ep.episode_number} aria-disabled className={cx('flex gap-3 rounded-2xl p-1.5 sm:flex-col sm:gap-0 sm:p-0', isSelected && SELECTED)}>
                      {body}
                    </div>
                  ) : (
                    <Link
                      key={ep.id}
                      data-ep={ep.episode_number}
                      to={href(season, ep.episode_number)}
                      replace={replace}
                      onClick={onPick}
                      className={cx('group flex gap-3 rounded-2xl p-1.5 sm:flex-col sm:gap-0 sm:p-0', isSelected && SELECTED)}
                      aria-current={isCurrent || undefined}
                    >
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
              <span className="flex items-center gap-1.5">
                <Kbd>Esc</Kbd> Close
              </span>
            </div>
            {/* Player: previous / next episode, where the details page has its play button. */}
            {current && (prev || next) && (
              <div className="ml-auto flex items-center gap-2.5">
                <button onClick={() => prev?.()} disabled={!prev} className={btn({ size: 'lg' })}>
                  <SkipBack className="size-4 fill-current" />
                  Previous
                </button>
                <button onClick={() => next?.()} disabled={!next} className={btn({ variant: 'primary', size: 'lg' })}>
                  <SkipForward className="size-4 fill-current" />
                  Next
                </button>
              </div>
            )}
            {!current &&
              (selUnaired && sel ? (
                // The selected episode isn't out yet: nothing to play; say when, and offer the library.
                <div className="ml-auto flex min-w-0 items-center gap-3">
                  <span className="min-w-0 truncate text-sm text-muted">
                    {epLabel(sel.season, sel.episode)} · {selEp?.air_date ? dateLabel(new Date(`${selEp.air_date}T00:00:00`).getTime()) : 'Date TBA'}
                  </span>
                  <LibraryButton item={{ id: show.id, mediaType: 'tv', title: titleOf(show), posterPath: show.poster_path, releaseDate: show.first_air_date, ratingScore: show.vote_average }} />
                </div>
              ) : (
                <Link to={href(cta.s, cta.e)} replace={replace} onClick={onPick} className={cx(btn({ variant: 'primary', size: 'lg' }), 'ml-auto')}>
                  <Play className="size-4 fill-current" strokeWidth={0} />
                  {cta.label} {epLabel(cta.s, cta.e)}
                  {!current && (
                    <Kbd light className="ml-1">
                      P
                    </Kbd>
                  )}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
