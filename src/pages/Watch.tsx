import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ListVideo, Server, ShieldCheck, X } from 'lucide-react';
import EpisodeSelector from '../components/EpisodeSelector';
import { allSeasons, epLabel, neighbors, regularSeasons, resolveEpisode } from '../lib/episodes';
import { imageUrl } from '../lib/images';
import { viaProxy } from '../lib/proxy';
import { EMBEDS, embedById, fetchJelly, type Target } from '../lib/servers';
import { actions, findProgress, getState, resumeTarget, useStore } from '../lib/store';
import { HttpError, q, titleOf, type MediaType } from '../lib/tmdb';
import { cx, useDismiss, useTitle } from '../lib/util';
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
      setFallbackNote(`Jelly: ${jelly.error.message}. Switched to ${EMBEDS[0].name}.`);
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
    <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:px-4">
      <Link to={detailsUrl} aria-label="Back to details" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/15">
        <ArrowLeft className="size-5" />
      </Link>
      <Link to={detailsUrl} className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold md:text-base">{title}</div>
        {subtitle && <div className="truncate text-xs text-white/65">{subtitle}</div>}
      </Link>
      {onEpisodes && (
        <>
          <HeaderButton label="Previous episode" onClick={prev} disabled={!prev}>
            <ChevronLeft className="size-5" />
          </HeaderButton>
          <HeaderButton label="Next episode" onClick={next} disabled={!next}>
            <ChevronRight className="size-5" />
          </HeaderButton>
          <HeaderButton label="Episodes" onClick={onEpisodes}>
            <ListVideo className="size-5" />
          </HeaderButton>
        </>
      )}
      {serverMenu}
    </div>
  );
}

function HeaderButton({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ServerMenu({ current, onPick, jellyState }: { current: string; onPick: (id: string) => void; jellyState: 'idle' | 'loading' | 'ok' | 'failed' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const blockPopups = useStore((s) => s.settings.blockPopups);
  const name = current === 'jelly' ? 'Jelly' : (embedById(current)?.name ?? 'Server');
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full px-3 text-sm hover:bg-white/15"
      >
        <Server className="size-4" />
        <span className="hidden sm:inline">{name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 max-h-[75vh] w-72 overflow-y-auto rounded-2xl bg-raised p-1.5 shadow-2xl ring-1 ring-white/5">
          <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Direct</div>
          <ServerItem selected={current === 'jelly'} onClick={() => pick('jelly')} name="Jelly" note={jellyState === 'failed' ? 'No sources for this title' : 'Ad-free · subtitles · quality picker'} warn={jellyState === 'failed'} />
          <div className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Embedded players</div>
          {EMBEDS.map((e) => (
            <ServerItem key={e.id} selected={current === e.id} onClick={() => pick(e.id)} name={e.name} note={e.tracksProgress ? 'Saves progress' : 'Progress not saved'} />
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitemcheckbox"
            aria-checked={blockPopups}
            onClick={() => actions.updateSettings({ blockPopups: !blockPopups })}
            className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10"
          >
            <ShieldCheck className={cx('mt-0.5 size-4 shrink-0', blockPopups ? 'text-emerald-400' : 'text-faint')} />
            <span>
              Block pop-ups in embeds
              <span className="block text-xs text-muted">{blockPopups ? 'On — turn off if a server refuses to play' : 'Off'}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function ServerItem({ selected, onClick, name, note, warn }: { selected: boolean; onClick: () => void; name: string; note: string; warn?: boolean }) {
  return (
    <button role="menuitemradio" aria-checked={selected} onClick={onClick} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10">
      <Check className={cx('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
      <span className="min-w-0">
        <span className="block text-sm">{name}</span>
        <span className={cx('block text-xs', warn ? 'text-amber-300' : 'text-muted')}>{note}</span>
      </span>
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
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
}
