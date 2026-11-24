/**
 * FshareTV (films only): the film's page, found by IMDb id, links to a watch page; the watch page
 * names a source id; an API call for that id lists files by quality, with backups and alternatives.
 * Ported from the server-only class (cinepro-org/core lineage).
 */
import { defineProvider, expectOk, getJson, NotFoundError, ProviderError, type RawStream } from '@charcoal/provider-sdk';
import { BROWSER_UA, qualityOf, streamType } from './shared.js';

const TRAILER = 'Png81APqcxU';
const SOURCE_ID = [/Movie\.setSource\("([^"]+)"/, /setSource\("([^"]+)"/, /setSource\('([^']+)'/, /"source_id"\s*:\s*"([^"]+)"/, /source_id\s*=\s*"([^"]+)"/, /file_id\s*=\s*"([^"]+)"/, /"file_id"\s*:\s*"([^"]+)"/];

interface File {
  src?: string;
  type?: string;
  label?: string;
  quality?: string | number;
}
interface Answer {
  status?: string;
  data?: { file?: { sources?: File[]; backups?: File[]; alternatives?: File[][] } };
}

export const fsharetv = defineProvider({
  manifest: {
    id: 'fsharetv',
    name: 'FshareTV',
    version: '2.0.0',
    description: 'Films by IMDb id: film page, watch page, then an API listing files by quality.',
    kinds: ['movie'],
    lookup: ['imdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['mp4', 'hls', 'webm', 'mkv'] },
    limits: { timeoutMs: 12_000, maxRequests: 5 },
    rank: 90,
    origin: 'apps/server/src/providers/fshare (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain }) {
    if (media.kind !== 'movie' || !media.ids.imdb) throw new NotFoundError('FshareTV: needs a film with an IMDb id');
    const site = domain('site');
    const H = { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', Referer: site };

    const film = expectOk(await fetch(url('site', `/movie/${media.ids.imdb}`), { headers: H, signal }), 'FshareTV');
    const watchPath = film.body.match(/href="(\/w\/[^"]+)"/)?.[1];
    if (!watchPath) throw new NotFoundError('FshareTV: no watch page for this film');
    const watch = expectOk(await fetch(url('site', watchPath), { headers: H, signal }), 'FshareTV watch page');
    let sourceId: string | undefined;
    for (const pattern of SOURCE_ID) if ((sourceId = watch.body.match(pattern)?.[1])) break;
    if (!sourceId) throw new ProviderError('SELECTOR_MISSING', 'FshareTV: no source id in the watch page', { step: 'setSource' });

    const answer = await getJson<Answer>(fetch, url('site', `/api/file/${sourceId}/source?trailer=${TRAILER}&type=watch`), { headers: { ...H, Accept: 'application/json, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', Referer: `${site}/` }, signal }, 'FshareTV files');
    if (answer.status !== 'ok') throw new ProviderError('INVALID_RESULT', `FshareTV: the file API answered "${answer.status ?? 'nothing'}"`);
    const file = answer.data?.file;
    const all = [...(file?.sources ?? []), ...(file?.backups ?? []), ...(file?.alternatives?.flat() ?? [])].filter((s): s is File & { src: string } => typeof s?.src === 'string' && !!s.src);
    const unique = [...new Map(all.map((s) => [s.src, s])).values()].sort((a, b) => Number(b.quality ?? 0) - Number(a.quality ?? 0));
    if (!unique.length) throw new NotFoundError('FshareTV: the file API listed nothing playable');
    const streams: RawStream[] = unique.map((s) => {
      const address = s.src.startsWith('http') ? s.src : `${site}${s.src}`;
      return { url: address, type: streamType(address, (s.type ?? '').replace('video/', '') || 'mp4'), quality: qualityOf(s.label) ?? qualityOf(s.quality), headers: H };
    });
    return { streams };
  },
});
