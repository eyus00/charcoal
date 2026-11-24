/**
 * Source ranking. No provider is preferred by name: every stream is scored on things that can be
 * measured (can this device play it, is it in the viewer's language, how good is the picture, how
 * reliably and how fast does its provider answer, how cheaply can it be delivered). The weights are
 * data and can be tuned from the registry without a release.
 */
import type { Delivery, Stream } from './types.js';

export interface RankWeights {
  language: number;
  quality: number;
  reliability: number;
  speed: number;
  delivery: number;
  /** The registry's (or author's) rank for the provider, normalised. */
  rank: number;
  /** The provider that played last time. */
  lastPlayed: number;
}

export const DEFAULT_WEIGHTS: RankWeights = { language: 30, quality: 25, reliability: 20, speed: 5, delivery: 10, rank: 5, lastPlayed: 5 };

const QUALITY_VALUE: Record<string, number> = { '2160': 1, '1440': 0.9, '1080': 0.8, auto: 0.7, '720': 0.6, original: 0.55, '480': 0.35, '360': 0.2, '240': 0.1 };
const HEIGHT: Record<string, number> = { '2160': 2160, '1440': 1440, '1080': 1080, '720': 720, '480': 480, '360': 360, '240': 240 };
const DELIVERY_VALUE: Record<Delivery, number> = { direct: 1, headers: 0.9, relay: 0.5, frame: 0.15, unplayable: 0 };

export interface RankContext {
  /** ISO 639-1 code the viewer wants to hear. */
  preferredLanguage?: string;
  maxHeight?: number;
  /** From the playback layer. */
  compatibility(stream: Stream): { playable: boolean; reason?: string };
  delivery(stream: Stream): Delivery;
  /** 0..1, 0.5 when unknown. */
  reliability(stream: Stream): number;
  /** Average answer time of the stream's provider in ms, when known. */
  averageMs?(stream: Stream): number | undefined;
  /** 0..1 */
  providerRank?(providerId: string): number;
  lastProvider?: string | null;
  weights?: Partial<RankWeights>;
}

export interface Scored {
  score: number;
  playable: boolean;
  reasons: string[];
}

/** 1 for the wanted or original/unknown audio, 0 for a dub in another language. */
function languageValue(stream: Stream, preferred?: string): number {
  if (!stream.audio.length) return 1;
  const langs = stream.audio.map((a) => a.lang);
  if (preferred && langs.includes(preferred)) return 1;
  // Most sources don't say; "unknown" is nearly always the original audio.
  if (langs.every((l) => l === 'und') && !stream.audio.some((a) => a.dub)) return preferred ? 0.85 : 1;
  return 0;
}

export function scoreStream(stream: Stream, ctx: RankContext): Scored {
  const w = { ...DEFAULT_WEIGHTS, ...ctx.weights };
  const reasons: string[] = [];
  const compat = ctx.compatibility(stream);
  const delivery = ctx.delivery(stream);
  if (!compat.playable || delivery === 'unplayable') {
    return { score: -1, playable: false, reasons: [compat.reason ?? 'Needs the helper extension or the app to play'] };
  }

  const lang = languageValue(stream, ctx.preferredLanguage);
  if (lang === 0) reasons.push('another language');

  let quality = QUALITY_VALUE[stream.quality] ?? 0.4;
  const h = HEIGHT[stream.quality];
  if (ctx.maxHeight && h && h > ctx.maxHeight) {
    // More pixels than the screen (or the data saver) wants: worth what the cap is worth, a little less.
    const capped = Object.entries(HEIGHT).filter(([, v]) => v <= ctx.maxHeight!).sort((a, b) => b[1] - a[1])[0];
    quality = (capped ? QUALITY_VALUE[capped[0]] : 0.2) - 0.05;
    reasons.push('above the quality limit');
  }

  const reliability = Math.min(1, Math.max(0, ctx.reliability(stream)));
  if (reliability < 0.4) reasons.push('unreliable source lately');
  const ms = ctx.averageMs?.(stream);
  const speed = ms === undefined ? 0.5 : Math.min(1, Math.max(0, 1 - (ms - 1000) / 9000));
  const rank = Math.min(1, Math.max(0, ctx.providerRank?.(stream.provider.id) ?? 0.5));
  const last = ctx.lastProvider && ctx.lastProvider === stream.provider.id ? 1 : 0;

  const score = w.language * lang + w.quality * quality + w.reliability * reliability + w.speed * speed + w.delivery * DELIVERY_VALUE[delivery] + w.rank * rank + w.lastPlayed * last;
  return { score: Math.round(score * 100) / 100, playable: true, reasons };
}

/** Best first; unplayable streams last (kept, so the UI can say why they are greyed out). */
export function rankStreams(streams: Stream[], ctx: RankContext): Stream[] {
  return streams
    .map((s) => {
      const r = scoreStream(s, ctx);
      return { ...s, score: r.score, reasons: r.reasons };
    })
    .sort((a, b) => b.score! - a.score! || (b.size ?? 0) - (a.size ?? 0) || a.id.localeCompare(b.id));
}
