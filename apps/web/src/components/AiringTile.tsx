import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellRing } from 'lucide-react';
import { Dialog } from './Modal';
import { NoSynopsis, Synopsis } from './Synopsis';
import Img from './Img';
import { Chip } from './EpisodeTile';
import { CARD_IMAGE, CARD_INFO, CARD_TITLE, CornerArc, TypeIcon } from './MediaCard';
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
 * The frame special releases get: an outline drawn just outside the image, with the label set into
 * its top edge (PREMIERE, FINALE, NEW TO STREAMING…). It takes no space, so framed and plain cards
 * are the same size and line up. `bg` is the colour behind the label. It makes no stacking layer
 * of its own: what's drawn behind the image (a stack's sheets) covers the outline, not the reverse.
 */
export function Frame({ label, bg = 'bg-bg', children }: { label?: string; bg?: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {label && (
        <>
          <span aria-hidden className="pointer-events-none absolute -inset-[6.5px] rounded-[22px] border-[1.5px] border-white/50" />
          <span className={cx('absolute -top-[15.5px] left-2.5 z-[3] px-1.5 text-[10.5px] leading-[15px] font-bold tracking-[0.14em] whitespace-nowrap text-white uppercase', bg)}>{label}</span>
        </>
      )}
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
    <div className={cx('group relative', className)}>
      {/* The whole card is one link (or, for a stack, one button) under the content, so the show name can be a link too. */}
      {onClick ? (
        <button type="button" onClick={onClick} {...hover} aria-haspopup="dialog" aria-label={`${line1}, ${a.title}: show all ${stack + 1} episodes`} className={stretched} />
      ) : (
        <Link to={to ?? linkOf(a)} {...hover} aria-label={`${line1}, ${line2 ?? ''}`} className={stretched} />
      )}
      <div className="pointer-events-none relative [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <div className="relative">
          {/* The rest of the stack: sheets behind the card, each a step higher and narrower (like a
              deck of cards seen from the front); they lift a little on hover. */}
          {stacked?.slice(0, 2).map((e, i) => (
            <span
              key={`${e.season}-${e.number}`}
              aria-hidden
              style={{ inset: i ? '-16px 30px 16px 30px' : '-8px 15px 8px 15px', zIndex: 1 - i }}
              className={cx(
                'absolute overflow-hidden rounded-2xl bg-raised ring-1 transition-transform duration-300',
                i ? 'ring-white/20 group-hover:-translate-y-1.5' : 'ring-white/30 group-hover:-translate-y-0.5',
              )}
            >
              <Img path={null} src={e.image ?? image} kind="still" sizes="120px" alt="" className="size-full" imgClassName={i ? 'brightness-[0.3]' : 'brightness-[0.5]'} />
            </span>
          ))}
          <div>
            <Frame label={label}>
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
        </div>
        <div className={CARD_INFO}>
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
  return (
    <>
      <Card a={a} ep={undefined} label={labelOf(a, 0, eps.length)} stacked={eps.slice(1)} showDate={!calendar} className={className} onClick={() => setOpen(true)} />
      {/* Tapping a stack: its episodes in a pop-up, laid out like the episode list. */}
      {open && (
        <Dialog title={a.title} subtitle={`${eps.length} episodes`} onClose={() => setOpen(false)} wide>
          <div className="grid grid-cols-1 gap-1 pt-5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8">
            {eps.map((e, i) => (
              <EpisodeCard key={`${e.season}-${e.number}`} a={a} ep={e} label={labelOf(a, i, eps.length)} />
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** One episode of a stack, like a card in the episode list: still, number and name, date, synopsis. */
function EpisodeCard({ a, ep, label }: { a: Airing; ep: AiringEpisode; label?: string }) {
  const upcoming = startOfDay(new Date(a.at)).getTime() > Date.now();
  return (
    <Link to={`/tv/${a.id}?episodes=${ep.season}&ep=${ep.number}`} className="group flex gap-3 rounded-2xl py-2.5 sm:flex-col sm:gap-0 sm:py-0">
      <div className="w-[44%] shrink-0 self-start pt-2 sm:w-full sm:pt-0">
        <Frame label={label} bg="bg-surface">
          <div className={CARD_IMAGE}>
            <Img path={null} src={ep.image ?? a.image} kind="still" sizes="(min-width: 640px) 320px, 45vw" alt="" className="aspect-video" />
            {ep.runtime ? (
              <span className="absolute right-2 bottom-2">
                <Chip>{formatRuntime(ep.runtime)}</Chip>
              </span>
            ) : null}
            <span className="absolute top-2 right-2 z-10">
              <ReminderBell a={a} ep={ep} />
            </span>
          </div>
        </Frame>
      </div>
      <div className={cx(CARD_INFO, 'min-w-0 flex-1 sm:pt-2.5')}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-muted tabular-nums">{ep.season === 0 ? 'Special' : ep.number}</span>
          <h3 className="line-clamp-2 min-w-0 text-body-sm font-medium text-balance text-white/95">{ep.name || `Episode ${ep.number}`}</h3>
        </div>
        <div className="text-caption text-faint">{dateLabel(a.at)}</div>
        {ep.overview ? <Synopsis text={ep.overview} title={`${seLabel(ep.season, ep.number)} ${ep.name}`} /> : <NoSynopsis n={ep.number} upcoming={upcoming} />}
      </div>
    </Link>
  );
}

export function AiringTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="skeleton aspect-video rounded-2xl" />
      <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded-md" />
      <div className="skeleton mt-2 h-3 w-1/2 rounded-md" />
    </div>
  );
}
