import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import AiringTile, { AiringTileSkeleton, linkOf } from '../components/AiringTile';
import { Scroller } from '../components/Row';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import { downloadIcs } from '../lib/reminders';
import { DAY, startOfDay, useSchedule, type Airing } from '../lib/schedule';
import { cx, useTitle } from '../lib/util';

type Section = 'yours' | 'explore';
type View = 'week' | 'day';

const VIEW_KEY = 'charcoal:calendar-view';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week';
  } catch {
    return 'week';
  }
};

const dayNum = (t: number) => new Date(t).getDate();
const weekday = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
const TILE_W = 'w-[240px] shrink-0 snap-start sm:w-[272px]';

/**
 * What's coming out, a week at a time. "Your shows": shows you follow, watch or saved, and movies on
 * your watchlist (followed shows get reminders). "Explore": the notable rest (lib/schedule), where
 * you follow shows or add movies to To watch.
 */
export default function Calendar() {
  useTitle('Calendar');
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage blocked */
    }
  };
  const [section, setSection] = useState<Section>('yours');
  const [week, setWeek] = useState(0);
  const today = startOfDay(new Date()).getTime();
  const start = useMemo(() => new Date(today + week * 7 * DAY), [today, week]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => start.getTime() + i * DAY), [start]);
  const [selected, setSelected] = useState(days[0]);
  useEffect(() => setSelected(days[0]), [days]);

  const { items, isPending, isError, refetch } = useSchedule(start, 7, 6);
  const yours = useMemo(() => items.filter((a) => a.yours), [items]);
  const explore = useMemo(() => items.filter((a) => !a.yours), [items]);
  const shown = section === 'yours' ? yours : explore;
  const byDay = useMemo(() => {
    const m = new Map<number, Airing[]>(days.map((d) => [d, []]));
    for (const a of shown) m.get(startOfDay(new Date(a.at)).getTime())?.push(a);
    return m;
  }, [shown, days]);

  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const range = `${fmt(days[0])} – ${fmt(days[6])}`;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-end gap-4">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight md:text-3xl">Calendar</h1>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex flex-1 items-center rounded-full bg-surface p-1 sm:flex-none">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setWeek((w) => w - 1)}
              className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => setWeek(0)} className="min-w-32 flex-1 rounded-full text-center text-sm tabular-nums">
              {week === 0 ? 'This week' : range}
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setWeek((w) => w + 1)}
              className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="flex shrink-0 rounded-full bg-surface p-1" role="group" aria-label="View">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cx('h-9 rounded-full px-4 text-sm capitalize transition', view === v ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-surface p-1" role="tablist" aria-label="Section">
          {(
            [
              ['yours', 'Your shows', yours.length],
              ['explore', 'Explore', 0],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={section === k}
              onClick={() => setSection(k)}
              className={cx('flex h-9 items-center gap-1.5 rounded-full px-4 text-sm transition', section === k ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
            >
              {label}
              {!isPending && n > 0 && <span className={cx('text-xs tabular-nums', section === k ? 'text-black/50' : 'text-faint')}>{n}</span>}
            </button>
          ))}
        </div>
        {section === 'yours' && yours.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadIcs(
                `Charcoal ${range}`,
                yours.map((a) => ({ key: a.key, title: a.title, body: a.sub, at: a.at, allDay: true, url: linkOf(a) })),
              )
            }
            aria-label="Add this week to your calendar app"
            className={cx(btn({ icon: true }), 'group/tip relative ml-auto')}
          >
            <CalendarPlus className="size-4" />
            <Tip label="Add this week to your calendar app (.ics)" side="bottom" align="end" />
          </button>
        )}
      </div>

      {isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl bg-surface/60 text-center">
          <p className="text-muted">Couldn’t load the calendar.</p>
          <button type="button" onClick={() => refetch()} className={btn()}>
            Try again
          </button>
        </div>
      ) : !isPending && !shown.length ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-3xl bg-surface/60 px-6 text-center">
          {section === 'yours' ? <CalendarDays className="mb-1 size-7 text-faint" /> : <Compass className="mb-1 size-7 text-faint" />}
          <p className="font-medium">{section === 'yours' ? 'Nothing from your shows this week' : 'Nothing notable this week'}</p>
          <p className="max-w-sm text-sm text-muted">
            {section === 'yours' ? 'Follow shows in Explore, or add them to your watchlist, and their new episodes show up here with reminders.' : 'Try next week.'}
          </p>
          {section === 'yours' && (
            <button type="button" onClick={() => setSection('explore')} className={cx(btn({ variant: 'primary' }), 'mt-3')}>
              Explore
            </button>
          )}
        </div>
      ) : view === 'week' ? (
        <div className="divide-y divide-white/[0.06]">
          {days.map((d) => (
            <DayRow key={d} day={d} items={byDay.get(d) ?? []} loading={isPending} />
          ))}
        </div>
      ) : (
        <>
          <DayStrip days={days} byDay={byDay} loading={isPending} selected={selected} onSelect={setSelected} />
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {isPending ? (
              Array.from({ length: 4 }, (_, i) => <AiringTileSkeleton key={i} />)
            ) : (byDay.get(selected) ?? []).length ? (
              (byDay.get(selected) ?? []).map((a) => <AiringTile key={a.key} a={a} />)
            ) : (
              <p className="col-span-full py-16 text-center text-sm text-muted">Nothing on this day.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Week view: one row per day, its releases side by side. */
function DayRow({ day, items, loading }: { day: number; items: Airing[]; loading: boolean }) {
  const isToday = day === startOfDay(new Date()).getTime();
  return (
    <section aria-label={new Date(day).toDateString()} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-5 first:pt-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-5">
      <div className="pt-1">
        <p className={cx('text-xs font-medium tracking-wide uppercase', isToday ? 'text-white' : 'text-faint')}>{isToday ? 'Today' : weekday(day)}</p>
        <p className={cx('text-2xl font-semibold tabular-nums', !isToday && 'text-white/85')}>{dayNum(day)}</p>
      </div>
      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 3 }, (_, i) => (
            <AiringTileSkeleton key={i} className={TILE_W} />
          ))}
        </div>
      ) : items.length ? (
        <Scroller label={new Date(day).toDateString()} bleed={false}>
          {items.map((a) => (
            <AiringTile key={a.key} a={a} className={TILE_W} />
          ))}
        </Scroller>
      ) : (
        <p className="self-center text-sm text-faint">Nothing</p>
      )}
    </section>
  );
}

/** Day view: the week as seven buttons, dots for how much is on. */
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
            <span className="flex h-1.5 gap-0.5">
              {!loading && Array.from({ length: Math.min(4, n) }, (_, i) => <span key={i} className={cx('size-1 rounded-full', on ? 'bg-black/50' : 'bg-white/50')} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
