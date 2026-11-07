import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Play } from 'lucide-react';
import Img from './Img';
import { EpisodeSkeleton } from './Skeletons';
import { ErrorBox } from './Grid';
import { percent, useStore, type HistoryItem } from '../lib/store';
import { q, type SeasonSummary } from '../lib/tmdb';
import { cx, formatDate, formatRuntime, isFuture } from '../lib/util';

export function SeasonPicker({
  seasons,
  value,
  onChange,
  className,
}: {
  seasons: SeasonSummary[];
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  if (seasons.length <= 1 && seasons[0]?.season_number === value) {
    return <div className={cx('text-sm font-medium', className)}>{seasons[0]?.name ?? `Season ${value}`}</div>;
  }
  return (
    <label className={cx('relative inline-block', className)}>
      <span className="sr-only">Season</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 appearance-none rounded-lg border border-line bg-surface pr-9 pl-3 text-sm font-medium outline-none hover:border-white/30"
      >
        {seasons.map((s) => (
          <option key={s.season_number} value={s.season_number}>
            {s.season_number === 0 ? 'Specials' : s.name || `Season ${s.season_number}`} ({s.episode_count})
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}

interface Props {
  tvId: number;
  season: number;
  current?: { season: number; episode: number };
  compact?: boolean;
  onSelect?: () => void;
}

export default function EpisodeList({ tvId, season, current, compact, onSelect }: Props) {
  const { data, isPending, isError, refetch } = useQuery(q.season(tvId, season));
  const history = useStore((s) => s.history);
  const progress = useMemo(() => {
    const map = new Map<number, HistoryItem>();
    for (const h of history) if (h.mediaType === 'tv' && h.id === tvId && h.season === season && !map.has(h.episode!)) map.set(h.episode!, h);
    return map;
  }, [history, tvId, season]);

  if (isPending) return <div className="space-y-1">{Array.from({ length: compact ? 6 : 4 }, (_, i) => <EpisodeSkeleton key={i} />)}</div>;
  if (isError) return <ErrorBox onRetry={() => refetch()} message="Couldn't load episodes." />;
  if (!data.episodes.length) return <p className="py-8 text-center text-muted">No episodes listed yet.</p>;

  return (
    <ol className="space-y-1">
      {data.episodes.map((ep) => {
        const h = progress.get(ep.episode_number);
        const pct = percent(h);
        const isCurrent = current?.season === season && current.episode === ep.episode_number;
        const upcoming = isFuture(ep.air_date);
        return (
          <li key={ep.id}>
            <Link
              to={`/watch/tv/${tvId}?season=${season}&episode=${ep.episode_number}`}
              replace={compact}
              onClick={onSelect}
              aria-current={isCurrent ? 'true' : undefined}
              className={cx(
                'group flex gap-3 rounded-lg p-2 transition-colors sm:gap-4',
                isCurrent ? 'bg-white/10' : 'hover:bg-white/5',
                upcoming && 'opacity-60',
              )}
            >
              <div className="relative shrink-0">
                <Img
                  path={ep.still_path}
                  kind="still"
                  sizes={compact ? '128px' : '(min-width: 640px) 176px, 144px'}
                  alt=""
                  className={cx('aspect-video rounded-md', compact ? 'w-32' : 'w-36 sm:w-44')}
                />
                <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                  <Play className="size-7 fill-white text-white drop-shadow" />
                </div>
                {pct > 0 && !h?.isCompleted && (
                  <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-start gap-2">
                  <h3 className="line-clamp-2 text-sm font-medium">
                    <span className="text-muted">{ep.episode_number}.</span> {ep.name}
                  </h3>
                  {h?.isCompleted && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-label="Watched" />}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {upcoming ? `Airs ${formatDate(ep.air_date)}` : [formatRuntime(ep.runtime), formatDate(ep.air_date)].filter(Boolean).join(' · ')}
                  {h && !h.isCompleted && h.progress && ` · ${Math.max(1, Math.round((h.progress.duration - h.progress.watched) / 60))}m left`}
                </div>
                {!compact && ep.overview && <p className="mt-1.5 line-clamp-2 text-sm text-white/65">{ep.overview}</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
