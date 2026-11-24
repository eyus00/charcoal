/**
 * Tulnex: fourteen named back-ends behind one API. Each answers `{ payload }`, a JSON document
 * wrapped in four layers (HMAC envelope, PBKDF2 + AES-CBC, a binary-digit encoding, an XOR pad).
 * The decoded documents come in many shapes; `pickStream` knows them in order of preference.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, NotFoundError, type RawStream } from '@charcoal/provider-sdk';
import { base64ToBytes, base64ToText, bytesToHex, decryptOr, gather, hexToBytes, text, utf8 } from './shared.js';

const L1_KEY = 'U24wMHBEMGcjTDFfWDBSX000c3QzckszeSEyMDI2c2V4';
const L1_SALT = 'eEs5IW1SMkBwTDUjblE4c2V4';
const L3_KEY = 'U24wMHBEMGcjTDNfQUVTX1MzY3VyM0szeUAyMDI2JHNleA==';
const L4_KEY = 'U24wMHBEMGcjTDRfSE1BQ19GMW40bFc0bGwjMjAyNiFzZXg=';

async function pbkdf2(pass: string, salt: string, iterations: number, hash: string): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey('raw', utf8(pass), { name: 'PBKDF2' }, false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: utf8(salt), iterations, hash }, material, 256));
}

let xorKey: Promise<Uint8Array> | undefined;

export async function decryptPayload(payload: string): Promise<unknown> {
  // Layer 4: "<hex hmac>|<base64 body>", HMAC-SHA-512 over the decoded body.
  const sep = payload.indexOf('|');
  if (sep === -1) throw new Error('L4: no separator');
  const body = base64ToText(payload.slice(sep + 1));
  const hmacKey = await crypto.subtle.importKey('raw', utf8(base64ToText(L4_KEY)), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  if (payload.slice(0, sep) !== bytesToHex(await crypto.subtle.sign('HMAC', hmacKey, utf8(body)))) throw new Error('L4: HMAC mismatch');

  // Layer 3: "iv.salt.ciphertext" (base64 each), AES-CBC under PBKDF2-SHA-512.
  const [iv, salt, ct] = body.split('.');
  if (!iv || !salt || !ct) throw new Error('L3: bad shape');
  const aesKey = await crypto.subtle.importKey('raw', await pbkdf2(base64ToText(L3_KEY), atob(salt), 100_000, 'SHA-512'), { name: 'AES-CBC' }, false, ['decrypt']);
  const l3 = text(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: base64ToBytes(iv) }, aesKey, base64ToBytes(ct)));

  // Layer 2: base64 of space-separated binary numbers, each a character.
  const l2 = atob(l3)
    .split(' ')
    .map((bits) => String.fromCharCode(parseInt(bits, 2)))
    .join('');

  // Layer 1: hex, XOR with a PBKDF2-SHA-256 pad (the same for every answer, so derived once).
  const pad = await (xorKey ??= pbkdf2(base64ToText(L1_KEY), base64ToText(L1_SALT), 50_000, 'SHA-256'));
  const src = hexToBytes(l2);
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] ^ pad[i % 32];
  return JSON.parse(text(out));
}

type Obj = Record<string, unknown>;
type Headers = Record<string, string> | undefined;
const isUrl = (v: unknown): v is string => typeof v === 'string' && v.includes('http');
const height = (o: Obj) => parseInt((typeof o.quality === 'string' ? o.quality : '').replace('p', '') || '0', 10);

/** The stream a decoded document points at, trying its known shapes in order. */
export function pickStream(data: unknown): { url: string; headers?: Record<string, string> } | null {
  if (!data) return null;
  if (isUrl(data)) return { url: data };
  if (typeof data !== 'object') return null;
  const d = data as Obj;
  const headers = (d.headers as Headers) ?? undefined;
  const wrap = (url: unknown, h: Headers = headers) => (isUrl(url) ? { url, headers: h } : null);
  for (const key of ['url', 'stream', 'playlist', 'streamUrl', 'stream_url', 'streaming_url', 'video_url', 'm3u8']) if (isUrl(d[key])) return wrap(d[key]);

  const primary = (d.sources as Obj | undefined)?.primary as Obj | undefined;
  if (primary?.url) return wrap(primary.url, (primary.headers as Headers) ?? headers);
  if (Array.isArray(d.sources) && d.sources.length) {
    const best = (d.sources as Obj[]).filter((s) => isUrl(s.url)).sort((a, b) => height(b) - height(a))[0];
    if (best) return wrap(best.url, (best.headers as Headers) ?? headers);
  }
  if (Array.isArray(d.languages)) {
    const original = (d.languages as Obj[]).find((l) => l.original === true && Array.isArray(l.sources) && l.sources.length);
    if (original) {
      const best = [...(original.sources as Obj[])].sort((a, b) => height(b) - height(a))[0];
      return wrap(best.url ?? best.file, (best.headers as Headers) ?? (original.headers as Headers) ?? headers);
    }
  }
  if (Array.isArray(d.links)) {
    const link = (d.links as Obj[]).find((l) => isUrl(l.url));
    if (link) return wrap(link.url);
  }
  const nested = d.data as Obj | undefined;
  const inner = nested?.data as Obj | undefined;
  if (inner?.stream) return wrap((inner.stream as Obj).playlist);
  if (nested?.stream) return wrap((nested.stream as Obj).playlist);
  if (isUrl(nested?.url)) return wrap(nested!.url, (nested!.headers as Headers) ?? headers);
  if (Array.isArray(nested?.sources)) {
    const src = (nested!.sources as Obj[]).find((s) => isUrl(s.url));
    if (src) return wrap(src.url, (src.headers as Headers) ?? headers);
  }
  if (Array.isArray(d.streams)) {
    const src = (d.streams as Obj[]).find((s) => isUrl(s.url) || isUrl(s.link));
    if (src) return wrap(src.url ?? src.link, (src.headers as Headers) ?? headers);
  }
  return null;
}

const SERVERS = ['onion', 'vidzee', 'icefy', 'tik', 'vaplayer', 'vidfast-alpha', 'uniquestream', 'vidfast-mega', 'vidfast-vrapid', 'allmovies', 'vidlink', 'vidfast-vedge', 'vidfast-vfast', 'moviebox'];

export const tulnex = defineProvider({
  manifest: {
    id: 'tulnex',
    name: 'Tulnex',
    version: '2.0.0',
    description: 'Fourteen named back-ends behind one API; answers are JSON wrapped in four layers.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    domainRoles: ['api'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 16 },
    rank: 85,
    origin: 'apps/server/src/providers/tulnex (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('Tulnex: needs a TMDB id');
    const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Cache-Control': 'no-cache' };
    const path = media.kind === 'movie' ? `movie/${media.ids.tmdb}` : `tv/${media.ids.tmdb}/${media.season}/${media.episode}`;
    const found = await gather<RawStream>(
      SERVERS.map((server) => async () => {
        const res = await fetch(url('api', `/${server}/${path}`), { headers: H, signal });
        if (res.status === 404) return null;
        const body = JSON.parse(expectOk(res, 'Tulnex').body) as { payload?: string };
        if (typeof body.payload !== 'string') return null;
        const picked = pickStream(await decryptOr('Tulnex', () => decryptPayload(body.payload!)));
        if (!picked) return null;
        return { url: picked.url, type: picked.url.includes('mkv') || picked.url.includes('mp4') ? 'mp4' : 'hls', headers: picked.headers, note: server };
      }),
      signal,
    );
    if (!found.length) throw new NotFoundError('Tulnex: no back-end has this title');
    return { streams: found };
  },
});
