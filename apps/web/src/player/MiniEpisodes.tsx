import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Maximize2 } from 'lucide-react';
import Img from '../components/Img';
import { allSeasons } from '../lib/episodes';
import { findProgress, useStore } from '../lib/store';
import { q, type Details } from '../lib/tmdb';
import { cx, formatRuntime, isFuture } from '../lib/util';

/**
 * The player's small episode picker, a compact version of the big one: seasons on top, episodes
 * as cards (still, runtime, watched / progress), the playing one ringed. The expand button opens
 * the big picker.
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
      <div className="flex shrink-0 items-center gap-1 pb-2">
        <div ref={tabs} role="group" aria-label="Seasons" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.season_number}
              type="button"
              aria-pressed={s.season_number === season}
              onClick={() => setSeason(s.season_number)}
              onPointerEnter={() => qc.prefetchQuery(q.season(show.id, s.season_number))}
              className={cx(
                'h-8 shrink-0 rounded-full px-3 text-xs whitespace-nowrap transition-colors',
                s.season_number === season ? 'bg-white font-medium text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/10 hover:text-white',
              )}
            >
              {s.season_number === 0 ? 'Specials' : `Season ${s.season_number}`}
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
      <div ref={list} className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto overscroll-contain">
        {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton aspect-video rounded-xl" />)}
        {data?.episodes.map((ep) => {
          const playing = season === current.season && ep.episode_number === current.episode;
          const upcoming = !ep.air_date || isFuture(ep.air_date);
          const h = findProgress(history, 'tv', show.id, season, ep.episode_number);
          const pct = !h?.isCompleted && h?.progress?.duration ? Math.min(100, (h.progress.watched / h.progress.duration) * 100) : 0;
          return (
            <button
              key={ep.episode_number}
              type="button"
              aria-current={playing}
              disabled={upcoming}
              onClick={() => onPick(season, ep.episode_number)}
              className="group/ep rounded-xl p-1 text-left transition-colors enabled:hover:bg-white/[0.06] disabled:opacity-45"
            >
              <span className={cx('relative block overflow-hidden rounded-lg bg-white/5', playing && 'ring-2 ring-white')}>
                <Img path={ep.still_path} kind="still" sizes="200px" alt="" className="aspect-video" />
                {playing ? (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-white px-2 py-0.5 text-micro font-medium text-black">Playing</span>
                ) : h?.isCompleted ? (
                  <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-micro font-medium text-black">
                    <Check className="size-3" /> Watched
                  </span>
                ) : null}
                {upcoming ? (
                  <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-micro backdrop-blur-sm">Soon</span>
                ) : ep.runtime ? (
                  <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-micro backdrop-blur-sm">{formatRuntime(ep.runtime)}</span>
                ) : null}
                {pct > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                    <span className="block h-full bg-white" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </span>
              <span className="mt-1.5 flex items-baseline gap-1.5 px-0.5 text-xs leading-snug">
                <span className="text-faint tabular-nums">{ep.episode_number}</span>
                <span className="line-clamp-1 font-medium text-white/90 group-hover/ep:text-white">{ep.name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
