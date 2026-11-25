import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Eye, Radio } from 'lucide-react';
import { listingState, matchesListing, orderListings, type LiveListing } from '@charcoal/content';
import EpisodeTile, { Chip, TileSkeleton } from '../components/EpisodeTile';
import { ErrorBox } from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill, SectionHeader } from '../components/Row';
import { Bone } from '../components/Skeletons';
import { btn } from '../components/Button';
import { localStart, startsIn, useDirectory, useNow, viewerCount } from '../lib/sports';
import { cx, useTitle } from '../lib/util';

/** Cards in a grid: one column on phones, up to four on a wide screen. */
export const EVENT_GRID = 'grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
/** How many upcoming events show before "Show more". */
const PAGE = 30;

export const LiveChip = () => (
  <Chip>
    <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-danger" /> Live
  </Chip>
);

/** One thing to watch, as the app's landscape card. `now` decides what its corner says. */
export function ListingCard({ listing: l, now }: { listing: LiveListing; now: number }) {
  const live = listingState(l, now) === 'live';
  const start = l.channel ? null : localStart(l.startsAt, now);
  const second = l.channel ? `${l.sport} · Always on` : [l.league || l.sport, live ? `Since ${start!.time}` : `${start!.day} ${start!.time}`].join(' · ');
  return (
    <li>
      <EpisodeTile
        to={`/sports/watch/${l.id}`}
        title={l.title}
        image={{ path: null, kind: 'backdrop', src: l.poster }}
        primary={l.title}
        secondary={second}
        width="w-full"
        topLeft={l.channel ? undefined : live ? <LiveChip /> : <Chip>{startsIn(l.startsAt, now)}</Chip>}
        bottomRight={
          l.viewers > 0 ? (
            <Chip>
              <Eye className="size-3.5" strokeWidth={1.75} aria-hidden />
              <span aria-label={`${l.viewers} watching`}>{viewerCount(l.viewers)}</span>
            </Chip>
          ) : undefined
        }
        linkProps={{ 'data-listing': l.id }}
      />
    </li>
  );
}

export const CardsSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className={EVENT_GRID} aria-hidden>
    {Array.from({ length: count }, (_, i) => (
      <TileSkeleton key={i} className="w-full" />
    ))}
  </div>
);

/** Sports: what is live now and what is coming up, each a tap away from playing. */
export default function Sports() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  useTitle(query ? `“${query}” · Sports` : 'Sports');
  const directory = useDirectory();
  const now = useNow();
  const [shown, setShown] = useState(PAGE);

  const all = directory.data?.listings ?? [];
  // Sports with something live or coming up, in the directory's order.
  const sports = useMemo(() => {
    const open = new Set(all.filter((l) => !l.channel && listingState(l, now) !== 'ended').map((l) => l.sport));
    return (directory.data?.sports ?? []).filter((s) => open.has(s));
  }, [all, directory.data, now]);
  const sport = sports.includes(params.get('sport') ?? '') ? params.get('sport')! : '';
  const choose = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set('sport', s);
    else next.delete('sport');
    setParams(next, { replace: true, preventScrollReset: true });
    setShown(PAGE);
  };

  const { live, upcoming } = useMemo(
    () =>
      orderListings(
        all.filter((l) => (!sport || l.sport === sport) && matchesListing(l, query)),
        now,
      ),
    [all, sport, query, now],
  );
  // A search also finds channels; without one they have their own page.
  const channels = useMemo(() => (query ? orderListings(all, now).channels.filter((l) => matchesListing(l, query)) : []), [all, query, now]);

  return (
    <div className="pb-10">
      <PageTitle
        title={query ? `“${query}”` : 'Sports'}
        body={query ? 'Events and channels matching your search.' : 'Live events and what is coming up, with start times in your own time zone.'}
      />

      {directory.isPending ? (
        <>
          <div className="mb-7 flex gap-2.5 overflow-hidden" aria-hidden>
            {['w-16', 'w-24', 'w-28', 'w-24', 'w-32'].map((w, i) => (
              <Bone key={i} className={cx('h-10 shrink-0 rounded-full!', w)} />
            ))}
          </div>
          <CardsSkeleton />
        </>
      ) : directory.error && !directory.data ? (
        <div className="space-y-4">
          <ErrorBox onRetry={() => directory.refetch()} message="Couldn’t load what’s on. The directory of live events didn’t answer; try again in a moment." />
          <Elsewhere />
        </div>
      ) : (
        <>
          {sports.length > 1 && (
            <div className="no-scrollbar scroll-row -mx-4 mb-7 flex gap-2.5 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Sport">
              <Pill on={!sport} onClick={() => choose('')}>
                All
              </Pill>
              {sports.map((s) => (
                <Pill key={s} on={s === sport} onClick={() => choose(s)}>
                  {s}
                </Pill>
              ))}
            </div>
          )}

          {!live.length && !upcoming.length && !channels.length ? (
            <div className="space-y-4">
              <Empty
                icon={Radio}
                title={query ? `Nothing found for “${query}”` : 'Nothing is on right now'}
                body={query ? 'Try a team, a competition or a sport.' : 'No events are listed at the moment. Channels are always on.'}
              />
              <Elsewhere />
            </div>
          ) : (
            <div className="space-y-10 md:space-y-12">
              {live.length > 0 && (
                <section aria-label="Live now">
                  <SectionHeader title="Live now" />
                  <ul className={EVENT_GRID} data-testid="live-events">
                    {live.map((l) => (
                      <ListingCard key={l.id} listing={l} now={now} />
                    ))}
                  </ul>
                </section>
              )}

              {channels.length > 0 && (
                <section aria-label="Channels">
                  <SectionHeader title="Channels" to="/sports/channels" />
                  <ul className={EVENT_GRID}>
                    {channels.map((l) => (
                      <ListingCard key={l.id} listing={l} now={now} />
                    ))}
                  </ul>
                </section>
              )}

              {upcoming.length > 0 && (
                <section aria-label="Coming up">
                  <SectionHeader title="Coming up" />
                  <Upcoming listings={upcoming.slice(0, shown)} now={now} />
                  {upcoming.length > shown && (
                    <div className="mt-6 flex justify-center">
                      <button type="button" onClick={() => setShown((n) => n + PAGE)} className={btn()}>
                        Show more
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
          <p className="mt-8 text-xs text-pretty text-faint">
            Events and their players come from PPV, a third-party directory. Charcoal doesn’t host or control them, and they may show ads.
          </p>
        </>
      )}
    </div>
  );
}

/** When the directory has nothing: the two pages that don’t depend on it. */
function Elsewhere() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Link to="/sports/channels" className={btn()}>
        Channels
      </Link>
      <Link to="/sports/schedule" className={btn()}>
        Schedule
      </Link>
    </div>
  );
}

/** Upcoming events as rows, under the day they start on in the viewer's own time zone. */
function Upcoming({ listings, now }: { listings: LiveListing[]; now: number }) {
  const days = useMemo(() => {
    const out: { day: string; rows: LiveListing[] }[] = [];
    for (const l of listings) {
      const day = localStart(l.startsAt, now).day;
      if (out[out.length - 1]?.day === day) out[out.length - 1].rows.push(l);
      else out.push({ day, rows: [l] });
    }
    return out;
  }, [listings, now]);
  return (
    <div className="space-y-6" data-testid="upcoming-events">
      {days.map(({ day, rows }) => (
        <div key={day}>
          <h3 className="mb-2.5 text-micro font-semibold tracking-wider text-muted uppercase">{day}</h3>
          <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {rows.map((l) => (
              <UpcomingRow key={l.id} listing={l} now={now} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UpcomingRow({ listing: l, now }: { listing: LiveListing; now: number }) {
  const start = localStart(l.startsAt, now);
  const soon = l.startsAt - now < 60 * 60_000;
  return (
    <li>
      <Link to={`/sports/watch/${l.id}`} data-listing={l.id} className="group flex items-center gap-4 rounded-2xl bg-surface px-4 py-3 transition-colors hover:bg-raised">
        <time dateTime={new Date(l.startsAt).toISOString()} title={new Date(l.startsAt).toLocaleString()} className="w-[4.5rem] shrink-0 text-body-sm font-medium tabular-nums">
          {start.time}
        </time>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-white/90 transition-colors group-hover:text-white">{l.title}</span>
          <span className="block truncate text-caption text-muted">{[l.league, l.sport].filter(Boolean).join(' · ')}</span>
        </span>
        {/* Phones: the title gets the room; the time on the left already says when. */}
        <span className={cx('shrink-0 text-caption tabular-nums max-sm:hidden', soon ? 'text-white' : 'text-faint')}>{startsIn(l.startsAt, now)}</span>
      </Link>
    </li>
  );
}
