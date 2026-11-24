/**
 * Small helpers the ported providers share: browser-like headers, byte and base64 handling
 * without Node's Buffer (so the same file runs in a page), and running several "servers" of one
 * provider side by side without losing the reason they failed.
 */
import { ProviderError, type CaptionFormat, type FailureCode, type StreamType } from '@charcoal/provider-sdk';

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Headers of an XHR made by a page on `site`. */
export const xhrHeaders = (site: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'User-Agent': BROWSER_UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${site.replace(/\/$/, '')}/`,
  Origin: site.replace(/\/$/, ''),
  ...extra,
});

export function streamType(url: string, hint = ''): StreamType {
  const t = hint.toLowerCase();
  const u = url.toLowerCase().split('?')[0];
  if (t.includes('hls') || t.includes('m3u8') || u.endsWith('.m3u8') || url.toLowerCase().includes('.m3u8')) return 'hls';
  if (t.includes('dash') || u.endsWith('.mpd')) return 'dash';
  if (t.includes('mkv') || u.endsWith('.mkv')) return 'mkv';
  if (t.includes('webm') || u.endsWith('.webm')) return 'webm';
  if (t.includes('mp4') || u.endsWith('.mp4')) return 'mp4';
  return 'hls';
}

export function captionFormat(url: string): CaptionFormat {
  const u = url.toLowerCase().split('?')[0];
  for (const f of ['srt', 'ass', 'ssa', 'ttml'] as const) if (u.endsWith(`.${f}`)) return f;
  return 'vtt';
}

/** "1080p", "FHD 1080", 1080 → "1080"; anything without a height → undefined (the platform detects it). */
export function qualityOf(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  if (/\b(4k|2160)/i.test(value)) return '2160';
  return value.match(/\b(1440|1080|720|576|480|360|240)\b/)?.[1] ?? value.match(/(\d{3,4})p/i)?.[1];
}

// ---------- bytes ----------

export const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
export const text = (b: ArrayBuffer | Uint8Array): string => new TextDecoder().decode(b);

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(bin);
}

export const base64Url = (bytes: ArrayBuffer | Uint8Array) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const base64ToText = (b64: string) => text(base64ToBytes(b64));

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2) throw new ProviderError('STRUCTURE_CHANGED', 'A hex value has an odd length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const bytesToHex = (bytes: ArrayBuffer | Uint8Array) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** A decryption that fails means the site changed its scheme: say so, rather than "not found". */
export async function decryptOr<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('STRUCTURE_CHANGED', `${what}: the response could not be decrypted (the site changed its scheme)`, { step: 'decrypt' });
  }
}

// ---------- several servers of one provider ----------

/** Which failure says most about why nothing came back, most telling first. */
const TELLING: FailureCode[] = ['CHALLENGE', 'ACCESS_DENIED', 'AUTH_REQUIRED', 'RATE_LIMITED', 'REDIRECTED', 'STRUCTURE_CHANGED', 'SELECTOR_MISSING', 'INVALID_RESULT', 'UNSUPPORTED_FORMAT', 'EXPIRED', 'DNS', 'TLS', 'CONNECT', 'TIMEOUT', 'NETWORK', 'HTTP', 'POLICY', 'INTERNAL', 'NOT_FOUND'];

/**
 * Runs the tasks side by side and returns what the successful ones produced. One server failing
 * never fails the provider. But when NONE produced anything and some failed, the most telling
 * failure is thrown, so an outage or a block is not reported as "this title isn't here".
 */
export async function gather<T>(tasks: (() => Promise<T | null | undefined>)[], signal: AbortSignal): Promise<T[]> {
  const settled = await Promise.allSettled(tasks.map((t) => t()));
  if (signal.aborted) throw new ProviderError('CANCELLED');
  const values: T[] = [];
  const errors: unknown[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value !== null && s.value !== undefined) values.push(s.value);
    } else errors.push(s.reason);
  }
  if (values.length || !errors.length) return values;
  const typed = errors.filter((e): e is ProviderError => e instanceof ProviderError);
  if (typed.some((e) => e.code === 'CANCELLED')) throw new ProviderError('CANCELLED');
  // An untyped error (a response of an unexpected shape) is left for the platform to diagnose.
  const untyped = errors.find((e) => !(e instanceof ProviderError));
  const best = typed.sort((a, b) => TELLING.indexOf(a.code) - TELLING.indexOf(b.code))[0];
  if (best && (best.code !== 'NOT_FOUND' || !untyped)) throw best;
  throw untyped ?? best;
}
