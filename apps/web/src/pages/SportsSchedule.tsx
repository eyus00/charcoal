import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarClock, ExternalLink, MapPin } from 'lucide-react';
import { ErrorBox } from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill } from '../components/Row';
import { Bone } from '../components/Skeletons';
import { btn } from '../components/Button';
import { listEvents, localStart, useNow, useSportsEvents, viewerRegion, type ListedEvent } from '../lib/sports';
import { SPORTS } from '../lib/sportsConfig';
import { cx, useTitle } from '../lib/util';

/**
 * The schedule: fixtures with each competition's official place to watch. A fixture here is not a
 * stream (those are on the Live page); its links open the rights holder's own site in a new tab.
 */
export default function SportsSchedule() {
  useTitle('Schedule · Sports');
  const [params, setParams] = useSearchParams();
  const tab = SPORTS.find((s) => s.key === params.get('sport')) ?? SPORTS[0];
  const choose = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === SPORTS[0].key) next.delete('sport');
    else next.set('sport', key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="pb-10">
      <PageTitle title="Schedule" body="Fixtures with start times in your own time zone, and where each competition is shown officially. Those links open in a new tab." />
      <div className="no-scrollbar scroll-row -mx-4 mb-7 flex gap-2.5 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Sport">
        {SPORTS.map((s) => (
          <Pill key={s.key} on={s.key === tab.key} onClick={() => choose(s.key)}>
            {s.label}
          </Pill>
        ))}
      </div>
      <Events key={tab.key} tab={tab} />
    </div>
  );
}

// ---------- events ----------

function Events({ tab }: { tab: (typeof SPORTS)[number] }) {
  const query = useSportsEvents(tab);
  // The clock moves events from "upcoming" to "live" between refreshes of the schedule.
  const now = useNow();
  const region = useMemo(viewerRegion, []);
  const events = useMemo(() => listEvents(query.data?.events ?? [], now, region), [query.data, now, region]);
  const zone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-[88px] rounded-2xl!" />
        ))}
      </div>
    );
  }
  if (query.error) return <ErrorBox onRetry={() => query.refetch()} message="Couldn’t load the schedule. The free schedule service limits how often it can be asked; try again in a minute." />;
  if (!events.length) return <Empty icon={CalendarClock} title={`No ${tab.label.toLowerCase()} coming up`} body="Nothing is listed for today or tomorrow. The schedule service’s free tier only lists a few events per day." />;
  return (
    <>
      <ul className="space-y-3" data-testid="events">
        {events.map((e) => (
          <EventRow key={e.id} event={e} now={now} />
        ))}
      </ul>
      <p className="mt-4 text-xs text-faint">
        Times are shown in your time zone ({zone}). Schedule from TheSportsDB{query.data?.incomplete ? '; some competitions didn’t answer and are missing' : ''}.
      </p>
    </>
  );
}

function EventRow({ event: e, now }: { event: ListedEvent; now: number }) {
  const start = localStart(e.startsAt, now);
  const live = e.state === 'live';
  return (
    <li data-event={e.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:flex-row sm:items-center sm:gap-5">
      {/* When: live, or the local day and time. */}
      <div className="flex shrink-0 items-center gap-3 sm:w-36 sm:flex-col sm:items-start sm:gap-0.5">
        {live ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-danger/15 px-2.5 text-micro font-semibold tracking-wide text-danger uppercase">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-danger" /> Live
          </span>
        ) : (
          <span className="text-micro font-semibold tracking-wider text-muted uppercase">{e.state === 'postponed' ? 'Postponed' : start.day}</span>
        )}
        <time dateTime={new Date(e.startsAt).toISOString()} className="text-body-sm font-medium tabular-nums" title={new Date(e.startsAt).toLocaleString()}>
          {live ? `Since ${start.time}` : start.time}
          {start.zone && <span className="ml-1.5 text-xs font-normal text-faint">{start.zone}</span>}
        </time>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-body-sm font-medium" title={e.title}>
          {e.title}
          {e.score && live && (
            <span className="ml-2 font-semibold tabular-nums">
              {e.score.home}–{e.score.away}
            </span>
          )}
        </h3>
        <p className="truncate text-caption text-muted">
          {[e.league, e.round && /^\d+$/.test(e.round) ? `Round ${e.round}` : e.round].filter(Boolean).join(' · ')}
        </p>
        {e.venue && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-caption text-faint">
            <MapPin className="size-3 shrink-0" strokeWidth={1.5} /> {[e.venue, e.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {/* Where: only official places, and they open elsewhere. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-[45%] sm:justify-end">
        {e.links.length ? (
          e.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              data-kind="official-site"
              aria-label={`${l.rightsHolder} (official site, opens in a new tab)`}
              className={cx(btn(), 'max-w-full')}
            >
              <ExternalLink className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{l.rightsHolder}</span>
              {l.free && <span className="text-xs font-normal text-success">Free</span>}
            </a>
          ))
        ) : (
          <span className="text-caption text-faint">No official link listed</span>
        )}
      </div>
    </li>
  );
}
