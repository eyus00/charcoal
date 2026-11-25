import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ExternalLink, MapPin, Play, Radio, Trophy } from 'lucide-react';
import { ErrorBox } from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill, SectionHeader } from '../components/Row';
import { Bone } from '../components/Skeletons';
import { btn } from '../components/Button';
import { countryName, listEvents, localStart, useChannels, useSportsEvents, viewerRegion, type ListedEvent, type PlayableChannel } from '../lib/sports';
import { SPORTS } from '../lib/sportsConfig';
import { cx, useTitle } from '../lib/util';

/** The two kinds of thing on this page, labelled the same way everywhere they appear. */
const PlaysHere = ({ className }: { className?: string }) => (
  <span data-kind="plays-here" className={cx('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-2.5 text-micro font-semibold tracking-wide text-success uppercase', className)}>
    <Play className="size-3 fill-current" strokeWidth={0} /> Plays here
  </span>
);
const OfficialSite = ({ className }: { className?: string }) => (
  <span data-kind="official-site" className={cx('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-micro font-semibold tracking-wide text-white/80 uppercase', className)}>
    <ExternalLink className="size-3" /> Official site
  </span>
);

/**
 * Sports: what is on, where to watch it officially, and the public channels that play here.
 * Fixtures are a schedule, not streams: an event is watched on a free channel below or on the
 * rights holder's own site.
 */
export default function Sports() {
  useTitle('Sports');
  const [params, setParams] = useSearchParams();
  const tab = SPORTS.find((s) => s.key === params.get('sport')) ?? SPORTS[0];
  const choose = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === SPORTS[0].key) next.delete('sport');
    else next.set('sport', key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="space-y-10 pb-10 md:space-y-12">
      <div>
        <PageTitle title="Sports" body="Fixtures with start times in your own time zone, free public channels you can watch right here, and links to each competition’s official broadcaster." />
        {/* What plays in Charcoal and what leaves it, said once up front. */}
        <ul className="grid gap-3 text-sm sm:grid-cols-2" aria-label="How to watch">
          <li className="flex items-start gap-3 rounded-2xl bg-surface p-4">
            <PlaysHere className="mt-0.5" />
            <span className="text-muted">Public, free-to-air channels. They open in Charcoal’s player.</span>
          </li>
          <li className="flex items-start gap-3 rounded-2xl bg-surface p-4">
            <OfficialSite className="mt-0.5" />
            <span className="text-muted">The competition’s own page or service. It opens in a new tab; Charcoal doesn’t carry these games.</span>
          </li>
        </ul>
      </div>

      <section aria-label="Live and upcoming events">
        <SectionHeader title="Live and upcoming" />
        <div className="no-scrollbar scroll-row mb-5 flex gap-2.5 overflow-x-auto" role="group" aria-label="Sport">
          {SPORTS.map((s) => (
            <Pill key={s.key} on={s.key === tab.key} onClick={() => choose(s.key)}>
              {s.label}
            </Pill>
          ))}
        </div>
        <Events key={tab.key} tab={tab} />
      </section>

      <Channels />
    </div>
  );
}

// ---------- events ----------

function Events({ tab }: { tab: (typeof SPORTS)[number] }) {
  const query = useSportsEvents(tab);
  // The clock moves events from "upcoming" to "live" between refreshes of the schedule.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
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
  if (!events.length) return <Empty icon={Trophy} title={`No ${tab.label.toLowerCase()} coming up`} body="Nothing is listed for today or tomorrow. The schedule service’s free tier only lists a few events per day." />;
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

// ---------- channels ----------

function Channels() {
  const channels = useChannels();
  return (
    <section aria-label="Free public channels that play here">
      <SectionHeader title="Free channels" action={<PlaysHere />} />
      {channels.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-[76px] rounded-2xl!" />
          ))}
        </div>
      ) : channels.error ? (
        <ErrorBox onRetry={() => channels.refetch()} message="Couldn’t load the channel list. Check your connection and try again." />
      ) : !channels.data.length ? (
        <Empty icon={Radio} title="No free channels available" body="None of the public sports channels has a stream that can play in a browser right now." />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="channels">
            {channels.data.map((c) => (
              <ChannelCard key={c.channel.id} entry={c} />
            ))}
          </ul>
          <p className="mt-4 text-xs text-faint">Public free-to-air channels from the iptv-org list. A channel can be off the air, or limited to its own country; you’ll be told if it can’t play.</p>
        </>
      )}
    </section>
  );
}

function ChannelCard({ entry: { channel, streams } }: { entry: PlayableChannel }) {
  // Said only when it holds for every stream: one open mirror is enough to play.
  const regional = streams.every((s) => s.hazards.includes('geo-blocked'));
  const partTime = streams.every((s) => s.hazards.includes('not-24-7'));
  const notes = [countryName(channel.country), regional && 'Home region only', partTime && 'Not always on air'].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        to={`/live/${encodeURIComponent(channel.id)}`}
        data-channel={channel.id}
        data-kind="plays-here"
        aria-label={`${channel.name}: plays here`}
        className="group flex items-center gap-3.5 rounded-2xl bg-surface p-4 transition-colors hover:bg-raised"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 transition-colors group-hover:bg-white group-hover:text-black">
          <Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium">{channel.name}</span>
          <span className="block truncate text-caption text-muted">{notes}</span>
        </span>
      </Link>
    </li>
  );
}
