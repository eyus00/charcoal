import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ChevronDown, RotateCw, X } from 'lucide-react';
import LivePill from '../components/LivePill';
import { listingState, type LiveListing } from '@charcoal/content';
import { btn } from '../components/Button';
import Kbd from '../components/Kbd';
import { Tip } from '../components/Tip';
import { localStart, optionLabels, startsIn, useDirectory, useNow } from '../lib/sports';
import { actions, useStore } from '../lib/store';
import { cx, useDismiss, useKeys, useTitle } from '../lib/util';

/** The same permissions the title player gives another site's player; no pop-ups, no leaving the page. */
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation';

/**
 * An event or a channel from the directory, in the directory's own player.
 *
 * The directory gives a player page and nothing else, so this is a frame: Charcoal can't see
 * whether it plays, read its position or change its quality. What it can do is around the frame:
 * say when an event starts, switch between the streams the directory lists, reload, keep pop-ups
 * in, and open the player by itself.
 */
export default function SportsWatch() {
  const { id = '' } = useParams();
  const directory = useDirectory();
  const listed = directory.data?.listings.find((l) => l.id === id);
  // A match that runs long is taken off the directory while it is still being watched: what was
  // opened stays open, whatever later answers say.
  const [kept, setKept] = useState(listed);
  useEffect(() => {
    if (listed) setKept(listed);
  }, [listed]);
  const listing = listed ?? (kept?.id === id ? kept : undefined);
  useTitle(listing ? `${listing.title} · Sports` : 'Sports');
  const leave = useLeave();
  // Esc closes, unless a menu is open (it closes that) or the frame is fullscreen.
  useKeys({ Escape: () => !document.fullscreenElement && !document.querySelector('[aria-expanded="true"]') && leave() });

  if (listing) return <Stream key={listing.id} listing={listing} onClose={leave} />;
  if (directory.isPending) return <Tuning onClose={leave} />;
  if (directory.error && !directory.data) {
    return <Message title="Couldn’t load this stream" body="The directory of live events didn’t answer. Try again in a moment." retry={() => directory.refetch()} />;
  }
  return <Message title="This isn’t on any more" body="The event has ended, or the directory no longer lists it." />;
}

/** Close returns to wherever the stream was opened from; opened directly, to Sports. */
function useLeave() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => (location.key !== 'default' ? navigate(-1) : navigate('/sports')), [location.key, navigate]);
}

function Stream({ listing: l, onClose }: { listing: LiveListing; onClose: () => void }) {
  const now = useNow();
  const state = listingState(l, now);
  const blockPopups = useStore((s) => s.settings.blockPopups);
  const noticeOff = useStore((s) => s.settings.embedNoticeOff);
  const [choice, setChoice] = useState(0);
  const [reloads, setReloads] = useState(0);
  // The player is shown from the moment the event is live (or the viewer opens it early), and
  // then stays: the clock passing the scheduled end must not take a game in extra time away.
  const [open, setOpen] = useState(state === 'live');
  useEffect(() => {
    if (state === 'live') setOpen(true);
  }, [state]);
  const [notice, setNotice] = useState(!noticeOff);
  const option = l.options[Math.min(choice, l.options.length - 1)];
  const labels = optionLabels(l.options);
  const start = l.channel ? null : localStart(l.startsAt, now);
  // Under the name: the league (or the sport, for a channel), then LIVE, or when it starts.
  const where = l.channel ? l.sport : l.league || l.sport;
  const when = l.channel || state === 'live' ? null : state === 'upcoming' ? `${start!.day} ${start!.time}` : open ? null : 'Ended';
  const isLive = !!l.channel || state === 'live';
  const waiting = !open;

  useKeys({ r: () => setReloads((n) => n + 1) }, !waiting);

  return (
    <div className="fixed inset-0 flex flex-col bg-black" data-testid="sports-watch">
      <div className="relative z-10 flex shrink-0 items-start gap-2 bg-bg px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:gap-3 md:px-5">
        <div className="min-w-0 px-1 pt-0.5 leading-snug">
          <h1 className="truncate text-base font-semibold md:text-lg" title={l.title}>
            {l.title}
          </h1>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-white/80">
            {where && <span className="truncate">{where}</span>}
            {isLive ? <LivePill /> : when && <span className="shrink-0 text-white/60">{when}</span>}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-3">
          {!waiting && <StreamMenu labels={labels} current={choice} onPick={setChoice} blockPopups={blockPopups} onReload={() => setReloads((n) => n + 1)} />}
          <button type="button" aria-label="Close (Esc)" onClick={onClose} className={cx(btn({ variant: 'secondary', icon: true }), 'group/tip relative')}>
            <X className="size-5" />
            <Tip label="Close" keys="Esc" side="bottom" align="end" />
          </button>
        </div>
      </div>

      {notice && !waiting && (
        <div className="flex shrink-0 items-center gap-3 bg-amber-500/15 px-4 py-2 text-sm text-amber-100" data-testid="embed-note">
          <span className="min-w-0 flex-1 text-pretty">This player belongs to another site, not Charcoal. It may show ads{blockPopups ? '; pop-ups from it are blocked.' : '.'}</span>
          {!blockPopups && (
            <button type="button" onClick={() => actions.updateSettings({ blockPopups: true })} className="shrink-0 font-medium text-white underline-offset-2 hover:underline">
              Block pop-ups
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setNotice(false);
              actions.updateSettings({ embedNoticeOff: true });
            }}
            className="shrink-0 text-amber-100/70 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {open ? null : state === 'upcoming' ? <NotYet listing={l} now={now} onOpen={() => setOpen(true)} /> : <Ended onOpen={() => setOpen(true)} />}
        {open && (
          <iframe
            // A new frame for another stream, a reload, or a change of the pop-up setting.
            key={`${option.embed}|${reloads}|${blockPopups}`}
            src={option.embed}
            title={`${l.title}: player`}
            className="absolute inset-0 size-full border-0 bg-black"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
            {...(blockPopups ? { sandbox: SANDBOX } : {})}
          />
        )}
      </div>
    </div>
  );
}

/** The streams the directory lists for this event, and what the frame is allowed to do. */
function StreamMenu({ labels, current, onPick, blockPopups, onReload }: { labels: string[]; current: number; onPick: (i: number) => void; blockPopups: boolean; onReload: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);
  useDismiss(open, close, ref);
  useKeys({ s: () => setOpen((o) => !o) });
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Stream: ${labels[current]} (S)`}
        className={cx(btn({ variant: open ? 'primary' : 'secondary' }), 'group/tip relative max-sm:px-3')}
      >
        <Tip label="Streams and pop-ups" side="bottom" align="end" hidden={open} />
        <span className="hidden max-w-[9rem] truncate font-medium sm:inline">{labels[current]}</span>
        <span className="font-medium sm:hidden">Stream</span>
        <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} />
        <Kbd light={open}>S</Kbd>
      </button>
      {open && (
        <div
          role="menu"
          className="toast-in absolute right-0 z-40 mt-2 max-h-[min(24rem,52dvh)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-[18px] border border-transparent bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/10"
        >
          {labels.map((label, i) => (
            <button
              key={i}
              role="menuitemradio"
              aria-checked={i === current}
              onClick={() => {
                onPick(i);
                setOpen(false);
              }}
              className={cx(
                'flex h-9 w-full items-center rounded-xl px-3 text-left text-sm transition-colors',
                i === current ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <span className="truncate">{label}</span>
            </button>
          ))}
          <div className="my-1.5 h-px bg-white/[0.06]" />
          {/* A player that froze or stays black: load it again. */}
          <button
            role="menuitem"
            onClick={() => {
              onReload();
              setOpen(false);
            }}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCw className="size-4 text-muted" strokeWidth={1.75} />
            <span className="flex-1">Reload the player</span>
            <Kbd>R</Kbd>
          </button>
          <button
            role="menuitemcheckbox"
            aria-checked={blockPopups}
            onClick={() => actions.updateSettings({ blockPopups: !blockPopups })}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="min-w-0 flex-1">Block pop-ups in embeds</span>
            <span aria-hidden className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', blockPopups ? 'bg-white' : 'bg-white/15')}>
              <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', blockPopups ? 'translate-x-4 bg-black' : 'bg-white')} />
            </span>
          </button>
          <p className="px-3 pt-1 pb-2 text-xs text-pretty text-faint">Some players refuse to start while pop-ups are blocked. If this one stays black, turn it off or try another stream.</p>
        </div>
      )}
    </div>
  );
}

/** Before the start: when it begins, counted down, over its poster. */
function NotYet({ listing: l, now, onOpen }: { listing: LiveListing; now: number; onOpen: () => void }) {
  const start = localStart(l.startsAt, now);
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden" data-testid="not-yet">
      {l.poster && <img src={l.poster} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full scale-105 object-cover opacity-25 blur-sm" />}
      <div className="relative flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <p className="text-micro font-semibold tracking-wider text-muted uppercase">Starts {startsIn(l.startsAt, now)}</p>
        <p className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          <time dateTime={new Date(l.startsAt).toISOString()}>
            {start.day} at {start.time}
          </time>
          {start.zone && <span className="ml-2 text-base font-normal text-faint">{start.zone}</span>}
        </p>
        <p className="text-sm text-pretty text-muted">The stream usually opens a few minutes before the start. This page switches to it by itself.</p>
        <button type="button" onClick={onOpen} className={cx(btn(), 'mt-2')}>
          Open the player now
        </button>
      </div>
    </div>
  );
}

function Ended({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center" data-testid="ended">
      <div className="max-w-md space-y-3">
        <p className="text-xl font-semibold">This event has ended</p>
        <p className="text-pretty text-muted">Its scheduled time is over. If it ran long, the player may still be showing it.</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <button type="button" onClick={onOpen} className={btn()}>
            Open the player anyway
          </button>
          <Link to="/sports" className={btn({ variant: 'primary' })}>
            See what’s on
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tuning({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-black" role="status">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 md:right-5">
        <button type="button" aria-label="Close (Esc)" onClick={onClose} className={btn({ variant: 'secondary', icon: true })}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="font-medium">Finding the stream…</p>
      </div>
    </div>
  );
}

function Message({ title, body, retry }: { title: string; body: string; retry?: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-bg p-6 text-center" data-testid="sports-message">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="text-pretty text-muted">{body}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {retry && (
            <button onClick={retry} className={btn()}>
              Try again
            </button>
          )}
          <Link to="/sports" className={btn({ variant: 'primary' })}>
            See what’s on
          </Link>
        </div>
      </div>
    </div>
  );
}
