import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Img from '../components/Img';
import { allSeasons } from '../lib/episodes';
import { findProgress, useStore } from '../lib/store';
import { q, type Details } from '../lib/tmdb';
import { cx, formatRuntime, isFuture } from '../lib/util';

/**
 * The player's small episode list: one season at a time, the playing episode highlighted, with a
 * way out to the full episode picker. Lives in the bottom bar like the subtitles and settings menus.
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
  const seasons = allSeasons(show);
  const [season, setSeason] = useState(current.season);
  const { data } = useQuery(q.season(show.id, season));
  const history = useStore((s) => s.history);
  const idx = seasons.findIndex((s) => s.season_number === season);
  const list = useRef<HTMLDivElement>(null);

  // Open on the playing episode.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 pb-1">
        <button
          type="button"
          aria-label="Previous season"
          disabled={idx <= 0}
          onClick={() => setSeason(seasons[idx - 1].season_number)}
          className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="flex-1 text-center text-sm font-medium">{seasons[idx]?.name ?? `Season ${season}`}</span>
        <button
          type="button"
          aria-label="Next season"
          disabled={idx < 0 || idx >= seasons.length - 1}
          onClick={() => setSeason(seasons[idx + 1].season_number)}
          className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
        {!data &&
          Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[60px] rounded-xl" />)}
        {data?.episodes.map((ep) => {
          const playing = season === current.season && ep.episode_number === current.episode;
          const upcoming = !ep.air_date || isFuture(ep.air_date);
          const h = findProgress(history, 'tv', show.id, season, ep.episode_number);
          const pct = h?.isCompleted ? 100 : h?.progress?.duration ? Math.min(100, (h.progress.watched / h.progress.duration) * 100) : 0;
          return (
            <button
              key={ep.episode_number}
              type="button"
              aria-current={playing}
              disabled={upcoming}
              onClick={() => onPick(season, ep.episode_number)}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors disabled:opacity-40',
                playing ? 'bg-white text-black' : 'enabled:hover:bg-white/10',
              )}
            >
              <span className="relative w-24 shrink-0 overflow-hidden rounded-lg bg-white/5">
                <Img path={ep.still_path} kind="still" sizes="96px" alt="" className="aspect-video" />
                {pct > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/40">
                    <span className="block h-full bg-white" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-snug font-medium">
                  <span className={cx('mr-1.5 tabular-nums', playing ? 'text-black/50' : 'text-faint')}>{ep.episode_number}</span>
                  {ep.name}
                </span>
                <span className={cx('block text-xs', playing ? 'text-black/55' : 'text-muted')}>
                  {playing ? 'Playing' : upcoming ? 'Coming soon' : h?.isCompleted ? 'Watched' : formatRuntime(ep.runtime ?? 0)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 shrink-0 border-t border-white/[0.08] pt-1">
        <button type="button" onClick={onAll} className="flex h-10 w-full items-center justify-center rounded-xl text-sm text-muted transition-colors hover:bg-white/10 hover:text-white">
          All episodes
        </button>
      </div>
    </div>
  );
}
