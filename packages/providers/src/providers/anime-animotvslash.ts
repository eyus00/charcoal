/**
 * AnimoTVSlash: a catalogue site whose player is a separate stream API keyed by AniList id. The
 * API answers with named playlists (one file carrying the Japanese and, when there is one, the
 * English audio track) and soft subtitles.
 *
 * Adapted from Seanime-contributions/Seanime-Providers (MIT), src/anime/animotvslash/provider.js.
 * Flow: with an AniList id the stream API is asked directly. Without one, as upstream does: site
 * search by title, the title's page for its episode list, the episode's page for the player frame,
 * whose address carries the AniList id and the episode number the API wants.
 */
import { defineProvider, expectOk, extract, NotFoundError, ProviderError, type AnimeMedia, type Caption, type ProviderContext, type RawStream } from '@charcoal/provider-sdk';
import { animeOnly, captionFormatOf, pageHeaders, rankMatches, readPlaylist, searchNames, uniqueCaptions, withPlaylistInfo } from './anime-shared.js';
import { streamType, xhrHeaders } from './shared.js';

interface Answer {
  type?: string;
  url?: string;
  sources?: { name?: string; url?: string }[];
  subtitles?: { url?: string; label?: string; language?: string; format?: string }[];
  subtitleType?: string;
  error?: string;
}
interface Entry {
  href: string;
  title: string;
  year?: number;
}

/** The site's search results for one name. An empty result is told apart from a redesigned page. */
async function search(name: string, { fetch, signal, url, domain }: ProviderContext): Promise<Entry[]> {
  const page = expectOk(await fetch(url('site', `/?s=${encodeURIComponent(name)}`), { headers: pageHeaders(domain('site')), signal }), 'AnimoTVSlash search');
  const doc = extract.parseHtml(page.body);
  const entries = doc.selectAll('article.bs a[href][title]').flatMap((a): Entry[] => {
    const href = extract.resolveUrl(extract.attr(a, 'href') ?? '', `${domain('site')}/`);
    const title = extract.attr(a, 'title')?.trim();
    return href && title ? [{ href, title }] : [];
  });
  // "No anime found" still shows the search section; a page with neither means the theme changed.
  if (!entries.length && !doc.select('.abr-search, .abr-empty, .listupd')) throw new ProviderError('SELECTOR_MISSING', 'AnimoTVSlash: the search page has neither results nor its search section', { step: 'article.bs' });
  return entries;
}

/** Title search → title page → episode page → the player frame's `/watch/<AniList id>/<episode>`. */
async function findByTitle(media: AnimeMedia, ctx: ProviderContext): Promise<{ id: string; episode: string } | null> {
  const { fetch, signal, domain } = ctx;
  const site = domain('site');
  const H = pageHeaders(site);
  let candidates: Entry[] = [];
  for (const name of searchNames(media)) {
    candidates = rankMatches(await search(name, ctx), media);
    if (candidates.length) break;
  }
  if (!candidates.length) throw new NotFoundError('AnimoTVSlash: no title matches');
  // Several entries can carry the same name (a series and its recap film): the release year decides.
  for (const candidate of candidates.slice(0, 2)) {
    const page = expectOk(await fetch(candidate.href, { headers: H, signal }), 'AnimoTVSlash title page');
    const doc = extract.parseHtml(page.body);
    const released = Number(page.body.match(/<b>\s*Released:\s*<\/b>\s*(\d{4})/i)?.[1]) || undefined;
    if (media.year && released && Math.abs(media.year - released) > 1) continue;
    const list = doc.select('#ts-ep-list');
    if (!list) throw new ProviderError('SELECTOR_MISSING', 'AnimoTVSlash: the title page has no episode list', { step: '#ts-ep-list' });
    const link = doc.selectAll('li a[href]', list).find((a) => {
      const number = doc.select('.epl-num', a);
      return number && Number.parseFloat(extract.textOf(number)) === media.episode;
    });
    if (!link) return null;
    const episodePage = expectOk(await fetch(extract.resolveUrl(extract.attr(link, 'href')!, `${site}/`)!, { headers: H, signal }), 'AnimoTVSlash episode page');
    const frame = extract.findIframes(episodePage.body, `${site}/`).map((f) => f.url.match(/\/watch\/(\d+)\/(\d+(?:\.\d+)?)/)).find(Boolean);
    if (!frame) throw new ProviderError('SELECTOR_MISSING', 'AnimoTVSlash: the episode page has no player frame', { step: 'iframe /watch/' });
    return { id: frame[1], episode: frame[2] };
  }
  throw new NotFoundError('AnimoTVSlash: the entries with this name are from another year');
}

export const animeAnimotvslash = defineProvider({
  manifest: {
    id: 'anime-animotvslash',
    name: 'AnimoTVSlash',
    version: '1.0.0',
    description: 'Anime by AniList id (or title search): a stream API answering with multi-audio playlists and soft subtitles.',
    kinds: ['anime'],
    languages: ['ja', 'en'],
    lookup: ['anilist', 'title'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site', 'api'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 20_000, maxRequests: 16 },
    rank: 105,
    license: 'MIT',
    origin: 'Seanime-contributions/Seanime-Providers src/anime/animotvslash/provider.js (MIT)',
  },
  async getSources(input, ctx) {
    const media = animeOnly(input, 'AnimoTVSlash');
    const { fetch, signal, url, domain } = ctx;
    const api = domain('api');
    const byId = !!media.ids.anilist && /^\d+$/.test(media.ids.anilist);
    const target = byId ? { id: media.ids.anilist!, episode: String(media.episode) } : await findByTitle(media, ctx);
    if (!target) throw new NotFoundError('AnimoTVSlash: no such episode');

    // Both audio versions are tracks of the same playlist, so one question is enough.
    const res = await fetch(url('api', `/api/stream/sources/koto?anilistId=${target.id}&episode=${encodeURIComponent(target.episode)}&lang=${media.audio === 'dub' ? 'dub' : 'sub'}`), { headers: xhrHeaders(api), signal });
    if (res.status === 404) throw new NotFoundError('AnimoTVSlash: no such episode');
    if (!res.ok && byId) {
      // The API answers 500 for an id it does not know. The catalogue says whether that is what happened.
      let listed = false;
      for (const name of searchNames(media, 2)) if ((listed = rankMatches(await search(name, ctx), media).length > 0)) break;
      if (!listed) throw new NotFoundError('AnimoTVSlash: the title is not in the catalogue');
    }
    expectOk(res, 'AnimoTVSlash stream API');
    let answer: Answer;
    try {
      answer = JSON.parse(res.body) as Answer;
    } catch {
      throw new ProviderError('STRUCTURE_CHANGED', 'AnimoTVSlash: the stream API did not answer with JSON', { step: 'sources' });
    }
    if (!answer || typeof answer !== 'object' || (!Array.isArray(answer.sources) && typeof answer.url !== 'string')) throw new ProviderError('STRUCTURE_CHANGED', 'AnimoTVSlash: the stream API answer has no sources', { step: 'sources' });

    const playback = { Referer: `${api}/`, Origin: api };
    const listed = [...(answer.sources ?? []), ...(typeof answer.url === 'string' ? [{ name: undefined, url: answer.url }] : [])];
    const seen = new Set<string>();
    const raw: RawStream[] = [];
    for (const s of listed) {
      if (typeof s?.url !== 'string' || !/^https?:\/\//.test(s.url) || seen.has(s.url)) continue;
      seen.add(s.url);
      raw.push({ url: s.url, type: streamType(s.url, answer.type), headers: playback, note: s.name });
    }
    if (!raw.length) throw new NotFoundError('AnimoTVSlash: the stream API listed nothing playable');
    const infos = await Promise.all(raw.map((s) => readPlaylist(s, ctx)));
    if (signal.aborted) throw new ProviderError('CANCELLED');
    const streams = raw.flatMap((s, i): RawStream[] => {
      const info = infos[i];
      // Unread: offered without a claim about its audio.
      if (!info) return [s];
      // A dub is only offered when the playlist really carries an English track.
      if (media.audio === 'dub' && !info.audio.some((a) => a.lang === 'en')) return [];
      return [withPlaylistInfo({ ...s, language: 'Japanese', languageCode: 'ja' }, info)];
    });
    if (!streams.length) throw new NotFoundError('AnimoTVSlash: no English audio for this episode');

    const captions = (answer.subtitles ?? []).flatMap((t): Caption[] => {
      const format = typeof t?.url === 'string' && /^https?:\/\//.test(t.url) ? captionFormatOf(t.url, t.format) : undefined;
      return format ? [{ url: t.url!, label: t.label || t.language || 'Subtitles', format, headers: playback }] : [];
    });
    return { streams, captions: uniqueCaptions(captions) };
  },
});
