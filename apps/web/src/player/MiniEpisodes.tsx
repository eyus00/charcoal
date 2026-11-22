import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Maximize2, SkipBack, SkipForward } from 'lucide-react';
import Img from '../components/Img';
import { Tip } from '../components/Tip';
import { allSeasons } from '../lib/episodes';
import { findProgress, useStore } from '../lib/store';
import { q, type Details } from '../lib/tmdb';
import { cx, formatDate, formatRuntime, isFuture } from '../lib/util';

/**
 * The player's small episode picker, a compact version of the big one: season numbers on top,
 * one episode per row (still with runtime / watched / progress on the left, name, date and
 * synopsis on the right), the playing one white. The expand button opens the big picker.
 */
export default function MiniEpisodes({
  show,
  current,
  onPick,
  onAll,
  onPrev,
  onNext,
}: {
  show: Details;
  current: { season: number; episode: number };
  onPick: (season: number, episode: number) => void;
  onAll: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const qc = useQueryClient();
  const seasons = allSeasons(show);
  const [season, setSeason] = useState(current.season);
  const { data } = useQuery(q.season(show.id, season));
  const history = useStore((s) => s.history);
  const list = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const nameOf = (n: number) => (n === 0 ? 'Specials' : `Season ${n}`);

  // Open on the playing episode, with its season's tab in view.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-1 pb-2">
        {/* Season picker: a small dropdown. */}
        <div
          className="relative min-w-0 flex-1"
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setPicking(false)}
        >
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
            className={cx('flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors', picking ? 'bg-white/10' : 'bg-white/[0.06] hover:bg-white/10')}
          >
            {nameOf(season)}
            <ChevronDown className={cx('size-4 text-muted transition-transform', picking && 'rotate-180')} />
          </button>
          {picking && (
            <div role="listbox" aria-label="Seasons" className="toast-in absolute top-full left-0 z-20 mt-1 max-h-60 w-48 overflow-y-auto overscroll-contain rounded-xl bg-raised p-1 shadow-2xl ring-1 ring-white/10">
              {seasons.map((s) => {
                const on = s.season_number === season;
                return (
                  <button
                    key={s.season_number}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => (setSeason(s.season_number), setPicking(false))}
                    onPointerEnter={() => qc.prefetchQuery(q.season(show.id, s.season_number))}
                    className={cx('flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors', on ? 'bg-white text-black' : 'hover:bg-white/10')}
                  >
                    <span className="flex-1">{nameOf(s.season_number)}</span>
                    {on && <Check className="size-4" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onAll}
          aria-label="All episodes (E)"
          className="group/tip relative grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="size-4" />
          <Tip label="All episodes" keys="E" align="end" />
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain border-t border-white/[0.08] pt-1.5">
        {!data && Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-[96px] rounded-xl" />)}
        {data?.episodes.map((ep) => {
          const playing = season === current.season && ep.episode_number === current.episode;
          const upcoming = !ep.air_date || isFuture(ep.air_date);
          const h = findProgress(history, 'tv', show.id, season, ep.episode_number);
          const watchedMin = h?.progress && !h.isCompleted ? Math.max(1, Math.round(h.progress.watched / 60)) : 0;
          const pct = !h?.isCompleted && h?.progress?.duration ? Math.min(100, (h.progress.watched / h.progress.duration) * 100) : 0;
          return (
            <button
              key={ep.episode_number}
              type="button"
              aria-current={playing}
              disabled={upcoming}
              onClick={() => onPick(season, ep.episode_number)}
              className={cx(
                'flex w-full gap-3 rounded-xl p-1.5 text-left transition-colors disabled:opacity-45',
                playing ? 'bg-white/[0.06]' : 'enabled:hover:bg-white/[0.06]',
              )}
            >
              <span className={cx('relative w-40 shrink-0 self-start overflow-hidden rounded-lg bg-white/5', playing && 'ring-2 ring-white')}>
                <Img path={ep.still_path} kind="still" sizes="160px" alt="" className="aspect-video" />
                {playing && <span className="absolute top-1 left-1 rounded-full bg-white px-1.5 py-px text-micro font-medium text-black">Playing</span>}
                {h?.isCompleted ? (
                  <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-white px-1.5 py-px text-micro font-medium text-black">
                    <Check className="size-3" /> Watched
                  </span>
                ) : watchedMin ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-white px-1.5 py-px text-micro font-medium text-black">{formatRuntime(watchedMin)}</span>
                ) : null}
                {!upcoming && ep.runtime ? (
                  <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1.5 py-px text-micro text-white backdrop-blur-sm">{formatRuntime(ep.runtime)}</span>
                ) : null}
                {pct > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                    <span className="block h-full bg-white" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 py-0.5">
                <span className="line-clamp-1 text-sm font-medium">
                  <span className="mr-1.5 text-faint tabular-nums">{ep.episode_number}</span>
                  {ep.name}
                </span>
                <span className="block text-xs text-faint">
                  {upcoming ? (ep.air_date ? `Airs ${formatDate(ep.air_date)}` : 'Coming soon') : ep.air_date ? formatDate(ep.air_date) : ''}
                </span>
                {ep.overview && <span className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{ep.overview}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {(onPrev || onNext) && (
        <div className="mt-1 grid shrink-0 grid-cols-2 gap-1.5 border-t border-white/[0.08] pt-1.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-sm transition-colors enabled:hover:bg-white/10 disabled:opacity-35"
          >
            <SkipBack className="size-4" /> Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-medium text-black transition-colors enabled:hover:bg-white/85 disabled:opacity-35"
          >
            Next <SkipForward className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
