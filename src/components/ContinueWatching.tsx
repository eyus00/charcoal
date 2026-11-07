import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { Eye, Film, History, Play, Tv, X } from 'lucide-react';
import Img from './Img';
import { Scroller, SectionHeader } from './Row';
import { actions, percent, watchUrl, type HistoryItem } from '../lib/store';
import { q } from '../lib/tmdb';

const fmt = (min: number) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`);

/**
 * The original "Continue Watching" row: wide cards with the episode still,
 * runtime and time-left badges, progress bar, and S/E + episode name.
 */
export default function ContinueWatching({ items, title = 'Continue Watching', subtitle = 'Pick up where you left off' }: { items: HistoryItem[]; title?: string; subtitle?: string }) {
  // Episode stills/names come from the season lists (cached, and shared with the details page).
  const seasonQueries = useQueries({
    queries: items.map((h) => {
      const target = h.isCompleted && h.nextEpisode ? h.nextEpisode : { season: h.season ?? 1, episode: h.episode ?? 1 };
      return { ...q.season(h.id, target.season), enabled: h.mediaType === 'tv' && h.season !== undefined };
    }),
  });

  if (!items.length) return null;
  return (
    <section>
      <SectionHeader icon={History} title={title} subtitle={subtitle} />
      <Scroller label={title}>
        {items.map((h, i) => {
          const isNext = h.mediaType === 'tv' && h.isCompleted && !!h.nextEpisode;
          const s = isNext ? h.nextEpisode!.season : h.season;
          const e = isNext ? h.nextEpisode!.episode : h.episode;
          const ep = seasonQueries[i]?.data?.episodes.find((x) => x.episode_number === e);
          const pct = isNext ? 0 : percent(h);
          const total = h.progress ? Math.floor(h.progress.duration / 60) : (ep?.runtime ?? 0);
          const left = h.progress && !isNext ? Math.max(1, Math.floor((h.progress.duration - h.progress.watched) / 60)) : 0;
          const still = ep?.still_path;
          return (
            <div
              key={h.mediaType + h.id}
              role="listitem"
              className="group relative flex w-[240px] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2 transition duration-300 hover:scale-[1.02] hover:border-white/10 hover:bg-white/[0.08] md:w-[340px] md:gap-4 md:rounded-3xl md:p-3"
            >
              <Link to={watchUrl(h)} className="relative block overflow-hidden rounded-2xl shadow-xl">
                <Img
                  path={still ?? h.backdropPath ?? h.posterPath}
                  kind={still ? 'still' : h.backdropPath ? 'backdrop' : 'poster'}
                  sizes="(min-width: 768px) 320px, 224px"
                  alt={h.title}
                  className="aspect-video"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100" />
                {total > 0 && (
                  <span className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/80 px-2.5 py-1 text-xs font-bold tracking-wider uppercase shadow-lg">{fmt(total)}</span>
                )}
                <span className="absolute right-3 bottom-3">
                  {isNext ? (
                    <span className="rounded-lg border border-white/10 bg-accent/80 px-2.5 py-1 text-xs font-bold tracking-wider uppercase shadow-lg">Up next</span>
                  ) : h.isCompleted ? (
                    <span className="flex items-center gap-1 rounded-lg border border-white/10 bg-green-500/80 px-2.5 py-1 text-xs font-bold tracking-wider uppercase shadow-lg">
                      <Eye className="size-3.5" /> Watched
                    </span>
                  ) : left > 0 ? (
                    <span className="rounded-lg border border-white/10 bg-accent/80 px-2.5 py-1 text-xs font-bold tracking-wider uppercase shadow-lg">{fmt(left)} left</span>
                  ) : null}
                </span>
                <span className="absolute inset-0 flex scale-90 items-center justify-center opacity-0 transition duration-300 group-hover:scale-100 group-hover:opacity-100">
                  <span className="grid size-16 place-items-center rounded-full border-2 border-white/20 bg-accent shadow-2xl">
                    <Play className="ml-1 size-9 fill-current" />
                  </span>
                </span>
                {pct > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
                    <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
                  </span>
                )}
              </Link>
              <div className="flex flex-col gap-1.5 px-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/${h.mediaType}/${h.id}`} className="truncate text-base leading-tight font-bold transition-colors hover:text-accent md:text-lg">
                    {h.title}
                  </Link>
                  <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5">
                    {h.mediaType === 'movie' ? <Film className="size-3.5 text-white/60" /> : <Tv className="size-3.5 text-white/60" />}
                  </span>
                </div>
                {h.mediaType === 'tv' && s !== undefined && (
                  <p className="truncate text-[10px] font-bold tracking-wider text-white/40 uppercase md:text-xs">
                    {s === 0 ? 'Special' : `S${s}`} • E{e}
                    {(ep?.name ?? (!isNext ? h.episodeTitle : undefined)) && <span className="text-white/25"> · {ep?.name ?? h.episodeTitle}</span>}
                  </p>
                )}
              </div>
              <button
                onClick={() => actions.removeHistory(h.mediaType, h.id)}
                aria-label={`Remove ${h.title} from continue watching`}
                title="Remove"
                className="absolute top-4 right-4 grid size-8 place-items-center rounded-full border border-white/10 bg-black/70 opacity-0 transition group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 md:top-5 md:right-5 [@media(hover:none)]:opacity-100"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </Scroller>
    </section>
  );
}
