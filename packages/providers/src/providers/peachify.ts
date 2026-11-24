/**
 * Peachify: six back-ends on two API hosts. An answer is either plain `{ sources, subtitles }` or
 * `{ isEncrypted, data }` with `data` = "iv.ciphertext.tag" (URL-safe base64), AES-GCM under a fixed
 * key. Field names differ between back-ends, so sources are read permissively.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, NotFoundError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { base64ToBytes, base64ToText, decryptOr, gather, hexToBytes, text, xhrHeaders } from './shared.js';

const KEY_HEX_B64 = 'YThmMmExYjVlOWM0NzA4MTRmNmIyYzNhNWQ4ZTdmOWMxYTJiM2M0ZDVlM2Y3YThiOGNhZDFlMmQwYTRkNWM1Yg==';

type Obj = Record<string, unknown>;
interface Answer {
  isEncrypted?: boolean;
  data?: string;
  sources?: Obj[];
  subtitles?: Obj[];
}

export async function decryptAnswer(payload: string): Promise<Answer> {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('expected iv.ciphertext.tag');
  const [iv, ciphertext, tag] = parts.map(base64ToBytes);
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);
  const key = await crypto.subtle.importKey('raw', hexToBytes(base64ToText(KEY_HEX_B64)), { name: 'AES-GCM' }, false, ['decrypt']);
  return JSON.parse(text(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed))) as Answer;
}

const pickString = (o: Obj, keys: string[]): string => {
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
  return '';
};
const pickNumber = (o: Obj, keys: string[]): number | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const m = v.match(/\d{3,4}/);
      if (m) return Number(m[0]);
      if (Number.isFinite(Number(v))) return Number(v);
    }
  }
  return undefined;
};
const headersOf = (o: Obj): Record<string, string> | undefined => {
  const raw = o.headers ?? o.header ?? o.requestHeaders ?? o.httpHeaders;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Obj).filter(([k, v]) => k.trim() && v != null);
  return entries.length ? Object.fromEntries(entries.map(([k, v]) => [k, String(v)])) : undefined;
};

/** [domain role, path] of each back-end. */
const SERVERS: [string, string][] = [
  ['moviebox', '/moviebox'],
  ['api', '/holly'],
  ['api', '/air'],
  ['api', '/multi'],
  ['moviebox', '/net'],
  ['moviebox', '/bmb'],
];

export const peachify = defineProvider({
  manifest: {
    id: 'peachify',
    name: 'Peachify',
    version: '2.0.0',
    description: 'Six back-ends on two API hosts; answers are plain or AES-GCM-sealed JSON.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site', 'api', 'moviebox'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 12_000, maxRequests: 8 },
    rank: 95,
    origin: 'apps/server/src/providers/peachify (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('Peachify: needs a TMDB id');
    const H = xhrHeaders(domain('site'));
    const path = media.kind === 'movie' ? `/movie/${media.ids.tmdb}` : `/tv/${media.ids.tmdb}/${media.season}/${media.episode}`;
    const found = await gather<{ streams: RawStream[]; captions: Caption[] }>(
      SERVERS.map(([role, base]) => async () => {
        const res = await fetch(url(role, `${base}${path}`), { headers: H, signal });
        if (res.status === 404) return null;
        let body = JSON.parse(expectOk(res, 'Peachify').body) as Answer;
        if (body.isEncrypted && body.data) body = await decryptOr('Peachify', () => decryptAnswer(body.data!));
        const streams: RawStream[] = [];
        for (const raw of Array.isArray(body.sources) ? body.sources : []) {
          const u = pickString(raw, ['url', 'src', 'file', 'stream', 'streamUrl', 'playbackUrl']);
          if (!u) continue;
          const kind = pickString(raw, ['type', 'format', 'container']).toLowerCase();
          const dub = pickString(raw, ['dub', 'audio', 'audioName', 'audioLang', 'language', 'lang', 'label', 'name', 'title']);
          const quality = pickNumber(raw, ['quality', 'resolution', 'height', 'res']);
          streams.push({
            url: u,
            type: kind.includes('hls') || kind.includes('m3u8') || u.toLowerCase().includes('.m3u8') ? 'hls' : 'mp4',
            quality: quality ? String(quality) : undefined,
            // "Dubbed" / "Subbed" say nothing about the language; a language name does.
            language: dub && !/^(dubbed|subbed|dub|sub|original)$/i.test(dub) ? dub : undefined,
            size: pickNumber(raw, ['sizeBytes', 'size', 'bytes']),
            headers: headersOf(raw) ?? H,
          });
        }
        if (!streams.length) return null;
        const captions: Caption[] = [];
        for (const raw of Array.isArray(body.subtitles) ? body.subtitles : []) {
          const u = pickString(raw, ['url', 'file', 'src']);
          if (u) captions.push({ url: u, label: pickString(raw, ['label', 'name', 'language']) || 'Subtitles', lang: pickString(raw, ['langCode', 'lang']) || undefined, format: 'vtt', headers: H });
        }
        return { streams, captions };
      }),
      signal,
    );
    if (!found.length) throw new NotFoundError('Peachify: no back-end has this title');
    return { streams: found.flatMap((f) => f.streams), captions: found.flatMap((f) => f.captions) };
  },
});
