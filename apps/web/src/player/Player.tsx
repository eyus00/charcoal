import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type Hls from 'hls.js';
import {
  Airplay,
  AlertTriangle,
  Captions,
  Cast,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FileUp,
  Maximize,
  Minimize,
  Minus,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { languageName, qualityLabel, type JellyResult, type JellySubtitle } from '../lib/servers';
import { actions, getState, useStore } from '../lib/store';
import { segmentAt, SEGMENT_LABEL, useSegments, type Segment } from '../lib/segments';
import type { MediaType } from '../lib/tmdb';
import { cx, formatClock } from '../lib/util';
import { btn } from '../components/Button';
import { useCast } from './cast';
import { allowStream, extensionFetcher, releaseStreams } from '../lib/extension';
import { activeCues, CaptionOverlay, CueText, parseCaptions, SubtitleStyleControls, type Cue } from './captions';

interface Props {
  data: Omit<JellyResult, 'via'> & { via?: JellyResult['via'] };
  /** What is playing (for skip segments). */
  media: { type: MediaType; id: number; season?: number; episode?: number };
  title: string;
  subtitle?: string;
  overview?: string;
  poster?: string;
  resumeAt: number;
  header: ReactNode;
  next?: { label: string; go: () => void } | null;
  onProgress: (watched: number, duration: number, ended?: boolean) => void;
  /** Every source failed: let the page offer embed servers. */
  onExhausted: () => void;
}

const STARTUP_TIMEOUT_MS = 15_000;
const REPORT_EVERY_MS = 10_000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HOLD_MS = 450;
const PAUSE_OVERLAY_MS = 5000;

/** Real upstream host of a (proxied) source URL, so one blocked host can rule out its siblings. */
function upstreamHost(url: string): string {
  try {
    const u = new URL(url);
    const data = u.searchParams.get('data');
    if (data) return new URL(JSON.parse(data).url).hostname;
    return u.hostname;
  } catch {
    return url;
  }
}

/** A subtitle track: from Jelly (url) or a file the viewer loaded (text). */
type Track = { label: string; url?: string; text?: string; format?: string; headers?: Record<string, string> };

type Menu = null | 'captions' | 'settings';
type View = 'main' | 'quality' | 'source' | 'audio' | 'speed' | 'style' | 'transcript';

export default function Player({ data, media, title, subtitle, overview, poster, resumeAt, header, next, onProgress, onExhausted }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const settings = useStore((s) => s.settings);

  // ---------- casting (Chromecast through the Cast SDK; AirPlay through Safari) ----------
  const cast = useCast();
  const casting = cast.state === 'CONNECTED';
  const castingRef = useRef(casting);
  castingRef.current = casting;
  const [airplay, setAirplay] = useState<'none' | 'available' | 'active'>('none');

  // Start with the provider that last played, if it's in this response.
  const [sourceIdx, setSourceIdx] = useState(() => {
    const last = getState().settings.lastProvider;
    const i = last ? data.sources.findIndex((s) => s.provider.id === last && s.type !== 'mkv') : -1;
    return Math.max(0, i);
  });
  const failed = useRef(new Set<number>());
  const seekOnLoad = useRef(resumeAt);
  const [exhausted, setExhausted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(settings.muted);
  const [rate, setRate] = useState(settings.playbackRate);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([]);
  const [audioTrack, setAudioTrack] = useState(-1);
  const [fullscreen, setFullscreen] = useState(false);
  const [fill, setFill] = useState(false);
  const [menu, setMenuState] = useState<Menu>(null);
  const [view, setView] = useState<View>('main');
  const [controls, setControls] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const [pausedIdle, setPausedIdle] = useState(false);

  const setMenu = useCallback((m: Menu) => {
    setMenuState(m);
    setView('main');
  }, []);

  const source = data.sources[sourceIdx];
  /** Streams found through Charcoal Helper load straight from the host (the extension adds headers). */
  const direct = data.via === 'extension';
  useEffect(() => (direct ? () => releaseStreams() : undefined), [direct]);

  // ---------- notices ----------
  const noticeTimer = useRef<number>(undefined);
  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  // ---------- subtitles ----------
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const tracks = useMemo<Track[]>(() => [...localTracks, ...sortSubtitles(data.subtitles)], [localTracks, data.subtitles]);
  const [subIdx, setSubIdx] = useState<number>(() => {
    const want = settings.subtitleLabel;
    return want ? sortSubtitles(data.subtitles).findIndex((s) => s.label === want) : -1;
  });
  const [cues, setCues] = useState<Cue[]>([]);
  const [delay, setDelay] = useState(0); // + shows subtitles later
  const lastSub = useRef(subIdx >= 0 ? subIdx : tracks.findIndex((s) => /english|^en/i.test(s.label)));
  const subLabel = subIdx >= 0 ? tracks[subIdx]?.label : undefined;

  useEffect(() => {
    const t = subIdx >= 0 ? tracks[subIdx] : undefined;
    if (!t) return setCues([]);
    if (t.text !== undefined) return setCues(parseCaptions(t.text));
    let stale = false;
    // Direct (extension) subtitles may need headers and aren't readable cross-site: the extension fetches them.
    const load = direct
      ? extensionFetcher(t.url!, { headers: t.headers }).then((r) => (r.ok ? r.body : Promise.reject(new Error(String(r.status)))))
      : fetch(t.url!).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    load
      .then((text) => !stale && setCues(parseCaptions(text)))
      .catch(() => {
        if (stale) return;
        setCues([]);
        flash('Couldn’t load those subtitles. Pick another track or turn them off.');
      });
    return () => {
      stale = true;
    };
  }, [subIdx, tracks, flash, direct]);

  const chooseSub = useCallback(
    (i: number, label?: string) => {
      setSubIdx(i);
      if (i >= 0) lastSub.current = i;
      actions.updateSettings({ subtitleLabel: i >= 0 ? (label ?? tracks[i]?.label ?? null) : null });
    },
    [tracks],
  );

  // A .srt / .vtt file from the picker or dropped on the player.
  const fileInput = useRef<HTMLInputElement>(null);
  const loadFile = useCallback(
    async (file: File) => {
      if (!/\.(srt|vtt)$/i.test(file.name)) return flash('Use an .srt or .vtt subtitle file');
      const text = await file.text();
      if (!parseCaptions(text).length) return flash('That file has no subtitles in it');
      const label = file.name.replace(/\.(srt|vtt)$/i, '');
      setLocalTracks((l) => [{ label, text }, ...l.filter((x) => x.label !== label)]);
      // The new file goes first in the list.
      setSubIdx(0);
      lastSub.current = 0;
      setDelay(0);
      flash(`Subtitles: ${label}`);
    },
    [flash],
  );
  // Indexes shift when a file is added in front; keep the same track selected.
  const prevLocal = useRef(localTracks.length);
  useEffect(() => {
    const added = localTracks.length - prevLocal.current;
    prevLocal.current = localTracks.length;
    if (added > 0) setSubIdx((i) => (i > 0 ? i + added : i));
  }, [localTracks.length]);

  // iOS fullscreen is the native player, which can't show our overlay: give it a real track.
  const nativeVtt = useMemo(() => (cues.length ? URL.createObjectURL(new Blob([toVtt(cues, delay)], { type: 'text/vtt' })) : null), [cues, delay]);
  useEffect(() => () => void (nativeVtt && URL.revokeObjectURL(nativeVtt)), [nativeVtt]);

  // ---------- skip segments ----------
  const segments = useSegments(media.type, media.id, media.season, media.episode);
  // While casting, the TV's clock drives everything.
  const now = casting ? cast.remote.time : time;
  const dur = casting && cast.remote.duration ? cast.remote.duration : duration;
  const isPlaying = casting ? cast.remote.active && !cast.remote.paused : playing;
  const nowRef = useRef(now);
  nowRef.current = now;
  const durRef = useRef(dur);
  durRef.current = dur;
  const segment = dur ? segmentAt(segments, now, dur) : undefined;
  const skipped = useRef(new Set<number>()); // auto-skipped segment starts
  const creditsOffered = useRef(false);

  // ---------- source loading & fallback ----------
  /** Why each failed source failed, in words (shown in the Source menu). */
  const failReason = useRef(new Map<number, string>());
  const fail = useCallback(
    (why: string, blockedHost = false) => {
      failed.current.add(sourceIdx);
      failReason.current.set(sourceIdx, describeFailure(why));
      // A 4xx from the video host (e.g. Cloudflare blocking the proxy) will hit every source on that host.
      if (blockedHost) {
        const host = upstreamHost(data.sources[sourceIdx].url);
        data.sources.forEach((s, i) => {
          if (upstreamHost(s.url) !== host || i === sourceIdx) return;
          failed.current.add(i);
          failReason.current.set(i, `Same host as a refused source (${host})`);
        });
      }
      const v = video.current;
      if (v && v.currentTime > 5) seekOnLoad.current = v.currentTime;
      const nextIdx = data.sources.findIndex((_, i) => !failed.current.has(i));
      if (nextIdx === -1) {
        setExhausted(true);
        setBuffering(false);
        return;
      }
      console.warn(`[player] source ${sourceIdx + 1} failed (${why}), trying ${nextIdx + 1}`);
      flash(`Source ${sourceIdx + 1} failed — trying another`);
      setSourceIdx(nextIdx);
    },
    [data.sources, sourceIdx, flash],
  );

  useEffect(() => {
    const v = video.current;
    if (!v || !source) return;
    let cancelled = false;
    let netRetry = false;
    let mediaRetry = false;
    setBuffering(true);
    setLevels([]);
    setLevel(-1);
    setAudioTracks([]);
    setAudioTrack(-1);
    const startAt = seekOnLoad.current;

    const startup = window.setTimeout(() => !cancelled && v.readyState < 3 && fail('startup timeout'), STARTUP_TIMEOUT_MS);
    const clearStartup = () => window.clearTimeout(startup);
    // Remember the provider that actually played, so it's tried first next time.
    const onPlaying = () => {
      clearStartup();
      if (getState().settings.lastProvider !== source.provider.id) actions.updateSettings({ lastProvider: source.provider.id });
    };
    v.addEventListener('playing', onPlaying, { once: true });
    v.addEventListener('canplay', clearStartup, { once: true });

    const play = () => v.play().catch(() => setPlaying(false)); // autoplay may be blocked; show the play button

    const nativeHls = v.canPlayType('application/vnd.apple.mpegurl') !== '';
    // Safari plays HLS itself. Letting it (instead of hls.js) is what makes AirPlay work: AirPlay
    // hands the TV the real stream address, which hls.js's in-tab blob: address can't be.
    const airplayCapable = 'WebKitPlaybackTargetAvailabilityEvent' in window;
    if (source.type === 'hls' && !(nativeHls && (airplayCapable || !('MediaSource' in window)))) {
      import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) {
          v.src = source.url;
          return play();
        }
        // Direct streams: before the first request to each host, have the extension allow it.
        const headers = source.headers ?? {};
        const Base = HlsCtor.DefaultConfig.loader as unknown as new (config: unknown) => { load(context: { url: string }, config: unknown, callbacks: unknown): void };
        class HelperLoader extends Base {
          load(context: { url: string }, config: unknown, callbacks: unknown) {
            allowStream(new URL(context.url).hostname, headers)
              .catch((e) => console.warn('[helper]', e.message))
              .finally(() => super.load(context, config, callbacks));
          }
        }
        const h = new HlsCtor({
          capLevelToPlayerSize: true,
          startPosition: startAt > 0 ? startAt : -1,
          maxBufferLength: 30,
          ...(direct ? { loader: HelperLoader as unknown as typeof HlsCtor.DefaultConfig.loader } : {}),
        });
        hls.current = h;
        h.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          setLevels(
            h.levels
              .map((l, index) => ({ height: l.height, index }))
              .filter((l) => l.height > 0)
              .sort((a, b) => b.height - a.height),
          );
          play();
        });
        h.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, () => {
          setAudioTracks(h.audioTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Track ${i + 1}` })));
          // Several audio languages in one stream (e.g. VixSrc): switch to the preferred one.
          const pref = getState().settings.audioLang;
          const want = languageName(pref).toLowerCase();
          const i = h.audioTracks.findIndex((t) => t.lang?.toLowerCase().startsWith(pref) || t.name?.toLowerCase().startsWith(want));
          if (i >= 0 && i !== h.audioTrack) h.audioTrack = i;
          setAudioTrack(i >= 0 ? i : h.audioTrack);
        });
        h.on(HlsCtor.Events.AUDIO_TRACK_SWITCHED, (_e, d) => setAudioTrack(d.id));
        h.on(HlsCtor.Events.ERROR, (_e, d) => {
          const status = (d.response as { code?: number } | undefined)?.code ?? 0;
          // Don't sit through hls.js retries on a refusal: 401/403/404/410 won't fix themselves.
          if ([401, 403, 404, 410].includes(status) && /LoadError$/.test(d.details)) {
            if (!cancelled) {
              cancelled = true;
              fail(`${d.details} ${status}`, status === 401 || status === 403);
            }
            return;
          }
          if (!d.fatal) return;
          if (d.type === HlsCtor.ErrorTypes.NETWORK_ERROR && !netRetry && d.details !== 'manifestLoadError') {
            netRetry = true;
            h.startLoad();
          } else if (d.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !mediaRetry) {
            mediaRetry = true;
            h.recoverMediaError();
          } else {
            fail(d.details);
          }
        });
        h.loadSource(source.url);
        h.attachMedia(v);
      });
    } else {
      const onMeta = () => {
        if (startAt > 0 && startAt < v.duration - 10) v.currentTime = startAt;
      };
      v.addEventListener('loadedmetadata', onMeta, { once: true });
      const start = () => {
        if (cancelled) return;
        v.src = source.url;
        play();
      };
      // Direct files: have the extension allow the host first.
      if (direct) allowStream(new URL(source.url).hostname, source.headers).catch(() => {}).finally(start);
      else start();
    }

    return () => {
      cancelled = true;
      clearStartup();
      v.removeEventListener('playing', onPlaying);
      hls.current?.destroy();
      hls.current = null;
      v.removeAttribute('src');
      v.load(); // stop downloading
    };
  }, [source, fail, direct]);

  // Apply persisted volume/speed (hold-to-speed overrides the speed while held).
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = held ? 2 : rate;
  }, [volume, muted, rate, held, sourceIdx]);

  // ---------- progress reporting ----------
  const lastReport = useRef(0);
  const report = useCallback(
    (force = false, ended = false) => {
      const v = video.current;
      if (!v || !v.duration || !Number.isFinite(v.duration)) return;
      const now = Date.now();
      if (!force && now - lastReport.current < REPORT_EVERY_MS) return;
      if (v.currentTime < 5 && !ended) return;
      lastReport.current = now;
      onProgress(v.currentTime, v.duration, ended);
    },
    [onProgress],
  );
  // On unmount the <video> is already reset, so save the last known position.
  const pos = useRef({ t: 0, d: 0 });
  const progressCb = useRef(onProgress);
  progressCb.current = onProgress;
  useEffect(
    () => () => {
      const { t, d } = pos.current;
      if (d > 0 && t > 5) progressCb.current(t, d);
    },
    [],
  );

  // ---------- controls visibility ----------
  const hideTimer = useRef<number>(undefined);
  const [pokes, setPokes] = useState(0);
  const poke = useCallback(() => {
    setControls(true);
    setPausedIdle(false);
    setPokes((n) => n + 1);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 3000);
  }, []);
  // Paused and left alone: fade the controls and show what's playing (like a TV's pause screen).
  const idleEligible = !casting && !playing && !buffering && !exhausted && countdown === null && menu === null && settings.pauseOverlay;
  useEffect(() => {
    if (!idleEligible) return setPausedIdle(false);
    const t = window.setTimeout(() => setPausedIdle(true), PAUSE_OVERLAY_MS);
    return () => window.clearTimeout(t);
  }, [idleEligible, pokes]);
  const showControls = !pausedIdle && (controls || !isPlaying || casting || menu !== null || exhausted || countdown !== null);

  // ---------- actions ----------
  const toggle = useCallback(() => {
    if (castingRef.current) return cast.playOrPause();
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);
  const seekTo = useCallback((t: number) => {
    if (castingRef.current) return cast.seek(Math.max(0, Math.min(durRef.current - 0.5, t)));
    const v = video.current;
    if (!v || !v.duration) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.5, t));
  }, []);
  const seekBy = useCallback(
    (s: number) => {
      if (!durRef.current) return;
      seekTo(nowRef.current + s);
      flash(`${s > 0 ? '+' : ''}${s}s`);
      poke();
    },
    [flash, poke, seekTo],
  );
  const setVol = useCallback((vol: number) => {
    const val = Math.max(0, Math.min(1, vol));
    if (castingRef.current) return cast.setVolume(val); // the TV's volume
    setVolume(val);
    setMuted(val === 0);
    actions.updateSettings({ volume: val, muted: val === 0 });
  }, []);
  const toggleMute = useCallback(() => {
    if (castingRef.current) return cast.toggleMute();
    setMuted((m) => {
      actions.updateSettings({ muted: !m });
      return !m;
    });
  }, []);
  const changeRate = useCallback((sp: number) => {
    setRate(sp);
    actions.updateSettings({ playbackRate: sp });
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = wrap.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {}))
        .catch(() => v?.webkitEnterFullscreen?.());
    } else v?.webkitEnterFullscreen?.(); // iOS Safari
  }, []);
  const togglePip = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture?.().catch(() => {});
  }, []);
  const toggleCaptions = useCallback(() => {
    if (!tracks.length) return;
    const i = subIdx >= 0 ? -1 : Math.max(0, Math.min(tracks.length - 1, lastSub.current));
    chooseSub(i);
    flash(i >= 0 ? `Subtitles: ${tracks[i].label}` : 'Subtitles off');
  }, [subIdx, tracks, flash, chooseSub]);
  const nudgeDelay = useCallback(
    (by: number) =>
      setDelay((d) => {
        const v = Math.round((d + by) * 10) / 10;
        flash(v === 0 ? 'Subtitle timing reset' : `Subtitles ${Math.abs(v)}s ${v > 0 ? 'later' : 'earlier'}`);
        return v;
      }),
    [flash],
  );
  const skipSegment = useCallback(
    (s: Segment) => {
      if (s.end === null) return;
      seekTo(s.end);
      poke();
    },
    [seekTo, poke],
  );

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---------- segments: auto-skip and the credits hand-off ----------
  useEffect(() => {
    if (!segment) return;
    if (segment.type === 'credits') {
      // Credits rolling with an episode to go to: start the "Up next" countdown now.
      if (next && settings.creditsNext && settings.autoplayNext && !creditsOffered.current && isPlaying) {
        creditsOffered.current = true;
        setCountdown(10);
      }
      return;
    }
    if (settings.autoSkip && segment.end !== null && !skipped.current.has(segment.start) && isPlaying) {
      skipped.current.add(segment.start);
      seekTo(segment.end);
      flash(`Skipped ${segment.type}`);
    }
  }, [segment, next, settings.creditsNext, settings.autoplayNext, settings.autoSkip, isPlaying, seekTo, flash]);

  // ---------- Chromecast: hand the stream over, keep progress, take it back ----------
  const castLoaded = useRef<string | null>(null);
  const lastRemote = useRef(0);
  if (casting && cast.remote.time > 0) lastRemote.current = cast.remote.time;
  useEffect(() => {
    if (!casting) {
      castLoaded.current = null;
      return;
    }
    if (castLoaded.current === source.url) return;
    castLoaded.current = source.url;
    const v = video.current;
    const startAt = v && v.currentTime > 1 ? v.currentTime : seekOnLoad.current;
    v?.pause();
    const t = subIdx >= 0 ? tracks[subIdx] : undefined;
    // The default receiver reads WebVTT only, and only from a real URL (not a file loaded here).
    const vtt = t?.url && (t.format === 'vtt' || /\.vtt(\?|$)/i.test(t.url)) ? t : undefined;
    cast
      .load({
        url: new URL(source.url, location.href).href,
        title,
        subtitle,
        poster,
        startAt,
        subtitles: vtt ? { url: new URL(vtt.url!, location.href).href, label: vtt.label } : undefined,
        subtitleStyle: { color: settings.subColor, bg: settings.subBg, scale: settings.subSize, bold: settings.subBold },
      })
      .then((ok) => {
        if (ok) return flash(`Playing on ${cast.device || 'your TV'}`);
        castLoaded.current = null;
        flash('The Chromecast couldn’t play this source');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casting, source.url]);

  // Casting ended: carry on here from where the TV was.
  const wasCasting = useRef(false);
  useEffect(() => {
    if (wasCasting.current && !casting) {
      const v = video.current;
      if (v && lastRemote.current > 0) v.currentTime = lastRemote.current;
      flash('Stopped casting');
    }
    wasCasting.current = casting;
  }, [casting, flash]);

  // Progress and the next-episode countdown while the TV is playing.
  useEffect(() => {
    if (!casting || !cast.remote.duration) return;
    const id = window.setInterval(() => onProgress(nowRef.current, durRef.current), REPORT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [casting, cast.remote.duration, onProgress]);
  const remoteEnded = casting && cast.remote.ended;
  useEffect(() => {
    if (!remoteEnded) return;
    onProgress(durRef.current, durRef.current, true);
    if (next && settings.autoplayNext) setCountdown(8);
  }, [remoteEnded, next, settings.autoplayNext, onProgress]);

  // ---------- AirPlay (Safari) ----------
  useEffect(() => {
    const v = video.current as (HTMLVideoElement & { webkitCurrentPlaybackTargetIsWireless?: boolean }) | null;
    if (!v || !('WebKitPlaybackTargetAvailabilityEvent' in window)) return;
    const onAvail = (e: Event) =>
      setAirplay((a) => ((e as Event & { availability?: string }).availability === 'available' ? (a === 'active' ? a : 'available') : a === 'active' ? a : 'none'));
    const onWireless = () => setAirplay(v.webkitCurrentPlaybackTargetIsWireless ? 'active' : 'available');
    v.addEventListener('webkitplaybacktargetavailabilitychanged', onAvail);
    v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless);
    return () => {
      v.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvail);
      v.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless);
    };
  }, []);
  const showAirplayPicker = () => (video.current as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })?.webkitShowPlaybackTargetPicker?.();

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Leave keys alone while typing, with modifiers, or while a dialog (e.g. the episode list) is open.
      if (/input|textarea|select/i.test(el.tagName) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      // YouTube-style keys, the de facto standard for web video.
      const jumpTo = (frac: number) => durRef.current && (seekTo(durRef.current * frac), flash(`${Math.round(frac * 100)}%`));
      const speed = (dir: 1 | -1) => {
        const i = SPEEDS.indexOf(rate);
        const sp = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.indexOf(1) : i) + dir))];
        changeRate(sp);
        flash(`Speed ${sp}×`);
      };
      const map: Record<string, () => void> = {
        ' ': toggle,
        k: toggle,
        ArrowLeft: () => seekBy(-5),
        ArrowRight: () => seekBy(5),
        j: () => seekBy(-10),
        l: () => seekBy(10),
        Home: () => jumpTo(0),
        End: () => jumpTo(0.999),
        ArrowUp: () => (setVol(volume + 0.1), flash(`Volume ${Math.round(Math.min(1, volume + 0.1) * 100)}%`)),
        ArrowDown: () => (setVol(volume - 0.1), flash(`Volume ${Math.round(Math.max(0, volume - 0.1) * 100)}%`)),
        m: toggleMute,
        f: toggleFullscreen,
        c: toggleCaptions,
        i: togglePip,
        '<': () => speed(-1),
        '>': () => speed(1),
        // Subtitle timing, as in mpv: Z earlier, X later.
        z: () => cues.length && nudgeDelay(-0.5),
        x: () => cues.length && nudgeDelay(0.5),
        N: () => next?.go(),
        ...Object.fromEntries([...'0123456789'].map((d) => [d, () => jumpTo(Number(d) / 10)])),
      };
      // Esc closes an open player menu first; otherwise the page handles it (back to details).
      if (e.key === 'Escape') {
        if (menu) {
          e.stopImmediatePropagation();
          setMenu(null);
        }
        return;
      }
      const fn = map[e.key] ?? (e.key.length === 1 && !e.shiftKey ? map[e.key.toLowerCase()] : undefined);
      if (!fn || (e.key === ' ' && el.tagName === 'BUTTON')) return;
      e.preventDefault();
      fn();
      poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekBy, setVol, volume, toggleMute, toggleFullscreen, toggleCaptions, togglePip, next, poke, flash, menu, rate, changeRate, cues.length, nudgeDelay, setMenu]);

  // ---------- media session (lock screen / hardware keys) ----------
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: subtitle ?? '', artwork: poster ? [{ src: poster, sizes: '342x513' }] : [] });
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => video.current?.play());
    ms.setActionHandler('pause', () => video.current?.pause());
    ms.setActionHandler('seekbackward', () => seekBy(-10));
    ms.setActionHandler('seekforward', () => seekBy(10));
    ms.setActionHandler('nexttrack', next ? () => next.go() : null);
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'nexttrack'] as MediaSessionAction[]) ms.setActionHandler(a, null);
    };
  }, [title, subtitle, poster, next, seekBy]);

  // ---------- autoplay next ----------
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      next?.go();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, next]);

  // ---------- pointer handling (tap vs click, double-tap seek, hold for 2×) ----------
  const lastTap = useRef(0);
  const holdTimer = useRef<number>(undefined);
  const holding = useRef(false);
  const endHold = () => {
    window.clearTimeout(holdTimer.current);
    if (!holding.current) return false;
    holding.current = false;
    setHeld(false);
    return true;
  };
  const onSurfaceDown = (e: React.PointerEvent) => {
    if (menu || !settings.holdToSpeed || e.button !== 0) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      if (video.current?.paused) return;
      holding.current = true;
      setHeld(true);
    }, HOLD_MS);
  };
  const onSurfaceUp = (e: React.PointerEvent) => {
    if (endHold()) return; // releasing a hold isn't a click
    if (menu) return setMenu(null);
    if (e.pointerType === 'mouse') return toggle();
    const now = Date.now();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (now - lastTap.current < 300 && (x < 0.35 || x > 0.65)) {
      seekBy(x < 0.35 ? -10 : 10);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    if (showControls && playing) {
      window.clearTimeout(hideTimer.current);
      setControls(false);
    } else poke();
  };

  // ---------- drag & drop subtitles ----------
  const [dragging, setDragging] = useState(false);
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) loadFile(f);
    },
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const skippable = segment && segment.end !== null && !(segment.type === 'credits' && next);
  const creditsNextBtn = segment?.type === 'credits' && next && countdown === null;
  const qualityNow = level === -1 ? 'Auto' : `${levels.find((l) => l.index === level)?.height ?? ''}p`;

  return (
    <div
      ref={wrap}
      className={cx('relative size-full overflow-hidden bg-black select-none', !showControls && 'cursor-none')}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
      // Tabbing to a control brings the (auto-hidden) controls back.
      onFocusCapture={poke}
      {...dropProps}
    >
      <video
        ref={video}
        className={cx('size-full', fill ? 'object-cover' : 'object-contain')}
        playsInline
        // Lets Safari offer this video to AirPlay.
        {...{ 'x-webkit-airplay': 'allow' }}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          endHold();
          report(true);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onSeeked={() => report(true)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (v.duration > 0) pos.current = { t: v.currentTime, d: v.duration };
          report();
        }}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onEnded={() => {
          report(true, true);
          if (next && settings.autoplayNext && countdown === null) setCountdown(8);
        }}
        onError={(e) => !hls.current && e.currentTarget.getAttribute('src') && e.currentTarget.error && fail('media error')}
        onDoubleClick={toggleFullscreen}
      >
        {nativeVtt && <track key={nativeVtt} kind="subtitles" src={nativeVtt} label={subLabel} />}
      </video>
      {/* Native (iOS) fullscreen can't show our caption overlay, so the track takes over there. */}
      <NativeFullscreenTracks video={video} />

      {!casting && airplay !== 'active' && <CaptionOverlay cues={cues} time={time - delay} raised={showControls} style={settings} />}

      {/* tap/click surface */}
      <div
        className="absolute inset-0"
        onPointerDown={onSurfaceDown}
        onPointerUp={onSurfaceUp}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        onContextMenu={(e) => held && e.preventDefault()}
        onDoubleClick={toggleFullscreen}
      />

      {/* Playing on a TV: this tab is the remote. */}
      {(casting || airplay === 'active') && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/85 p-6 text-center">
          <div>
            {casting ? <Cast className="mx-auto size-10 text-white/80" /> : <Airplay className="mx-auto size-10 text-white/80" />}
            <p className="mt-3 text-sm text-muted">Playing on</p>
            <p className="text-xl font-semibold">{casting ? cast.device || 'Chromecast' : 'AirPlay'}</p>
            <p className="mt-1 text-sm text-white/70">{subtitle ? `${title} · ${subtitle}` : title}</p>
            {casting && (
              <button onClick={cast.stop} className={cx(btn(), 'pointer-events-auto mt-5')}>
                Stop casting
              </button>
            )}
          </div>
        </div>
      )}

      {/* centre states */}
      {buffering && !exhausted && !casting && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      )}
      {!playing && !buffering && !exhausted && countdown === null && !pausedIdle && !casting && (
        <button onClick={toggle} aria-label="Play" className="absolute inset-0 m-auto grid size-20 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/70">
          <Play className="ml-1 size-9 fill-white text-white" />
        </button>
      )}
      {held && (
        <div className="pointer-events-none absolute top-20 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/75 px-4 py-2 text-sm font-medium backdrop-blur-sm">
          2× <ChevronsRight className="size-4" />
        </div>
      )}
      {notice && !held && (
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-sm backdrop-blur-sm">{notice}</div>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-4 z-40 grid place-items-center rounded-3xl border-2 border-dashed border-white/40 bg-black/70 text-center">
          <div>
            <FileUp className="mx-auto size-8" />
            <p className="mt-2 font-medium">Drop a subtitle file</p>
            <p className="text-sm text-muted">.srt or .vtt</p>
          </div>
        </div>
      )}

      {/* Paused for a while: what's playing, like a TV's pause screen. */}
      <div
        aria-hidden={!pausedIdle}
        className={cx(
          'pointer-events-none absolute inset-0 flex items-center bg-gradient-to-r from-black/85 via-black/45 to-transparent px-6 transition-opacity duration-500 md:px-16',
          pausedIdle ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="max-w-xl">
          <p className="text-sm text-muted">You’re watching</p>
          <h2 className="mt-1 text-3xl font-semibold text-balance md:text-5xl">{title}</h2>
          {subtitle && <p className="mt-2 text-lg text-white/85">{subtitle}</p>}
          {overview && <p className="mt-4 line-clamp-4 text-body-sm leading-relaxed text-white/75 md:text-base">{overview}</p>}
          <p className="mt-6 text-sm text-muted">Paused · {formatClock(time)} of {formatClock(duration)}</p>
        </div>
      </div>

      {exhausted && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
          <div className="max-w-sm space-y-4">
            <AlertTriangle className="mx-auto size-10 text-warning" />
            <p className="font-medium">None of Jelly’s sources would play.</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => {
                  failed.current.clear();
                  setExhausted(false);
                  setSourceIdx(0);
                }}
                className={btn()}
              >
                Retry
              </button>
              <button onClick={onExhausted} className={btn({ variant: 'primary' })}>
                Use another server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip intro / recap / credits, and "Next episode" when the credits start. Shown even
          while the controls are hidden, like on streaming services. */}
      {(skippable || creditsNextBtn) && !exhausted && (
        <div className={cx('absolute right-4 z-20 transition-[bottom] duration-200 md:right-8', showControls ? 'bottom-28' : 'bottom-8')}>
          {creditsNextBtn ? (
            <button onClick={() => next!.go()} className={btn({ variant: 'primary', size: 'lg' })}>
              <SkipForward className="size-4 fill-current" /> Next episode
            </button>
          ) : (
            <button onClick={() => skipSegment(segment!)} className={cx(btn({ size: 'lg' }), 'bg-black/60! backdrop-blur-md hover:bg-black/80!')}>
              {SEGMENT_LABEL[segment!.type]} <ChevronsRight className="size-4" />
            </button>
          )}
        </div>
      )}

      {countdown !== null && next && (
        <div className="absolute right-4 bottom-28 z-20 w-72 rounded-2xl border border-transparent bg-raised/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-md md:right-8">
          <div className="text-xs text-muted tabular-nums">Up next in {countdown}s</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium">{next.label}</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => next.go()} className={cx(btn({ variant: 'primary' }), 'flex-1')}>
              Play now
            </button>
            <button onClick={() => setCountdown(null)} className={btn()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* top bar */}
      <div
        className={cx(
          'absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent pb-10 transition-opacity duration-200 focus-within:pointer-events-auto focus-within:opacity-100',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {header}
      </div>

      {/* bottom controls */}
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-12 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-200 focus-within:pointer-events-auto focus-within:opacity-100 md:px-6',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <SeekBar time={now} duration={dur} buffered={casting ? 0 : buffered} segments={segments} onSeek={seekTo} />
        <div className="mt-1 flex items-center gap-1 md:gap-2">
          <IconButton label={isPlaying ? 'Pause (K)' : 'Play (K)'} onClick={toggle}>
            {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
          </IconButton>
          <IconButton label="Back 10 seconds (J)" onClick={() => seekBy(-10)}>
            <RotateCcw className="size-5" />
          </IconButton>
          <IconButton label="Forward 10 seconds (L)" onClick={() => seekBy(10)}>
            <RotateCw className="size-5" />
          </IconButton>
          <div className="group/vol hidden items-center sm:flex">
            <IconButton label={muted || volume === 0 ? 'Unmute (M)' : 'Mute (M)'} onClick={toggleMute}>
              <VolumeIcon className="size-5" />
            </IconButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
              className="w-0 accent-white opacity-0 transition-[width,opacity] group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
            />
          </div>
          <span className="ml-1 text-xs text-white/85 tabular-nums md:text-sm">
            {formatClock(now)} <span className="text-white/60">/ {formatClock(dur)}</span>
          </span>
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            {next && (
              <IconButton label={`Next: ${next.label} (Shift N)`} onClick={next.go}>
                <SkipForward className="size-5" />
              </IconButton>
            )}

            {/* Subtitles: tracks, own file, timing, look, transcript */}
            <div className="relative">
              <IconButton label="Subtitles (C)" active={subIdx >= 0 || menu === 'captions'} expanded={menu === 'captions'} onClick={() => setMenu(menu === 'captions' ? null : 'captions')}>
                <Captions className="size-5" />
              </IconButton>
              {menu === 'captions' && (
                <Popover wide={view === 'transcript'}>
                  {view === 'main' && (
                    <>
                      <MenuItem selected={subIdx < 0} onClick={() => (chooseSub(-1), setMenu(null))}>
                        Off
                      </MenuItem>
                      {tracks.map((s, i) => (
                        <MenuItem key={(s.url ?? 'file') + s.label + i} selected={subIdx === i} onClick={() => (chooseSub(i), setMenu(null))}>
                          <span className="flex-1 truncate">{s.label}</span>
                          {s.text !== undefined && <span className="text-micro tracking-wider text-faint uppercase">file</span>}
                        </MenuItem>
                      ))}
                      <Divider />
                      <MenuItem onClick={() => fileInput.current?.click()}>
                        <FileUp className="size-4 shrink-0 text-muted" />
                        <span className="flex-1">Load a file…</span>
                      </MenuItem>
                      {subIdx >= 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
                          <span className="flex-1">
                            Timing
                            <span className="block text-xs text-muted tabular-nums">
                              {delay === 0 ? 'In sync' : `${Math.abs(delay)}s ${delay > 0 ? 'later' : 'earlier'}`} · Z / X
                            </span>
                          </span>
                          <StepButton label="Earlier (Z)" onClick={() => nudgeDelay(-0.5)}>
                            <Minus className="size-4" />
                          </StepButton>
                          <StepButton label="Later (X)" onClick={() => nudgeDelay(0.5)}>
                            <Plus className="size-4" />
                          </StepButton>
                        </div>
                      )}
                      <NavItem label="Style" value={`${Math.round(settings.subSize * 100)}%`} onClick={() => setView('style')} />
                      {cues.length > 0 && <NavItem label="Transcript" onClick={() => setView('transcript')} />}
                    </>
                  )}
                  {view === 'style' && (
                    <>
                      <BackHeader onBack={() => setView('main')}>Subtitle style</BackHeader>
                      <SubtitleStyleControls />
                    </>
                  )}
                  {view === 'transcript' && (
                    <>
                      <BackHeader onBack={() => setView('main')}>Transcript</BackHeader>
                      <Transcript cues={cues} time={time - delay} onSeek={(t) => seekTo(t + delay)} />
                    </>
                  )}
                </Popover>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".srt,.vtt,text/vtt,application/x-subrip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  setMenu(null);
                  if (f) loadFile(f);
                }}
              />
            </div>

            {/* Settings: quality, audio, source, speed, toggles */}
            <div className="relative">
              <IconButton label="Settings (quality, source, speed)" active={menu === 'settings'} expanded={menu === 'settings'} onClick={() => setMenu(menu === 'settings' ? null : 'settings')}>
                <Settings className="size-5" />
              </IconButton>
              {menu === 'settings' && (
                <Popover>
                  {view === 'main' && (
                    <>
                      {levels.length > 1 && <NavItem label="Quality" value={qualityNow} onClick={() => setView('quality')} />}
                      {audioTracks.length > 1 && <NavItem label="Audio" value={audioTracks.find((t) => t.id === audioTrack)?.name} onClick={() => setView('audio')} />}
                      <NavItem label="Source" value={`${qualityLabel(source.quality)} · ${source.provider.name}${source.audioTracks?.[0]?.label ? ` · ${source.audioTracks[0].label}` : ''}`} onClick={() => setView('source')} />
                      <NavItem label="Speed" value={rate === 1 ? 'Normal' : `${rate}×`} onClick={() => setView('speed')} />
                      <Divider />
                      <SwitchItem label="Fill screen" hint="Crop to remove black bars" on={fill} onChange={setFill} />
                      <SwitchItem label="Skip intros automatically" on={settings.autoSkip} onChange={(v) => actions.updateSettings({ autoSkip: v })} />
                      <SwitchItem label="Autoplay next episode" on={settings.autoplayNext} onChange={(v) => actions.updateSettings({ autoplayNext: v })} />
                    </>
                  )}
                  {view === 'quality' && (
                    <>
                      <BackHeader onBack={() => setView('main')}>Quality</BackHeader>
                      <MenuItem
                        selected={level === -1}
                        onClick={() => {
                          if (hls.current) hls.current.currentLevel = -1;
                          setLevel(-1);
                          setMenu(null);
                        }}
                      >
                        Auto
                      </MenuItem>
                      {levels.map((l) => (
                        <MenuItem
                          key={l.index}
                          selected={level === l.index}
                          onClick={() => {
                            if (hls.current) hls.current.currentLevel = l.index;
                            setLevel(l.index);
                            setMenu(null);
                          }}
                        >
                          <span className="flex-1">{l.height}p</span>
                          {l.height >= 2160 ? <Badge>4K</Badge> : l.height >= 720 ? <Badge>HD</Badge> : null}
                        </MenuItem>
                      ))}
                    </>
                  )}
                  {view === 'audio' && (
                    <>
                      <BackHeader onBack={() => setView('main')}>Audio</BackHeader>
                      {audioTracks.map((t) => (
                        <MenuItem
                          key={t.id}
                          selected={audioTrack === t.id}
                          onClick={() => {
                            if (hls.current) hls.current.audioTrack = t.id;
                            setMenu(null);
                          }}
                        >
                          {t.name}
                        </MenuItem>
                      ))}
                    </>
                  )}
                  {view === 'source' && (
                    <>
                      <BackHeader onBack={() => setView('main')}>Source</BackHeader>
                      <p className="px-3 pb-1.5 text-xs text-muted">
                        Found by {data.via === 'extension' ? 'this browser (Charcoal Helper)' : data.via === 'own' ? 'your server' : 'Charcoal’s server'}
                      </p>
                      {data.sources.map((s, i) => (
                        <MenuItem
                          key={s.url}
                          selected={sourceIdx === i}
                          onClick={() => {
                            if (i === sourceIdx) return setMenu(null);
                            const v = video.current;
                            if (v && v.currentTime > 5) seekOnLoad.current = v.currentTime;
                            failed.current.delete(i);
                            setSourceIdx(i);
                            setMenu(null);
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            {qualityLabel(s.quality)} · {s.provider.name}
                            {s.audioTracks?.[0]?.label && <span className="text-muted"> · {s.audioTracks[0].label}</span>}
                            {failed.current.has(i) && failReason.current.get(i) && (
                              <span className="block truncate text-xs text-faint" title={failReason.current.get(i)}>
                                {failReason.current.get(i)}
                              </span>
                            )}
                          </span>
                          <span className={cx('text-micro tracking-wider uppercase', failed.current.has(i) ? 'text-danger' : 'text-faint')}>
                            {failed.current.has(i) ? 'failed' : s.type}
                          </span>
                        </MenuItem>
                      ))}
                      {/* Every other provider, and why it had nothing: useful when a title won't play. */}
                      {data.report?.some((r) => !r.ok) && (
                        <>
                          <Divider />
                          <p className="px-3 pt-1 pb-1 text-xs text-muted">No stream from</p>
                          {data.report
                            .filter((r) => !r.ok)
                            .map((r) => (
                              <div key={r.name} className="flex items-baseline gap-2 px-3 py-1 text-xs" title={r.reason}>
                                <span className="shrink-0 text-white/80">{r.name}</span>
                                <span className="min-w-0 truncate text-faint">{r.reason}</span>
                              </div>
                            ))}
                        </>
                      )}
                    </>
                  )}
                  {view === 'speed' && (
                    <>
                      <BackHeader onBack={() => setView('main')}>Speed</BackHeader>
                      {SPEEDS.map((sp) => (
                        <MenuItem
                          key={sp}
                          selected={rate === sp}
                          onClick={() => {
                            changeRate(sp);
                            setMenu(null);
                          }}
                        >
                          {sp === 1 ? 'Normal' : `${sp}×`}
                        </MenuItem>
                      ))}
                      <p className="px-3 pt-1 pb-2 text-xs text-muted">
                        {settings.holdToSpeed ? 'Tip: press and hold the video for 2×. ' : ''}&lt; and &gt; change speed.
                      </p>
                    </>
                  )}
                </Popover>
              )}
            </div>
            {/* A TV can't add the headers direct (extension) streams need. */}
            {!direct && (cast.state === 'NOT_CONNECTED' || cast.state === 'CONNECTING' || casting) && (
              <IconButton label={casting ? `Stop casting to ${cast.device}` : 'Cast to a TV'} active={casting} onClick={casting ? cast.stop : cast.start}>
                <Cast className={cx('size-5', cast.state === 'CONNECTING' && 'animate-pulse')} />
              </IconButton>
            )}
            {airplay !== 'none' && (
              <IconButton label="AirPlay" active={airplay === 'active'} onClick={showAirplayPicker}>
                <Airplay className="size-5" />
              </IconButton>
            )}
            {'pictureInPictureEnabled' in document && document.pictureInPictureEnabled && !casting && (
              <IconButton label="Picture in picture (I)" onClick={togglePip} className="hidden sm:grid">
                <PictureInPicture2 className="size-5" />
              </IconButton>
            )}
            <IconButton label={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- pieces ----------

/** Shows the native caption track only while iOS's own fullscreen player or AirPlay is up. */
function NativeFullscreenTracks({ video }: { video: React.RefObject<HTMLVideoElement | null> }) {
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const set = (mode: TextTrackMode) => () => {
      for (const t of Array.from(v.textTracks)) t.mode = mode;
    };
    const on = set('showing');
    const off = set('hidden');
    off();
    // On AirPlay the TV draws the native track too (our overlay stays on the phone).
    const wireless = () => ((v as HTMLVideoElement & { webkitCurrentPlaybackTargetIsWireless?: boolean }).webkitCurrentPlaybackTargetIsWireless ? on() : off());
    v.addEventListener('webkitbeginfullscreen', on);
    v.addEventListener('webkitendfullscreen', off);
    v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', wireless);
    v.textTracks.addEventListener?.('addtrack', off);
    return () => {
      v.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', wireless);
      v.removeEventListener('webkitbeginfullscreen', on);
      v.removeEventListener('webkitendfullscreen', off);
      v.textTracks.removeEventListener?.('addtrack', off);
    };
  }, [video]);
  return null;
}

/** Every cue as a list; the current one is highlighted and kept in view. Click to jump. */
function Transcript({ cues, time, onSeek }: { cues: Cue[]; time: number; onSeek: (t: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const now = activeCues(cues, time)[0];
  const at = now ? cues.indexOf(now) : -1;
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (!follow || at < 0) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [at, follow]);
  return (
    <div ref={list} className="max-h-[46vh] overflow-y-auto overscroll-contain pb-1" onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)}>
      {cues.map((c, i) => (
        <button
          key={i}
          data-i={i}
          onClick={() => {
            onSeek(c.start);
            setFollow(true);
          }}
          className={cx('flex w-full gap-3 rounded-xl px-3 py-2 text-left text-sm transition', i === at ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white')}
        >
          <span className="w-12 shrink-0 pt-px text-xs text-faint tabular-nums">{formatClock(c.start)}</span>
          <span className="min-w-0">
            <CueText text={c.text} />
          </span>
        </button>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
  className,
  expanded,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  className?: string;
  /** For menu buttons: whether the menu is open (also tells the page's Esc to leave it alone). */
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      onClick={onClick}
      className={cx(btn({ variant: 'ghost', icon: true }), 'text-white', active && 'bg-white/15', className)}
    >
      {children}
    </button>
  );
}

const StepButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20">
    {children}
  </button>
);

const Popover = ({ children, wide }: { children: ReactNode; wide?: boolean }) => (
  <div
    className={cx(
      'toast-in absolute right-0 bottom-12 z-30 max-h-[64vh] overflow-y-auto overscroll-contain rounded-[18px] border border-transparent bg-raised/95 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-md',
      wide ? 'w-[min(24rem,calc(100vw-1.5rem))]' : 'w-72',
    )}
  >
    {children}
  </div>
);
const Divider = () => <div className="mx-3 my-1.5 h-px bg-white/[0.08]" />;
const Badge = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-white/10 px-1.5 py-px text-micro font-semibold tracking-wider text-white/80">{children}</span>
);

function BackHeader({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <button onClick={onBack} className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium hover:bg-white/10">
      <ChevronLeft className="size-4" />
      {children}
    </button>
  );
}

function NavItem({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/10">
      <span className="flex-1">{label}</span>
      {value && <span className="max-w-[55%] truncate text-muted">{value}</span>}
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </button>
  );
}

function SwitchItem({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/10">
      <span className="flex-1">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', on ? 'translate-x-4 bg-black' : 'bg-white')} />
      </span>
    </button>
  );
}

function MenuItem({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={selected} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10">
      {selected !== undefined && <Check className={cx('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />}
      {children}
    </button>
  );
}

const SEGMENT_NAME: Record<Segment['type'], string> = { intro: 'Intro', recap: 'Recap', credits: 'Credits', preview: 'Preview' };

function SeekBar({
  time,
  duration,
  buffered,
  segments,
  onSeek,
}: {
  time: number;
  duration: number;
  buffered: number;
  segments: Segment[];
  onSeek: (t: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const frac = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const shown = scrub ?? (duration ? time / duration : 0);
  const tip = scrub ?? hover;
  const tipSegment = tip !== null && duration ? segmentAt(segments, tip * duration, duration) : undefined;
  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={formatClock(time)}
      tabIndex={0}
      onKeyDown={(e) => {
        // Own the arrows here so the player's ±10s shortcut doesn't also fire.
        const to = e.key === 'ArrowLeft' ? time - 5 : e.key === 'ArrowRight' ? time + 5 : e.key === 'Home' ? 0 : e.key === 'End' ? duration : null;
        if (to === null || !duration) return;
        e.preventDefault();
        e.stopPropagation();
        onSeek(Math.max(0, Math.min(duration, to)));
      }}
      className="group/seek relative flex h-5 cursor-pointer touch-none items-center"
      onPointerDown={(e) => {
        if (!duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setScrub(frac(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!duration) return;
        const f = frac(e.clientX);
        if (scrub !== null) setScrub(f);
        else if (e.pointerType === 'mouse') setHover(f);
      }}
      onPointerUp={(e) => {
        if (scrub !== null) onSeek(frac(e.clientX) * duration);
        setScrub(null);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/seek:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${duration ? Math.min(100, (buffered / duration) * 100) : 0}%` }} />
        {/* Intro / recap / credits ranges */}
        {duration > 0 &&
          segments.map((s) => (
            <div
              key={s.type + s.start}
              className="absolute inset-y-0 bg-planned/70"
              style={{ left: `${(s.start / duration) * 100}%`, width: `${(((s.end ?? duration) - s.start) / duration) * 100}%` }}
            />
          ))}
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${shown * 100}%` }} />
      </div>
      <div
        className="absolute size-3.5 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
        style={{ left: `${shown * 100}%`, opacity: scrub !== null ? 1 : undefined }}
      />
      {tip !== null && duration > 0 && (
        <div className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-full bg-black/85 px-2.5 py-0.5 text-xs whitespace-nowrap tabular-nums" style={{ left: `${tip * 100}%` }}>
          {formatClock(tip * duration)}
          {tipSegment && <span className="text-planned"> · {SEGMENT_NAME[tipSegment.type]}</span>}
        </div>
      )}
    </div>
  );
}

/** hls.js / player failure codes in plain words. */
function describeFailure(why: string): string {
  const status = why.match(/\b(\d{3})\b/)?.[1];
  if (status === '403' || status === '401') return `The video host refused it (${status})`;
  if (status === '404' || status === '410') return `The video is gone (${status})`;
  if (/manifest/i.test(why)) return 'Couldn’t load the playlist';
  if (/frag/i.test(why)) return 'Couldn’t load the video pieces';
  if (/startup timeout/.test(why)) return 'Took too long to start';
  if (/media error|bufferAppend|codec/i.test(why)) return 'This browser can’t play its format';
  return why;
}

// ---------- subtitle helpers ----------

function sortSubtitles(list: JellySubtitle[]): Track[] {
  const seen = new Set<string>();
  return list
    .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
    .sort((a, b) => Number(/english/i.test(b.label)) - Number(/english/i.test(a.label)) || a.label.localeCompare(b.label))
    .map((s) => ({ label: s.label, url: s.url, format: s.format, headers: s.headers }));
}

/** Cues back to WebVTT (for the native fullscreen player), shifted by the timing offset. */
function toVtt(cues: Cue[], delay: number) {
  const ts = (t: number) => {
    const v = Math.max(0, t);
    const h = Math.floor(v / 3600);
    const m = Math.floor((v % 3600) / 60);
    const s = (v % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`;
  };
  return 'WEBVTT\n\n' + cues.map((c) => `${ts(c.start + delay)} --> ${ts(c.end + delay)}\n${c.text}`).join('\n\n');
}
