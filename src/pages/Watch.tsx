import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, Keyboard, ListVideo, SkipBack, SkipForward, X } from 'lucide-react';
import EpisodeSelector from '../components/EpisodeSelector';
import { allSeasons, epLabel, neighbors, regularSeasons, resolveEpisode } from '../lib/episodes';
import { imageUrl } from '../lib/images';
import { viaProxy } from '../lib/proxy';
import { EMBEDS, embedById, fetchJelly, type Target } from '../lib/servers';
import { actions, findProgress, getState, resumeTarget, useStore } from '../lib/store';
import { HttpError, q, titleOf, type MediaType } from '../lib/tmdb';
import { cx, useDismiss, useKeys, useTitle } from '../lib/util';
import { hotkeysCtl } from '../components/Hotkeys';
import Kbd from '../components/Kbd';
import EmbedPlayer from '../player/EmbedPlayer';
import Player from '../player/Player';

export default function Watch() {
  const params = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const type = params.type as MediaType;
  const id = Number(params.id);
  const valid = (type === 'movie' || type === 'tv') && Number.isInteger(id) && id > 0;
  const details = useQuery({ ...q.details(type, id), enabled: valid });
  const d = details.data;

  const rawS = sp.get('season');
  const rawE = sp.get('episode');
  const season = rawS === null ? undefined : Number(rawS);
  const episode = rawE === null ? undefined : Number(rawE);

  // TV without (valid) season/episode: go to the resume point / first episode.
  const fix = useMemo(() => {
    if (type !== 'tv' || !d) return null;
    if (season === undefined || episode === undefined || Number.isNaN(season) || Number.isNaN(episode)) {
      const r = resumeTarget(getState().history, 'tv', id);
      const first = regularSeasons(d)[0]?.season_number ?? allSeasons(d)[0]?.season_number;
      if (r?.season !== undefined) return { season: r.season, episode: r.episode! };
      return first !== undefined ? { season: first, episode: 1 } : 'invalid';
    }
    const ok = resolveEpisode(d, season, episode);
    if (!ok) return 'invalid';
    return ok.season === season && ok.episode === episode ? null : ok;
  }, [type, d, id, season, episode]);

  useEffect(() => {
    if (fix && fix !== 'invalid') navigate(`/watch/tv/${id}?season=${fix.season}&episode=${fix.episode}`, { replace: true });
  }, [fix, id, navigate]);

  useTitle(d ? (type === 'tv' && season !== undefined ? `${titleOf(d)} ${epLabel(season, episode)}` : titleOf(d)) : 'Watch');

  if (!valid || (details.error instanceof HttpError && details.error.status === 404) || fix === 'invalid') {
    return <Message title="Can’t play this" body="This title or episode doesn’t exist." back={valid ? `/${type}/${id}` : '/'} />;
  }
  if (details.error) return <Message title="Couldn’t load this title" body="Check your connection and try again." back="/" retry={() => details.refetch()} />;
  if (!d || fix) return <div className="fixed inset-0 grid place-items-center bg-black"><Spinner /></div>;

  return <WatchView key={`${type}-${id}-${season}-${episode}`} type={type} id={id} season={season} episode={episode} restart={sp.get('t') === '0'} />;
}

function WatchView({ type, id, season, episode, restart }: { type: MediaType; id: number; season?: number; episode?: number; restart: boolean }) {
  const navigate = useNavigate();
  const { data: d } = useQuery(q.details(type, id));
  const { data: seasonData } = useQuery({ ...q.season(id, season ?? 1), enabled: type === 'tv' });
  const settings = useStore((s) => s.settings);
  const [server, setServer] = useState(settings.server);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  const target = useMemo<Target>(() => ({ type, id, season, episode }), [type, id, season, episode]);
  const title = d ? titleOf(d) : '';
  const ep = seasonData?.episodes.find((e) => e.episode_number === episode);
  const { prev, next } = useMemo(() => (type === 'tv' ? neighbors(d, season!, episode!) : { prev: null, next: null }), [type, d, season, episode]);
  const detailsUrl = `/${type}/${id}${type === 'tv' ? `?season=${season}` : ''}`;
  const go = useCallback(
    (s: number, e: number) => navigate(`/watch/tv/${id}?season=${s}&episode=${e}`, { replace: true }),
    [id, navigate],
  );

  // Resume point, read once per episode (not reactive: progress updates must not restart playback).
  const resumeAt = useMemo(() => {
    if (restart) return 0;
    const p = findProgress(getState().history, type, id, season, episode);
    return p?.progress && !p.isCompleted && p.progress.watched < p.progress.duration - 30 ? p.progress.watched : 0;
  }, [restart, type, id, season, episode]);

  const jelly = useQuery({
    queryKey: ['jelly', type, id, season, episode],
    queryFn: ({ signal }) => fetchJelly(target, signal),
    enabled: server === 'jelly',
    retry: false,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 30,
  });

  // Route Jelly's streams through the user's own proxy (Profile → Settings), if set.
  const streams = useMemo(() => (jelly.data ? viaProxy(jelly.data, settings.proxyUrl) : undefined), [jelly.data, settings.proxyUrl]);

  // Jelly found nothing → fall back to the first embed (without changing the saved preference).
  useEffect(() => {
    if (server === 'jelly' && jelly.isError) {
      console.warn('Jelly:', jelly.error.message);
      setFallbackNote(`Jelly couldn’t find a working source. Switched to ${EMBEDS[0].name}.`);
      setServer(EMBEDS[0].id);
    }
  }, [server, jelly.isError, jelly.error]);

  const record = useCallback(
    (watched: number, duration: number, ended?: boolean) => {
      if (!d) return;
      actions.recordProgress({
        id,
        mediaType: type,
        title: titleOf(d),
        posterPath: d.poster_path,
        backdropPath: d.backdrop_path,
        ...(type === 'tv' ? { season, episode, episodeTitle: ep?.name, nextEpisode: next } : {}),
        progress: duration > 0 ? { watched, duration } : undefined,
        ended,
      });
    },
    [d, id, type, season, episode, ep?.name, next],
  );

  const pickServer = (s: string) => {
    if (s === 'jelly' && jelly.isError) jelly.refetch();
    setServer(s);
    setFallbackNote(null);
    actions.updateSettings({ server: s });
  };

  const embed = server !== 'jelly' ? (embedById(server) ?? EMBEDS[0]) : null;

  // Page shortcuts (the Jelly player adds its own: space, arrows, f, m, c, n, i).
  useKeys({
    ...(type === 'tv' ? { e: () => setDrawer(true) } : {}),
    ...(prev ? { P: () => go(prev.season, prev.episode) } : {}),
    // The Jelly player already handles "n"; embeds can't, so the page does.
    ...(next && embed ? { n: () => go(next.season, next.episode), N: () => go(next.season, next.episode) } : {}),
  });
  const subtitle = type === 'tv' ? `${epLabel(season, episode)}${ep?.name ? ` · ${ep.name}` : ''}` : undefined;

  const header = (
    <Header
      title={title}
      subtitle={subtitle}
      detailsUrl={detailsUrl}
      prev={prev ? () => go(prev.season, prev.episode) : undefined}
      next={next ? () => go(next.season, next.episode) : undefined}
      onEpisodes={type === 'tv' ? () => setDrawer(true) : undefined}
      serverMenu={<ServerMenu current={embed ? embed.id : 'jelly'} onPick={pickServer} jellyState={jelly.isError ? 'failed' : jelly.isFetching ? 'loading' : jelly.data ? 'ok' : 'idle'} />}
    />
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      {embed ? (
        <>
          <div className="relative z-10 shrink-0 bg-bg">{header}</div>
          {fallbackNote && <Banner text={fallbackNote} onClose={() => setFallbackNote(null)} />}
          <div className="relative min-h-0 flex-1">
            <EmbedPlayer
              server={embed}
              target={target}
              resumeAt={resumeAt}
              sandbox={settings.blockPopups}
              onProgress={record}
              onStarted={() => record(0, 0)}
            />
          </div>
        </>
      ) : streams ? (
        <Player
          key={settings.proxyUrl}
          data={streams}
          title={title}
          subtitle={subtitle}
          poster={imageUrl(d?.poster_path, 'poster', 342)}
          resumeAt={resumeAt}
          header={header}
          next={next ? { label: nextLabel(next, seasonData?.episodes), go: () => go(next.season, next.episode) } : null}
          onProgress={record}
          onExhausted={() => {
            setFallbackNote(`Jelly’s sources wouldn’t play. Switched to ${EMBEDS[0].name}.`);
            setServer(EMBEDS[0].id);
          }}
        />
      ) : (
        <>
          <div className="relative z-10 shrink-0">{header}</div>
          <JellyLoading backdrop={d?.backdrop_path} onSkip={() => pickServer(EMBEDS[0].id)} />
        </>
      )}

      {drawer && type === 'tv' && d && (
        <EpisodeSelector show={d} current={{ season: season!, episode: episode! }} onClose={closeDrawer} onPick={closeDrawer} replace />
      )}
    </div>
  );
}

function nextLabel(n: { season: number; episode: number }, eps?: { season_number: number; episode_number: number; name: string }[]) {
  const name = eps?.find((e) => e.season_number === n.season && e.episode_number === n.episode)?.name;
  return `${epLabel(n.season, n.episode)}${name ? ` · ${name}` : ''}`;
}

// ---------- header ----------

/** Soft grouped box, like the sidebar's groups; readable over video and over the page. */
const BOX = 'flex shrink-0 items-center gap-0.5 rounded-2xl bg-black/30 p-1 ring-1 ring-white/10 backdrop-blur-xl';

function Header({
  title,
  subtitle,
  detailsUrl,
  prev,
  next,
  onEpisodes,
  serverMenu,
}: {
  title: string;
  subtitle?: string;
  detailsUrl: string;
  prev?: () => void;
  next?: () => void;
  onEpisodes?: () => void;
  serverMenu: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:gap-3 md:px-5">
      <div className={BOX}>
        <HeaderButton label="Back to details" to={detailsUrl}>
          <ArrowLeft className="size-[18px]" />
        </HeaderButton>
      </div>
      <Link to={detailsUrl} className="min-w-0 flex-1 leading-tight">
        <div className="line-clamp-2 text-sm leading-tight font-semibold md:line-clamp-1 md:text-base">{title}</div>
        {subtitle && <div className="truncate text-xs text-white/65 md:text-[13px]">{subtitle}</div>}
      </Link>
      {onEpisodes && (
        <div className={BOX}>
          {/* Phones: previous / next live in the episode list, so the title keeps its room. */}
          <div className="hidden items-center gap-0.5 sm:flex">
            <HeaderButton label="Previous episode" keys="Shift P" onClick={prev} disabled={!prev}>
              <SkipBack className="size-[18px]" />
            </HeaderButton>
            <HeaderButton label="Next episode" keys="N" onClick={next} disabled={!next}>
              <SkipForward className="size-[18px]" />
            </HeaderButton>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-white/10" />
          </div>
          <button type="button" onClick={onEpisodes} className="flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm transition hover:bg-white/10 md:px-3" aria-label="Episodes">
            <ListVideo className="size-[18px]" />
            <span className="hidden md:inline">Episodes</span>
            <Kbd>E</Kbd>
          </button>
        </div>
      )}
      {serverMenu}
      <div className={cx(BOX, 'hidden lg:flex')}>
        <HeaderButton label="Keyboard shortcuts" keys="?" onClick={() => hotkeysCtl.help()}>
          <Keyboard className="size-[18px]" />
        </HeaderButton>
      </div>
    </div>
  );
}

/** Icon button with a hover label (and its key) shown below it. */
function HeaderButton({ label, keys, onClick, to, disabled, children }: { label: string; keys?: string; onClick?: () => void; to?: string; disabled?: boolean; children: React.ReactNode }) {
  // The back button sits at the left edge, so its label opens to the right.
  const side = to ? 'left-0' : 'right-0';
  const cls = 'group relative grid size-10 shrink-0 place-items-center rounded-xl transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent';
  const tip = (
    <span className={cx('pointer-events-none absolute top-full z-50 mt-2 flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/5 transition group-hover:opacity-100 group-focus-visible:opacity-100', side)}>
      {label}
      {keys && <Kbd>{keys}</Kbd>}
    </span>
  );
  return to ? (
    <Link to={to} aria-label={label} className={cls}>
      {children}
      {tip}
    </Link>
  ) : (
    <button type="button" aria-label={keys ? `${label} (${keys})` : label} onClick={onClick} disabled={disabled} className={cls}>
      {children}
      {tip}
    </button>
  );
}

const DOT: Record<'idle' | 'loading' | 'ok' | 'failed', string> = {
  idle: 'bg-white/40',
  loading: 'animate-pulse bg-warning',
  ok: 'bg-success',
  failed: 'bg-danger',
};

function ServerMenu({ current, onPick, jellyState }: { current: string; onPick: (id: string) => void; jellyState: 'idle' | 'loading' | 'ok' | 'failed' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);
  useDismiss(open, close, ref);
  const blockPopups = useStore((s) => s.settings.blockPopups);
  const name = current === 'jelly' ? 'Jelly' : (embedById(current)?.name ?? 'Server');
  useKeys({ s: () => setOpen((o) => !o) });
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative shrink-0">
      <div className={BOX}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Server: ${name} (S)`}
          className={cx('flex h-10 items-center gap-2 rounded-xl px-3 text-sm transition', open ? 'bg-white text-black' : 'hover:bg-white/10')}
        >
          {current === 'jelly' && <span aria-hidden className={cx('size-2 shrink-0 rounded-full', DOT[jellyState])} />}
          <span className="hidden max-w-[7rem] truncate font-medium sm:inline">{name}</span>
          <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} />
          <Kbd light={open}>S</Kbd>
        </button>
      </div>
      {open && (
        <div className="toast-in absolute right-0 z-40 mt-2 max-h-[75vh] w-72 overflow-y-auto overscroll-contain rounded-[18px] border border-transparent bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/10">
          <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wider text-faint uppercase">Direct</div>
          <ServerItem selected={current === 'jelly'} onClick={() => pick('jelly')} name="Jelly" dot={DOT[jellyState]} note={jellyState === 'failed' ? 'No sources for this title' : jellyState === 'loading' ? 'Checking sources…' : jellyState === 'ok' ? 'Sources found · ad-free · subtitles' : 'Ad-free · subtitles · quality picker'} warn={jellyState === 'failed'} />
          <div className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-wider text-faint uppercase">Embedded players</div>
          {EMBEDS.map((e) => (
            <ServerItem key={e.id} selected={current === e.id} onClick={() => pick(e.id)} name={e.name} note={e.tracksProgress ? 'Saves progress' : 'Progress not saved'} />
          ))}
          <div className="my-1.5 h-px bg-white/[0.06]" />
          <button
            aria-pressed={blockPopups}
            onClick={() => actions.updateSettings({ blockPopups: !blockPopups })}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/[0.06]"
          >
            <span className="min-w-0 flex-1">
              Block pop-ups in embeds
              <span className="block text-xs text-muted">Turn off if a server refuses to play</span>
            </span>
            <span aria-hidden className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', blockPopups ? 'bg-white' : 'bg-white/15')}>
              <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full transition-transform', blockPopups ? 'translate-x-5 bg-black' : 'bg-white')} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function ServerItem({ selected, onClick, name, note, warn, dot }: { selected: boolean; onClick: () => void; name: string; note: string; warn?: boolean; dot?: string }) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition', selected ? 'bg-white text-black' : 'hover:bg-white/[0.06]')}
    >
      {dot && <span aria-hidden className={cx('size-2 shrink-0 rounded-full', dot)} />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{name}</span>
        <span className={cx('block text-xs', selected ? 'text-black/60' : warn ? 'text-warning' : 'text-muted')}>{note}</span>
      </span>
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}

// ---------- states ----------

function JellyLoading({ backdrop, onSkip }: { backdrop?: string | null; onSkip: () => void }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden">
      {backdrop && <img src={imageUrl(backdrop, 'backdrop', 780)} alt="" className="absolute inset-0 size-full scale-105 object-cover opacity-25 blur-sm" />}
      <div className="relative flex flex-col items-center gap-4 px-6 text-center">
        <Spinner />
        <div>
          <p className="font-medium">Finding sources…</p>
          <p className="mt-1 text-sm text-white/60 tabular-nums">
            Jelly is checking providers · {secs}s
          </p>
        </div>
        {secs >= 8 && (
          <button onClick={onSkip} className="h-10 rounded-full bg-white/10 px-5 text-sm hover:bg-white/20">
            Use an embedded player instead
          </button>
        )}
      </div>
    </div>
  );
}

function Banner({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
      <span className="flex-1">{text}</span>
      <button onClick={onClose} aria-label="Dismiss" className="text-amber-100/70 hover:text-white">
        <X className="size-4" />
      </button>
    </div>
  );
}

const Spinner = () => <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />;

function Message({ title, body, back, retry }: { title: string; body: string; back: string; retry?: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-bg p-6 text-center">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted">{body}</p>
        <div className="flex justify-center gap-2 pt-2">
          {retry && (
            <button onClick={retry} className="h-11 rounded-full px-5 text-sm ring-1 ring-white/20 hover:bg-white/10">
              Try again
            </button>
          )}
          <Link to={back} className="h-11 rounded-full bg-white px-5 text-sm leading-[2.75rem] font-medium text-black hover:bg-white/90">
            {back === '/' ? 'Go home' : 'Back to details'}
          </Link>
        </div>
      </div>
    </div>
  );
}
