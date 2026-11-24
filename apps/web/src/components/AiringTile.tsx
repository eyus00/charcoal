import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellRing, ChevronLeft, ChevronRight } from 'lucide-react';
import Img from './Img';
import { Chip } from './EpisodeTile';
import { CARD_IMAGE, CARD_TITLE, CornerArc, TypeIcon } from './MediaCard';
import { Tip } from './Tip';
import { toast } from './Toast';
import { episodePeekProps, peekProps } from '../lib/peek';
import { useInLibrary } from '../lib/library';
import { toggleReminder, useReminders, type Reminder } from '../lib/reminders';
import { DAY, startOfDay, type Airing, type AiringEpisode, type Label } from '../lib/schedule';
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
export function Frame({ label, bg = 'bg-bg', fill, children }: { label?: string; bg?: string; fill?: boolean; children: React.ReactNode }) {
  return (
    <div className={cx('relative rounded-[22px] border-[1.5px] p-[5px]', label ? 'border-white/50' : 'border-transparent', fill && bg)}>
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
        'group/tip relative grid size-9 place-items-center rounded-full transition-[background-color,opacity]',
        on
          ? 'bg-white text-black'
          : 'bg-black/75 text-white hover:bg-black/90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
      )}
    >
      {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      <Tip label={library ? 'In your library: you’ll be notified' : own ? 'Reminder on · click to remove' : 'Remind me (adds it to your calendar)'} side="bottom" align="end" />
    </button>
  );
}

const STARTS: Label[] = ['Premiere', 'New season', 'Full season', 'Special'];
const ENDS: Label[] = ['Finale', 'Series finale'];
/**
 * The tag one episode of a batch carries: its own when known; otherwise the batch's, on the
 * episode it belongs to (a premiere on the first, a finale on the last), never on all of them.
 */
function labelOf(a: Airing, i: number, n: number): Label | undefined {
  const eps = a.episodes ?? [];
  const tags = eps.map((e, k) => ('label' in e ? e.label : k === 0 ? a.label : undefined)).concat(a.label ?? []);
  // A batch has one finale, on its last episode, and one premiere, on its first, however the
  // episodes themselves are tagged (a two-part finale is often tagged on both, or the first).
  const end = tags.find((t) => t && ENDS.includes(t));
  const start = tags.find((t) => t && STARTS.includes(t));
  if (n > 1) return i === n - 1 && end ? end : i === 0 && start ? start : undefined;
  return end ?? start ?? a.label;
}

/** One card: image (frame, runtime, bell), then two lines and, outside the Calendar, the date. */
function Card({
  a,
  ep,
  to,
  showDate,
  className,
  onClick,
  stacked,
  label,
}: {
  a: Airing;
  ep?: AiringEpisode;
  to?: string;
  showDate: boolean;
  className?: string;
  onClick?: () => void;
  /** The rest of the day's episodes, drawn as sheets behind this card. */
  stacked?: AiringEpisode[];
  label?: string;
}) {
  const tv = a.type === 'tv';
  const first = ep ?? a.episodes?.[0];
  const stack = stacked?.length ?? 0;
  // Shows: the episode is the headline, the show under it. Films: the title, then year · rating.
  // Shows: the episode is the headline, then the date, then the show (a link of its own).
  // Films: the title, the date, then year · rating. A stack reads like its first episode.
  const line1 = tv && first ? `${seLabel(first.season, first.number)}${first.name ? ` ${first.name}` : ''}` : a.title;
  const line2 = tv ? a.title : a.se;
  const runtime = ep ? ep.runtime : stack ? first?.runtime : a.runtime;
  const image = ep?.image ?? first?.image ?? a.image;
  // A stack's tap fans it out (not the touch-screen peek).
  const hover = tv && first ? episodePeekProps(a.id, first.season, first.number, { tap: !onClick }) : peekProps(a.type, a.id, { tap: !onClick });
  const stretched = 'absolute inset-0 z-0 rounded-2xl';
  return (
    <div className={cx('group relative', stack > 0 && 'mr-4', className)}>
      {/* The whole card is one link (or, for a stack, one button) under the content, so the show name can be a link too. */}
      {onClick ? (
        <button type="button" onClick={onClick} {...hover} aria-expanded={false} aria-label={`${line1}, ${a.title}: show all ${stack + 1} episodes`} className={stretched} />
      ) : (
        <Link to={to ?? linkOf(a)} {...hover} aria-label={`${line1}, ${line2 ?? ''}`} className={stretched} />
      )}
      <div className="pointer-events-none relative [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <div className="relative">
          {/* The rest of the stack: outlined sheets behind the card, stepping out to the right. */}
          {stacked?.slice(0, 2).map((e, i) => (
            <span
              key={`${e.season}-${e.number}`}
              aria-hidden
              style={{ inset: i ? '24px -26px 24px 40px' : '12px -13px 12px 20px', zIndex: 1 - i }}
              className={cx(
                'absolute overflow-hidden rounded-2xl bg-raised shadow-[-8px_0_16px_rgba(0,0,0,0.6)] ring-[1.5px] transition-transform duration-300 group-hover:translate-x-[3px]',
                i ? 'ring-white/30' : 'ring-white/55',
              )}
            >
              <Img path={null} src={e.image ?? image} kind="still" sizes="120px" alt="" className="size-full" imgClassName={i ? 'brightness-[0.35]' : 'brightness-[0.55]'} />
            </span>
          ))}
          <div className="relative z-[2]">
            <Frame label={label} fill={stack > 0}>
              <div className={CARD_IMAGE}>
                <Img path={null} src={image} kind="still" sizes="(min-width: 640px) 300px, 260px" alt="" className="aspect-video" />
                {runtime ? (
                  <span className="absolute right-2 bottom-2">
                    <Chip>{formatRuntime(runtime)}</Chip>
                  </span>
                ) : null}
                {!stack && (
                  <span className="absolute top-2 right-2 z-10">
                    <ReminderBell a={a} ep={ep} />
                  </span>
                )}
              </div>
            </Frame>
          </div>
          {/* Hovering a stack: an arrow says it opens out. */}
          {stack > 0 && (
            <span
              aria-hidden
              className="absolute top-1/2 -right-4 z-[3] grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white text-black opacity-0 shadow-lg shadow-black/50 transition-opacity duration-200 group-hover:opacity-100"
            >
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
        <div className="relative pt-2 pr-2.5 pb-2 pl-[6.5px]">
          <div className={CARD_TITLE}>{line1}</div>
          {showDate && <div className="text-caption text-faint">{dateLabel(a.at, !tv)}</div>}
          <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted">
            {tv ? (
              <Link to={`/tv/${a.id}`} className="relative z-10 min-w-0 truncate decoration-white/80 decoration-1 underline-offset-[3px] transition-colors hover:text-white hover:underline">
                {line2}
              </Link>
            ) : (
              <span className="min-w-0 truncate">{line2}</span>
            )}
            <TypeIcon type={a.type} />
          </div>
          <CornerArc />
        </div>
      </div>
    </div>
  );
}

/**
 * A release (new episode / film) as a card, the same everywhere. Several episodes of a show the
 * same day are always one stack: the card with the others as sheets behind it. Tapping it fans
 * them out, grouped in one tray with a button at its end to fold them back.
 * `calendar`: under a day heading, so no date line.
 */
export default function AiringTile({ a, calendar, className }: { a: Airing; calendar?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const eps = a.episodes ?? [];
  if (a.kind !== 'episode' || eps.length < 2) return <Card a={a} ep={eps[0]} label={a.kind === 'episode' ? labelOf(a, 0, 1) : a.label} showDate={!calendar} className={className} />;
  if (!open) return <Card a={a} ep={undefined} label={labelOf(a, 0, eps.length)} stacked={eps.slice(1)} showDate={!calendar} className={className} onClick={() => setOpen(true)} />;
  // Opened: the episodes side by side on a tray. The tray's backdrop hangs outside the cards
  // (absolutely placed), so opening and closing never changes the row's height.
  return (
    <div role="group" aria-label={`${a.title}, ${eps.length} episodes`} className="relative flex shrink-0 snap-start gap-3">
      <span aria-hidden className="absolute inset-y-0 -right-1 -left-1.5 rounded-[24px] bg-white/[0.035] ring-1 ring-white/[0.07]" />
      {eps.map((e, i) => (
        <div key={`${e.season}-${e.number}`} className="fade-in relative" style={{ animationDelay: `${Math.min(i, 6) * 40}ms`, animationFillMode: 'both' }}>
          <Card a={a} ep={e} label={labelOf(a, i, eps.length)} to={`/tv/${a.id}?episodes=${e.season}&ep=${e.number}`} showDate={!calendar} className={className} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="group/tip relative my-[6.5px] grid w-10 shrink-0 place-items-center self-stretch rounded-2xl text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
        aria-label={`Stack ${a.title}’s episodes again`}
      >
        <ChevronLeft className="size-5" />
        <Tip label="Stack them again" side="bottom" align="end" />
      </button>
    </div>
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
