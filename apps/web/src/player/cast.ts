import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Chromecast through Google's Cast SDK (Chrome / Edge on desktop and Android).
 *
 * hls.js plays video from a blob: address that only exists in this tab, so the browser's own
 * casting can't take it over. Instead we hand the Chromecast the real stream address (Jelly's
 * public proxy URL) and the TV loads it itself; this tab becomes the remote.
 *
 * The SDK has no published types we ship, so it's reached through `any`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

let loading: Promise<boolean> | null = null;

/** Loads the SDK once. Resolves false where casting isn't possible (Safari, Firefox, iOS). */
export function loadCastSdk(): Promise<boolean> {
  if (loading) return loading;
  const w = window as any;
  // The Cast SDK only works in Chromium browsers, and never on iOS (all iOS browsers are Safari inside).
  if (!w.chrome || /iPhone|iPad|iPod/.test(navigator.userAgent)) return (loading = Promise.resolve(false));
  loading = new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(false), 15_000);
    w.__onGCastApiAvailable = (ok: boolean) => {
      window.clearTimeout(timer);
      if (ok) {
        w.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          // Re-joins a session started earlier from this site (e.g. after moving to the next episode).
          autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
      }
      resolve(ok);
    };
    const s = document.createElement('script');
    s.src = SDK;
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type CastState = 'unavailable' | 'NO_DEVICES_AVAILABLE' | 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED';

export interface RemoteState {
  time: number;
  duration: number;
  paused: boolean;
  /** Media loaded and playing or paused (not idle / finished). */
  active: boolean;
  /** The receiver finished the video. */
  ended: boolean;
  volume: number;
  muted: boolean;
}

export interface CastLoad {
  url: string;
  title: string;
  subtitle?: string;
  poster?: string;
  startAt: number;
  /** WebVTT subtitle URL to show on the TV (the default receiver only reads WebVTT). */
  subtitles?: { url: string; label: string };
  subtitleStyle?: { color: string; bg: number; scale: number; bold: boolean };
}

const NO_REMOTE: RemoteState = { time: 0, duration: 0, paused: true, active: false, ended: false, volume: 1, muted: false };

/** Is the playlist made of fragmented MP4 (has an init segment) or MPEG-TS? Needed by the receiver. */
async function segmentFormat(url: string): Promise<'ts' | 'fmp4'> {
  try {
    let text = await (await fetch(url)).text();
    if (text.includes('#EXT-X-STREAM-INF')) {
      const variant = text.split('\n').find((l) => l.trim() && !l.startsWith('#'));
      if (variant) text = await (await fetch(new URL(variant.trim(), url))).text();
    }
    return text.includes('#EXT-X-MAP') ? 'fmp4' : 'ts';
  } catch {
    return 'ts';
  }
}

const hex = (color: string, alpha = 1) => {
  const c = color.replace('#', '');
  const full = c.length === 3 ? [...c].map((x) => x + x).join('') : c.slice(0, 6);
  return `#${full}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`.toUpperCase();
};

export function useCast() {
  const [state, setState] = useState<CastState>('unavailable');
  const [device, setDevice] = useState('');
  const [remote, setRemote] = useState<RemoteState>(NO_REMOTE);
  const player = useRef<any>(null);
  const ctrl = useRef<any>(null);

  useEffect(() => {
    let off = () => {};
    let dead = false;
    loadCastSdk().then((ok) => {
      if (!ok || dead) return;
      const fw = (window as any).cast.framework;
      const ctx = fw.CastContext.getInstance();
      const updateState = () => {
        setState(ctx.getCastState());
        setDevice(ctx.getCurrentSession()?.getCastDevice()?.friendlyName ?? '');
      };
      updateState();
      ctx.addEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, updateState);

      const p = new fw.RemotePlayer();
      const c = new fw.RemotePlayerController(p);
      player.current = p;
      ctrl.current = c;
      const sync = () => {
        // "Finished" is only visible on the media session's idle reason.
        const ms = ctx.getCurrentSession()?.getMediaSession();
        setRemote({
          time: p.currentTime || 0,
          duration: p.duration || 0,
          paused: p.isPaused,
          active: p.isMediaLoaded && p.playerState !== 'IDLE',
          ended: ms?.playerState === 'IDLE' && ms?.idleReason === 'FINISHED',
          volume: p.volumeLevel ?? 1,
          muted: p.isMuted,
        });
      };
      c.addEventListener(fw.RemotePlayerEventType.ANY_CHANGE, sync);
      sync();
      off = () => {
        ctx.removeEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, updateState);
        c.removeEventListener(fw.RemotePlayerEventType.ANY_CHANGE, sync);
      };
    });
    return () => {
      dead = true;
      off();
    };
  }, []);

  const session = () => (window as any).cast?.framework?.CastContext.getInstance().getCurrentSession();

  /** Opens the browser's device picker. */
  const start = useCallback(() => {
    (window as any).cast?.framework?.CastContext.getInstance()
      .requestSession()
      .catch(() => {}); // closing the picker rejects with "cancel"
  }, []);
  const stop = useCallback(() => session()?.endSession(true), []);

  const load = useCallback(async (m: CastLoad) => {
    const s = session();
    if (!s) return false;
    const cm = (window as any).chrome.cast.media;
    const info = new cm.MediaInfo(m.url, 'application/x-mpegURL');
    const fmt = await segmentFormat(m.url);
    info.hlsSegmentFormat = fmt === 'fmp4' ? cm.HlsSegmentFormat.FMP4 : cm.HlsSegmentFormat.TS;
    info.hlsVideoSegmentFormat = fmt === 'fmp4' ? cm.HlsVideoSegmentFormat.FMP4 : cm.HlsVideoSegmentFormat.MPEG2_TS;
    info.streamType = cm.StreamType.BUFFERED;
    const meta = new cm.GenericMediaMetadata();
    meta.title = m.title;
    meta.subtitle = m.subtitle;
    if (m.poster) meta.images = [new (window as any).chrome.cast.Image(m.poster)];
    info.metadata = meta;
    const active: number[] = [];
    if (m.subtitles) {
      const t = new cm.Track(1, cm.TrackType.TEXT);
      t.trackContentId = m.subtitles.url;
      t.trackContentType = 'text/vtt';
      t.subtype = cm.TextTrackType.SUBTITLES;
      t.name = m.subtitles.label;
      info.tracks = [t];
      active.push(1);
      if (m.subtitleStyle) {
        const st = new cm.TextTrackStyle();
        st.foregroundColor = hex(m.subtitleStyle.color);
        st.backgroundColor = hex('#000000', m.subtitleStyle.bg);
        st.fontScale = m.subtitleStyle.scale;
        st.fontStyle = m.subtitleStyle.bold ? cm.TextTrackFontStyle.BOLD : cm.TextTrackFontStyle.NORMAL;
        st.edgeType = m.subtitleStyle.bg < 0.3 ? cm.TextTrackEdgeType.DROP_SHADOW : cm.TextTrackEdgeType.NONE;
        info.textTrackStyle = st;
      }
    }
    const req = new cm.LoadRequest(info);
    req.currentTime = m.startAt;
    req.autoplay = true;
    req.activeTrackIds = active;
    try {
      await s.loadMedia(req);
      return true;
    } catch (e) {
      console.warn('[cast] load failed', e);
      return false;
    }
  }, []);

  const playOrPause = useCallback(() => ctrl.current?.playOrPause(), []);
  const seek = useCallback((t: number) => {
    if (!player.current) return;
    player.current.currentTime = t;
    ctrl.current.seek();
  }, []);
  const setVolume = useCallback((v: number) => {
    if (!player.current) return;
    player.current.volumeLevel = v;
    ctrl.current.setVolumeLevel();
  }, []);
  const toggleMute = useCallback(() => ctrl.current?.muteOrUnmute(), []);

  return { state, device, remote, start, stop, load, playOrPause, seek, setVolume, toggleMute };
}
