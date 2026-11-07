import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type Hls from 'hls.js';
import {
  AlertTriangle,
  Captions,
  Check,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { qualityLabel, type JellyResponse, type JellySubtitle } from '../lib/servers';
import { actions, getState } from '../lib/store';
import { cx, formatClock } from '../lib/util';

interface Props {
  data: JellyResponse;
  title: string;
  subtitle?: string;
  poster?: string;
  resumeAt: number;
  header: ReactNode;
  next?: { label: string; go: () => void } | null;
  onProgress: (watched: number, duration: number, ended?: boolean) => void;
  /** Every source failed: let the page offer embed servers. */
  onExhausted: () => void;
}

const STARTUP_TIMEOUT_MS = 15_000;

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
const REPORT_EVERY_MS = 10_000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type Menu = null | 'captions' | 'settings';

export default function Player({ data, title, subtitle, poster, resumeAt, header, next, onProgress, onExhausted }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const settings = getState().settings;

  const [sourceIdx, setSourceIdx] = useState(0);
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
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const [controls, setControls] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  const source = data.sources[sourceIdx];

  // ---------- notices ----------
  const noticeTimer = useRef<number>(undefined);
  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);

  // ---------- subtitles ----------
  const subtitles = useMemo(() => sortSubtitles(data.subtitles), [data.subtitles]);
  const [subIdx, setSubIdx] = useState<number>(() => {
    const want = settings.subtitleLabel;
    return want ? subtitles.findIndex((s) => s.label === want) : -1;
  });
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const lastSub = useRef(subIdx >= 0 ? subIdx : subtitles.findIndex((s) => /english|^en/i.test(s.label)));

  useEffect(() => {
    if (subIdx < 0 || !subtitles[subIdx]) return setSubUrl(null);
    let revoked = false;
    let url: string | null = null;
    fetch(subtitles[subIdx].url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (revoked) return;
        url = URL.createObjectURL(new Blob([toVtt(text)], { type: 'text/vtt' }));
        setSubUrl(url);
      })
      .catch(() => !revoked && flash('Couldn’t load those subtitles'));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [subIdx, subtitles, flash]);

  const chooseSub = (i: number) => {
    setSubIdx(i);
    if (i >= 0) lastSub.current = i;
    actions.updateSettings({ subtitleLabel: i >= 0 ? subtitles[i].label : null });
    setMenu(null);
  };

  // ---------- source loading & fallback ----------
  const fail = useCallback(
    (why: string, blockedHost = false) => {
      failed.current.add(sourceIdx);
      // A 4xx from the video host (e.g. Cloudflare blocking the proxy) will hit every source on that host.
      if (blockedHost) {
        const host = upstreamHost(data.sources[sourceIdx].url);
        data.sources.forEach((s, i) => upstreamHost(s.url) === host && failed.current.add(i));
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
    const startAt = seekOnLoad.current;

    const startup = window.setTimeout(() => !cancelled && v.readyState < 3 && fail('startup timeout'), STARTUP_TIMEOUT_MS);
    const clearStartup = () => window.clearTimeout(startup);
    v.addEventListener('playing', clearStartup, { once: true });
    v.addEventListener('canplay', clearStartup, { once: true });

    const play = () => v.play().catch(() => setPlaying(false)); // autoplay may be blocked; show the play button

    const nativeHls = v.canPlayType('application/vnd.apple.mpegurl') !== '';
    if (source.type === 'hls' && !(nativeHls && !('MediaSource' in window))) {
      import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) {
          v.src = source.url;
          return play();
        }
        const h = new HlsCtor({ capLevelToPlayerSize: true, startPosition: startAt > 0 ? startAt : -1, maxBufferLength: 30 });
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
      v.src = source.url;
      const onMeta = () => {
        if (startAt > 0 && startAt < v.duration - 10) v.currentTime = startAt;
      };
      v.addEventListener('loadedmetadata', onMeta, { once: true });
      play();
    }

    return () => {
      cancelled = true;
      clearStartup();
      hls.current?.destroy();
      hls.current = null;
      v.removeAttribute('src');
      v.load(); // stop downloading
    };
  }, [source, fail]);

  // Apply persisted volume/speed.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate, sourceIdx]);

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
  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 3000);
  }, []);
  const showControls = controls || !playing || menu !== null || exhausted || countdown !== null;

  // ---------- actions ----------
  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);
  const seekBy = useCallback(
    (s: number) => {
      const v = video.current;
      if (!v || !v.duration) return;
      v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + s));
      flash(`${s > 0 ? '+' : ''}${s}s`);
      poke();
    },
    [flash, poke],
  );
  const setVol = useCallback(
    (vol: number) => {
      const val = Math.max(0, Math.min(1, vol));
      setVolume(val);
      setMuted(val === 0);
      actions.updateSettings({ volume: val, muted: val === 0 });
    },
    [],
  );
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      actions.updateSettings({ muted: !m });
      return !m;
    });
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
    if (!subtitles.length) return;
    const i = subIdx >= 0 ? -1 : Math.max(0, lastSub.current);
    setSubIdx(i);
    actions.updateSettings({ subtitleLabel: i >= 0 ? subtitles[i].label : null });
    flash(i >= 0 ? `Subtitles: ${subtitles[i].label}` : 'Subtitles off');
  }, [subIdx, subtitles, flash]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Leave keys alone while typing, with modifiers, or while a dialog (e.g. the episode list) is open.
      if (/input|textarea|select/i.test(el.tagName) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[aria-modal="true"]')) return;
      const map: Record<string, () => void> = {
        ' ': toggle,
        k: toggle,
        ArrowLeft: () => seekBy(-10),
        j: () => seekBy(-10),
        ArrowRight: () => seekBy(10),
        l: () => seekBy(10),
        ArrowUp: () => (setVol(volume + 0.1), flash(`Volume ${Math.round(Math.min(1, volume + 0.1) * 100)}%`)),
        ArrowDown: () => (setVol(volume - 0.1), flash(`Volume ${Math.round(Math.max(0, volume - 0.1) * 100)}%`)),
        m: toggleMute,
        f: toggleFullscreen,
        c: toggleCaptions,
        i: togglePip,
        n: () => next?.go(),
        Escape: () => setMenu(null),
      };
      const fn = map[e.key] ?? map[e.key.toLowerCase()];
      if (!fn || (e.key === ' ' && el.tagName === 'BUTTON')) return;
      e.preventDefault();
      fn();
      poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekBy, setVol, volume, toggleMute, toggleFullscreen, toggleCaptions, togglePip, next, poke, flash]);

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

  // ---------- pointer handling (tap vs click, double-tap seek) ----------
  const lastTap = useRef(0);
  const onSurfaceUp = (e: React.PointerEvent) => {
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

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={wrap}
      className={cx('relative size-full overflow-hidden bg-black select-none', !showControls && 'cursor-none')}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
    >
      <video
        ref={video}
        className="size-full object-contain"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
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
          if (next && getState().settings.autoplayNext) setCountdown(8);
        }}
        onError={(e) => !hls.current && e.currentTarget.getAttribute('src') && e.currentTarget.error && fail('media error')}
        onDoubleClick={toggleFullscreen}
      >
        {subUrl && <track key={subUrl} kind="subtitles" src={subUrl} label={subtitles[subIdx]?.label} default />}
      </video>

      {/* tap/click surface */}
      <div className="absolute inset-0" onPointerUp={onSurfaceUp} onDoubleClick={toggleFullscreen} />

      {/* centre states */}
      {buffering && !exhausted && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      )}
      {!playing && !buffering && !exhausted && countdown === null && (
        <button onClick={toggle} aria-label="Play" className="absolute inset-0 m-auto grid size-20 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/70">
          <Play className="ml-1 size-9 fill-white text-white" />
        </button>
      )}
      {notice && (
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-sm backdrop-blur-sm">{notice}</div>
      )}

      {exhausted && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
          <div className="max-w-sm space-y-4">
            <AlertTriangle className="mx-auto size-10 text-amber-400" />
            <p className="font-medium">None of Jelly’s sources would play.</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => {
                  failed.current.clear();
                  setExhausted(false);
                  setSourceIdx(0);
                }}
                className="h-11 rounded-full px-5 text-sm ring-1 ring-white/25 hover:bg-white/10"
              >
                Retry
              </button>
              <button onClick={onExhausted} className="h-11 rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-white/90">
                Use another server
              </button>
            </div>
          </div>
        </div>
      )}

      {countdown !== null && next && (
        <div className="absolute right-4 bottom-28 z-20 w-72 rounded-2xl bg-raised/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-md md:right-8">
          <div className="text-xs text-muted">Up next in {countdown}s</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium">{next.label}</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => next.go()} className="h-10 flex-1 rounded-full bg-white text-sm font-medium text-black hover:bg-white/90">
              Play now
            </button>
            <button onClick={() => setCountdown(null)} className="h-10 rounded-full px-4 text-sm ring-1 ring-white/20 hover:bg-white/10">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* top bar */}
      <div
        className={cx(
          'absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent pb-10 transition-opacity duration-200',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {header}
      </div>

      {/* bottom controls */}
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-12 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-200 md:px-6',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <SeekBar time={time} duration={duration} buffered={buffered} onSeek={(t) => video.current && (video.current.currentTime = t)} />
        <div className="mt-1 flex items-center gap-1 md:gap-2">
          <IconButton label={playing ? 'Pause (k)' : 'Play (k)'} onClick={toggle}>
            {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
          </IconButton>
          <IconButton label="Back 10 seconds (←)" onClick={() => seekBy(-10)}>
            <RotateCcw className="size-5" />
          </IconButton>
          <IconButton label="Forward 10 seconds (→)" onClick={() => seekBy(10)}>
            <RotateCw className="size-5" />
          </IconButton>
          <div className="group/vol hidden items-center sm:flex">
            <IconButton label="Mute (m)" onClick={toggleMute}>
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
              className="w-0 accent-white opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
            />
          </div>
          <span className="ml-1 text-xs text-white/85 tabular-nums md:text-sm">
            {formatClock(time)} <span className="text-white/45">/ {formatClock(duration)}</span>
          </span>
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            {next && (
              <IconButton label={`Next: ${next.label} (n)`} onClick={next.go}>
                <SkipForward className="size-5" />
              </IconButton>
            )}
            {subtitles.length > 0 && (
              <div className="relative">
                <IconButton label="Subtitles (c)" active={subIdx >= 0} onClick={() => setMenu(menu === 'captions' ? null : 'captions')}>
                  <Captions className="size-5" />
                </IconButton>
                {menu === 'captions' && (
                  <Popover>
                    <MenuItem selected={subIdx < 0} onClick={() => chooseSub(-1)}>
                      Off
                    </MenuItem>
                    {subtitles.map((s, i) => (
                      <MenuItem key={s.url} selected={subIdx === i} onClick={() => chooseSub(i)}>
                        {s.label}
                      </MenuItem>
                    ))}
                  </Popover>
                )}
              </div>
            )}
            <div className="relative">
              <IconButton label="Settings (quality, source, speed)" active={menu === 'settings'} onClick={() => setMenu(menu === 'settings' ? null : 'settings')}>
                <Settings className="size-5" />
              </IconButton>
              {menu === 'settings' && (
                <Popover>
                  {levels.length > 1 && (
                    <>
                      <MenuLabel>Quality</MenuLabel>
                      <MenuItem
                        selected={level === -1}
                        onClick={() => {
                          if (hls.current) hls.current.currentLevel = -1;
                          setLevel(-1);
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
                          }}
                        >
                          {l.height}p
                        </MenuItem>
                      ))}
                    </>
                  )}
                  <MenuLabel>Source</MenuLabel>
                  {data.sources.map((s, i) => (
                    <MenuItem
                      key={s.url}
                      selected={sourceIdx === i}
                      onClick={() => {
                        if (i === sourceIdx) return;
                        const v = video.current;
                        if (v && v.currentTime > 5) seekOnLoad.current = v.currentTime;
                        failed.current.delete(i);
                        setSourceIdx(i);
                        setMenu(null);
                      }}
                    >
                      <span className="flex-1">
                        {qualityLabel(s.quality)} · {s.provider.name}
                      </span>
                      <span className={cx('text-[10px] uppercase', failed.current.has(i) ? 'text-red-300' : 'text-faint')}>
                        {failed.current.has(i) ? 'failed' : s.type}
                      </span>
                    </MenuItem>
                  ))}
                  <MenuLabel>Speed</MenuLabel>
                  <div className="flex flex-wrap gap-1 px-2 pb-1">
                    {SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        onClick={() => {
                          setRate(sp);
                          actions.updateSettings({ playbackRate: sp });
                        }}
                        className={cx('h-8 rounded-full px-3 text-xs', rate === sp ? 'bg-white font-medium text-black' : 'bg-white/10 hover:bg-white/20')}
                      >
                        {sp}×
                      </button>
                    ))}
                  </div>
                </Popover>
              )}
            </div>
            {'pictureInPictureEnabled' in document && document.pictureInPictureEnabled && (
              <IconButton label="Picture in picture (i)" onClick={togglePip} className="hidden sm:grid">
                <PictureInPicture2 className="size-5" />
              </IconButton>
            )}
            <IconButton label="Fullscreen (f)" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- pieces ----------

function IconButton({
  label,
  onClick,
  children,
  active,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx('grid size-10 place-items-center rounded-full transition-colors hover:bg-white/15', active ? 'bg-white/15 text-white' : 'text-white', className)}
    >
      {children}
    </button>
  );
}

const Popover = ({ children }: { children: ReactNode }) => (
  <div className="absolute right-0 bottom-12 z-30 max-h-[60vh] w-64 overflow-y-auto rounded-2xl bg-raised/95 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
    {children}
  </div>
);
const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{children}</div>
);
function MenuItem({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10">
      <Check className={cx('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
      {children}
    </button>
  );
}

function SeekBar({ time, duration, buffered, onSeek }: { time: number; duration: number; buffered: number; onSeek: (t: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const frac = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const shown = scrub ?? (duration ? time / duration : 0);
  const tip = scrub ?? hover;
  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={formatClock(time)}
      tabIndex={-1}
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
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${shown * 100}%` }} />
      </div>
      <div
        className="absolute size-3.5 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
        style={{ left: `${shown * 100}%`, opacity: scrub !== null ? 1 : undefined }}
      />
      {tip !== null && duration > 0 && (
        <div className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-full bg-black/85 px-2.5 py-0.5 text-xs tabular-nums" style={{ left: `${tip * 100}%` }}>
          {formatClock(tip * duration)}
        </div>
      )}
    </div>
  );
}

// ---------- subtitle helpers ----------

function sortSubtitles(list: JellySubtitle[]) {
  const seen = new Set<string>();
  return list
    .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
    .sort((a, b) => Number(/english/i.test(b.label)) - Number(/english/i.test(a.label)) || a.label.localeCompare(b.label));
}

/** <track> only understands WebVTT; convert SRT on the fly. */
function toVtt(text: string) {
  const t = text.replace(/^﻿/, '').replace(/\r/g, '');
  if (t.trimStart().startsWith('WEBVTT')) return t;
  return 'WEBVTT\n\n' + t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}
