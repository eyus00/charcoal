import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Maximize2 } from 'lucide-react';
import Img from '../components/Img';
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
}: {
  show: Details;
  current: { season: number; episode: number };
  onPick: (season: number, episode: number) => void;
  onAll: () => void;
}) {
  const qc = useQueryClient();
  const seasons = allSeasons(show);
  const [season, setSeason] = useState(current.season);
  const { data } = useQuery(q.season(show.id, season));
  const history = useStore((s) => s.history);
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);

  // Open on the playing episode, with its season's tab in view.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [data]);
  useEffect(() => {
    tabs.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [season]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-1 pb-2">
        <span className="text-xs text-muted">Season</span>
        <div ref={tabs} role="group" aria-label="Seasons" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.season_number}
              type="button"
              aria-pressed={s.season_number === season}
              aria-label={s.season_number === 0 ? 'Specials' : `Season ${s.season_number}`}
              onClick={() => setSeason(s.season_number)}
              onPointerEnter={() => qc.prefetchQuery(q.season(show.id, s.season_number))}
              className={cx(
                'h-8 min-w-8 shrink-0 rounded-full px-2.5 text-sm tabular-nums transition-colors',
                s.season_number === season ? 'bg-white font-medium text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/10 hover:text-white',
              )}
            >
              {s.season_number === 0 ? 'Sp' : s.season_number}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAll}
          aria-label="All episodes"
          title="All episodes"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain">
        {!data && Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-[92px] rounded-xl" />)}
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
                'flex w-full gap-3 rounded-xl p-2 text-left transition-colors disabled:opacity-45',
                playing ? 'bg-white text-black' : 'bg-white/[0.06] enabled:hover:bg-white/10',
              )}
            >
              <span className="relative w-32 shrink-0 self-start overflow-hidden rounded-lg bg-white/5">
                <Img path={ep.still_path} kind="still" sizes="128px" alt="" className="aspect-video" />
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
                  <span className={cx('mr-1.5 tabular-nums', playing ? 'text-black/45' : 'text-faint')}>{ep.episode_number}</span>
                  {ep.name}
                </span>
                <span className={cx('block text-xs', playing ? 'text-black/55' : 'text-faint')}>
                  {playing ? 'Playing now' : upcoming ? (ep.air_date ? `Airs ${formatDate(ep.air_date)}` : 'Coming soon') : ep.air_date ? formatDate(ep.air_date) : ''}
                </span>
                {ep.overview && <span className={cx('mt-1 line-clamp-2 text-xs leading-snug', playing ? 'text-black/70' : 'text-muted')}>{ep.overview}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
