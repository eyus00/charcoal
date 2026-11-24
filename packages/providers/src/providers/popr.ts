/**
 * Popr: ten named servers behind one endpoint; each answers with one stream and its subtitles. The
 * site lists streams that no longer work, so each is opened (a few kilobytes) before it is offered.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, NotFoundError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { BROWSER_UA, gather } from './shared.js';

const SERVERS = ['default', 'catflix', 'hexa', 'Gama', 'Liligoon', 'Sigma', 'Prime', 'Alfa', 'Lamda', 'ynx_vidsrc'];
/** Values the site puts in "quality" that are not qualities. */
const LANGUAGE_LABELS = ['Hindi', 'English'];
const NOT_QUALITY = [...LANGUAGE_LABELS, 'MAIN'];

interface Answer {
  results?: { streams?: { url?: string; quality?: string; headers?: Record<string, string> }[]; subtitles?: { url?: string; lang?: string }[] }[];
}

export const popr = defineProvider({
  manifest: {
    id: 'popr',
    name: 'Popr',
    version: '2.0.0',
    description: 'Ten named servers behind one endpoint; every stream is opened before it is offered.',
    kinds: ['movie', 'tv'],
    languages: ['en', 'hi'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 24 },
    rank: 90,
    origin: 'apps/server/src/providers/popr (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('Popr: needs a TMDB id');
    const H = { 'User-Agent': BROWSER_UA, Referer: `${domain('site')}/` };
    const address = (server: string) =>
      media.kind === 'tv'
        ? url('site', `/api/vidnest?id=${media.ids.tmdb}&type=tv&server=${server}&season=${media.season}&episode=${media.episode}`)
        : url('site', `/api/vidnest?id=${media.ids.tmdb}&type=movie${server !== 'default' ? `&server=${server}` : ''}`);

    const found = await gather<{ stream: RawStream; captions: Caption[] }>(
      SERVERS.map((server) => async () => {
        const res = await fetch(address(server), { headers: H, signal });
        if (res.status === 404) return null;
        const data = JSON.parse(expectOk(res, 'Popr').body) as Answer;
        const s = data.results?.[0]?.streams?.[0];
        if (!s?.url) return null;
        const headers = { ...H, ...(s.headers ?? {}) };
        // Open it: a playlist must list segments, a file must not be a web page. Never the whole file.
        const probe = await fetch(s.url, { headers, signal, maxBytes: 65_536 });
        if (probe.status < 200 || probe.status >= 300) return null;
        const type = /video\/(mp4|webm)/i.test(probe.headers['content-type'] ?? '') ? 'mp4' : probe.body.trimStart().startsWith('#EXTM3U') ? 'hls' : /^\s*(<!doctype html|<html)/i.test(probe.body) ? null : 'mp4';
        if (!type) return null;
        if (type === 'hls' && !probe.body.split('\n').some((l) => l.trim() && !l.trim().startsWith('#'))) return null;
        const quality = s.quality ?? '';
        return {
          stream: { url: s.url, type, quality: NOT_QUALITY.includes(quality) ? undefined : quality || undefined, language: LANGUAGE_LABELS.includes(quality) ? quality : 'English', headers, note: server },
          captions: (data.results?.[0]?.subtitles ?? []).filter((c) => c?.url).map((c): Caption => ({ url: c.url!, label: c.lang || 'Subtitles', format: 'vtt' })),
        };
      }),
      signal,
    );
    if (!found.length) throw new NotFoundError('Popr: no working server');
    const captions = new Map<string, Caption>();
    for (const f of found) for (const c of f.captions) if (!captions.has(c.url)) captions.set(c.url, c);
    return { streams: found.map((f) => f.stream), captions: [...captions.values()] };
  },
});
