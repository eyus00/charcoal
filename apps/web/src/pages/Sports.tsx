import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Eye, Play, Radio, Search, X } from 'lucide-react';
import { listingState, matchesListing, orderListings, type LiveListing } from '@charcoal/content';
import EpisodeTile, { Chip, TileSkeleton } from '../components/EpisodeTile';
import { ErrorBox } from '../components/Grid';
import { Empty } from '../components/PageHeader';
import { Pill, SectionHeader } from '../components/Row';
import Segmented from '../components/Segmented';
import { countryName, localStart, useChannels, useDirectory, useNow, viewerCount, type PlayableChannel } from '../lib/sports';
import { useTitle } from '../lib/util';

type Tab = 'live' | 'schedule' | 'channels';
const TABS: { key: Tab; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'channels', label: 'Channels' },
];
/** Banner cards: one column on phones, up to four on a wide screen. */
const GRID = 'grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

/** One thing to watch, as the app's banner card. Its corner says live, or when it starts. */
function ListingCard({ listing: l, now }: { listing: LiveListing; now: number }) {
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
            <Chip>
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-danger" /> Live
            </Chip>
          ) : (
            <Chip light>
              <time dateTime={new Date(l.startsAt).toISOString()}>{start!.time}</time>
            </Chip>
          )
        }
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
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const all = directory.data?.listings ?? [];
  const ordered = useMemo(() => orderListings(all.filter((l) => matchesListing(l, query)), now), [all, query, now]);
  const events = tab === 'live' ? ordered.live : tab === 'schedule' ? ordered.upcoming : [];
  // Sports that have something in this view, in the directory's order.
  const sports = useMemo(() => (directory.data?.sports ?? []).filter((s) => events.some((l) => l.sport === s)), [directory.data, events]);
  const sport = sports.includes(params.get('sport') ?? '') ? params.get('sport')! : '';
  const shown = sport ? events.filter((l) => l.sport === sport) : events;
  const failed = !!directory.error && !directory.data;

  return (
    <div className="pb-10">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Sports</h1>
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
            <button type="button" aria-label="Clear" onClick={() => set({ q: '' })} className="absolute right-1.5 grid size-7 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white">
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
      ) : !shown.length ? (
        <Empty icon={Radio} title={query ? `Nothing found for “${query}”` : tab === 'live' ? 'Nothing is live right now' : 'Nothing scheduled'} body={tab === 'live' && !query ? 'See Schedule for what is coming up.' : ''} />
      ) : tab === 'live' ? (
        <ul className={GRID} data-testid="live-events">
          {shown.map((l) => (
            <ListingCard key={l.id} listing={l} now={now} />
          ))}
        </ul>
      ) : (
        <Schedule listings={shown} now={now} />
      )}
    </div>
  );
}

/** What is coming up, as banner cards under the day they start on (the viewer's own time zone). */
function Schedule({ listings, now }: { listings: LiveListing[]; now: number }) {
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
    <div className="space-y-10" data-testid="upcoming-events">
      {days.map(({ day, rows }) => (
        <section key={day} aria-label={day}>
          <SectionHeader title={day} />
          <ul className={GRID}>
            {rows.map((l) => (
              <ListingCard key={l.id} listing={l} now={now} />
            ))}
          </ul>
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
      <Link to={`/live/${encodeURIComponent(channel.id)}`} data-channel={channel.id} aria-label={`${channel.name}: play`} className="group flex items-center gap-3.5 rounded-2xl bg-surface p-4 transition-colors hover:bg-raised">
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
