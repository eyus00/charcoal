/**
 * VidZee: a key endpoint gives an AES-GCM-wrapped key; up to fourteen numbered servers each give
 * AES-CBC-encrypted links ("iv:ciphertext", base64 inside base64) and subtitle tracks.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { base64ToBytes, base64ToText, decryptOr, gather, text, utf8, xhrHeaders } from './shared.js';

const KEY_SECRET = '4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c';
const SERVERS = 14;

/** The key endpoint's payload is nonce(12) + tag(16) + ciphertext, AES-GCM under SHA-256 of a fixed secret. */
export async function deriveKey(payload: string): Promise<string> {
  const bytes = base64ToBytes(payload);
  if (bytes.length <= 28) throw new Error('short key payload');
  const nonce = bytes.slice(0, 12);
  const tag = bytes.slice(12, 28);
  const body = bytes.slice(28);
  const sealed = new Uint8Array(body.length + tag.length);
  sealed.set(body, 0);
  sealed.set(tag, body.length);
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8(KEY_SECRET)), { name: 'AES-GCM' }, false, ['decrypt']);
  return text(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, sealed));
}

/** A link is base64("base64(iv):base64(ciphertext)"), AES-CBC under the key zero-padded to 32 bytes. */
export async function decryptLink(encrypted: string, key: string): Promise<string> {
  const [iv, cipher] = base64ToText(encrypted).split(':');
  if (!iv || !cipher) throw new Error('bad link');
  const raw = new Uint8Array(32);
  raw.set(utf8(key).slice(0, 32));
  const aes = await crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['decrypt']);
  return text(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: base64ToBytes(iv) }, aes, base64ToBytes(cipher)));
}

interface ServerResponse {
  url?: { link?: string; lang?: string; type?: string }[];
  tracks?: { lang?: string; url?: string }[];
  serverInfo?: { number?: number };
}

export const vidzee = defineProvider({
  manifest: {
    id: 'vidzee',
    name: 'VidZee',
    version: '2.0.0',
    description: 'A wrapped key plus fourteen numbered servers that answer with encrypted links.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['api', 'player'],
    followDiscovered: true,
    output: { types: ['hls'] },
    limits: { timeoutMs: 12_000, maxRequests: 20 },
    rank: 105,
    origin: 'apps/server/src/providers/vidzee (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('VidZee: needs a TMDB id');
    const H = xhrHeaders(domain('player'));
    const keyRes = await fetch(url('api', '/api-key'), { headers: H, signal });
    // The key endpoint answering 404 is not "title not found": the site has moved or removed it.
    if (keyRes.status === 404) throw new ProviderError('STRUCTURE_CHANGED', 'VidZee: the key endpoint is gone', { step: 'api-key', status: 404 });
    const key = await decryptOr('VidZee key', () => deriveKey(expectOk(keyRes, 'VidZee key').body.trim()));

    const episode = media.kind === 'tv' ? `&ss=${media.season}&ep=${media.episode}` : '';
    const responses = await gather<ServerResponse>(
      Array.from({ length: SERVERS }, (_, n) => async () => {
        const res = await fetch(url('player', `/api/server?id=${media.ids.tmdb}&sr=${n}${episode}`), { headers: H, signal });
        if (res.status !== 200) return expectOk(res, 'VidZee server') && null;
        // The player app answers unknown routes with its HTML shell: the API route no longer exists.
        if (/^\s*</.test(res.body)) throw new ProviderError('STRUCTURE_CHANGED', 'VidZee: the server API now returns a page', { step: 'api/server' });
        return JSON.parse(res.body) as ServerResponse;
      }),
      signal,
    );
    const links = new Set<string>();
    const captions = new Map<string, Caption>();
    for (const r of responses) {
      for (const u of r.url ?? []) {
        if (!u?.link) continue;
        const link = await decryptLink(u.link, key).catch(() => '');
        if (link.startsWith('http')) links.add(link);
      }
      for (const t of r.tracks ?? []) if (t?.url && t.lang && !captions.has(`${t.lang}_${r.serverInfo?.number}`)) captions.set(`${t.lang}_${r.serverInfo?.number}`, { url: t.url, label: t.lang.replace(/\d+/g, '').trim(), format: 'vtt', headers: H });
    }
    if (!links.size) {
      if (responses.some((r) => (r.url ?? []).some((u) => u?.link))) throw new ProviderError('STRUCTURE_CHANGED', 'VidZee: links could not be decrypted', { step: 'decrypt' });
      throw new NotFoundError('VidZee: no working servers');
    }
    const headersFor = (link: string): Record<string, string> => (link.includes('fast33lane') ? { Referer: 'https://rapidairmax.site/', Origin: 'https://rapidairmax.site' } : link.includes('serversicuro.cc') ? {} : { ...H, Referer: `${domain('api')}/` });
    const streams: RawStream[] = [...links].map((link) => ({ url: link, type: 'hls', language: link.includes('phim1280.tv') ? 'Vietnamese' : 'English', headers: headersFor(link) }));
    return { streams, captions: [...captions.values()] };
  },
});
