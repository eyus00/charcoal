import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Columns3, Rows3 } from 'lucide-react';
import AiringTile, { AiringTileSkeleton, reminderOf } from '../components/AiringTile';
import { Pill } from '../components/Row';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import { downloadIcs } from '../lib/reminders';
import { DAY, startOfDay, useSchedule, type Airing } from '../lib/schedule';
import { startTraktLogin, useTraktUser } from '../lib/trakt';
import { cx, useTitle } from '../lib/util';

type Filter = 'all' | 'yours' | 'shows' | 'movies';
type View = 'week' | 'day';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['yours', 'Your shows'],
  ['shows', 'Shows'],
  ['movies', 'Movies'],
];

const VIEW_KEY = 'charcoal:calendar-view';
const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'week' || v === 'day') return v;
  } catch {
    /* storage blocked */
  }
  return 'week';
};

/** Wide enough for seven columns? (Below that, the day view is the only view.) */
function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * New episodes, premieres and movie releases, a week at a time: a week grid on wide screens and a
 * day view (with a day strip) everywhere. Only what's relevant to you (lib/schedule). Every card
 * can get a reminder or go into your own calendar.
 */
export default function Calendar() {
  useTitle('Calendar');
  const user = useTraktUser();
  const wide = useWide();
  const [viewPref, setViewPref] = useState<View>(readView);
  const view: View = wide ? viewPref : 'day';
  const setView = (v: View) => {
    setViewPref(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage blocked */
    }
  };
  const [filter, setFilter] = useState<Filter>('all');
  // Weeks start today (so "this week" is always the next seven days).
  const [week, setWeek] = useState(0);
  const today = startOfDay(new Date()).getTime();
  const start = useMemo(() => new Date(today + week * 7 * DAY), [today, week]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => start.getTime() + i * DAY), [start]);
  const [selected, setSelected] = useState(days[0]);
  useEffect(() => setSelected(days[0]), [days]);

  const { items, isPending, isError, refetch } = useSchedule(start, 7, 8);
  const shown = useMemo(() => items.filter((a) => (filter === 'yours' ? a.yours : filter === 'shows' ? a.kind === 'episode' : filter === 'movies' ? a.kind === 'movie' : true)), [items, filter]);
  const byDay = useMemo(() => {
    const m = new Map<number, Airing[]>(days.map((d) => [d, []]));
    for (const a of shown) m.get(startOfDay(new Date(a.at)).getTime())?.push(a);
    return m;
  }, [shown, days]);

  const fmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString(undefined, o);
  const range = `${fmt(days[0], { month: 'short', day: 'numeric' })} – ${fmt(days[6], { month: 'short', day: 'numeric' })}`;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-muted">What’s coming out that you’ll care about: your shows, big premieres and notable movies.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-full bg-surface p-1 sm:flex-none">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setWeek((w) => w - 1)}
              className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-36 flex-1 text-center text-sm tabular-nums">{week === 0 ? 'Next 7 days' : range}</span>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setWeek((w) => w + 1)}
              className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {week !== 0 && (
            <button type="button" onClick={() => setWeek(0)} className={cx(btn(), 'h-11')}>
              Today
            </button>
          )}
          {wide && (
            <div className="flex rounded-full bg-surface p-1" role="group" aria-label="View">
              {(
                [
                  ['week', 'Week', Columns3],
                  ['day', 'Day', Rows3],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cx('flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition', view === v ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex items-center gap-2">
        <div
          className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:pr-0 sm:[mask-image:none]"
          role="group"
          aria-label="Show"
        >
          {FILTERS.map(([k, label]) => (
            <Pill key={k} on={filter === k} onClick={() => setFilter(k)}>
              {label}
            </Pill>
          ))}
        </div>
        <button
          type="button"
          disabled={!shown.length}
          onClick={() =>
            downloadIcs(
              `Charcoal ${range}`,
              shown.map((a) => ({ ...reminderOf(a), minutes: a.runtime })),
            )
          }
          aria-label="Add this week to your calendar"
          className={cx(btn(), 'group/tip relative shrink-0 disabled:opacity-40')}
        >
          <CalendarPlus className="size-4" /> <span className="hidden sm:inline">Add week</span>
          <Tip label="Download this week as an .ics file for your calendar app" side="bottom" align="end" />
        </button>
      </div>

      {filter === 'yours' && !user && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted">Showing shows from your watchlist and history. Connect Trakt to include everything you follow there.</p>
          <button type="button" onClick={() => startTraktLogin('/calendar')} className={cx(btn(), 'h-9 px-4 text-sm')}>
            Connect Trakt
          </button>
        </div>
      )}

      {isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl bg-surface/60 text-center">
          <p className="text-muted">Couldn’t load the calendar.</p>
          <button type="button" onClick={() => refetch()} className={btn()}>
            Try again
          </button>
        </div>
      ) : view === 'week' ? (
        <WeekGrid days={days} byDay={byDay} loading={isPending} onDay={(d) => (setSelected(d), setView('day'))} />
      ) : (
        <>
          <DayStrip days={days} byDay={byDay} loading={isPending} selected={selected} onSelect={setSelected} />
          <DayList day={selected} items={byDay.get(selected) ?? []} loading={isPending} filter={filter} />
        </>
      )}
    </div>
  );
}

const dayNum = (t: number) => new Date(t).getDate();
const weekday = (t: number, long = false) => new Date(t).toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });

/** Seven columns, one per day: a calendar's week view. */
function WeekGrid({ days, byDay, loading, onDay }: { days: number[]; byDay: Map<number, Airing[]>; loading: boolean; onDay: (d: number) => void }) {
  const today = startOfDay(new Date()).getTime();
  return (
    <div className="grid grid-cols-7 gap-3 xl:gap-4">
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        const isToday = d === today;
        return (
          <section key={d} aria-label={new Date(d).toDateString()} className="min-w-0">
            <button type="button" onClick={() => onDay(d)} className="group/tip relative mb-3 flex w-full items-baseline gap-2 rounded-2xl px-1 py-1 text-left transition-colors hover:bg-white/[0.04]">
              <span className={cx('grid size-9 shrink-0 place-items-center rounded-full text-base font-semibold tabular-nums', isToday ? 'bg-white text-black' : 'text-white')}>{dayNum(d)}</span>
              <span className="min-w-0">
                <span className={cx('block text-sm font-medium', isToday ? 'text-white' : 'text-white/85')}>{isToday ? 'Today' : weekday(d)}</span>
                <span className="block text-xs text-faint">{loading ? ' ' : list.length ? `${list.length} release${list.length === 1 ? '' : 's'}` : 'Nothing'}</span>
              </span>
              <Tip label="Open this day" side="bottom" align="start" />
            </button>
            <div className="min-h-[28rem] space-y-4 rounded-3xl bg-surface/40 p-2.5 ring-1 ring-white/[0.04]">
              {loading ? (
                Array.from({ length: 3 }, (_, i) => <AiringTileSkeleton key={i} />)
              ) : list.length ? (
                list.map((a) => <AiringTile key={a.key} a={a} compact />)
              ) : (
                <p className="px-2 pt-3 text-xs text-faint">Nothing notable.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The week as seven day buttons with how much is on each; picks the day for the day view. */
function DayStrip({ days, byDay, loading, selected, onSelect }: { days: number[]; byDay: Map<number, Airing[]>; loading: boolean; selected: number; onSelect: (d: number) => void }) {
  const today = startOfDay(new Date()).getTime();
  return (
    <div className="grid grid-cols-7 gap-1.5 rounded-3xl bg-surface p-1.5 sm:gap-2" role="tablist" aria-label="Days">
      {days.map((d) => {
        const on = d === selected;
        const n = byDay.get(d)?.length ?? 0;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(d)}
            className={cx('flex flex-col items-center gap-0.5 rounded-2xl py-2.5 transition-colors', on ? 'bg-white text-black' : 'text-white/80 hover:bg-white/[0.06] hover:text-white')}
          >
            <span className={cx('text-micro font-medium tracking-wide uppercase sm:text-xs', on ? 'text-black/60' : d === today ? 'text-white' : 'text-faint')}>
              {d === today ? 'Today' : weekday(d)}
            </span>
            <span className="text-lg font-semibold tabular-nums sm:text-xl">{dayNum(d)}</span>
            {/* How busy the day is: up to four dots. */}
            <span className="flex h-1.5 gap-0.5" aria-label={loading ? undefined : `${n} releases`}>
              {!loading && Array.from({ length: Math.min(4, n) }, (_, i) => <span key={i} className={cx('size-1 rounded-full', on ? 'bg-black/50' : 'bg-white/50')} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One day: big cards, grouped as your shows first, then the rest. */
function DayList({ day, items, loading, filter }: { day: number; items: Airing[]; loading: boolean; filter: Filter }) {
  const grid = 'grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
  const yours = items.filter((a) => a.yours);
  const rest = items.filter((a) => !a.yours);
  const title = new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <section aria-label={title} className="min-h-[24rem]">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
      {loading ? (
        <div className={grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <AiringTileSkeleton key={i} />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-3xl bg-surface/60 px-6 text-center">
          <CalendarDays className="mb-1 size-7 text-faint" />
          <p className="font-medium">Nothing notable on this day</p>
          <p className="max-w-sm text-sm text-muted">{filter === 'yours' ? 'None of your shows air today. Add shows to your watchlist to follow them here.' : 'Try another day this week.'}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {yours.length > 0 && rest.length > 0 && filter !== 'yours' ? (
            <>
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted">Your shows</h3>
                <div className={grid}>
                  {yours.map((a) => (
                    <AiringTile key={a.key} a={a} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted">Also out</h3>
                <div className={grid}>
                  {rest.map((a) => (
                    <AiringTile key={a.key} a={a} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className={grid}>
              {items.map((a) => (
                <AiringTile key={a.key} a={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
