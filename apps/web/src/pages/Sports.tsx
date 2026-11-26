import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bell, BellRing, Play, Radio, Search, X } from 'lucide-react';
import { listingState, matchesListing, orderListings, type LiveListing } from '@charcoal/content';
import EpisodeTile, { Chip, TileSkeleton } from '../components/EpisodeTile';
import { ErrorBox } from '../components/Grid';
import { Empty } from '../components/PageHeader';
import { Pill, SectionHeader } from '../components/Row';
import Segmented from '../components/Segmented';
import { countryName, localStart, startsIn, useChannels, useDirectory, useNow, type PlayableChannel } from '../lib/sports';
import LivePill from '../components/LivePill';
import { Tip } from '../components/Tip';
import { toggleReminder, useReminders } from '../lib/reminders';
import { cx, useTitle } from '../lib/util';

type Tab = 'live' | 'schedule' | 'channels';
const TABS: { key: Tab; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'channels', label: 'Channels' },
];
/** Banner cards: one column on phones, up to four on a wide screen. */
const GRID = 'grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

const matchKey = (id: string) => `sports-${id}`;
const startMs = (l: LiveListing) => new Date(l.startsAt).getTime();

/** The matches you've belled: reminder keys of the form sports-<id>. */
function useMine(): Set<string> {
  const reminders = useReminders();
  return useMemo(() => new Set(reminders.filter((r) => r.key.startsWith('sports-')).map((r) => r.key.slice(7))), [reminders]);
}

/** The bell on a match card: adds it to Your matches, with a reminder for its start. */
function MatchBell({ listing: l, live, on }: { listing: LiveListing; live: boolean; on: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleReminder(
          { key: matchKey(l.id), title: l.title, body: [l.league, l.sport].filter(Boolean).join(' · '), at: startMs(l), url: `/sports/watch/${l.id}` },
          {
            already: live,
            words: live ? { on: 'Added to Your matches', off: 'Removed from Your matches' } : { on: 'Added to Your matches. You’ll be reminded when it starts.', off: 'Removed from Your matches' },
          },
        );
      }}
      aria-pressed={on}
      aria-label={on ? `Remove ${l.title} from your matches` : `Add ${l.title} to your matches`}
      className={cx(
        'group/tip absolute top-2.5 right-2.5 z-10 grid size-9 place-items-center rounded-full transition-[background-color,opacity]',
        on
          ? 'bg-white text-black'
          : 'bg-black/75 text-white hover:bg-black/90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
      )}
    >
      {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      <Tip label={on ? 'In your matches · click to remove' : live ? 'Add to your matches' : 'Remind me and add to your matches'} side="bottom" align="end" />
    </button>
  );
}

/** One thing to watch, as the app's banner card. Its corner says live, or when it starts. */
function ListingCard({ listing: l, now, mine, timed }: { listing: LiveListing; now: number; mine?: Set<string>; timed?: boolean }) {
  const live = listingState(l, now) === 'live';
  const start = l.channel ? null : localStart(l.startsAt, now);
  return (
    <li>
      <EpisodeTile
        to={`/sports/watch/${l.id}`}
        title={l.title}
        image={{ path: null, kind: 'backdrop', src: l.poster }}
        primary={l.title}
        secondary={l.channel ? l.sport : [l.league, l.sport].filter(Boolean).join(' · ')}
        width="w-full"
        topLeft={
          l.channel ? undefined : live ? (
            <LivePill />
          ) : timed ? undefined : (
            <Chip light>
              <time dateTime={new Date(l.startsAt).toISOString()}>{start!.time}</time>
            </Chip>
          )
        }
        linkProps={{ 'data-listing': l.id }}
      >
        {!l.channel && mine && <MatchBell listing={l} live={live} on={mine.has(l.id)} />}
      </EpisodeTile>
    </li>
  );
}

/**
 * Sports: a small app of its own inside Charcoal. Live, Schedule and Channels are its three
 * views, and its search looks only through them. Everything listed is something its player can
 * open: the stream directory's events and channels, and the free public channels.
 */
export default function Sports() {
  useTitle('Sports');
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'live';
  const query = (params.get('q') ?? '').trim();
  const directory = useDirectory();
  const now = useNow();
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const all = directory.data?.listings ?? [];
  const ordered = useMemo(
    () =>
      orderListings(
        all.filter((l) => matchesListing(l, query)),
        now,
      ),
    [all, query, now],
  );
  const events = tab === 'live' ? ordered.live : tab === 'schedule' ? ordered.upcoming : [];
  // Sports that have something in this view, in the directory's order.
  const sports = useMemo(() => (directory.data?.sports ?? []).filter((s) => events.some((l) => l.sport === s)), [directory.data, events]);
  const sport = sports.includes(params.get('sport') ?? '') ? params.get('sport')! : '';
  const filtered = sport ? events.filter((l) => l.sport === sport) : events;
  const mine = useMine();
  // Your matches come first, in their own section; the rest below.
  const yours = filtered.filter((l) => mine.has(l.id));
  const shown = filtered.filter((l) => !mine.has(l.id));
  const failed = !!directory.error && !directory.data;

  return (
    <div className="pb-10">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        {/* The wordmark at the top says "Charcoal Sports"; the heading is for screen readers. */}
        <h1 className="sr-only">Sports</h1>
        <Segmented value={tab} options={TABS} onChange={(t) => set({ tab: t === 'live' ? '' : t, sport: '' })} label="Sports" />
        <label className="relative ml-auto flex h-10 w-full items-center sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-muted" />
          <input
            type="search"
            value={params.get('q') ?? ''}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search sports"
            aria-label="Search sports"
            autoComplete="off"
            className="h-10 w-full rounded-full bg-surface pr-9 pl-10 text-sm outline-none ring-1 ring-white/[0.08] placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => set({ q: '' })}
              className="absolute right-1.5 grid size-7 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      {tab !== 'channels' && sports.length > 1 && (
        <div className="no-scrollbar scroll-row -mx-4 mb-7 flex gap-2.5 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Sport">
          <Pill on={!sport} onClick={() => set({ sport: '' })}>
            All
          </Pill>
          {sports.map((s) => (
            <Pill key={s} on={s === sport} onClick={() => set({ sport: s })}>
              {s}
            </Pill>
          ))}
        </div>
      )}

      {tab === 'channels' ? (
        <Channels directory={ordered.channels} loading={directory.isPending} failed={failed} retry={() => directory.refetch()} now={now} query={query} />
      ) : directory.isPending ? (
        <div className={GRID} aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <TileSkeleton key={i} className="w-full" />
          ))}
        </div>
      ) : failed ? (
        <ErrorBox onRetry={() => directory.refetch()} message="Couldn’t load what’s on. Try again in a moment." />
      ) : !shown.length && !yours.length ? (
        <Empty
          icon={Radio}
          title={query ? `Nothing found for “${query}”` : tab === 'live' ? 'Nothing is live right now' : 'Nothing scheduled'}
          body={tab === 'live' && !query ? 'See Schedule for what is coming up.' : ''}
        />
      ) : (
        <div className="space-y-12">
          {yours.length > 0 && (
            <section aria-label="Your matches" data-testid="your-matches">
              <SectionHeader title="Your matches" />
              <ul className={GRID}>
                {yours.map((l) => (
                  <ListingCard key={l.id} listing={l} now={now} mine={mine} />
                ))}
              </ul>
            </section>
          )}
          {shown.length > 0 &&
            (tab === 'live' ? (
              <section aria-label="Live now">
                {yours.length > 0 && <SectionHeader title="Live now" />}
                <ul className={GRID} data-testid="live-events">
                  {shown.map((l) => (
                    <ListingCard key={l.id} listing={l} now={now} mine={mine} />
                  ))}
                </ul>
              </section>
            ) : (
              <Schedule listings={shown} now={now} mine={mine} />
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * What is coming up, a day at a time, laid out by time of day: the start time on the left and
 * everything starting then beside it (the viewer's own time zone).
 */
function Schedule({ listings, now, mine }: { listings: LiveListing[]; now: number; mine: Set<string> }) {
  const days = useMemo(() => {
    const out: { day: string; slots: { time: string; at: number; rows: LiveListing[] }[] }[] = [];
    for (const l of listings) {
      const { day, time } = localStart(l.startsAt, now);
      let d = out[out.length - 1];
      if (d?.day !== day) out.push((d = { day, slots: [] }));
      const slot = d.slots[d.slots.length - 1];
      if (slot?.time === time) slot.rows.push(l);
      else d.slots.push({ time, at: startMs(l), rows: [l] });
    }
    return out;
  }, [listings, now]);
  return (
    <div className="space-y-12" data-testid="upcoming-events">
      {days.map(({ day, slots }) => (
        <section key={day} aria-label={day}>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">{day}</h2>
          <div className="divide-y divide-white/[0.06]">
            {slots.map(({ time, at, rows }) => (
              <div key={time} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 py-6 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6">
                <div className="pt-1">
                  <time dateTime={new Date(at).toISOString()} className="block text-lg leading-tight font-semibold tabular-nums sm:text-xl">
                    {time}
                  </time>
                  <span className="mt-0.5 block text-xs text-faint">{startsIn(at, now)}</span>
                </div>
                <ul className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((l) => (
                    <ListingCard key={l.id} listing={l} now={now} mine={mine} timed />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Channels({ directory, loading, failed, retry, now, query }: { directory: LiveListing[]; loading: boolean; failed: boolean; retry: () => void; now: number; query: string }) {
  const free = useChannels();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const freeShown = (free.data ?? []).filter((c) => words.every((w) => `${c.channel.name} ${countryName(c.channel.country)}`.toLowerCase().includes(w)));
  return (
    <div className="space-y-10">
      {loading ? (
        <div className={GRID} aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <TileSkeleton key={i} className="w-full" />
          ))}
        </div>
      ) : failed ? (
        <ErrorBox onRetry={retry} message="Couldn’t load the sports channels. Try again in a moment." />
      ) : directory.length > 0 ? (
        <ul className={GRID} data-testid="directory-channels">
          {directory.map((l) => (
            <ListingCard key={l.id} listing={l} now={now} />
          ))}
        </ul>
      ) : null}
      {freeShown.length > 0 && (
        <section aria-label="Free public channels">
          <SectionHeader title="Free public channels" />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="channels">
            {freeShown.map((c) => (
              <ChannelCard key={c.channel.id} entry={c} />
            ))}
          </ul>
        </section>
      )}
      {!loading && !failed && !directory.length && !freeShown.length && !free.isPending && <Empty icon={Radio} title={query ? `Nothing found for “${query}”` : 'No channels right now'} body="" />}
    </div>
  );
}

function ChannelCard({ entry: { channel, streams } }: { entry: PlayableChannel }) {
  // Said only when it holds for every stream: one open mirror is enough to play.
  const regional = streams.every((s) => s.hazards.includes('geo-blocked'));
  const notes = [countryName(channel.country), regional && 'Home region only'].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        to={`/live/${encodeURIComponent(channel.id)}`}
        data-channel={channel.id}
        aria-label={`${channel.name}: play`}
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
