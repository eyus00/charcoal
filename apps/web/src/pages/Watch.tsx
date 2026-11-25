import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, Check, ChevronDown, Keyboard, ShieldAlert, X } from 'lucide-react';
import Modal from '../components/Modal';
import EpisodeSelector from '../components/EpisodeSelector';
import { allSeasons, epLabel, neighbors, regularSeasons, resolveEpisode } from '../lib/episodes';
import { imageUrl } from '../lib/images';
import { toast } from '../components/Toast';
import { useSources } from '../lib/resolver';
import { looksLikeAnime, useAnime, type AnimeAudio, type AnimeState } from '../lib/anime';
import { EMBEDS, embedById, languageName, type JellySource, type Target } from '../lib/servers';
import { actions, findProgress, getState, resumeTarget, useStore } from '../lib/store';
import { HttpError, q, titleOf, type MediaType } from '../lib/tmdb';
import { cx, useDismiss, useKeys, useTitle } from '../lib/util';
import { hotkeysCtl } from '../components/Hotkeys';
import Kbd from '../components/Kbd';
import { btn } from '../components/Button';
import EmbedPlayer from '../player/EmbedPlayer';
import Player, { TitleInfo } from '../player/Player';
import MiniEpisodes from '../player/MiniEpisodes';
import { Tip } from '../components/Tip';
import Segmented from '../components/Segmented';

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
  if (!d || fix)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black">
        <Spinner />
      </div>
    );

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
  // Close / Esc return to wherever the player was opened from (home, the hero, a row, the title
  // page). Episode changes replace the history entry, so one step back always leaves the player.
  // Opened directly (a link or a refresh), there is nothing to go back to, so use the title page.
  const location = useLocation();
  const leave = useCallback(() => (location.key !== 'default' ? navigate(-1) : navigate(detailsUrl)), [location.key, navigate, detailsUrl]);
  const go = useCallback((s: number, e: number) => navigate(`/watch/tv/${id}?season=${s}&episode=${e}`, { replace: true }), [id, navigate]);

  // Resume point, read once per episode (not reactive: progress updates must not restart playback).
  const resumeAt = useMemo(() => {
    if (restart) return 0;
    const p = findProgress(getState().history, type, id, season, episode);
    return p?.progress && !p.isCompleted && p.progress.watched < p.progress.duration - 30 ? p.progress.watched : 0;
  }, [restart, type, id, season, episode]);

  // One search, wherever the sources come from: providers that can run in this browser (through
  // Charcoal Helper or the app) run here, the rest on the viewer's own server or Charcoal's, and
  // everything arrives as one ranked list that grows while providers are still answering.
  // A title that is anime is also searched for as its AniList / MAL entry (lib/resolver does that
  // by itself); what is known about it here is for the audio control.
  const anime = useAnime(type, id, d, season, episode);
  const found = useSources(target, d, ep?.id, server === 'jelly');
  const streams = found.data;
  // Search again with fresh links (the player calls it once by itself before giving up).
  const refreshSources = found.refetch;
  // Their own server didn't work, so the hosted one answered: say so once.
  const ownError = streams?.ownError;
  useEffect(() => {
    if (ownError) toast(`Your server didn’t work (${ownError.replace(/\.$/, '')}), so Charcoal’s server is being used`);
  }, [ownError]);

  // Nothing playable anywhere: use an embed server (without changing the saved preference). This
  // happens as soon as every provider has answered; there is no blind retry in between.
  // A search that ends with nothing is run once more by itself first: a provider that was slow
  // or resting a moment ago often answers the second time, and an embed is a worse way to watch.
  // (Only when the first one was quick: after a long empty search the viewer has waited enough.)
  const emptySearches = useRef(0);
  const opened = useRef(Date.now());
  useEffect(() => {
    if (server === 'jelly' && found.error && !found.searching) {
      if (emptySearches.current++ < 1 && Date.now() - opened.current < 8000) return void found.refetch();
      console.warn('Jelly:', found.error.message);
      setFallbackNote(`Jelly couldn’t find a working source. Switched to ${EMBEDS[0].name}.`);
      setServer(EMBEDS[0].id);
    }
  }, [server, found.error, found.searching]);

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
        ...(looksLikeAnime(d) ? { anime: true } : {}),
        progress: duration > 0 ? { watched, duration } : undefined,
        ended,
      });
    },
    [d, id, type, season, episode, ep?.name, next],
  );

  // Switching from Jelly to an embed: first say what embeds are (once, unless turned off).
  const [embedAsk, setEmbedAsk] = useState<string | null>(null);
  const pickServer = (s: string, confirmed = false) => {
    if (s !== 'jelly' && server === 'jelly' && !confirmed && !getState().settings.embedNoticeOff) return setEmbedAsk(s);
    setEmbedAsk(null);
    if (s === 'jelly' && found.error) found.refetch();
    setServer(s);
    setFallbackNote(null);
    actions.updateSettings({ server: s });
  };


  const embed = server !== 'jelly' ? (embedById(server) ?? EMBEDS[0]) : null;

  // Audio preferences apply to the next search, so changing one searches again: the list on screen
  // stays until the new one arrives, and the player then carries on from the same position.
  const refetch = found.refetch;
  const setAnimeAudio = useCallback(
    (animeAudio: AnimeAudio) => {
      actions.updateSettings({ animeAudio });
      refetch();
    },
    [refetch],
  );
  const setAudioLang = useCallback(
    (audioLang: string) => {
      actions.updateSettings({ audioLang });
      refetch();
    },
    [refetch],
  );
  const heard = useMemo(() => audioLanguages(streams?.sources ?? []), [streams?.sources]);
  const audioMenu =
    !embed && (anime.isAnime || heard.length > 0) ? (
      <AudioMenu anime={anime} animeAudio={settings.animeAudio} onAnimeAudio={setAnimeAudio} languages={heard} preferred={settings.audioLang} onLanguage={setAudioLang} />
    ) : null;

  // Page shortcuts (the Jelly player adds its own: space, arrows, f, m, c, n, i).
  useKeys({
    // Esc: back to the title page, unless a menu is open (it closes that) or the video is
    // fullscreen (the browser exits fullscreen).
    Escape: () => !document.fullscreenElement && !document.querySelector('[aria-expanded="true"]') && leave(),
    ...(type === 'tv' ? { e: () => setDrawer(true) } : {}),
    ...(prev ? { P: () => go(prev.season, prev.episode) } : {}),
    // The Jelly player already handles Shift N; embeds can't, so the page does.
    ...(next && embed ? { N: () => go(next.season, next.episode) } : {}),
  });
  const subtitle = type === 'tv' ? `${epLabel(season, episode)}${ep?.name ? ` · ${ep.name}` : ''}` : undefined;

  const meta = [(d?.release_date || d?.first_air_date || '').slice(0, 4), d?.vote_average ? `★ ${d.vote_average.toFixed(1)}` : ''].filter(Boolean).join(' · ');
  const makeHeader = (pausedInfo?: React.ReactNode) => (
    <Header
      pausedInfo={pausedInfo}
      title={title}
      subtitle={subtitle}
      detailsUrl={detailsUrl}
      onClose={leave}
      onEpisodes={type === 'tv' ? () => setDrawer(true) : undefined}
      audioMenu={audioMenu}
      serverMenu={<ServerMenu current={embed ? embed.id : 'jelly'} onPick={pickServer} jellyState={found.error ? 'failed' : found.data ? 'ok' : found.searching ? 'loading' : 'idle'} />}
    />
  );
  const header = makeHeader();

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      {embedAsk && <EmbedNotice name={embedById(embedAsk)?.name ?? 'this server'} onCancel={() => setEmbedAsk(null)} onContinue={() => pickServer(embedAsk, true)} />}
      {embed ? (
        <>
          <div className="relative z-10 shrink-0 bg-bg">{header}</div>
          {fallbackNote && <Banner text={fallbackNote} onClose={() => setFallbackNote(null)} />}
          <div className="relative min-h-0 flex-1">
            <EmbedPlayer server={embed} target={target} resumeAt={resumeAt} sandbox={settings.blockPopups} onProgress={record} onStarted={() => record(0, 0)} />
          </div>
        </>
      ) : streams ? (
        <Player
          key={settings.serverUrl}
          data={streams}
          media={target}
          title={title}
          subtitle={subtitle}
          overview={(type === 'tv' ? ep?.overview : undefined) || d?.overview}
          detailsUrl={detailsUrl}
          onEpisodes={type === 'tv' ? () => setDrawer(true) : undefined}
          onDetails={d ? () => navigate(detailsUrl) : undefined}
          meta={meta}
          poster={imageUrl(d?.poster_path, 'poster', 342)}
          resumeAt={resumeAt}
          audioLang={anime.isAnime && settings.animeAudio === 'sub' ? 'ja' : settings.audioLang}
          header={makeHeader}
          prev={type === 'tv' ? (prev ? { label: nextLabel(prev, seasonData?.episodes), go: () => go(prev.season, prev.episode) } : null) : undefined}
          next={type === 'tv' ? (next ? { label: nextLabel(next, seasonData?.episodes), go: () => go(next.season, next.episode) } : null) : undefined}
          episodes={
            type === 'tv' && d
              ? (close) => (
                  <MiniEpisodes
                    show={d}
                    current={{ season: season!, episode: episode! }}
                    onPick={(s, e) => (close(), go(s, e))}
                    onAll={() => (close(), setDrawer(true))}
                    onPrev={prev ? () => (close(), go(prev.season, prev.episode)) : undefined}
                    onNext={next ? () => (close(), go(next.season, next.episode)) : undefined}
                  />
                )
              : undefined
          }
          onProgress={record}
          searching={found.searching}
          refreshing={found.refreshing}
          generation={found.generation}
          onRefresh={refreshSources}
          onExhausted={() => {
            setFallbackNote(`Jelly’s sources wouldn’t play. Switched to ${EMBEDS[0].name}.`);
            setServer(EMBEDS[0].id);
          }}
        />
      ) : (
        <>
          <div className="relative z-10 shrink-0">
            {makeHeader(
              <TitleInfo
                title={title}
                subtitle={subtitle}
                meta={meta}
                detailsUrl={detailsUrl}
                onDetails={d ? () => navigate(detailsUrl) : undefined}
                onEpisodes={type === 'tv' ? () => setDrawer(true) : undefined}
              />,
            )}
          </div>
          <JellyLoading backdrop={d?.backdrop_path} onSkip={() => pickServer(EMBEDS[0].id)} />
        </>
      )}

      {drawer && type === 'tv' && d && (
        <EpisodeSelector
          show={d}
          current={{ season: season!, episode: episode! }}
          onClose={closeDrawer}
          onPick={closeDrawer}
          replace
          prev={prev ? () => (closeDrawer(), go(prev.season, prev.episode)) : null}
          next={next ? () => (closeDrawer(), go(next.season, next.episode)) : null}
        />
      )}
    </div>
  );
}

function nextLabel(n: { season: number; episode: number }, eps?: { season_number: number; episode_number: number; name: string }[]) {
  const name = eps?.find((e) => e.season_number === n.season && e.episode_number === n.episode)?.name;
  return `${epLabel(n.season, n.episode)}${name ? ` · ${name}` : ''}`;
}

// ---------- header ----------

/** Text links brighten on hover (the app-wide convention for links that are text). */
const TEXT_LINK = 'transition-colors hover:text-white';

function Header({
  title,
  subtitle,
  detailsUrl,
  onEpisodes,
  audioMenu,
  serverMenu,
  onClose,
  pausedInfo,
}: {
  /** Jelly player: the bigger "what's playing" block replaces the small title. */
  pausedInfo?: React.ReactNode;
  title: string;
  subtitle?: string;
  detailsUrl: string;
  onClose: () => void;
  onEpisodes?: () => void;
  /** Sub / dub and the audio language (Jelly only, when there is something to choose). */
  audioMenu?: React.ReactNode;
  serverMenu: React.ReactNode;
}) {
  return (
    // Close and the title on the left, shortcuts then the server on the far right. No boxes: plain round
    // controls like the details page.
    <div className="flex items-start gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:gap-3 md:px-5">
      {pausedInfo ? <div className="min-w-0 px-1">{pausedInfo}</div> : <TitleBox title={title} subtitle={subtitle} detailsUrl={detailsUrl} onEpisodes={onEpisodes} />}
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-3">
        {/* Same as the sidebar's shortcuts button: no background, the icon and its key. */}
        <button
          type="button"
          onClick={() => hotkeysCtl.help()}
          aria-label="Keyboard shortcuts (?)"
          className="group/tip relative hidden h-10 items-center gap-2 rounded-xl px-2 text-faint transition hover:text-white lg:flex"
        >
          <Tip label="Keyboard shortcuts" side="bottom" />
          <Keyboard className="size-[18px]" strokeWidth={1.5} />
          <Kbd>?</Kbd>
        </button>
        {audioMenu}
        {serverMenu}
        <HeaderButton label="Close player" keys="Esc" onClick={onClose} solid>
          <X className="size-5" />
        </HeaderButton>
      </div>
    </div>
  );
}

/**
 * The centred title hub. Fixed width from tablet up, so nothing grows or shifts with the episode
 * name (long names truncate; the full name is in the tooltip and the episode list). For TV the
 * whole hub opens the episode list; previous / next and the title link sit on top of it.
 */
/** What's playing, top-left (embedded players): the title and the episode. */
function TitleBox({ title, subtitle, detailsUrl, onEpisodes }: { title: string; subtitle?: string; detailsUrl: string; onEpisodes?: () => void }) {
  const text = (
    <div className="min-w-0 leading-snug">
      <Link to={detailsUrl} title={`${title}: details`} className={cx(TEXT_LINK, 'pointer-events-auto block truncate text-base font-semibold text-white md:text-lg')}>
        {title}
      </Link>
      {subtitle && <div className="truncate text-sm text-white/80">{subtitle}</div>}
    </div>
  );
  if (!onEpisodes) return <div className="min-w-0 px-1 pt-0.5">{text}</div>;
  return (
    <div className="group/hub relative min-w-0">
      <button
        type="button"
        onClick={onEpisodes}
        aria-label={`Episodes${subtitle ? `, now playing ${subtitle}` : ''} (E)`}
        title={subtitle}
        className="absolute inset-0 rounded-xl transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05]"
      />
      <div className="pointer-events-none relative flex items-center gap-2 px-2.5 py-1">
        {text}
        <Kbd className="shrink-0 self-center">E</Kbd>
      </div>
      <span className="pointer-events-none absolute top-full left-0 z-50 mt-2 flex items-center gap-2 rounded-lg border border-transparent bg-raised px-2.5 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/5 transition group-hover/hub:opacity-100 group-focus-within/hub:opacity-100">
        Episodes
        <Kbd>E</Kbd>
      </span>
    </div>
  );
}

/** Icon button with a hover label (and its key) shown below it. */
function HeaderButton({
  label,
  keys,
  onClick,
  to,
  disabled,
  children,
  tipSide,
  solid,
  quiet,
}: {
  label: string;
  keys?: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  children: React.ReactNode;
  tipSide?: 'left' | 'right';
  solid?: boolean;
  quiet?: boolean;
}) {
  // Buttons near the left edge open their label to the right, so it stays on screen.
  const align = (tipSide ?? (to ? 'left' : 'right')) === 'left' ? 'start' : 'end';
  // `solid`: the app's round close button (filled); otherwise a plain round icon button.
  // `solid` (the close button) is a secondary button; the rest are ghost buttons.
  const cls = cx(btn({ variant: solid ? 'secondary' : 'ghost', icon: true }), 'group/tip relative', quiet && 'text-white/60');
  const tip = <Tip label={label} keys={keys} side="bottom" align={align} />;
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
  const jellyOn = current === 'jelly';
  const jellyNote = jellyState === 'failed' ? 'Nothing found for this title' : jellyState === 'loading' ? 'Finding sources…' : 'Ad-free · best quality';
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Server: ${name} (S)`}
        className={cx(btn({ variant: open ? 'primary' : 'secondary' }), 'group/tip relative max-sm:px-3')}
      >
        <Tip label="Choose a server" side="bottom" align="end" hidden={open} />
        {current === 'jelly' && <span aria-hidden className={cx('size-2 shrink-0 rounded-full', DOT[jellyState])} />}
        {/* Phones: just the arrow (and Jelly's status dot), so the title gets the room. */}
        <span className="hidden max-w-[7rem] truncate font-medium sm:inline">{name}</span>
        <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} />
        <Kbd light={open}>S</Kbd>
      </button>
      {open && (
        <div className="toast-in absolute right-0 z-40 mt-2 max-h-[75vh] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-[18px] border border-transparent bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/10">
          {/* Jelly: our own player, the one to use. */}
          <button
            aria-pressed={jellyOn}
            onClick={() => pick('jelly')}
            className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors', jellyOn ? 'bg-white text-black' : 'bg-white/[0.06] hover:bg-white/10')}
          >
            <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', DOT[jellyState])} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Jelly</span>
              <span className={cx('block text-xs', jellyOn ? 'text-black/60' : jellyState === 'failed' ? 'text-warning' : 'text-muted')}>{jellyNote}</span>
            </span>
            <span className={cx('rounded-full px-2 max-sm:hidden py-0.5 text-micro font-medium', jellyOn ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/80')}>Recommended</span>
          </button>

          {/* Embeds: other sites' players, a quiet list. */}
          <div className="px-3 pt-3 pb-1 text-xs text-faint">Embedded players</div>
          {EMBEDS.map((e) => {
            const on = current === e.id;
            return (
              <button
                key={e.id}
                aria-pressed={on}
                onClick={() => pick(e.id)}
                className={cx(
                  'flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors',
                  on ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                <span className="flex-1 truncate">{e.name}</span>
                {e.tracksProgress && <span className={cx('text-xs', on ? 'text-black/50' : 'text-faint')}>Saves progress</span>}
              </button>
            );
          })}
          <div className="my-1.5 h-px bg-white/[0.06]" />
          <button
            aria-pressed={blockPopups}
            onClick={() => actions.updateSettings({ blockPopups: !blockPopups })}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="min-w-0 flex-1">Block pop-ups in embeds</span>
            <span aria-hidden className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', blockPopups ? 'bg-white' : 'bg-white/15')}>
              <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', blockPopups ? 'translate-x-4 bg-black' : 'bg-white')} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- audio: sub / dub and the language ----------

interface Heard {
  /** ISO 639-1 code. */
  code: string;
  name: string;
  /** How many of the sources found say they carry it. */
  sources: number;
}

/** The audio languages the sources found report, the most common first. Sources that don't say are left out. */
function audioLanguages(sources: JellySource[]): Heard[] {
  const count = new Map<string, number>();
  for (const s of sources) {
    for (const code of new Set((s.audioTracks ?? []).map((a) => a.language.toLowerCase().slice(0, 2)))) {
      if (/^[a-z]{2}$/.test(code) && code !== 'un') count.set(code, (count.get(code) ?? 0) + 1);
    }
  }
  return [...count].map(([code, n]) => ({ code, name: languageName(code), sources: n })).sort((a, b) => b.sources - a.sources || a.name.localeCompare(b.name));
}

const ANIME_AUDIO: { key: AnimeAudio; label: string }[] = [
  { key: 'sub', label: 'Sub' },
  { key: 'dub', label: 'Dub' },
];

/** A two-letter language tag, like the age-rating tags on cards. */
const LangBadge = ({ code, on }: { code: string; on?: boolean }) => (
  <span className={cx('inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-[5px] px-1.5 text-[11px] leading-none font-medium tracking-wide uppercase ring-1 ring-inset', on ? 'ring-black/40' : 'ring-white/35')}>{code}</span>
);

/**
 * The audio the viewer wants: for anime, original (sub) or dubbed; for everything, which language
 * to put first, chosen from the languages the sources found say they carry.
 */
function AudioMenu({
  anime,
  animeAudio,
  onAnimeAudio,
  languages,
  preferred,
  onLanguage,
}: {
  anime: AnimeState;
  animeAudio: AnimeAudio;
  onAnimeAudio: (a: AnimeAudio) => void;
  languages: Heard[];
  preferred: string;
  onLanguage: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);
  useDismiss(open, close, ref);
  useKeys({ a: () => setOpen((o) => !o) });
  // The chosen language is always listed, also when no source found says it carries it.
  const rows = languages.some((l) => l.code === preferred) ? languages : [{ code: preferred, name: languageName(preferred), sources: 0 }, ...languages];
  const current = anime.isAnime ? (animeAudio === 'sub' ? 'Sub' : 'Dub') : languageName(preferred);
  const entry = anime.identity?.entry;
  // A language is chosen for everything but subtitled anime, whose audio is Japanese by definition.
  const choosing = !anime.isAnime || animeAudio === 'dub';
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Audio: ${current} (A)`}
        className={cx(btn({ variant: open ? 'primary' : 'secondary' }), 'group/tip relative max-sm:px-3')}
      >
        <Tip label="Audio" side="bottom" align="end" hidden={open} />
        <AudioLines className="size-4" />
        <span className="hidden max-w-[6rem] truncate font-medium sm:inline">{current}</span>
        <Kbd light={open}>A</Kbd>
      </button>
      {open && (
        <div
          data-testid="audio-menu"
          // Phones: the button sits left of the server and close buttons, so the panel is pulled
          // right by their width to line up with the screen's edge instead of running off the left.
          className="toast-in absolute right-0 z-40 mt-2 max-h-[75vh] w-[min(18rem,calc(100vw-1.5rem))] max-sm:right-[-9.25rem] overflow-y-auto overscroll-contain rounded-[18px] border border-transparent bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/10"
        >
          {anime.isAnime && (
            <>
              <div className="px-3 pt-2.5 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Anime audio</span>
                  <Segmented value={animeAudio} options={ANIME_AUDIO} onChange={onAnimeAudio} label="Anime audio" compact />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {animeAudio === 'sub' ? 'Japanese audio first; turn subtitles on with C.' : `Sources dubbed into ${languageName(preferred)} first, then other dubs.`}
                </p>
                {/* Which identity the search used, so a missing source can be understood. */}
                {anime.identity !== undefined && (
                  <p className="mt-1 text-xs text-faint" data-testid="anime-identity">
                    {entry ? `Also searched as its anime entry${entry.anilist ? ` (AniList ${entry.anilist})` : ''}, episode ${anime.identity!.episode}.` : 'Not in the anime list: searched as a TMDB title only.'}
                  </p>
                )}
              </div>
              <div className="mb-1.5 h-px bg-white/[0.06]" />
            </>
          )}
          {choosing ? (
            <>
              <div className="px-3 pt-1.5 pb-1 text-xs text-faint">{anime.isAnime ? 'Dub language' : 'Audio language'}</div>
              {rows.map((l) => {
                const on = l.code === preferred;
                return (
                  <button
                    key={l.code}
                    aria-pressed={on}
                    data-lang={l.code}
                    onClick={() => {
                      if (!on) onLanguage(l.code);
                      setOpen(false);
                    }}
                    className={cx('flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors', on ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10 hover:text-white')}
                  >
                    <LangBadge code={l.code} on={on} />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className={cx('text-xs tabular-nums', on ? 'text-black/60' : 'text-faint')}>{sourceCount(l.sources)}</span>
                    {on && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
              <p className="px-3 pt-2 pb-2 text-xs text-muted">Sources in this language are tried first. Sources that don’t say what they carry usually have the original audio.</p>
            </>
          ) : (
            // Sub: the language is settled (Japanese). What the sources carry is shown, not chosen.
            <>
              <div className="px-3 pt-1.5 pb-1 text-xs text-faint">Audio the sources carry</div>
              {languages.length ? (
                languages.map((l) => (
                  <div key={l.code} data-lang={l.code} className="flex h-9 items-center gap-2.5 px-3 text-sm text-white/80">
                    <LangBadge code={l.code} />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="text-xs text-faint tabular-nums">{sourceCount(l.sources)}</span>
                  </div>
                ))
              ) : (
                <p className="px-3 pb-2 text-xs text-muted">None of the sources found says. They usually have the original audio.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const sourceCount = (n: number) => (n ? `${n} ${n === 1 ? 'source' : 'sources'}` : 'none found');

/** Shown before leaving Jelly for an embed: those players are other sites', with their ads. */
function EmbedNotice({ name, onCancel, onContinue }: { name: string; onCancel: () => void; onContinue: () => void }) {
  const [dontAsk, setDontAsk] = useState(false);
  const go = () => {
    if (dontAsk) actions.updateSettings({ embedNoticeOff: true });
    onContinue();
  };
  return (
    <Modal label="About embedded players" onClose={onCancel}>
      <div className="fixed inset-0 grid place-items-center bg-black/70 p-4" onClick={onCancel}>
        <div className="toast-in w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <ShieldAlert className="size-6 text-warning" />
          <h2 className="mt-3 text-lg font-semibold">Switch to {name}?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Embedded players are run by other sites, not Charcoal. We can’t control their ads, pop-ups or redirects, and some don’t save your progress. Jelly is ad-free.
          </p>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="size-4 accent-white" />
            Don’t show this again
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onCancel} className={btn()}>
              Stay on Jelly
            </button>
            <button onClick={go} autoFocus className={btn({ variant: 'primary' })}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </Modal>
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
          <p className="mt-1 text-sm text-white/60 tabular-nums">Jelly is checking providers · {secs}s</p>
        </div>
        {secs >= 8 && (
          <button onClick={onSkip} className={btn()}>
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
            <button onClick={retry} className={btn()}>
              Try again
            </button>
          )}
          <Link to={back} className={btn({ variant: 'primary' })}>
            {back === '/' ? 'Go home' : 'Back to details'}
          </Link>
        </div>
      </div>
    </div>
  );
}
