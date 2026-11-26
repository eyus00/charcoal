import { useCallback, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';
import { btn } from '../components/Button';
import { Tip } from '../components/Tip';
import Player from '../player/Player';
import LivePill from '../components/LivePill';
import { countryName, PROBLEM_TEXT, tune, useChannels, type PlayableChannel, type StreamProblem } from '../lib/sports';
import { cx, useKeys, useTitle } from '../lib/util';

/** Something with no TMDB identity: no skip segments, no history entry, nothing to scrobble. */
const NO_TITLE = { type: 'movie', id: 0 } as const;
const noProgress = () => {};

/**
 * A public channel, live, in Charcoal's own player. The stream is the channel's own HLS address
 * from the iptv-org list, loaded straight from its host: no provider, no relay.
 */
export default function Live() {
  const { channelId = '' } = useParams();
  const channels = useChannels();
  const entry = channels.data?.find((c) => c.channel.id === channelId);
  useTitle(entry ? `${entry.channel.name} · Live` : 'Live');

  if (channels.isPending) return <Tuning text="Finding the channel…" />;
  if (channels.error) return <Message title="Couldn’t load the channel list" body="Check your connection and try again." retry={() => channels.refetch()} />;
  if (!entry) return <Message title="This channel isn’t available" body="It isn’t one of the free public channels that can play here." />;
  return <LiveView key={entry.channel.id} entry={entry} />;
}

function LiveView({ entry }: { entry: PlayableChannel }) {
  const { channel } = entry;
  const navigate = useNavigate();
  const location = useLocation();
  // Close returns to wherever the channel was opened from; opened directly, to the channel list.
  const leave = useCallback(() => (location.key !== 'default' ? navigate(-1) : navigate('/sports?tab=channels')), [location.key, navigate]);
  useKeys({ Escape: () => !document.fullscreenElement && !document.querySelector('[aria-expanded="true"]') && leave() });

  // Ask each stream whether it answers before the player gets it: a channel that is off the air or
  // limited to its own country is then said so in words, instead of a player that never starts.
  const tuned = useQuery({ queryKey: ['live-tune', channel.id], queryFn: ({ signal }) => tune(entry, signal), staleTime: 0, gcTime: 0, retry: false });
  // The streams answered, but then none of them would actually play.
  const [gaveUp, setGaveUp] = useState(false);

  const subtitle = countryName(channel.country);
  const official = channel.website && /^https?:\/\//i.test(channel.website) ? channel.website : undefined;
  const problem: StreamProblem | null = gaveUp ? 'unreachable' : (tuned.data?.problem ?? (tuned.error ? 'unreachable' : null));

  if (tuned.isPending) return <Tuning text={`Tuning in to ${channel.name}…`} onClose={leave} />;
  if (problem || !tuned.data) {
    return (
      <Message
        title={`${channel.name} can’t be played right now`}
        body={PROBLEM_TEXT[problem ?? 'unreachable']}
        retry={() => {
          setGaveUp(false);
          tuned.refetch();
        }}
        official={official}
      />
    );
  }

  // The same as the sports player: the channel, then its country and LIVE. (The player's bigger
  // paused-state block is not used: a channel has nothing more to say.)
  const header = (_info: ReactNode | null) => (
    <div className="flex items-start gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:gap-3 md:px-5">
      <div className="min-w-0 px-1 pt-0.5 leading-snug">
        <div className="truncate text-base font-semibold md:text-lg">{channel.name}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-white/80">
          {subtitle && <span className="truncate">{subtitle}</span>}
          <LivePill />
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <CloseButton onClose={leave} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <Player live data={tuned.data.result} media={NO_TITLE} title={channel.name} subtitle={subtitle} resumeAt={0} header={header} onProgress={noProgress} onExhausted={() => setGaveUp(true)} />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" aria-label="Close player (Esc)" onClick={onClose} className={cx(btn({ variant: 'secondary', icon: true }), 'group/tip relative')}>
      <X className="size-5" />
      <Tip label="Close player" keys="Esc" side="bottom" align="end" />
    </button>
  );
}

function Tuning({ text, onClose }: { text: string; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-black" role="status">
      {onClose && (
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 md:right-5">
          <CloseButton onClose={onClose} />
        </div>
      )}
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="font-medium">{text}</p>
      </div>
    </div>
  );
}

/** Why a channel isn't playing, in plain words, with the ways on from here. */
function Message({ title, body, retry, official }: { title: string; body: string; retry?: () => void; official?: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-bg p-6 text-center" data-testid="live-message">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="text-pretty text-muted">{body}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {retry && (
            <button onClick={retry} className={btn()}>
              Try again
            </button>
          )}
          {official && (
            <a href={official} target="_blank" rel="noopener noreferrer" className={btn()}>
              <ExternalLink className="size-4" strokeWidth={1.5} /> The channel’s own site
            </a>
          )}
          <Link to="/sports?tab=channels" className={btn({ variant: 'primary' })}>
            Back to Channels
          </Link>
        </div>
      </div>
    </div>
  );
}
