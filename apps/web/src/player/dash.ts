/**
 * MPEG-DASH for the player, through dash.js.
 *
 * This file (and dash.js with it) is a lazy chunk: Player.tsx imports it only when a DASH source
 * is about to play. It gives the player the same things hls.js does (qualities, audio tracks,
 * a start position, recovery, a reason when it gives up), so the controls, menus, subtitles,
 * progress saving and fail-over above it are the same code for both.
 *
 * Delivery only: it loads the manifest and segments of the one URL it is given. It never looks
 * for sources, and it never asks for a DRM licence (see `startDash`).
 */
import { MediaPlayer, supportsMediaSource, type MediaInfo, type MediaPlayerClass, type Representation } from 'dashjs';
import { languageName } from '../lib/servers';
import { canDecode, DRM_REASON, REFUSALS, retryBudget, undecodable, unplayable, type EngineAudioTrack, type EngineLevel, type PlaybackEngine } from '../lib/playback-engines';

// ---------- reading a manifest before playing it ----------

export interface MpdFacts {
  /** It declares content protection (any scheme: Widevine, PlayReady, ClearKey, plain CENC). */
  protected: boolean;
  /** Every video / audio representation, as a type a browser can be asked about. */
  video: { type: string; codecs: string }[];
  audio: { type: string; codecs: string }[];
}

/** What an MPD says about protection and codecs; null when it isn't a readable MPD. */
export function readMpd(xml: string): MpdFacts | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return null;
  }
  if (doc.documentElement?.localName !== 'MPD' || doc.getElementsByTagName('parsererror').length) return null;
  const facts: MpdFacts = { protected: doc.getElementsByTagNameNS('*', 'ContentProtection').length > 0, video: [], audio: [] };
  for (const set of Array.from(doc.getElementsByTagNameNS('*', 'AdaptationSet'))) {
    const reps = Array.from(set.getElementsByTagNameNS('*', 'Representation'));
    for (const rep of reps.length ? reps : [set]) {
      const mime = rep.getAttribute('mimeType') ?? set.getAttribute('mimeType') ?? '';
      const codecs = rep.getAttribute('codecs') ?? set.getAttribute('codecs') ?? '';
      const kind = set.getAttribute('contentType') ?? mime.split('/')[0];
      // Text and thumbnails don't decide whether it plays; a set that doesn't say what it is gets the benefit of the doubt.
      if ((kind !== 'video' && kind !== 'audio') || !mime) continue;
      facts[kind].push({ type: codecs ? `${mime}; codecs="${codecs}"` : mime, codecs });
    }
  }
  return facts;
}

/**
 * Why this device can't play a manifest, for people; undefined when nothing rules it out.
 * Checked on the manifest itself, before a single segment is requested.
 */
export function mpdProblem(xml: string, canPlay: (type: string) => boolean = canDecode): string | undefined {
  const facts = readMpd(xml);
  if (!facts) return undefined; // not readable here: dash.js reports the parsing error itself
  if (facts.protected) return DRM_REASON;
  for (const kind of ['video', 'audio'] as const) {
    const list = facts[kind];
    if (list.length && !list.some((r) => canPlay(r.type))) return undecodable(kind, list[0].codecs);
  }
  return undefined;
}

// ---------- audio track names ----------

const CHANNELS: Record<string, string> = { '1': 'mono', '2': 'stereo', '6': '5.1', '8': '7.1' };

/** Extra words that tell two tracks in the same language apart: "5.1", "commentary". */
function audioDetail(t: MediaInfo): string {
  const role = t.roles?.map((r) => r.value).find((v) => v && v !== 'main');
  const channels = CHANNELS[String(t.audioChannelConfiguration?.[0]?.value ?? '')];
  return [role, channels].filter(Boolean).join(', ');
}

/** "English", "French"; "English (5.1)" / "English 2" when a language appears more than once. */
export function audioNames(list: MediaInfo[]): string[] {
  const base = list.map((t, i) => t.labels?.find((l) => l.text)?.text || (t.lang && t.lang !== 'und' ? languageName(t.lang) : '') || `Track ${i + 1}`);
  const named = base.map((name, i) => {
    if (base.filter((n) => n === name).length < 2) return name;
    const detail = audioDetail(list[i]);
    return detail ? `${name} (${detail})` : name;
  });
  const seen = new Map<string, number>();
  return named.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n > 1 ? `${name} ${n}` : name;
  });
}

// ---------- the engine ----------

export interface DashOptions {
  url: string;
  /** Seconds to start from (0 = the beginning). */
  startAt: number;
  /** Preferred audio language (ISO 639-1); the matching track is chosen at start. */
  audioLang?: string;
  /**
   * Bridged sources only: called with a host before the first request to it, so the bridge can add
   * the headers that host expects (and CORS). The browser itself cannot set them.
   */
  allow?: (host: string) => Promise<void>;
}

export interface DashEvents {
  /** The stream is set up: playback can be started. */
  ready(): void;
  /** Whether it is a live stream (a dynamic manifest). */
  live?(isLive: boolean): void;
  levels(list: EngineLevel[]): void;
  audioTracks(list: EngineAudioTrack[], current: number): void;
  audioTrack(current: number): void;
  /** It can't go on. `why` is a failure code the player words; `status` the HTTP status behind it, if any. */
  fail(why: string, status?: number): void;
}

/** What dash.js hands its request / response interceptors, as far as this file reads it. */
interface DashRequest {
  url: string;
  customData?: { request?: { type?: string; mediaType?: string } };
}
interface DashResponse {
  status?: number;
  data?: unknown;
  request?: DashRequest;
}
interface DashError {
  error?: { code?: number; message?: string; data?: { response?: { status?: number } } } | string | null;
}

// dash.js error codes (MediaPlayer.errors), grouped by what the player does about them. Codes 1-5
// are the video element's own MediaError codes, which dash.js passes on once its own decode
// recovery is used up.
const MANIFEST_LOAD = [11, 25];
const MANIFEST_PARSE = [10, 31];
const NOTHING_PLAYABLE = [23, 32, 34, 35];
const DOWNLOAD = [15, 17, 19, 26, 27, 28];
const MEDIA = [1, 2, 3, 4, 20, 21, 22];
const ENCRYPTED = 5;

const SEGMENTS = ['InitializationSegment', 'MediaSegment', 'IndexSegment', 'BitstreamSwitchingSegment'];
/** A request that is never answered: dash.js waits on it until it is torn down. */
const never = <T,>() => new Promise<T>(() => {});

/**
 * Plays a DASH manifest in `video`. Returns at once; everything it learns arrives through `on`.
 *
 * DRM is out of scope, on purpose and in three layers: dash.js's protection module is removed
 * before a player is created (without it dash.js cannot open a key session or ask for a licence);
 * a manifest that declares ContentProtection is refused before dash.js parses it; and content
 * that turns out to be encrypted without saying so is stopped at the browser's `encrypted` event.
 */
export function startDash(video: HTMLVideoElement, o: DashOptions, on: DashEvents): PlaybackEngine {
  let dead = false; // no more events: it failed or was destroyed
  let destroyed = false;
  let mp: MediaPlayerClass | null = null;
  let reps: Representation[] = [];
  let tracks: MediaInfo[] = [];
  /** The picture height the viewer chose, or null for automatic. */
  let wantHeight: number | null = null;
  let lastTime = 0;
  /** A recovery is about to restart the stream: other errors from the same incident are dropped. */
  let restarting = false;
  /** After a recovery, carry on playing only if it was playing. */
  let resume = true;
  const retry = retryBudget();
  const timers = new Set<number>();
  const later = (fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      fn();
    }, 0);
    timers.add(t);
  };

  const onTime = () => {
    if (video.currentTime > 0) lastTime = video.currentTime;
  };
  const onEncrypted = () => fatal(unplayable(DRM_REASON));

  const destroy = () => {
    dead = true;
    if (destroyed) return;
    destroyed = true;
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
    video.removeEventListener('timeupdate', onTime);
    video.removeEventListener('encrypted', onEncrypted);
    try {
      mp?.destroy();
    } catch {
      /* already gone */
    }
    mp = null;
  };

  function fatal(why: string, status?: number) {
    if (dead) return;
    dead = true;
    // Stop loading now, but not from inside dash.js's own event dispatch.
    later(destroy);
    on.fail(why, status);
  }

  if (!supportsMediaSource()) {
    later(() => on.fail(unplayable('This browser can’t play DASH streams')));
    return { setLevel() {}, setAudioTrack() {}, destroy };
  }

  // Layer one of "no DRM": dash.js finds its protection module on its global. Without it there is
  // no key system, no key session and no licence request, whatever a manifest or a segment says.
  const globals = (window as unknown as { dashjs?: { Protection?: unknown } }).dashjs;
  if (globals) delete globals.Protection;

  const player = MediaPlayer().create();
  mp = player;
  player.initialize(undefined, undefined, false);
  // Live streams bring their own clock source (UTCTiming, or the manifest's Date header); the
  // player doesn't call a third-party time server by itself.
  player.clearDefaultUTCTimingSources();
  player.updateSettings({
    debug: { logLevel: 2 }, // errors only
    streaming: {
      // Like hls.js's capLevelToPlayerSize: automatic quality doesn't exceed what the screen shows.
      abr: { limitBitrateByPortal: true, usePixelRatioInLimitBitrateByPortal: true },
      // Subtitles are the player's own overlay (as with HLS), not dash.js's.
      text: { defaultEnabled: false },
      // The audio language comes from the viewer's setting, not from dash.js's own storage.
      lastMediaSettingsCachingInfo: { enabled: false },
    },
  });
  if (o.audioLang) player.setInitialMediaSettingsFor('audio', { lang: o.audioLang });

  // ----- requests -----
  if (o.allow) {
    const allow = o.allow;
    const before = async (request: DashRequest) => {
      try {
        const u = new URL(request.url, location.href);
        if (u.protocol === 'http:' || u.protocol === 'https:') await allow(u.hostname);
      } catch (e) {
        console.warn('[helper]', (e as Error).message);
      }
      return request;
    };
    player.addRequestInterceptor(before as unknown as Parameters<MediaPlayerClass['addRequestInterceptor']>[0]);
  }

  const after = (response: DashResponse): Promise<DashResponse> => {
    if (dead) return never();
    const request = response.request?.customData?.request;
    const type = request?.type ?? '';
    const status = response.status ?? 0;
    const isManifest = type === 'MPD';
    const isSegment = SEGMENTS.includes(type) && (request?.mediaType === 'video' || request?.mediaType === 'audio');
    // A refusal won't fix itself: don't sit through dash.js's retries. (A live stream's 404 can be
    // a segment that isn't out yet, so that one is left to dash.js.)
    if ((isManifest || isSegment) && REFUSALS.includes(status) && !(isSegment && status === 404 && isLive())) {
      fatal(`${isManifest ? 'manifest' : 'frag'}LoadError ${status}`, status);
      return never();
    }
    // Layer two of "no DRM", and the codec check: read the manifest before dash.js does.
    if (isManifest && status >= 200 && status < 300) {
      const text = typeof response.data === 'string' ? response.data : response.data instanceof ArrayBuffer ? new TextDecoder().decode(response.data) : '';
      const problem = text ? mpdProblem(text) : undefined;
      if (problem) {
        fatal(unplayable(problem));
        return never();
      }
    }
    return Promise.resolve(response);
  };
  player.addResponseInterceptor(after as unknown as Parameters<MediaPlayerClass['addResponseInterceptor']>[0]);

  const isLive = () => {
    try {
      return !!mp?.isDynamic();
    } catch {
      return false;
    }
  };

  // ----- qualities -----
  const applyLevel = () => {
    if (dead || !mp) return;
    const rep = wantHeight === null ? undefined : reps.find((r) => r.height === wantHeight);
    try {
      // A chosen quality may be above what the automatic choice is capped to.
      mp.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: !rep }, limitBitrateByPortal: !rep } } });
      if (rep) mp.setRepresentationForTypeById('video', rep.id, true);
    } catch {
      /* the stream isn't up yet: applied when it is */
    }
  };
  const readLevels = () => {
    let all: Representation[] = [];
    try {
      all = mp?.getRepresentationsByTypeUnfiltered('video') ?? [];
    } catch {
      /* not up yet */
    }
    // One entry per picture height (its best bitrate), best first: what the quality menu lists.
    const byHeight = new Map<number, Representation>();
    for (const r of all) {
      if (!(r.height > 0)) continue;
      const had = byHeight.get(r.height);
      if (!had || r.bandwidth > had.bandwidth) byHeight.set(r.height, r);
    }
    reps = [...byHeight.values()].sort((a, b) => b.height - a.height);
    on.levels(reps.map((r, index) => ({ height: r.height, index })));
  };

  // ----- audio -----
  const currentAudio = () => {
    try {
      const now = mp?.getCurrentTrackFor('audio');
      return now ? tracks.findIndex((t) => t.index === now.index) : -1;
    } catch {
      return -1;
    }
  };
  const readAudio = () => {
    try {
      tracks = mp?.getTracksFor('audio') ?? [];
    } catch {
      tracks = [];
    }
    const names = audioNames(tracks);
    on.audioTracks(tracks.map((_, id) => ({ id, name: names[id] })), currentAudio());
  };

  // ----- events -----
  player.on('streamInitialized', () => {
    if (dead) return;
    readLevels();
    readAudio();
    on.live?.(isLive());
    if (wantHeight !== null) applyLevel();
    if (resume) on.ready();
    resume = true;
  });
  player.on('trackChangeRendered', (e: { mediaType?: string }) => {
    if (!dead && e.mediaType === 'audio') on.audioTrack(currentAudio());
  });

  /** dash.js has given up on the stream: start it again where it stopped, once per kind per minute. */
  const recover = (kind: 'network' | 'media', why: string, status?: number) => {
    if (restarting) return;
    if (!retry(kind)) return fatal(why, status);
    restarting = true;
    resume = !video.paused;
    const at = lastTime || o.startAt;
    later(() => {
      if (dead || !mp) return;
      try {
        // Ends the old session (and its pending requests): any error from here on is a new one.
        mp.attachSource(o.url, at > 0 ? at : undefined);
        restarting = false;
      } catch {
        fatal(why, status);
      }
    });
  };
  player.on('error', (e: DashError) => {
    if (dead) return;
    const err = e.error && typeof e.error === 'object' ? e.error : {};
    const code = err.code ?? -1;
    const status = err.data?.response?.status || undefined;
    const tail = status ? ` ${status}` : '';
    if (MANIFEST_LOAD.includes(code)) return fatal(`manifestLoadError${tail}`, status);
    if (MANIFEST_PARSE.includes(code)) return fatal('manifestParsingError');
    if (NOTHING_PLAYABLE.includes(code)) return fatal(unplayable('This browser can’t play its format'));
    if (code === ENCRYPTED) return fatal(unplayable(DRM_REASON));
    // dash.js has already retried each request (and reset the decoder for decode errors) by now.
    if (DOWNLOAD.includes(code)) return recover('network', `fragLoadError${tail}`, status);
    if (MEDIA.includes(code)) return recover('media', 'media error');
    console.warn('[dash]', code, err.message ?? e.error);
  });

  // Layer three of "no DRM": encrypted media that the manifest didn't declare.
  video.addEventListener('encrypted', onEncrypted);
  video.addEventListener('timeupdate', onTime);

  player.attachView(video);
  player.attachSource(o.url, o.startAt > 0 ? o.startAt : undefined);

  return {
    setLevel(index) {
      wantHeight = index < 0 ? null : (reps[index]?.height ?? null);
      applyLevel();
    },
    setAudioTrack(id) {
      const track = tracks[id];
      if (dead || !mp || !track) return;
      try {
        mp.setCurrentTrack(track);
        on.audioTrack(id);
      } catch {
        /* not up yet */
      }
    },
    destroy,
  };
}
