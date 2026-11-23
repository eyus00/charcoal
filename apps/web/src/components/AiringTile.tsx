import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
import Img from './Img';
import { Chip } from './EpisodeTile';
import FollowButton from './FollowButton';
import { CARD_IMAGE, CARD_TITLE, CornerArc, TypeIcon } from './MediaCard';
import { Dialog } from './Modal';
import { peekProps } from '../lib/peek';
import { DAY, startOfDay, type Airing } from '../lib/schedule';
import { cx, formatRuntime } from '../lib/util';

const fullDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The date pill: "Airs today", "Airs tomorrow", "Airs 26 Nov 2026", "Aired yesterday"; films "Out …". */
export function dateLabel(at: number, film = false) {
  const d = startOfDay(new Date(at)).getTime();
  const today = startOfDay(new Date()).getTime();
  const past = d < today;
  const verb = film ? 'Out' : past ? 'Aired' : 'Airs';
  if (d === today) return `${verb} today`;
  if (d === today + DAY) return `${verb} tomorrow`;
  if (d === today - DAY) return `${verb} yesterday`;
  return `${verb} ${fullDate(d)}`;
}

/** "Today", "Tomorrow", "Thursday" or "Nov 30" (day headings). */
export function dayName(at: number, long = true) {
  const d = startOfDay(new Date(at)).getTime();
  const today = startOfDay(new Date()).getTime();
  if (d === today) return 'Today';
  if (d === today + DAY) return 'Tomorrow';
  if (d === today - DAY) return 'Yesterday';
  if (d > today && d < today + 7 * DAY) return new Date(d).toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const linkOf = (a: Airing) => (a.type === 'tv' && a.season !== undefined ? `/tv/${a.id}?episodes=${a.season}&ep=${a.episode}` : `/${a.type}/${a.id}`);

/**
 * The frame special releases get: an outline around the image with the label set into its top
 * edge (PREMIERE, FINALE, NEW TO STREAMING…). Without a label the frame is invisible but keeps
 * its size, so framed and plain cards line up. `bg` is the colour behind the label.
 */
export function Frame({ label, bg = 'bg-bg', children }: { label?: string; bg?: string; children: React.ReactNode }) {
  return (
    <div className={cx('relative rounded-[22px] border-[1.5px] p-[5px]', label ? 'border-white/50' : 'border-transparent')}>
      {label && <span className={cx('absolute -top-[9px] left-4 z-[2] px-1.5 text-[10.5px] leading-[15px] font-bold tracking-[0.14em] whitespace-nowrap text-white uppercase', bg)}>{label}</span>}
      {children}
    </div>
  );
}

/**
 * A release (new episode / film) as a card, the same everywhere: frame + label when special, the
 * date pill, runtime, Follow. Several episodes the same day: one card with their total runtime and
 * a button listing them all in a popup (so nothing on the page resizes). `details`: offer that
 * button for a single episode too (Calendar).
 */
export default function AiringTile({ a, details, className }: { a: Airing; details?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const eps = a.episodes ?? [];
  const showEps = a.kind === 'episode' && (eps.length > 1 || (details && eps.length === 1));
  return (
    <div className={cx('group relative', className)}>
      <Link to={linkOf(a)} {...peekProps(a.type, a.id)} aria-label={`${a.title}${a.se ? `, ${a.se}` : ''}`} className="absolute inset-x-0 top-0 bottom-10 z-0 rounded-2xl" />
      <div className="pointer-events-none relative">
        <Frame label={a.label}>
          <div className={CARD_IMAGE}>
            <Img path={null} src={a.image} kind="still" sizes="(min-width: 640px) 300px, 260px" alt="" className="aspect-video" />
            <span className="absolute top-2 left-2">
              <Chip>{a.at ? dateLabel(a.at, a.kind === 'movie') : 'Date TBA'}</Chip>
            </span>
            {a.runtime ? (
              <span className="absolute right-2 bottom-2">
                <Chip>{formatRuntime(a.runtime)}</Chip>
              </span>
            ) : null}
            <span className="pointer-events-auto absolute top-2 right-2">
              <FollowButton type={a.type} id={a.id} title={a.title} variant="card" />
            </span>
          </div>
        </Frame>
        <div className="relative pt-2 pr-2.5 pb-2 pl-[6.5px]">
          <div className={CARD_TITLE}>{a.title}</div>
          <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted">
            {a.se && <span className="shrink-0">{a.se}</span>}
            {a.epName && <span className="min-w-0 truncate">{a.epName}</span>}
            <TypeIcon type={a.type} />
          </div>
          <CornerArc />
        </div>
      </div>
      {showEps && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="relative ml-[6.5px] flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          {eps.length > 1 ? `${eps.length} episodes` : 'Episode details'}
          <ChevronDown className="size-4" />
        </button>
      )}
      {open && <EpisodesDialog a={a} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Every episode of a release, in a popup: still, "E1 · Name", runtime, synopsis. */
function EpisodesDialog({ a, onClose }: { a: Airing; onClose: () => void }) {
  const eps = a.episodes ?? [];
  const season = eps[0]?.season;
  return (
    <Dialog
      title={`${a.title}${season ? ` · Season ${season}` : ''}`}
      subtitle={[eps.length > 1 ? `${eps.length} episodes` : null, a.runtime ? formatRuntime(a.runtime) : null, dateLabel(a.at)].filter(Boolean).join(' · ')}
      onClose={onClose}
      wide
    >
      <div className="space-y-1">
        {eps.map((e) => (
          <Link
            key={`${e.season}-${e.number}`}
            to={`/tv/${a.id}?episodes=${e.season}&ep=${e.number}`}
            onClick={onClose}
            className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-3.5 rounded-2xl p-2 transition-colors hover:bg-white/[0.04] sm:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <Img path={null} src={e.image ?? a.image} kind="still" sizes="160px" alt="" className="aspect-video rounded-xl" />
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-white/90">
                E{e.number}
                {e.name ? ` · ${e.name}` : ''}
              </p>
              {e.runtime ? <p className="text-xs text-faint">{formatRuntime(e.runtime)}</p> : null}
              <p className="mt-1 line-clamp-2 text-caption leading-5 text-muted">{e.overview || 'No synopsis yet.'}</p>
            </div>
          </Link>
        ))}
      </div>
    </Dialog>
  );
}

export function AiringTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="p-[6.5px]">
        <div className="skeleton aspect-video rounded-2xl" />
      </div>
      <div className="skeleton mt-2 ml-[6.5px] h-3.5 w-3/4 rounded-md" />
      <div className="skeleton mt-2 ml-[6.5px] h-3 w-1/2 rounded-md" />
    </div>
  );
}
