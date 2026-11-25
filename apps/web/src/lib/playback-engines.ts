/**
 * What the player needs from a streaming engine (hls.js for HLS, dash.js for DASH), so its menus,
 * recovery and fail-over are written once, and the few decisions both engines share. Nothing here
 * loads an engine or fetches anything: each engine is a lazy chunk the player imports when a source
 * of that kind is about to play.
 */
import { classifyPlaybackError, codecFamilies } from '@charcoal/provider-sdk';

/** One picture quality of an adaptive stream. `index` is the engine's own handle for it. */
export interface EngineLevel {
  height: number;
  index: number;
}

/** One audio track of a stream with several. */
export interface EngineAudioTrack {
  id: number;
  name: string;
}

/** A running engine, as the player's menus see it. */
export interface PlaybackEngine {
  /** A quality from the list the engine reported, or -1 to choose by itself again. */
  setLevel(index: number): void;
  setAudioTrack(id: number): void;
  /** Stops loading and lets go of the video element. Safe to call twice. */
  destroy(): void;
}

// ---------- failures ----------

/** Statuses that won't fix themselves: retrying only delays the next source. */
export const REFUSALS = [401, 403, 404, 410];

const UNPLAYABLE = 'unplayable: ';
/** A failure that means "this device can't play it at all", carrying the reason for people. */
export const unplayable = (reason: string) => UNPLAYABLE + reason;
/** The reason of an `unplayable()` failure, or undefined for any other failure. */
export const unplayableReason = (why: string) => (why.startsWith(UNPLAYABLE) ? why.slice(UNPLAYABLE.length) : undefined);

export const DRM_REASON = 'It is DRM-protected, which Charcoal doesn’t play';

/** "This device can’t decode HEVC video", in the same words the resolver uses for declared codecs. */
export function undecodable(kind: 'video' | 'audio', codecs: string | undefined): string {
  const family = codecFamilies(codecs)[0];
  if (family) return `This device can’t decode ${family.toUpperCase()} ${kind}`;
  return `This device can’t decode its ${kind}${codecs ? ` (${codecs})` : ''}`;
}

/** Whether Media Source Extensions here can take a type ("video/mp4; codecs=…"). Not knowing counts as yes. */
export function canDecode(type: string): boolean {
  const w = window as unknown as { ManagedMediaSource?: typeof MediaSource; MediaSource?: typeof MediaSource };
  const MS = w.ManagedMediaSource ?? w.MediaSource;
  try {
    return !MS || MS.isTypeSupported(type);
  } catch {
    return true;
  }
}

const AUDIO_FAMILIES = new Set(['eac3', 'ac3', 'dts', 'flac', 'opus', 'aac', 'mp3']);
const CODEC_STRING = /\b(?:[a-z][a-z0-9]{3}\.[\w.]+|ec-3|ac-3|opus|flac)\b/gi;

/**
 * Why a stream whose codecs are named somewhere in `text` (an engine's own error message, e.g.
 * hls.js's `CODECS in variant not supported: ["hvc1.1.6.L93.B0,mp4a.40.2"]`) won't play here:
 * names the first one this device has no decoder for.
 */
export function undecodableIn(text: string | undefined): string {
  for (const codec of text?.match(CODEC_STRING) ?? []) {
    const kind = AUDIO_FAMILIES.has(codecFamilies(codec)[0] ?? '') ? 'audio' : 'video';
    if (!canDecode(`${kind}/mp4; codecs="${codec}"`)) return undecodable(kind, codec);
  }
  return 'This device can’t decode its video or audio';
}

/**
 * True when a refused request (401/403) most likely means the link's token ran out, so the stream
 * is worth resolving again; false when the host simply refuses it.
 */
export const linkRanOut = (status: number, source: { expiresAt?: number }) => classifyPlaybackError(status, source) === 'expired';

// ---------- recovery ----------

/**
 * How often an engine may try to recover from one kind of error (network, media) before the
 * player gives up on the source: once a minute. A hiccup an hour into a film gets its retry;
 * a source that breaks again straight after recovering is left for the next one.
 */
export function retryBudget(windowMs = 60_000, now: () => number = Date.now) {
  const last = new Map<string, number>();
  return (kind: string): boolean => {
    const t = now();
    const before = last.get(kind);
    if (before !== undefined && t - before < windowMs) return false;
    last.set(kind, t);
    return true;
  };
}
