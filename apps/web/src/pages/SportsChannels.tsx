import { useMemo } from 'react';
import { Link } from 'react-router';
import { Play, Tv } from 'lucide-react';
import { orderListings } from '@charcoal/content';
import { ErrorBox } from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { SectionHeader } from '../components/Row';
import { Bone } from '../components/Skeletons';
import { countryName, useChannels, useDirectory, useNow, type PlayableChannel } from '../lib/sports';
import { useTitle } from '../lib/util';
import { CardsSkeleton, EVENT_GRID, ListingCard } from './Sports';

/**
 * Channels that are always on: the directory's sports channels (their own player, in a frame) and
 * public free-to-air channels (their own stream, in Charcoal's player). Either list stands without
 * the other, so one source being down never empties the page.
 */
export default function SportsChannels() {
  useTitle('Channels · Sports');
  const directory = useDirectory();
  const now = useNow();
  const channels = useMemo(() => orderListings(directory.data?.listings ?? [], now).channels, [directory.data, now]);
  const failed = !!directory.error && !directory.data;
  return (
    <div className="space-y-10 pb-10 md:space-y-12">
      <div>
        <PageTitle title="Channels" body="Sports channels that are on around the clock." />
        {directory.isPending ? (
          <CardsSkeleton count={3} />
        ) : failed ? (
          <ErrorBox onRetry={() => directory.refetch()} message="Couldn’t load the sports channels. The free public channels below don’t depend on them." />
        ) : channels.length ? (
          <ul className={EVENT_GRID} data-testid="directory-channels">
            {channels.map((l) => (
              <ListingCard key={l.id} listing={l} now={now} />
            ))}
          </ul>
        ) : (
          <Empty icon={Tv} title="No sports channels listed" body="The directory lists none right now. The free public channels below are separate." />
        )}
      </div>
      <PublicChannels />
    </div>
  );
}

function PublicChannels() {
  const channels = useChannels();
  // Nothing to show and nothing wrong: the section isn't there.
  if (channels.data && !channels.data.length) return null;
  return (
    <section aria-label="Free public channels">
      <SectionHeader title="Free public channels" />
      {channels.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-[76px] rounded-2xl!" />
          ))}
        </div>
      ) : channels.error ? (
        <ErrorBox onRetry={() => channels.refetch()} message="Couldn’t load the public channel list. Check your connection and try again." />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="channels">
            {channels.data.map((c) => (
              <ChannelCard key={c.channel.id} entry={c} />
            ))}
          </ul>
          <p className="mt-4 text-xs text-pretty text-faint">
            Free-to-air channels from the iptv-org list, played in Charcoal’s own player. A channel can be off the air, or limited to its own country; you’ll be told if it can’t play.
          </p>
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
