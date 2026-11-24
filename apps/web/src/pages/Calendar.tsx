import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import AiringTile, { AiringTileSkeleton, linkOf, seLabel } from '../components/AiringTile';
import Img from '../components/Img';
import { Scroller } from '../components/Row';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import { downloadIcs } from '../lib/reminders';
import { episodePeekProps, peekProps } from '../lib/peek';
import { DAY, startOfDay, useSchedule, type Airing } from '../lib/schedule';
import { cx, useTitle } from '../lib/util';

type Section = 'explore' | 'yours';
const NAME: Record<Section, string> = { explore: 'Explore', yours: 'Your shows' };

const dayNum = (t: number) => new Date(t).getDate();
const weekday = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
const TILE_W = 'w-[240px] shrink-0 snap-start sm:w-[272px]';

/**
 * The Release Calendar: a week at a time, a row per day. "Explore" (the default) is the notable
 * releases (lib/schedule); "Your shows" is your library's. Whichever is picked fills the page and
 * the other sits in a panel on the right (below on phones), so both are always in view.
 */
export default function Calendar() {
  useTitle('Release Calendar');
  const [section, setSection] = useState<Section>('explore');
  const [week, setWeek] = useState(0);
  const today = startOfDay(new Date()).getTime();
  const start = useMemo(() => new Date(today + week * 7 * DAY), [today, week]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => start.getTime() + i * DAY), [start]);

  const { items, isPending, isError, refetch } = useSchedule(start, 7, 6);
  const lists = useMemo(() => ({ yours: items.filter((a) => a.yours), explore: items.filter((a) => !a.yours) }), [items]);
  const other: Section = section === 'explore' ? 'yours' : 'explore';
  const main = lists[section];
  const byDay = useMemo(() => {
    const m = new Map<number, Airing[]>(days.map((d) => [d, []]));
    for (const a of main) m.get(startOfDay(new Date(a.at)).getTime())?.push(a);
    return m;
  }, [main, days]);

  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const range = `${fmt(days[0])} – ${fmt(days[6])}`;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight md:text-3xl">Release Calendar</h1>
        <div className="flex w-full items-center rounded-full bg-surface p-1 sm:w-auto">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeek((w) => w - 1)}
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setWeek(0)} className="min-w-36 flex-1 rounded-full text-center text-sm tabular-nums">
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
      </header>

      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-surface p-1" role="tablist" aria-label="Section">
          {(['explore', 'yours'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={section === k}
              onClick={() => setSection(k)}
              className={cx('h-9 rounded-full px-4 text-sm transition', section === k ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
            >
              {NAME[k]}
            </button>
          ))}
        </div>
        {lists.yours.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadIcs(
                `Charcoal ${range}`,
                lists.yours.map((a) => ({ key: a.key, title: a.title, body: a.se, at: a.at, allDay: true, url: linkOf(a) })),
              )
            }
            aria-label="Add your shows this week to your calendar app"
            className={cx(btn({ icon: true }), 'group/tip relative ml-auto')}
          >
            <CalendarPlus className="size-4" />
            <Tip label="Add your shows this week to your calendar app (.ics)" side="bottom" align="end" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          {isError ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl bg-surface/60 text-center">
              <p className="text-muted">Couldn’t load the calendar.</p>
              <button type="button" onClick={() => refetch()} className={btn()}>
                Try again
              </button>
            </div>
          ) : !isPending && !main.length ? (
            <EmptySection section={section} onExplore={() => setSection('explore')} />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {days.map((d) => (
                <DayRow key={d} day={d} items={byDay.get(d) ?? []} loading={isPending} />
              ))}
            </div>
          )}
        </div>
        <SidePanel section={other} items={lists[other]} loading={isPending} onOpen={() => setSection(other)} />
      </div>
    </div>
  );
}

function EmptySection({ section, onExplore }: { section: Section; onExplore: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-3xl bg-surface/60 px-6 text-center">
      {section === 'yours' ? <CalendarDays className="mb-1 size-7 text-faint" /> : <Compass className="mb-1 size-7 text-faint" />}
      <p className="font-medium">{section === 'yours' ? 'Nothing from your shows this week' : 'Nothing notable this week'}</p>
      <p className="max-w-sm text-sm text-muted">
        {section === 'yours' ? 'Add shows and films to your library (the ♥ on their page). Their new episodes and streaming days show up here, with a reminder.' : 'Try next week.'}
      </p>
      {section === 'yours' && (
        <button type="button" onClick={onExplore} className={cx(btn({ variant: 'primary' }), 'mt-3')}>
          Explore
        </button>
      )}
    </div>
  );
}

/** One row per day: the date on the left, its releases side by side. */
function DayRow({ day, items, loading }: { day: number; items: Airing[]; loading: boolean }) {
  const isToday = day === startOfDay(new Date()).getTime();
  return (
    <section aria-label={new Date(day).toDateString()} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-5 first:pt-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
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
            <AiringTile key={a.key} a={a} className={TILE_W} calendar />
          ))}
        </Scroller>
      ) : (
        <p className="self-center text-sm text-faint">Nothing</p>
      )}
    </section>
  );
}

/** The other section, compact: a list grouped by day. Its heading switches the page to it. */
function SidePanel({ section, items, loading, onOpen }: { section: Section; items: Airing[]; loading: boolean; onOpen: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<number, Airing[]>();
    for (const a of items) {
      const d = startOfDay(new Date(a.at)).getTime();
      m.set(d, [...(m.get(d) ?? []), a]);
    }
    return [...m.entries()];
  }, [items]);
  const today = startOfDay(new Date()).getTime();
  return (
    <aside className="min-w-0 self-start rounded-3xl bg-surface/60 p-4 ring-1 ring-white/[0.05] lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:overscroll-contain">
      <button type="button" onClick={onOpen} className="group/tip relative mb-3 flex w-full items-center gap-2 text-left">
        <h2 className="flex-1 text-base font-semibold">{NAME[section]}</h2>
        <span className="text-xs text-muted transition-colors group-hover/tip:text-white">Open</span>
        <ChevronRight className="size-4 text-muted" />
      </button>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <div className="skeleton aspect-video w-24 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="skeleton h-3.5 w-4/5 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : !items.length ? (
        <p className="py-6 text-center text-sm text-faint">{section === 'yours' ? 'Nothing from your library this week.' : 'Nothing else this week.'}</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([d, list]) => (
            <div key={d}>
              <p className="mb-1.5 text-xs font-medium tracking-wide text-faint uppercase">{d === today ? 'Today' : new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</p>
              <div className="space-y-0.5">
                {list.map((a) => (
                  <PanelRow key={a.key} a={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function PanelRow({ a }: { a: Airing }) {
  const eps = a.episodes ?? [];
  const first = eps[0];
  const line1 = a.type === 'tv' && first ? `${seLabel(first.season, first.number)}${eps.length > 1 ? `–${eps[eps.length - 1].number}` : first.name ? ` ${first.name}` : ''}` : a.title;
  const hover = a.type === 'tv' && first ? episodePeekProps(a.id, first.season, first.number) : peekProps(a.type, a.id);
  return (
    <Link to={linkOf(a)} {...hover} className="group flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-white/[0.05]">
      <Img path={null} src={a.image} kind="still" sizes="96px" alt="" className="aspect-video w-24 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white/90 group-hover:text-white">{line1}</span>
        <span className="block truncate text-xs text-muted">
          {a.type === 'tv' ? a.title : (a.label ?? a.se)}
          {eps.length > 1 ? ` · ${eps.length} episodes` : ''}
        </span>
      </span>
    </Link>
  );
}
