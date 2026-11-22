import { Link } from 'react-router';
import { Bell, BellRing, CalendarPlus } from 'lucide-react';
import Img from './Img';
import { Chip } from './EpisodeTile';
import { CARD_IMAGE, CARD_INFO, CARD_TITLE, CornerArc, TypeIcon } from './MediaCard';
import { Tip } from './Tip';
import { peekProps } from '../lib/peek';
import { downloadIcs, toggleReminder, useReminders, type Reminder } from '../lib/reminders';
import { DAY, startOfDay, type Airing } from '../lib/schedule';
import { cx } from '../lib/util';

export const timeOf = (a: Airing) => (a.allDay ? (a.tag === 'In theaters' ? 'In theaters' : 'All day') : new Date(a.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));

/** "Today", "Tomorrow", "Thursday" or "Nov 30". */
export function dayName(at: number, long = true) {
  const d = startOfDay(new Date(at)).getTime();
  const today = startOfDay(new Date()).getTime();
  if (d === today) return 'Today';
  if (d === today + DAY) return 'Tomorrow';
  if (d === today - DAY) return 'Yesterday';
  if (d > today && d < today + 7 * DAY) return new Date(d).toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const reminderOf = (a: Airing): Reminder => ({
  key: a.key,
  title: a.title,
  body: a.sub,
  at: a.at,
  allDay: a.allDay,
  url: a.type === 'tv' && a.season ? `/tv/${a.id}?episodes=${a.season}&ep=${a.episode}` : `/${a.type}/${a.id}`,
});

/** Bell (reminder) and calendar (.ics) buttons, as round buttons over the image. */
export function AiringActions({ a, className }: { a: Airing; className?: string }) {
  const reminders = useReminders();
  const on = reminders.some((r) => r.key === a.key);
  const past = (a.allDay ? startOfDay(new Date(a.at)).getTime() + DAY : a.at) < Date.now();
  const round = 'group/tip relative grid size-8 place-items-center rounded-full backdrop-blur-sm transition-colors';
  return (
    <div className={cx('flex gap-1.5', className)}>
      {!past && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleReminder(reminderOf(a));
          }}
          aria-pressed={on}
          aria-label={on ? 'Remove reminder' : 'Remind me'}
          className={cx(round, on ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80')}
        >
          {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          <Tip label={on ? 'Reminder on' : 'Remind me'} side="bottom" align="end" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          downloadIcs(a.sub ? `${a.title} ${a.sub}` : a.title, [{ ...reminderOf(a), minutes: a.runtime }]);
        }}
        aria-label="Add to calendar"
        className={cx(round, 'bg-black/60 text-white hover:bg-black/80')}
      >
        <CalendarPlus className="size-4" />
        <Tip label="Add to your calendar (.ics)" side="bottom" align="end" />
      </button>
    </div>
  );
}

/**
 * A release as a landscape card: still, time and premiere chips, reminder / calendar buttons
 * (on hover with a mouse, always on touch). `compact` for the week grid's narrow columns.
 */
export default function AiringTile({ a, compact, when, className }: { a: Airing; compact?: boolean; when?: 'day' | 'time'; className?: string }) {
  const reminders = useReminders();
  const on = reminders.some((r) => r.key === a.key);
  const label = when === 'day' ? `${dayName(a.at)}${a.allDay ? '' : ` · ${timeOf(a)}`}` : timeOf(a);
  const highlight = a.tag && a.tag !== 'Streaming' && a.tag !== 'In theaters' ? a.tag : null;
  return (
    <div className={cx('group relative', className)}>
      <Link to={reminderOf(a).url} {...peekProps(a.type, a.id)} aria-label={`${a.title}${a.sub ? `, ${a.sub}` : ''}`} className="absolute inset-0 z-0 rounded-2xl" />
      <div className="pointer-events-none relative">
        <div className={CARD_IMAGE}>
          <Img path={null} src={a.image} kind="still" sizes={compact ? '240px' : '(min-width: 640px) 344px, 288px'} alt="" className="aspect-video" />
          <span className="absolute top-2 left-2 flex flex-wrap gap-1.5">
            <Chip>{label}</Chip>
          </span>
          {highlight && (
            <span className="absolute bottom-2 left-2">
              <Chip light>{compact && highlight === 'Series premiere' ? 'Premiere' : highlight}</Chip>
            </span>
          )}
          <AiringActions
            a={a}
            className={cx(
              'pointer-events-auto absolute top-2 right-2 transition-opacity',
              !on && '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
            )}
          />
        </div>
        <div className={CARD_INFO}>
          <div className={CARD_TITLE}>{a.title}</div>
          <div className="flex items-center gap-1.5 text-caption text-muted">
            <span className="truncate">{a.sub ?? (a.tag === 'Streaming' ? 'New on streaming' : a.tag === 'In theaters' ? 'In theaters' : 'Movie')}</span>
            {a.yours && <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-micro text-white/80">Yours</span>}
            <TypeIcon type={a.type} />
          </div>
          <CornerArc />
        </div>
      </div>
    </div>
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
