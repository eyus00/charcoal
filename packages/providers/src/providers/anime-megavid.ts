/**
 * Megavid: an embed service addressed by AniList id (or MyAnimeList id), episode and audio version.
 * One JSON endpoint answers with the playlist and the caption files, or with `status: "missing"`.
 *
 * Adapted from Seanime-contributions/Seanime-Providers (MIT), src/anime/megavid/provider.js.
 * Upstream maps a title to ids through AniList; here the request already carries them, so the flow
 * is the source endpoint by AniList id, then by MAL id when that one has nothing.
 */
import { defineProvider, getJson, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { animeOnly, audioFields, captionFormatOf, labelFromPlaylist, uniqueCaptions, wantedAudio, type Audio } from './anime-shared.js';
import { gather, streamType, xhrHeaders } from './shared.js';

interface Answer {
  status?: string;
  code?: number;
  message?: string;
  source?: string;
  type?: string;
  tracks?: { file?: string; label?: string; kind?: string; srclang?: string }[];
}

export const animeMegavid = defineProvider({
  manifest: {
    id: 'anime-megavid',
    name: 'Megavid',
    version: '1.0.0',
    description: 'Anime by AniList or MyAnimeList id: one JSON endpoint per episode and audio version.',
    kinds: ['anime'],
    languages: ['ja', 'en'],
    lookup: ['anilist', 'mal'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 12 },
    rank: 100,
    license: 'MIT',
    origin: 'Seanime-contributions/Seanime-Providers src/anime/megavid/provider.js (MIT)',
  },
  async getSources(input, ctx) {
    const media = animeOnly(input, 'Megavid');
    const { fetch, signal, url, domain } = ctx;
    const routes = [media.ids.anilist ? `ani/${encodeURIComponent(media.ids.anilist)}` : null, media.ids.mal ? `mal/${encodeURIComponent(media.ids.mal)}` : null].filter((r): r is string => !!r);
    if (!routes.length) throw new NotFoundError('Megavid: needs an AniList or MyAnimeList id');
    const site = domain('site');
    const H = xhrHeaders(site);
    const playback = { Referer: `${site}/` };

    const one = async (audio: Audio): Promise<{ stream: RawStream; captions: Caption[] } | null> => {
      for (const route of routes) {
        const answer = await getJson<Answer>(fetch, url('site', `/${route}/${media.episode}/${audio}/source?axsv=loli`), { headers: H, signal }, 'Megavid');
        if (answer?.status === 'missing') continue;
        if (answer?.status !== 'ok' || typeof answer.source !== 'string' || !/^https?:\/\//.test(answer.source)) throw new ProviderError('STRUCTURE_CHANGED', `Megavid: the source endpoint answered "${String(answer?.status ?? 'nothing').slice(0, 40)}" without a stream`, { step: 'source' });
        const type = streamType(answer.source, answer.type);
        const stream = await labelFromPlaylist({ url: answer.source, type, headers: playback, note: audio === 'dub' ? 'Dub' : 'Sub', ...audioFields(audio) }, ctx);
        const captions = (answer.tracks ?? [])
          .filter((t): t is { file: string; label?: string; kind?: string; srclang?: string } => typeof t?.file === 'string' && /^https?:\/\//.test(t.file) && (!t.kind || /caption|subtitle/i.test(t.kind)))
          .map((t): Caption => ({ url: t.file, label: t.label || 'Subtitles', lang: t.srclang || undefined, format: captionFormatOf(t.file) ?? 'vtt', headers: playback }));
        return { stream, captions };
      }
      return null;
    };

    const found = await gather(wantedAudio(media).map((audio) => () => one(audio)), signal);
    if (!found.length) throw new NotFoundError('Megavid: no such episode');
    return { streams: found.map((f) => f.stream), captions: uniqueCaptions(found.flatMap((f) => f.captions)) };
  },
});
