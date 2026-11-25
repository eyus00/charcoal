/**
 * shonen.to: a catalogue keyed by AniList id. One JSON endpoint lists the playlists of an episode
 * (a copy on the site's own CDN, relays of other players), each with subtitle tracks.
 *
 * Adapted from Seanime-contributions/Seanime-Providers (MIT), src/anime/shonen/provider.js.
 * Flow: the AniList id is the site's own id, so with one the sources endpoint is asked directly;
 * without one, the browse page is searched by title and the best match's id is used. When the
 * endpoint has nothing, the title's page says whether the episode exists at all (a missing episode
 * answers 502 there, which must not be reported as an outage).
 */
import { defineProvider, expectOk, extract, NotFoundError, ProviderError, type AnimeMedia, type Caption, type ProviderContext, type RawStream } from '@charcoal/provider-sdk';
import { animeOnly, audioFields, captionFormatOf, labelFromPlaylist, pageHeaders, rankMatches, searchNames, uniqueCaptions, wantedAudio, type Audio } from './anime-shared.js';
import { gather, streamType, xhrHeaders } from './shared.js';

interface Track {
  file?: string;
  label?: string;
  language?: string;
  kind?: string;
}
interface Source {
  file?: string;
  type?: string;
  label?: string;
  tracks?: Track[];
}
interface Answer {
  data?: { provider?: string; source?: string; sources?: Source[]; tracks?: Track[] };
}

/** The site's id for a title: the cards of the browse page link to /anime/<AniList id>. */
async function findByTitle(media: AnimeMedia, { fetch, signal, url, domain }: ProviderContext): Promise<string> {
  let sawCards = false;
  for (const name of searchNames(media)) {
    const page = expectOk(await fetch(url('site', `/browse?q=${encodeURIComponent(name)}`), { headers: pageHeaders(domain('site')), signal }), 'Shonen search');
    const doc = extract.parseHtml(page.body);
    const cards = doc.selectAll('a.card[href]').flatMap((a) => {
      const id = extract.attr(a, 'href')?.match(/^\/anime\/(\d+)/)?.[1];
      const titleNode = doc.select('.ct', a);
      const title = extract.attr(a, 'title') || (titleNode ? extract.textOf(titleNode) : '');
      const meta = doc.select('.cm', a);
      const year = Number(meta ? extract.textOf(meta).match(/\b(19|20)\d{2}\b/)?.[0] : undefined) || undefined;
      return id && title ? [{ id, title, year }] : [];
    });
    sawCards ||= cards.length > 0;
    const best = rankMatches(cards, media)[0];
    if (best) return best.id;
    // No card at all: "nothing found" still shows the search form; a page without it is a redesign.
    if (!cards.length && !doc.select('form.browse-panel, input[name="q"]')) throw new ProviderError('SELECTOR_MISSING', 'Shonen: the browse page has neither result cards nor its search form', { step: 'a.card' });
  }
  throw new NotFoundError(sawCards ? 'Shonen: no title matches' : 'Shonen: nothing found for this title');
}

/** How many episodes the site lists for a title, from its page; undefined when the page does not say. */
function episodeCount(html: string, id: string): number | undefined {
  const series = extract.findJsonLd(html).find((e) => e['@type'] === 'TVSeries' || e['@type'] === 'Movie');
  const declared = Number(series?.numberOfEpisodes);
  if (Number.isInteger(declared) && declared > 0) return declared;
  const numbers = [...html.matchAll(new RegExp(`/watch/${id}/(\\d+)`, 'g'))].map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) : undefined;
}

export const animeShonen = defineProvider({
  manifest: {
    id: 'anime-shonen',
    name: 'Shonen',
    version: '1.0.0',
    description: 'Anime by AniList id (or title search): a JSON endpoint listing an episode’s playlists and subtitle tracks.',
    kinds: ['anime'],
    languages: ['ja', 'en'],
    lookup: ['anilist', 'title'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls', 'mp4'] },
    limits: { timeoutMs: 15_000, maxRequests: 20 },
    rank: 110,
    license: 'MIT',
    origin: 'Seanime-contributions/Seanime-Providers src/anime/shonen/provider.js (MIT)',
  },
  async getSources(input, ctx) {
    const media = animeOnly(input, 'Shonen');
    const { fetch, signal, url, domain } = ctx;
    const site = domain('site');
    const id = media.ids.anilist && /^\d+$/.test(media.ids.anilist) ? media.ids.anilist : await findByTitle(media, ctx);
    const watch = `${site}/watch/${id}/${media.episode}`;
    const playback = { Referer: `${site}/` };
    const absolute = (file: string) => extract.resolveUrl(file, `${site}/`);

    const one = async (audio: Audio): Promise<{ streams: RawStream[]; captions: Caption[] } | null> => {
      const res = await fetch(url('site', `/sources/shonen?id=${id}&episode=${media.episode}&language=${audio}`), { headers: xhrHeaders(site, { Referer: watch }), signal });
      if (!res.ok) {
        // Not an answer. Before calling it an outage, ask the title's page whether the episode exists.
        const page = await fetch(url('site', `/anime/${id}`), { headers: pageHeaders(site), signal });
        if (page.status === 404) return null;
        const count = page.ok ? episodeCount(page.body, id) : undefined;
        if (count !== undefined && media.episode > count) return null;
        expectOk(res, 'Shonen sources');
      }
      let answer: Answer;
      try {
        answer = JSON.parse(res.body) as Answer;
      } catch {
        throw new ProviderError('STRUCTURE_CHANGED', 'Shonen: the sources endpoint did not answer with JSON', { step: 'sources' });
      }
      const data = answer?.data;
      if (!data || typeof data !== 'object') throw new ProviderError('STRUCTURE_CHANGED', 'Shonen: the sources answer has no data', { step: 'data' });
      const listed = [...(Array.isArray(data.sources) ? data.sources : [])];
      // The preferred one first.
      listed.sort((a, b) => Number(b?.file === data.source) - Number(a?.file === data.source));
      if (typeof data.source === 'string' && !listed.some((s) => s?.file === data.source)) listed.unshift({ file: data.source });
      const seen = new Set<string>();
      const streams: RawStream[] = [];
      for (const s of listed) {
        const address = typeof s?.file === 'string' ? absolute(s.file) : undefined;
        if (!address || seen.has(address)) continue;
        seen.add(address);
        const expiry = Number(new URL(address).searchParams.get('e'));
        streams.push({
          url: address,
          type: streamType(address, s.type),
          headers: playback,
          note: [audio === 'dub' ? 'Dub' : 'Sub', s.label].filter(Boolean).join(' · '),
          ...(expiry > 1e9 && expiry < 1e11 ? { expiresAt: expiry * 1000 } : {}),
          ...audioFields(audio),
        });
      }
      const tracks = [...listed.flatMap((s) => (Array.isArray(s?.tracks) ? s.tracks : [])), ...(Array.isArray(data.tracks) ? data.tracks : [])];
      const captions = tracks.flatMap((t): Caption[] => {
        const address = t?.kind === 'subtitles' && typeof t.file === 'string' ? absolute(t.file) : undefined;
        const format = address ? captionFormatOf(address) : undefined;
        return address && format ? [{ url: address, label: t.label || 'Subtitles', lang: t.language || undefined, format, headers: playback }] : [];
      });
      if (!streams.length) return null;
      // One playlist read labels the preferred stream; the rest are mirrors of the same episode.
      streams[0] = await labelFromPlaylist(streams[0], ctx);
      return { streams, captions };
    };

    const found = await gather(wantedAudio(media).map((audio) => () => one(audio)), signal);
    if (!found.length) throw new NotFoundError('Shonen: no such episode');
    return { streams: found.flatMap((f) => f.streams), captions: uniqueCaptions(found.flatMap((f) => f.captions)) };
  },
});
