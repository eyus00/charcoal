/**
 * ZokoAnime: an embed player addressed by MyAnimeList id, episode and audio version. The player page
 * carries its configuration in `window.__P`, base64 of JSON XOR-ed with a fixed key; inside are the
 * playlist address and the subtitle files.
 *
 * Adapted from Seanime-contributions/Seanime-Providers (MIT), src/anime/zokoanime/provider.js.
 * Upstream finds the MAL id by asking AniList for the title; here the request already carries it,
 * so there is no search step: page (one per audio version), decode, playlist.
 */
import { defineProvider, expectOk, extract, NotFoundError, ProviderError, type Caption, type RawStream } from '@charcoal/provider-sdk';
import { animeOnly, audioFields, labelFromPlaylist, pageHeaders, uniqueCaptions, wantedAudio, type Audio } from './anime-shared.js';
import { base64ToBytes, decryptOr, gather, text, utf8 } from './shared.js';

const KEY = 'otaku-embed-v1';

interface Payload {
  src?: string;
  subtitles?: { src?: string; label?: string; lang?: string }[];
}

/** base64 → XOR with the repeating key → JSON. */
export function decodePayload(blob: string): Payload {
  const bytes = base64ToBytes(blob);
  const key = utf8(KEY);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= key[i % key.length];
  return JSON.parse(text(bytes)) as Payload;
}

export const animeZokoanime = defineProvider({
  manifest: {
    id: 'anime-zokoanime',
    name: 'ZokoAnime',
    version: '1.0.0',
    description: 'Anime by MyAnimeList id: an embed page whose obfuscated configuration names the playlist and subtitles.',
    kinds: ['anime'],
    languages: ['ja', 'en'],
    lookup: ['mal'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls'] },
    limits: { timeoutMs: 15_000, maxRequests: 8 },
    rank: 100,
    license: 'MIT',
    origin: 'Seanime-contributions/Seanime-Providers src/anime/zokoanime/provider.js (MIT)',
  },
  async getSources(input, ctx) {
    const media = animeOnly(input, 'ZokoAnime');
    const { fetch, signal, url, domain } = ctx;
    if (!media.ids.mal) throw new NotFoundError('ZokoAnime: needs a MyAnimeList id');
    const site = domain('site');
    const playback = { Referer: `${site}/` };

    const one = async (audio: Audio): Promise<{ stream: RawStream; captions: Caption[] } | null> => {
      const page = expectOk(await fetch(url('site', `/stream/mal/${encodeURIComponent(media.ids.mal!)}/${media.episode}/${audio}`), { headers: pageHeaders(site), signal }), 'ZokoAnime');
      const blob = page.body.match(/window\.__P\s*=\s*["']([^"']+)["']/)?.[1];
      if (!blob) {
        // The player answers 200 with an error card ("// Error 404") for an episode it does not have.
        const card = extract.parseHtml(page.body).select('.card .code');
        if (card && extract.textOf(card) === '404') return null;
        throw new ProviderError('SELECTOR_MISSING', 'ZokoAnime: the player page has no configuration', { step: 'window.__P' });
      }
      const payload = await decryptOr('ZokoAnime', async () => decodePayload(blob));
      if (typeof payload.src !== 'string' || !/^https?:\/\//.test(payload.src)) throw new ProviderError('STRUCTURE_CHANGED', 'ZokoAnime: the player configuration names no stream', { step: 'src' });
      ctx.discovered(payload.src);
      const stream = await labelFromPlaylist({ url: payload.src, type: 'hls', headers: playback, note: audio === 'dub' ? 'Dub' : 'Sub', ...audioFields(audio) }, ctx);
      // Every track says lang "en"; the label is what tells them apart.
      const captions = (payload.subtitles ?? []).filter((t): t is { src: string; label?: string } => typeof t?.src === 'string' && /^https?:\/\//.test(t.src)).map((t): Caption => ({ url: t.src, label: t.label || 'Subtitles', format: 'vtt', headers: playback }));
      return { stream, captions };
    };

    const found = await gather(wantedAudio(media).map((audio) => () => one(audio)), signal);
    if (!found.length) throw new NotFoundError('ZokoAnime: no such episode');
    return { streams: found.map((f) => f.stream), captions: uniqueCaptions(found.flatMap((f) => f.captions)) };
  },
});
