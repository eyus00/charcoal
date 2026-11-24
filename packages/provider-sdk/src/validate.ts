/**
 * Checking that a discovered stream actually answers with media, cheaply.
 *
 * An extraction returning a URL proves nothing: the link may be expired, bound to another address,
 * a decoy page, or protected. This module tries it the way a player would begin to: read the
 * manifest, follow it to one media playlist, and ask for the first kilobytes of the first segment
 * (or of the file). It never downloads a video: every read is capped, and at most four requests are
 * made per stream.
 *
 * A check says something about the place it ran from. A link bound to the viewer's address fails
 * from a server and plays at home; that is why a result carries `by`, and why a stream marked
 * `ipBound` is left 'unchecked' anywhere but on the viewer's own connection.
 */
import { classifyStatus, classifyTransport, FAILURES, type FailureCode } from './errors.js';
import { parseDash, parseHls, type HlsPlaylist } from './extract/media.js';
import { isPublicHost } from './policy.js';
import type { Fetcher, FetchResponse, RuntimeDescriptor, StreamType, Verification } from './types.js';

export interface ValidateOptions {
  /** Where the check runs (recorded in the result; decides whether address-bound links are tried). */
  runtime: RuntimeDescriptor;
  signal?: AbortSignal;
  /** Per request. */
  timeoutMs?: number;
  /** Stop after the manifest (no segment request). */
  manifestOnly?: boolean;
  now?: () => number;
}

export interface Checkable {
  url: string;
  type: StreamType;
  headers?: Record<string, string>;
  ipBound?: boolean;
  expiresAt?: number;
}

const MANIFEST_BYTES = 1024 * 1024;
const PROBE_BYTES = 2048;
const DRM_KEYFORMATS = /com\.apple\.streamingkeydelivery|urn:uuid:edef8ba9|com\.widevine|com\.microsoft\.playready/i;

class CheckFailed extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
    readonly level: Verification['level'],
  ) {
    super(message);
  }
}

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};

/** What the first bytes of a media response are, or undefined when they are not recognisably media. */
export function sniffContainer(binary: string): string | undefined {
  if (!binary) return undefined;
  const b = (i: number) => binary.charCodeAt(i) & 0xff;
  const at4 = binary.slice(4, 8);
  if (at4 === 'ftyp' || at4 === 'styp' || at4 === 'moof' || at4 === 'sidx' || at4 === 'moov' || at4 === 'mdat') return 'mp4';
  if (b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3) return 'matroska';
  if (b(0) === 0x47 && (binary.length < 189 || b(188) === 0x47)) return 'mpegts';
  if (binary.startsWith('ID3')) return 'id3';
  if (b(0) === 0xff && (b(1) & 0xf6) === 0xf0) return 'aac';
  if (binary.startsWith('WEBVTT')) return 'vtt';
  // Hosts that disguise segments as images put a real picture header in front of the transport stream.
  if (binary.startsWith('\x89PNG') || (b(0) === 0xff && b(1) === 0xd8) || binary.startsWith('GIF8')) return 'disguised';
  return undefined;
}

const looksLikeHtml = (text: string) => /^\s*(<!doctype html|<html|<head|<body)/i.test(text.slice(0, 300));

/**
 * Tries one stream. Never throws: the outcome, how far it got and why it stopped are in the result.
 */
export async function validateStream(stream: Checkable, fetcher: Fetcher, opts: ValidateOptions): Promise<Verification> {
  const now = opts.now ?? Date.now;
  const started = now();
  const base = { by: opts.runtime.kind, at: started };
  const done = (v: Omit<Verification, 'by' | 'at' | 'ms'>): Verification => ({ ...v, ...base, ms: now() - started });

  if (stream.type === 'frame') return done({ state: 'unchecked', level: 'none', message: 'A player page can only be tried in a browser' });
  if (stream.ipBound && opts.runtime.egress !== 'user') return done({ state: 'unchecked', level: 'none', message: 'The link only works from the address that found it' });
  if (stream.expiresAt && stream.expiresAt <= started) return done({ state: 'failed', level: 'none', code: 'EXPIRED', message: 'The link has already expired' });

  const timeoutMs = opts.timeoutMs ?? 8000;
  const get = async (url: string, extra: { binary?: boolean; maxBytes: number; range?: string }, level: Verification['level']): Promise<FetchResponse> => {
    const host = hostOf(url);
    if (!host || !/^https?:$/.test(new URL(url).protocol) || !isPublicHost(host)) throw new CheckFailed('POLICY', `Refused to try ${host ?? 'an invalid address'}`, level);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = { ...(stream.headers ?? {}), ...(extra.range ? { Range: extra.range } : {}) };
      const res = await fetcher(url, { headers, signal: ctrl.signal, maxBytes: extra.maxBytes, binary: extra.binary });
      const finalHost = hostOf(res.url);
      if (finalHost && !isPublicHost(finalHost)) throw new CheckFailed('POLICY', `Redirected to ${finalHost}`, level);
      const code = classifyStatus(res.status, res.headers, extra.binary ? '' : res.body);
      if (code) throw new CheckFailed(code === 'NOT_FOUND' ? 'EXPIRED' : code, `${FAILURES[code].label} (${host}, ${res.status})`, level);
      return res;
    } catch (e) {
      if (e instanceof CheckFailed) throw e;
      if (opts.signal?.aborted) throw new CheckFailed('CANCELLED', 'Cancelled', level);
      const code = ctrl.signal.aborted ? 'TIMEOUT' : classifyTransport(e);
      throw new CheckFailed(code, `${FAILURES[code].label} (${host})`, level);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  };

  /** The first kilobytes of a segment or file: is it media? */
  const probe = async (url: string, encrypted: boolean, level: 'segment' | 'header') => {
    const res = await get(url, { binary: true, maxBytes: PROBE_BYTES, range: `bytes=0-${PROBE_BYTES - 1}` }, level);
    const contentType = res.headers['content-type'];
    if (!res.body.length) throw new CheckFailed('INVALID_RESULT', 'The media address returned nothing', level);
    const container = sniffContainer(res.body);
    if (!container && !encrypted && (looksLikeHtml(res.body) || /^text\/html/i.test(contentType ?? ''))) {
      // Some hosts label real segments text/html; only the bytes decide.
      if (looksLikeHtml(res.body)) throw new CheckFailed('INVALID_RESULT', 'The media address returned a web page', level);
    }
    const total = Number(res.headers['content-range']?.split('/')[1]) || Number(res.status === 200 ? res.headers['content-length'] : 0) || undefined;
    return { container: container ?? (encrypted ? 'encrypted' : 'unknown'), contentType, size: total };
  };

  try {
    if (stream.type === 'hls') {
      let text: string;
      let baseUrl = stream.url;
      if (stream.url.startsWith('data:')) {
        const comma = stream.url.indexOf(',');
        const meta = stream.url.slice(5, comma);
        const payload = stream.url.slice(comma + 1);
        text = /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
        baseUrl = 'https://invalid.invalid/';
      } else {
        const res = await get(stream.url, { maxBytes: MANIFEST_BYTES }, 'none');
        text = res.body;
        baseUrl = res.url || stream.url;
      }
      let playlist: HlsPlaylist;
      try {
        playlist = parseHls(text, baseUrl);
      } catch {
        throw new CheckFailed('INVALID_RESULT', looksLikeHtml(text) ? 'The playlist address returned a web page' : 'The playlist address did not return a playlist', 'none');
      }
      const detail: NonNullable<Verification['detail']> = {};
      let media = playlist;
      if (playlist.kind === 'master') {
        if (!playlist.variants.length) throw new CheckFailed('INVALID_RESULT', 'The playlist lists no qualities', 'manifest');
        detail.variants = playlist.variants.length;
        detail.maxHeight = playlist.maxHeight;
        detail.codecs = [...new Set(playlist.variants.flatMap((v) => (v.codecs ?? '').split(',').map((c) => c.trim()).filter(Boolean)))];
        detail.audioLanguages = [...new Set(playlist.renditions.filter((r) => r.type === 'AUDIO' && r.language).map((r) => r.language!.toLowerCase()))];
        detail.subtitleLanguages = [...new Set(playlist.renditions.filter((r) => r.type === 'SUBTITLES' && r.language).map((r) => r.language!.toLowerCase()))];
        if (opts.manifestOnly) return done({ state: 'verified', level: 'manifest', detail });
        // The cheapest variant is enough to know the chain works.
        const variant = [...playlist.variants].sort((a, b) => (a.bandwidth ?? Infinity) - (b.bandwidth ?? Infinity))[0];
        const res = await get(variant.url, { maxBytes: MANIFEST_BYTES }, 'manifest');
        try {
          media = parseHls(res.body, res.url || variant.url);
        } catch {
          throw new CheckFailed('INVALID_RESULT', 'A quality in the playlist did not return a playlist', 'manifest');
        }
        if (/#EXT-X-(SESSION-)?KEY:[^\n]*KEYFORMAT="[^"]*"/i.test(text) && DRM_KEYFORMATS.test(text)) throw new CheckFailed('UNSUPPORTED_FORMAT', 'The stream is DRM-protected', 'manifest');
        if (DRM_KEYFORMATS.test(res.body)) throw new CheckFailed('UNSUPPORTED_FORMAT', 'The stream is DRM-protected', 'manifest');
      } else if (DRM_KEYFORMATS.test(text)) {
        throw new CheckFailed('UNSUPPORTED_FORMAT', 'The stream is DRM-protected', 'manifest');
      }
      detail.live = media.live;
      detail.encryption = media.encryption;
      if (media.encryption && /SAMPLE-AES/i.test(media.encryption) && DRM_KEYFORMATS.test(text)) throw new CheckFailed('UNSUPPORTED_FORMAT', 'The stream is DRM-protected', 'manifest');
      if (!media.firstSegment) throw new CheckFailed('INVALID_RESULT', 'The playlist has no media segments', 'manifest');
      if (opts.manifestOnly) return done({ state: 'verified', level: 'manifest', detail });
      const p = await probe(media.firstSegment, !!media.encryption, 'segment');
      return done({ state: 'verified', level: 'segment', detail: { ...detail, container: p.container, contentType: p.contentType } });
    }

    if (stream.type === 'dash') {
      const res = await get(stream.url, { maxBytes: MANIFEST_BYTES }, 'none');
      if (!/<MPD[\s>]/.test(res.body)) throw new CheckFailed('INVALID_RESULT', 'The manifest address did not return a DASH manifest', 'none');
      const mpd = parseDash(res.body);
      if (mpd.protected) throw new CheckFailed('UNSUPPORTED_FORMAT', 'The stream is DRM-protected', 'manifest');
      if (!mpd.representations.length) throw new CheckFailed('INVALID_RESULT', 'The manifest lists no qualities', 'manifest');
      return done({
        state: 'verified',
        level: 'manifest',
        detail: {
          variants: mpd.representations.filter((r) => r.contentType === 'video').length,
          maxHeight: mpd.maxHeight,
          live: mpd.type === 'dynamic',
          codecs: [...new Set(mpd.representations.map((r) => r.codecs).filter((c): c is string => !!c))],
          audioLanguages: [...new Set(mpd.representations.filter((r) => r.contentType === 'audio' && r.lang).map((r) => r.lang!.toLowerCase()))],
        },
      });
    }

    // A file: mp4, mkv, webm.
    const p = await probe(stream.url, false, 'header');
    if (p.container === 'unknown' && !/^(video|audio)\/|octet-stream/i.test(p.contentType ?? '')) throw new CheckFailed('INVALID_RESULT', `The file address returned ${p.contentType ?? 'something that is not video'}`, 'header');
    return done({ state: 'verified', level: 'header', detail: { container: p.container, contentType: p.contentType, size: p.size } });
  } catch (e) {
    if (e instanceof CheckFailed) return done({ state: 'failed', level: e.level, code: e.code, message: e.message });
    return done({ state: 'failed', level: 'none', code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) });
  }
}

/** Tries several streams with bounded concurrency; results are in the same order. */
export async function validateStreams<T extends Checkable>(streams: T[], fetcher: Fetcher, opts: ValidateOptions & { concurrency?: number }): Promise<Verification[]> {
  const out = new Array<Verification>(streams.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= streams.length) return;
      out[i] = await validateStream(streams[i], fetcher, opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, streams.length) }, worker));
  return out;
}

// ---------- verification as part of a result stream ----------

/** A stream found earlier in the same response has now been tried. */
export interface VerifyEvent {
  t: 'verify';
  provider: string;
  /** Stream.id */
  stream: string;
  verification: Verification;
}

export interface VerificationOptions extends ValidateOptions {
  concurrency?: number;
  /** Streams tried per provider result, best first as the provider returned them. */
  maxPerProvider?: number;
  /** How long the end of the response waits for checks still running. */
  graceMs?: number;
  /** Results are reused for this long (the same link is not tried again for every viewer). */
  cacheMs?: number;
  cache?: Map<string, { at: number; v: Verification }>;
  onVerified?: (provider: string, verification: Verification) => void;
}

interface ResultLike {
  t: string;
  provider?: { id: string };
  streams?: (Checkable & { id: string; verification?: Verification })[];
}

/**
 * Passes a response's events through and adds a `verify` event for every stream as it is tried.
 * Results are never held back for their checks: a stream is "discovered" the moment its provider
 * answers and becomes "verified" (or "failed") a moment later. The final `done` event waits, up to
 * `graceMs`, for checks that are still running.
 */
export async function* withVerification<E extends ResultLike>(events: AsyncIterable<E>, fetcher: Fetcher, o: VerificationOptions): AsyncGenerator<E | VerifyEvent> {
  const now = o.now ?? Date.now;
  const limit = o.concurrency ?? 4;
  const queue: (() => Promise<void>)[] = [];
  const ready: VerifyEvent[] = [];
  let running = 0;
  let wake: (() => void) | undefined;
  const notify = () => {
    wake?.();
    wake = undefined;
  };
  const pump = () => {
    while (running < limit && queue.length) {
      running++;
      void queue
        .shift()!()
        .catch(() => undefined)
        .finally(() => {
          running--;
          pump();
          notify();
        });
    }
  };
  const schedule = (provider: string, s: Checkable & { id: string }) => {
    const key = `${s.id}|${s.url}`;
    const hit = o.cache?.get(key);
    if (hit && now() - hit.at < (o.cacheMs ?? 120_000)) return void ready.push({ t: 'verify', provider, stream: s.id, verification: hit.v });
    queue.push(async () => {
      const v = await validateStream(s, fetcher, o);
      if (o.cache) {
        if (o.cache.size > 2000) o.cache.clear();
        if (v.state !== 'unchecked' && v.code !== 'CANCELLED') o.cache.set(key, { at: now(), v });
      }
      if (v.state !== 'unchecked' && v.code !== 'CANCELLED') o.onVerified?.(provider, v);
      ready.push({ t: 'verify', provider, stream: s.id, verification: v });
    });
    pump();
  };

  for await (const e of events) {
    if (e.t === 'done') {
      // Give running checks a moment, handing each over as it lands.
      const deadline = now() + (o.graceMs ?? 6000);
      while ((running || queue.length) && now() < deadline && !o.signal?.aborted) {
        while (ready.length) yield ready.shift()!;
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 100);
        });
      }
      while (ready.length) yield ready.shift()!;
      yield e;
      continue;
    }
    yield e;
    if (e.t === 'result' && e.provider && e.streams?.length) for (const s of e.streams.slice(0, o.maxPerProvider ?? 4)) schedule(e.provider.id, s);
    while (ready.length) yield ready.shift()!;
  }
}
