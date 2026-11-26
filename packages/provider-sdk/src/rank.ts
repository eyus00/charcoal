/**
 * Source ranking. No provider is preferred by name: every stream is scored on things that can be
 * measured (can this device play it, is it in the viewer's language, how good is the picture, how
 * reliably and how fast does its provider answer, how cheaply can it be delivered). The weights are
 * data and can be tuned from the registry without a release.
 */
import type { Delivery, Stream } from "./types.js";

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
  /** A stream that was tried and answered with media (see Stream.verification). */
  verified?: number;
}

export const DEFAULT_WEIGHTS: RankWeights = {
  language: 30,
  quality: 25,
  reliability: 20,
  speed: 5,
  delivery: 10,
  rank: 5,
  lastPlayed: 5,
  verified: 10,
};

const QUALITY_VALUE: Record<string, number> = {
  "2160": 1,
  "1440": 0.9,
  "1080": 0.8,
  auto: 0.7,
  "720": 0.6,
  original: 0.55,
  "480": 0.35,
  "360": 0.2,
  "240": 0.1,
};
const HEIGHT: Record<string, number> = {
  "2160": 2160,
  "1440": 1440,
  "1080": 1080,
  "720": 720,
  "480": 480,
  "360": 360,
  "240": 240,
};
/** The quality step a measured picture height belongs to (a 1918×800 film is still 1080p). */
function heightKey(h: number): string {
  const steps = [2160, 1440, 1080, 720, 480, 360, 240];
  return String(steps.find((s) => h >= s * 0.7) ?? 240);
}
const DELIVERY_VALUE: Record<Delivery, number> = {
  direct: 1,
  headers: 0.9,
  relay: 0.5,
  frame: 0.15,
  unplayable: 0,
};

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
  /** 0..1: how often the provider's unlabelled audio turns out to be a dub (ProviderManifest.dubRisk). */
  dubRisk?(providerId: string): number;
  lastProvider?: string | null;
  weights?: Partial<RankWeights>;
}

export interface Scored {
  score: number;
  playable: boolean;
  reasons: string[];
}

/** A playlist's own language tag ("en", "eng", "en-US") as ISO 639-1. */
const iso1 = (l: string) => {
  const t = l.toLowerCase().split(/[-_]/)[0];
  return ISO3[t] ?? t;
};
const ISO3: Record<string, string> = {
  eng: "en",
  hin: "hi",
  tam: "ta",
  tel: "te",
  mal: "ml",
  kan: "kn",
  spa: "es",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  ita: "it",
  por: "pt",
  jpn: "ja",
  kor: "ko",
  chi: "zh",
  zho: "zh",
  rus: "ru",
  ara: "ar",
  tur: "tr",
  ben: "bn",
  urd: "ur",
};

/**
 * 1 for the wanted or original audio, 0 for a dub in another language. What the stream's own
 * playlist declares (read when it was verified) outranks what the provider labelled it; an
 * unlabelled stream is taken as the original, less so from a provider whose unlabelled streams are
 * often dubs.
 */
function languageValue(
  stream: Stream,
  preferred?: string,
  dubRisk = 0,
): number {
  const declared = (stream.verification?.detail?.audioLanguages ?? [])
    .map(iso1)
    .filter((l) => l && l !== "und" && l !== "mul");
  if (preferred && declared.length) return declared.includes(preferred) ? 1 : 0;
  const unknown = (v: number) => v * (1 - Math.min(1, Math.max(0, dubRisk)));
  if (!stream.audio.length) return preferred ? unknown(0.85) : 1;
  const langs = stream.audio.map((a) => a.lang);
  if (preferred && langs.includes(preferred)) return 1;
  // Most sources don't say; "unknown" is nearly always the original audio.
  if (langs.every((l) => l === "und") && !stream.audio.some((a) => a.dub))
    return preferred ? unknown(0.85) : 1;
  return 0;
}

export function scoreStream(stream: Stream, ctx: RankContext): Scored {
  const w = { ...DEFAULT_WEIGHTS, ...ctx.weights };
  const reasons: string[] = [];
  const compat = ctx.compatibility(stream);
  const delivery = ctx.delivery(stream);
  if (!compat.playable || delivery === "unplayable") {
    return {
      score: -1,
      playable: false,
      reasons: [
        compat.reason ?? "Needs the helper extension or the app to play",
      ],
    };
  }

  const lang = languageValue(
    stream,
    ctx.preferredLanguage,
    ctx.dubRisk?.(stream.provider.id),
  );
  if (lang === 0) reasons.push("another language");

  // The picture the playlist actually offers, when it was read, beats the label: an "auto" stream
  // is often 1080p, and a label can be wrong.
  const measured = stream.verification?.detail?.maxHeight;
  const key = measured ? heightKey(measured) : stream.quality;
  let quality = QUALITY_VALUE[key] ?? 0.4;
  const h = HEIGHT[key];
  if (ctx.maxHeight && h && h > ctx.maxHeight) {
    // More pixels than the screen (or the data saver) wants: worth what the cap is worth, a little less.
    const capped = Object.entries(HEIGHT)
      .filter(([, v]) => v <= ctx.maxHeight!)
      .sort((a, b) => b[1] - a[1])[0];
    quality = (capped ? QUALITY_VALUE[capped[0]] : 0.2) - 0.05;
    reasons.push("above the quality limit");
  }

  const reliability = Math.min(1, Math.max(0, ctx.reliability(stream)));
  if (reliability < 0.4) reasons.push("unreliable source lately");
  const ms = ctx.averageMs?.(stream);
  const speed =
    ms === undefined ? 0.5 : Math.min(1, Math.max(0, 1 - (ms - 1000) / 9000));
  const rank = Math.min(
    1,
    Math.max(0, ctx.providerRank?.(stream.provider.id) ?? 0.5),
  );
  const last =
    ctx.lastProvider && ctx.lastProvider === stream.provider.id ? 1 : 0;

  // Tried and answering beats merely discovered; tried and not answering goes to the bottom of
  // what is still offered (it may be bound to another address, so it is not hidden).
  const tried = stream.verification?.state;
  if (tried === "failed") reasons.push("did not answer when tried");
  const verified = tried === "verified" ? 1 : tried === "failed" ? 0 : 0.5;

  let score =
    w.language * lang +
    w.quality * quality +
    w.reliability * reliability +
    w.speed * speed +
    w.delivery * DELIVERY_VALUE[delivery] +
    w.rank * rank +
    w.lastPlayed * last +
    (w.verified ?? 0) * verified;
  if (tried === "failed") score *= 0.25;
  return { score: Math.round(score * 100) / 100, playable: true, reasons };
}

/** Best first; unplayable streams last (kept, so the UI can say why they are greyed out). */
export function rankStreams(streams: Stream[], ctx: RankContext): Stream[] {
  return streams
    .map((s) => {
      const r = scoreStream(s, ctx);
      return { ...s, score: r.score, reasons: r.reasons };
    })
    .sort(
      (a, b) =>
        b.score! - a.score! ||
        (b.size ?? 0) - (a.size ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
