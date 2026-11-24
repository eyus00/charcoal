/**
 * Playback resolution: given a normalised stream and what a client can do, decide HOW it reaches
 * the player (straight from the origin, with bridge-injected headers, through the relay, or as a
 * frame) and whether this device can play it at all. Finding a stream and delivering its bytes are
 * separate concerns; nothing here fetches video.
 */
import type { Delivery, Stream, StreamType } from './types.js';

/** What the playing device and its surroundings can do. All plain facts the client measures once. */
export interface PlaybackCapabilities {
  /** A bridge (extension or app) that can add request headers and CORS for media requests. */
  bridge: boolean;
  /** A relay endpoint is available for streams that need headers and have no bridge. */
  relay: boolean;
  /** Container / protocol support. */
  hls: boolean;
  dash: boolean;
  mp4: boolean;
  mkv: boolean;
  webm: boolean;
  /** Video codecs the device decodes ("avc", "hevc", "av1", "vp9"). Empty = unknown, assume avc. */
  videoCodecs?: string[];
  /** Audio codecs it decodes ("aac", "mp3", "opus", "ac3", "eac3", "dts", "flac"). Empty = aac/mp3/opus. */
  audioCodecs?: string[];
  /** Largest picture height worth sending (screen size or a data-saver setting). */
  maxHeight?: number;
  /** Frames (other sites' players) are acceptable. */
  frames: boolean;
}

/** Headers that only describe the client; a stream "needing" just these plays fine without them. */
const COSMETIC = new Set(['user-agent', 'accept', 'accept-language', 'accept-encoding']);

export function needsHeaders(stream: Pick<Stream, 'headers'>): boolean {
  return Object.keys(stream.headers ?? {}).some((k) => !COSMETIC.has(k.toLowerCase()));
}

const CODEC_FAMILY: [RegExp, string][] = [
  [/hevc|h\.?265|x265|hvc1|hev1/i, 'hevc'],
  [/av01|\bav1\b/i, 'av1'],
  [/vp0?9/i, 'vp9'],
  [/avc|h\.?264|x264/i, 'avc'],
  [/e-?ac-?3|ec-3|ddp|dd\+|atmos/i, 'eac3'],
  [/\bac-?3\b|\bdd5|dolby digital/i, 'ac3'],
  [/dts|truehd/i, 'dts'],
  [/flac/i, 'flac'],
  [/opus/i, 'opus'],
  [/mp4a|\baac\b/i, 'aac'],
  [/\bmp3\b/i, 'mp3'],
];

/** Codec families named in a codec string or a file description ("hvc1.2.4.L153", "x265 10bit · DDP5.1"). */
export function codecFamilies(text: string | undefined): string[] {
  if (!text) return [];
  return [...new Set(CODEC_FAMILY.filter(([re]) => re.test(text)).map(([, f]) => f))];
}

export interface Compatibility {
  playable: boolean;
  /** Why not, for people. */
  reason?: string;
}

/** Whether this device can decode the stream. Unknown codecs are given the benefit of the doubt. */
export function checkCompatibility(stream: Stream, caps: PlaybackCapabilities): Compatibility {
  if (stream.type === 'frame') return caps.frames ? { playable: true } : { playable: false, reason: 'Embedded players are turned off' };
  const container: Record<Exclude<StreamType, 'frame'>, boolean> = { hls: caps.hls, dash: caps.dash, mp4: caps.mp4, mkv: caps.mkv, webm: caps.webm };
  if (!container[stream.type]) return { playable: false, reason: `This device can’t play ${stream.type.toUpperCase()} files` };
  const video = new Set(caps.videoCodecs?.length ? caps.videoCodecs : ['avc']);
  const audio = new Set(caps.audioCodecs?.length ? caps.audioCodecs : ['aac', 'mp3', 'opus']);
  // HLS conversions are assumed browser-safe unless they declare otherwise; files say what they are in their note.
  const described = [stream.video?.codec, ...(stream.audio ?? []).map((a) => a.codec), stream.type === 'hls' ? undefined : stream.note].filter(Boolean).join(' ');
  const families = codecFamilies(described);
  const badVideo = families.find((f) => ['hevc', 'av1', 'vp9', 'avc'].includes(f) && !video.has(f));
  if (badVideo) return { playable: false, reason: `This device can’t decode ${badVideo.toUpperCase()} video` };
  const audioFamilies = families.filter((f) => ['eac3', 'ac3', 'dts', 'flac', 'opus', 'aac', 'mp3'].includes(f));
  if (audioFamilies.length && !audioFamilies.some((f) => audio.has(f))) return { playable: false, reason: `This device can’t decode ${audioFamilies[0].toUpperCase()} audio` };
  return { playable: true };
}

/**
 * How a stream should be delivered on this client:
 * - frame:   it is another site's player
 * - direct:  nothing special needed; the player loads it from the origin
 * - headers: it needs request headers (or CORS) and a bridge can add them
 * - relay:   it needs headers, there is no bridge, a relay exists; or it was resolved on another
 *            machine and is bound to that address
 * - unplayable: it needs headers and nothing here can supply them
 */
export function decideDelivery(stream: Stream, caps: PlaybackCapabilities, resolvedHere: boolean): Delivery {
  if (stream.type === 'frame') return caps.frames ? 'frame' : 'unplayable';
  const headers = needsHeaders(stream);
  if (resolvedHere) {
    if (!headers && !caps.bridge) return 'direct';
    // With a bridge, always go through it: it also supplies CORS, which most hosts don't send.
    if (caps.bridge) return 'headers';
    return caps.relay ? 'relay' : 'unplayable';
  }
  // Resolved elsewhere (a server): address-bound links only work from that server.
  if (stream.ipBound) return caps.relay ? 'relay' : 'unplayable';
  if (!headers) return 'direct';
  if (caps.relay) return 'relay';
  return caps.bridge ? 'headers' : 'unplayable';
}

/** Milliseconds until a stream must be re-resolved (Infinity when it doesn't expire). */
export function timeToExpiry(stream: Pick<Stream, 'expiresAt'>, now = Date.now()): number {
  return stream.expiresAt === undefined ? Infinity : stream.expiresAt - now;
}

/** True when a stream should be refreshed before it is used (expired, or about to). */
export function needsRefresh(stream: Pick<Stream, 'expiresAt'>, now = Date.now(), marginMs = 30_000): boolean {
  return timeToExpiry(stream, now) <= marginMs;
}

/** What a playback failure most likely means, from the HTTP status the player saw. */
export function classifyPlaybackError(status: number | undefined, stream: Pick<Stream, 'expiresAt' | 'ipBound'>, now = Date.now()): 'expired' | 'refused' | 'gone' | 'network' | 'unknown' {
  if (status === 401 || status === 403) return needsRefresh(stream, now, 0) || stream.expiresAt !== undefined ? 'expired' : 'refused';
  if (status === 404 || status === 410) return 'gone';
  if (status === undefined || status === 0 || status >= 500) return 'network';
  return 'unknown';
}
