import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellRing, ChevronLeft } from 'lucide-react';
import Img from './Img';
import { Chip } from './EpisodeTile';
import { CARD_IMAGE, CARD_TITLE, CornerArc, TypeIcon } from './MediaCard';
import { Tip } from './Tip';
import { toast } from './Toast';
import { episodePeekProps, peekProps } from '../lib/peek';
import { useInLibrary } from '../lib/library';
import { toggleReminder, useReminders, type Reminder } from '../lib/reminders';
import { DAY, startOfDay, type Airing, type AiringEpisode } from '../lib/schedule';
import { cx, formatRuntime } from '../lib/util';

const fullDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "Airs today", "Airs tomorrow", "Airs Nov 26, 2026", "Aired yesterday"; films "Out …". */
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

export const linkOf = (a: Airing) => (a.type === 'tv' && a.season !== undefined ? `/tv/${a.id}?episodes=${a.season}&ep=${a.episode}` : `/${a.type}/${a.id}`);

/** "S1 E2", or "Special 3" for season 0. */
export const seLabel = (s: number, e: number) => (s === 0 ? `Special ${e}` : `S${s} E${e}`);

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
 * The bell: a reminder for this one release. Titles in your library notify you anyway, so for them
 * it's already on. With a mouse it shows on hover (and stays when on); on touch it's always there.
 */
export function ReminderBell({ a, ep }: { a: Airing; ep?: AiringEpisode }) {
  const reminders = useReminders();
  const library = useInLibrary(a.type, a.id);
  const key = ep ? `tv-${a.id}-${ep.season}-${ep.number}` : a.key;
  const own = reminders.some((r) => r.key === key);
  const on = library || own;
  const past = startOfDay(new Date(a.at)).getTime() + DAY <= Date.now();
  if (past) return null;
  const reminder: Reminder = {
    key,
    title: a.title,
    body: ep ? `${seLabel(ep.season, ep.number)}${ep.name ? ` ${ep.name}` : ''}` : undefined,
    at: a.at,
    allDay: true,
    url: ep ? `/tv/${a.id}?episodes=${ep.season}&ep=${ep.number}` : linkOf(a),
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (library && !own) return toast(`You’ll be notified: “${a.title}” is in your library`);
        toggleReminder(reminder);
      }}
      aria-pressed={on}
      aria-label={on ? 'Reminder on' : 'Remind me'}
      className={cx(
        'group/tip relative grid size-9 place-items-center rounded-full backdrop-blur-sm transition-[background-color,opacity]',
        on
          ? 'bg-white text-black'
          : 'bg-black/60 text-white hover:bg-black/80 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
      )}
    >
      {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      <Tip label={library ? 'In your library: you’ll be notified' : own ? 'Reminder on · click to remove' : 'Remind me (adds it to your calendar)'} side="bottom" align="end" />
    </button>
  );
}

/** One card: image (frame, runtime, bell), then two lines and, outside the Calendar, the date. */
function Card({
  a,
  ep,
  to,
  showDate,
  className,
  onClick,
  stack = 0,
}: {
  a: Airing;
  ep?: AiringEpisode;
  to?: string;
  showDate: boolean;
  className?: string;
  onClick?: () => void;
  /** Cards stacked behind this one (several episodes the same day). */
  stack?: number;
}) {
  const tv = a.type === 'tv';
  const first = ep ?? a.episodes?.[0];
  // Shows: the episode is the headline, the show under it. Films: the title, then year · rating.
  const line1 = tv && first ? `${seLabel(first.season, first.number)}${first.name ? ` ${first.name}` : ''}` : a.title;
  const line2 = tv ? a.title : a.se;
  const runtime = ep ? ep.runtime : stack ? a.episodes?.[0]?.runtime : a.runtime;
  const image = ep?.image ?? a.image;
  // A stack's tap fans it out (not the touch-screen peek).
  const hover = tv && first ? episodePeekProps(a.id, first.season, first.number, { tap: !onClick }) : peekProps(a.type, a.id, { tap: !onClick });
  const body = (
    <>
      <div className="relative">
        {/* The rest of the stack, peeking out on the right. */}
        {stack > 0 && (
          <>
            <span aria-hidden className="absolute inset-y-[14px] -right-[14px] left-[14px] rounded-2xl bg-white/[0.06] ring-1 ring-white/10" />
            {stack > 1 && <span aria-hidden className="absolute inset-y-[22px] -right-[26px] left-[26px] rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]" />}
          </>
        )}
        <Frame label={a.label}>
          <div className={CARD_IMAGE}>
            <Img path={null} src={image} kind="still" sizes="(min-width: 640px) 300px, 260px" alt="" className="aspect-video" />
            {stack > 0 && (
              <span className="absolute bottom-2 left-2">
                <Chip light>{stack + 1} episodes</Chip>
              </span>
            )}
            {runtime ? (
              <span className="absolute right-2 bottom-2">
                <Chip>{formatRuntime(runtime)}</Chip>
              </span>
            ) : null}
            <span className="absolute top-2 right-2 z-10">
              <ReminderBell a={a} ep={ep} />
            </span>
          </div>
        </Frame>
      </div>
      <div className="relative pt-2 pr-2.5 pb-2 pl-[6.5px]">
        <div className={CARD_TITLE}>{line1}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted">
          <span className="min-w-0 truncate">{line2}</span>
          <TypeIcon type={a.type} />
        </div>
        {showDate && <div className="text-caption text-faint">{dateLabel(a.at, !tv)}</div>}
        <CornerArc />
      </div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} {...hover} aria-label={`${a.title}: show all ${stack + 1} episodes`} className={cx('group relative block text-left', className)}>
      {body}
    </button>
  ) : (
    <Link to={to ?? linkOf(a)} {...hover} aria-label={`${line1}, ${line2 ?? ''}`} className={cx('group relative block', className)}>
      {body}
    </Link>
  );
}

/**
 * A release (new episode / film) as a card, the same everywhere. Several episodes the same day: a
 * stack (the rest peek out on the right); tapping it fans them out as cards in the row, with a
 * button at the end to fold them back. `calendar`: under a day heading, so no date line.
 */
export default function AiringTile({ a, calendar, className }: { a: Airing; calendar?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const eps = a.episodes ?? [];
  if (a.kind !== 'episode' || eps.length < 2) return <Card a={a} ep={eps[0]} showDate={!calendar} className={className} />;
  if (!open) return <Card a={a} showDate={!calendar} className={className} stack={Math.min(eps.length - 1, 2)} onClick={() => setOpen(true)} />;
  return (
    <>
      {eps.map((e) => (
        <Card key={`${e.season}-${e.number}`} a={a} ep={e} to={`/tv/${a.id}?episodes=${e.season}&ep=${e.number}`} showDate={!calendar} className={className} />
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="group/tip relative grid aspect-[9/16] w-12 shrink-0 place-items-center self-start rounded-2xl bg-white/[0.04] text-muted ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-white"
        aria-label="Fold the episodes back"
      >
        <ChevronLeft className="size-5" />
        <Tip label="Fold back" side="bottom" />
      </button>
    </>
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
