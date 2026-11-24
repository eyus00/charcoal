/**
 * MafiaEmbed (StreamMafia): a session cookie, then a token, then an AES-256-GCM-sealed answer that
 * names an HLS stream and "switches" (other audio versions), each of which is one more sealed call.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, extract, getJson, NotFoundError, ProviderError, type RawStream } from '@charcoal/provider-sdk';
import { base64ToBytes, BROWSER_UA, decryptOr, gather, qualityOf, streamType, text, utf8 } from './shared.js';

const SECRET = 'Z9#rL!v2K*5qP&7mXw';

interface Sealed {
  iv: string;
  tag: string;
  data: string;
}
interface Answer {
  selected?: { lang_code?: string; lang?: string };
  switches?: { file_code?: string; lang_code?: string; lang?: string }[];
  stream?: { hls_streaming?: string; download?: { quality?: string; url?: string }[] };
}

export async function unseal(payload: Sealed): Promise<Answer> {
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8(SECRET)), { name: 'AES-GCM' }, false, ['decrypt']);
  const data = base64ToBytes(payload.data);
  const tag = base64ToBytes(payload.tag);
  const sealed = new Uint8Array(data.length + tag.length);
  sealed.set(data, 0);
  sealed.set(tag, data.length);
  return JSON.parse(text(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv), tagLength: 128 }, key, sealed))) as Answer;
}

export const streammafia = defineProvider({
  manifest: {
    id: 'streammafia',
    name: 'MafiaEmbed',
    version: '2.0.0',
    description: 'A session cookie and a token unlock a sealed answer naming an HLS stream and its other audio versions.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'app'],
    // The session is a cookie the site sets and expects back.
    requires: { features: ['forbidden-headers', 'cookies'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 24 },
    rank: 100,
    origin: 'apps/server/src/providers/streammafia (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain, discovered }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('MafiaEmbed: needs a TMDB id');
    const site = domain('site');
    const H: Record<string, string> = { 'User-Agent': BROWSER_UA, Accept: 'application/json, text/javascript, */*; q=0.01', 'Accept-Language': 'en-US,en;q=0.9', Referer: `${site}/`, Origin: site, 'x-content-id': media.ids.tmdb };

    const session = expectOk(await fetch(url('site', '/api/session'), { method: 'POST', headers: H, signal }), 'MafiaEmbed session');
    const cookie = (session.headers['set-cookie'] ?? '').split(';')[0];
    if (!cookie) throw new ProviderError('STRUCTURE_CHANGED', 'MafiaEmbed: the session call set no cookie', { step: 'session' });
    H.Cookie = cookie;
    const token = (await getJson<{ token?: string }>(fetch, url('site', '/api/token'), { headers: H, signal }, 'MafiaEmbed token')).token;
    if (!token) throw new ProviderError('STRUCTURE_CHANGED', 'MafiaEmbed: no token in the answer', { step: 'token' });
    H['x-api-token'] = token;

    const sealedCall = async (path: string) => {
      const sealed = await getJson<Sealed>(fetch, url('site', path), { headers: H, signal }, 'MafiaEmbed');
      const answer = await decryptOr('MafiaEmbed', () => unseal(sealed));
      // The playlist host is only named inside the sealed answer.
      discovered(JSON.stringify(answer));
      return answer;
    };
    const toStreams = async (a: Answer, language?: string): Promise<RawStream[]> => {
      const out: RawStream[] = [];
      const hls = a.stream?.hls_streaming;
      if (hls) {
        // Read the playlist once for its top quality and its audio languages (best effort).
        let quality: string | undefined;
        let audio: RawStream['audio'];
        try {
          const res = await fetch(hls, { headers: { 'User-Agent': BROWSER_UA, Referer: `${site}/` }, signal });
          if (res.status === 200) {
            const p = extract.parseHls(res.body, hls);
            quality = p.maxHeight ? String(p.maxHeight) : undefined;
            const tracks = p.renditions.filter((r) => r.type === 'AUDIO' && r.language);
            if (tracks.length) audio = tracks.map((r) => ({ lang: r.language!.toLowerCase().slice(0, 2), label: r.name }));
          }
        } catch (e) {
          if (e instanceof ProviderError && e.code === 'CANCELLED') throw e;
        }
        out.push({ url: hls, type: 'hls', quality, audio, language: audio ? undefined : language });
      }
      for (const d of a.stream?.download ?? []) if (d?.url) out.push({ url: d.url, type: streamType(d.url), quality: qualityOf(d.quality), language });
      return out;
    };

    const main = await sealedCall(media.kind === 'movie' ? `/api/movie/?id=${media.ids.tmdb}` : `/api/?tv=${media.ids.tmdb}&season=${media.season}&episode=${media.episode}`);
    const streams = await toStreams(main, main.selected?.lang ?? main.selected?.lang_code);
    const others = await gather<RawStream[]>(
      (main.switches ?? []).filter((sw) => sw?.file_code).map((sw) => async () => toStreams(await sealedCall(`/api/source/${sw.file_code}`), sw.lang ?? sw.lang_code)),
      signal,
    ).catch((e) => {
      // The main answer already has a stream: another audio version failing is not fatal.
      if (streams.length && !(e instanceof ProviderError && e.code === 'CANCELLED')) return [] as RawStream[][];
      throw e;
    });
    const seen = new Set<string>();
    const all = [...streams, ...others.flat()].filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
    if (!all.length) throw new NotFoundError('MafiaEmbed: no playable sources');
    return { streams: all };
  },
});
