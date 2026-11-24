/**
 * The source normaliser: whatever shape a provider answers in, a client only ever sees `Stream`.
 * It validates, fills in what can be detected (type, quality, language, expiry), gives every
 * stream a stable id, and finds duplicates across providers.
 */
import { detectExpiry, detectQuality, sniffStreamType } from './extract/media.js';
import type { AudioInfo, Caption, RawStream, RuntimeKind, SourceResult, Stream, StreamType } from './types.js';

/** FNV-1a, twice with different seeds: a short stable id, not a security hash. */
export function hashId(input: string): string {
  const round = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return round(0x811c9dc5) + round(0x01234567);
}

const TOKEN_PARAM = /^(token|tok|t|sig|signature|sign|hash|md5|key|auth|expires?|exp|e|validto|st|ip|h|hdnts|hdnea|policy|x-amz-.*|.*-signature)$/i;

/**
 * What a stream URL points at, without the parts that change between resolves (tokens, expiry,
 * signatures). Two providers handing out the same file get the same key.
 */
export function upstreamKey(url: string): string {
  if (url.startsWith('data:')) return `data:${hashId(url)}`;
  try {
    const u = new URL(url);
    const kept = [...u.searchParams.entries()].filter(([k]) => !TOKEN_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const query = kept.map(([k, v]) => `${k}=${v}`).join('&');
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/{2,}/g, '/')}${query ? `?${query}` : ''}`;
  } catch {
    return url;
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'en', hindi: 'hi', tamil: 'ta', telugu: 'te', malayalam: 'ml', kannada: 'kn', bengali: 'bn', marathi: 'mr', punjabi: 'pa', gujarati: 'gu', urdu: 'ur',
  spanish: 'es', latino: 'es', castellano: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', russian: 'ru', japanese: 'ja', korean: 'ko',
  chinese: 'zh', mandarin: 'zh', cantonese: 'zh', arabic: 'ar', turkish: 'tr', polish: 'pl', dutch: 'nl', indonesian: 'id', thai: 'th', vietnamese: 'vi',
  hungarian: 'hu', czech: 'cs', greek: 'el', hebrew: 'he', swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', romanian: 'ro', ukrainian: 'uk',
};

/** ISO 639-1 code for a language name or code ("Hindi", "hin", "pt-BR" → "hi", "hi", "pt"); 'und' when unknown. */
export function languageCode(value: string | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  if (!v || /^(und|unknown|original|ost|default|auto)$/.test(v)) return 'und';
  if (LANGUAGE_NAMES[v]) return LANGUAGE_NAMES[v];
  const three: Record<string, string> = { eng: 'en', hin: 'hi', tam: 'ta', tel: 'te', mal: 'ml', kan: 'kn', ben: 'bn', mar: 'mr', pan: 'pa', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', rus: 'ru', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', ara: 'ar', tur: 'tr' };
  if (three[v]) return three[v];
  const code = /^([a-z]{2})(?:[-_][a-z0-9]{2,4})?$/.exec(v);
  if (code) return code[1];
  const word = Object.keys(LANGUAGE_NAMES).find((n) => new RegExp(`\\b${n}\\b`).test(v));
  return word ? LANGUAGE_NAMES[word] : 'und';
}

function audioOf(raw: RawStream): AudioInfo[] {
  if (raw.audio?.length) return raw.audio.map((a) => ({ ...a, lang: languageCode(a.lang) === 'und' ? languageCode(a.label) : languageCode(a.lang) }));
  const lang = languageCode(raw.languageCode) !== 'und' ? languageCode(raw.languageCode) : languageCode(raw.language);
  return [{ lang, label: raw.language }];
}

const QUALITIES = new Set(['2160', '1440', '1080', '720', '480', '360', '240', 'auto', 'original']);

function qualityOf(raw: RawStream): string {
  const q = String(raw.quality ?? '').toLowerCase().trim();
  if (QUALITIES.has(q)) return q;
  if (/^4k$|^uhd$/.test(q)) return '2160';
  if (/orig/.test(q)) return 'original';
  const fromField = q ? detectQuality(q.replace(/^(\d{3,4})$/, '$1p')) : undefined;
  if (fromField) return fromField;
  if (raw.video?.height) return detectQuality(`${raw.video.height}p`) ?? 'auto';
  return detectQuality(raw.note ?? '') ?? detectQuality(safePath(raw.url)) ?? 'auto';
}

const safePath = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return '';
  }
};

export interface NormalizeContext {
  provider: { id: string; name: string; version: string };
  runtime: RuntimeKind;
  now?: number;
}

const TYPES = new Set<StreamType>(['hls', 'dash', 'mp4', 'mkv', 'webm', 'frame']);

/** One raw stream → a Stream, or a reason it can't be used. */
export function normalizeStream(raw: RawStream, ctx: NormalizeContext): Stream | { rejected: string } {
  const now = ctx.now ?? Date.now();
  if (!raw || typeof raw.url !== 'string' || !raw.url) return { rejected: 'no url' };
  const isData = raw.url.startsWith('data:application/vnd.apple.mpegurl') || raw.url.startsWith('data:application/x-mpegurl');
  if (!isData) {
    let u: URL;
    try {
      u = new URL(raw.url);
    } catch {
      return { rejected: 'not an absolute url' };
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { rejected: `unsupported scheme ${u.protocol}` };
  }
  const type = TYPES.has(raw.type) ? raw.type : (isData ? 'hls' : sniffStreamType(raw.url));
  if (!type) return { rejected: 'unknown stream type' };
  const expiresAt = raw.expiresAt ?? (isData ? undefined : detectExpiry(raw.url, now));
  if (expiresAt !== undefined && expiresAt <= now) return { rejected: 'already expired' };
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.headers ?? {})) if (typeof v === 'string' && v) headers[k] = v;
  const dedupKey = upstreamKey(raw.url);
  const { quality: _q, audio: _a, headers: _h, language: _l, languageCode: _c, ...rest } = raw;
  void _q, void _a, void _h, void _l, void _c;
  return {
    ...rest,
    type,
    id: `${ctx.provider.id}:${hashId(`${ctx.provider.id}|${dedupKey}`)}`,
    dedupKey,
    quality: qualityOf(raw),
    headers,
    audio: audioOf(raw),
    expiresAt,
    provider: ctx.provider,
    runtime: ctx.runtime,
  };
}

export interface NormalizedResult {
  streams: Stream[];
  captions: Caption[];
  /** Why raw streams were dropped. */
  rejected: string[];
}

export function normalizeResult(result: SourceResult | undefined, ctx: NormalizeContext): NormalizedResult {
  const out: NormalizedResult = { streams: [], captions: [], rejected: [] };
  const seen = new Set<string>();
  for (const raw of result?.streams ?? []) {
    const s = normalizeStream(raw, ctx);
    if ('rejected' in s) out.rejected.push(s.rejected);
    else if (!seen.has(s.id)) {
      seen.add(s.id);
      out.streams.push(s);
    }
  }
  const urls = new Set<string>();
  for (const c of result?.captions ?? []) {
    if (!c || typeof c.url !== 'string' || !/^https?:/.test(c.url) || urls.has(c.url)) continue;
    urls.add(c.url);
    const format = c.format ?? (/\.srt(\?|$)/i.test(c.url) ? 'srt' : 'vtt');
    out.captions.push({ ...c, format, label: c.label || 'Unknown', lang: c.lang ?? (languageCode(c.label) === 'und' ? undefined : languageCode(c.label)) });
  }
  return out;
}

/**
 * Adds newly found streams to a list, folding duplicates: the same upstream file from two
 * providers is one entry (the first one found stays; `better` can prefer the newcomer).
 */
export function mergeStreams(existing: Stream[], incoming: Stream[], better?: (candidate: Stream, current: Stream) => boolean): Stream[] {
  const out = [...existing];
  const index = new Map(out.map((s, i) => [s.dedupKey, i]));
  for (const s of incoming) {
    const at = index.get(s.dedupKey);
    if (at === undefined) {
      index.set(s.dedupKey, out.length);
      out.push(s);
    } else if (better?.(s, out[at])) out[at] = s;
  }
  return out;
}

export function mergeCaptions(existing: Caption[], incoming: Caption[]): Caption[] {
  const urls = new Set(existing.map((c) => c.url));
  return [...existing, ...incoming.filter((c) => !urls.has(c.url) && urls.add(c.url))];
}
