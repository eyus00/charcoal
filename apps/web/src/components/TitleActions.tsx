import { Link } from 'react-router';
import { Play, Share2 } from 'lucide-react';
import { btn } from './Button';
import Kbd from './Kbd';
import { Tip } from './Tip';
import { toast } from './Toast';
import { epLabel } from '../lib/episodes';
import { findProgress, percent, resumeTarget, useStore } from '../lib/store';
import type { MediaType } from '../lib/tmdb';
import { cx } from '../lib/util';

/**
 * The title's main button, everywhere it appears (details page, peeks):
 * - movie: plays, or resumes where you stopped ("Resume", with a progress bar in the button);
 * - TV: opens the episode list (its footer resumes / plays), labelled with what's next
 *   ("Resume S1 E3", "Play S2 E1").
 */
export function PlayTitleButton({
  id,
  type,
  onEpisodes,
  size = 'lg',
  kbd,
  className,
}: {
  id: number;
  type: MediaType;
  onEpisodes: () => void;
  size?: 'md' | 'lg';
  /** Show the P key cue. */
  kbd?: boolean;
  className?: string;
}) {
  const history = useStore((s) => s.history);
  const cls = cx(btn({ variant: 'primary', size }), 'relative overflow-hidden', size === 'md' && 'h-9 px-4 text-sm', className);
  const icon = <Play className={size === 'md' ? 'size-3.5 fill-current' : 'size-4 fill-current'} strokeWidth={0} />;
  // How far you got, as a thin bar along the button's bottom edge.
  const bar = (pct: number) =>
    pct > 1 && pct < 100 ? (
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-black/15">
        <span className="block h-full bg-black/70" style={{ width: `${pct}%` }} />
      </span>
    ) : null;
  if (type === 'movie') {
    const p = findProgress(history, 'movie', id);
    const resumable = p && !p.isCompleted && percent(p) > 1;
    return (
      <Link to={`/watch/movie/${id}`} className={cls} aria-label={resumable ? `Resume, ${Math.round(percent(p))}% watched` : undefined}>
        {icon}
        {resumable ? 'Resume' : size === 'md' ? 'Watch' : 'Watch now'}
        {kbd && <Kbd light>P</Kbd>}
        {resumable && bar(percent(p))}
      </Link>
    );
  }
  const r = resumeTarget(history, 'tv', id);
  const label = r?.season !== undefined ? `${r.isNext ? 'Play' : 'Resume'} ${epLabel(r.season, r.episode)}` : size === 'md' ? 'Watch' : 'Watch now';
  const pct = r && !r.isNext ? percent(r.item) : 0;
  return (
    <button type="button" onClick={onEpisodes} className={cls} aria-haspopup="dialog">
      {icon}
      {label}
      {kbd && <Kbd light>P</Kbd>}
      {bar(pct)}
    </button>
  );
}

/** Share a title's page: the system share sheet on phones, else copy the link. */
export function ShareButton({ title, path, size = 'lg', className }: { title: string; path?: string; size?: 'md' | 'lg'; className?: string }) {
  const share = async () => {
    const url = path ? new URL(path, window.location.origin).toString() : window.location.href.split('?')[0];
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Couldn’t copy the link. Copy it from the address bar.');
    }
  };
  return (
    <button type="button" onClick={share} aria-label="Share" className={cx(btn({ size, icon: true }), 'group/tip relative', size === 'md' && 'size-9!', className)}>
      <Share2 className={size === 'md' ? 'size-4' : 'size-[18px]'} />
      <Tip label="Share" />
    </button>
  );
}
