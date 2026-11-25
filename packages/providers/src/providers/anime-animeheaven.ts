/**
 * AnimeHeaven: subbed anime as plain MP4 files. The search lists titles; a title's page lists its
 * episodes, each with a key; the player page ("gate") is the same address for every episode and
 * shows the one whose key is in the `key` cookie. Its <video> element names the file.
 *
 * Adapted from Seanime-contributions/Seanime-Providers (MIT), src/anime/animeheaven/provider.js.
 * Flow: search by title → the title's page (also where its Japanese name and year are, which the
 * search results lack) → gate page with the episode's key → <video id="vid"> sources.
 */
import { bestTitleMatch, defineProvider, expectOk, extract, NotFoundError, ProviderError, type AnimeMedia, type ProviderContext } from '@charcoal/provider-sdk';
import { animeOnly, audioFields, pageHeaders, rankMatches, searchNames } from './anime-shared.js';

interface Card {
  path: string;
  title: string;
}
interface TitlePage {
  html: string;
  title: string;
}

/** Result cards of one search, in the site's order. */
async function search(name: string, { fetch, signal, url, domain }: ProviderContext): Promise<Card[]> {
  const page = expectOk(await fetch(url('site', `/search.php?s=${encodeURIComponent(name)}`), { headers: pageHeaders(domain('site')), signal }), 'AnimeHeaven search');
  const doc = extract.parseHtml(page.body);
  const cards = doc.selectAll('.similarimg').flatMap((card): Card[] => {
    const link = doc.select('a[href^="anime.php?"]', card);
    const image = doc.select('img[alt]', card);
    const name = doc.select('.similarname', card);
    const title = (extract.attr(image, 'alt') || (name ? extract.textOf(name) : '')).trim();
    const path = extract.attr(link, 'href');
    return path && title ? [{ path, title }] : [];
  });
  // "Nothing found" is the same page without cards; without its search box too, the site changed.
  if (!cards.length && !doc.select('form.searchf, input[name="s"]')) throw new ProviderError('SELECTOR_MISSING', 'AnimeHeaven: the search page has neither results nor its search box', { step: '.similarimg' });
  return cards;
}

/**
 * The page of the wanted title. Cards only carry the site's English name ("Sorcery Fight" for
 * Jujutsu Kaisen), so the pages of the likeliest cards are opened and matched on their English
 * name, Japanese name and year.
 */
async function findTitle(media: AnimeMedia, ctx: ProviderContext): Promise<TitlePage> {
  const { fetch, signal, url, domain } = ctx;
  const opened = new Set<string>();
  let sawCards = false;
  for (const name of searchNames(media)) {
    const cards = await search(name, ctx);
    sawCards ||= cards.length > 0;
    const ranked = rankMatches(cards, media);
    // Cards that match by name first, then the site's own best guesses for this query.
    const order = [...ranked.slice(0, 2), ...cards.filter((c) => !ranked.includes(c))].filter((c) => !opened.has(c.path));
    for (const card of order.slice(0, Math.max(0, 3 - opened.size))) {
      opened.add(card.path);
      const page = expectOk(await fetch(url('site', `/${card.path}`), { headers: pageHeaders(domain('site')), signal }), 'AnimeHeaven title page');
      const doc = extract.parseHtml(page.body);
      const node = (selector: string) => {
        const n = doc.select(selector);
        return n ? extract.textOf(n) : '';
      };
      const title = node('.infotitle') || card.title;
      const japanese = node('.infotitlejp');
      const year = Number(node('.infoyear').match(/Year:\s*(\d{4})/)?.[1]) || undefined;
      if (bestTitleMatch([{ title, altTitles: japanese ? [japanese] : [], year }], media)) return { html: page.body, title };
    }
  }
  throw new NotFoundError(sawCards ? 'AnimeHeaven: no title matches' : 'AnimeHeaven: nothing found for this title');
}

export const animeAnimeheaven = defineProvider({
  manifest: {
    id: 'anime-animeheaven',
    name: 'AnimeHeaven',
    version: '1.0.0',
    description: 'Subbed anime by title search: the episode key goes in a cookie and the player page names MP4 mirrors.',
    kinds: ['anime'],
    languages: ['ja'],
    lookup: ['title'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers', 'cookies'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['mp4'] },
    limits: { timeoutMs: 20_000, maxRequests: 12 },
    rank: 95,
    license: 'MIT',
    origin: 'Seanime-contributions/Seanime-Providers src/anime/animeheaven/provider.js (MIT)',
  },
  async getSources(input, ctx) {
    const media = animeOnly(input, 'AnimeHeaven');
    if (media.audio === 'dub') throw new NotFoundError('AnimeHeaven: subbed only');
    const { fetch, signal, url, domain } = ctx;
    const site = domain('site');
    const page = await findTitle(media, ctx);

    // Every episode is an anchor whose id is its key, around a ".watch2" cell with its number.
    const doc = extract.parseHtml(page.html);
    const episodes = doc.selectAll('a[id]').flatMap((a) => {
      const cell = doc.select('.watch2', a);
      const number = cell ? Number.parseFloat(extract.textOf(cell)) : NaN;
      const key = extract.attr(a, 'id');
      return key && Number.isFinite(number) ? [{ key, number }] : [];
    });
    if (!episodes.length) throw new ProviderError('SELECTOR_MISSING', `AnimeHeaven: no episode list on the page of "${page.title}"`, { step: 'a[id] .watch2' });
    const episode = episodes.find((e) => e.number === media.episode);
    if (!episode) throw new NotFoundError(`AnimeHeaven: "${page.title}" has no episode ${media.episode}`);
    if (!/^[\w-]+$/.test(episode.key)) throw new ProviderError('STRUCTURE_CHANGED', 'AnimeHeaven: the episode key has an unexpected form', { step: 'key' });

    const gate = expectOk(await fetch(url('site', '/gate.php'), { headers: pageHeaders(site, { Referer: `${site}/anime.php`, Cookie: `key=${episode.key}` }), signal }), 'AnimeHeaven player page');
    // Only the player element counts: the page also carries a commented-out <source> for another episode.
    const player = extract.parseHtml(gate.body);
    const video = player.select('video#vid') ?? player.select('video');
    if (!video) throw new ProviderError('SELECTOR_MISSING', 'AnimeHeaven: the player page has no <video>', { step: 'video#vid' });
    const files = [...new Set(player.selectAll('source[src]', video).map((s) => extract.resolveUrl(extract.attr(s, 'src') ?? '', `${site}/`)).filter((u): u is string => !!u && /\.mp4(?:[?#]|$)/i.test(u)))];
    if (!files.length) throw new ProviderError('SELECTOR_MISSING', 'AnimeHeaven: the player has no MP4 source', { step: 'video#vid source' });
    // The key must be the one asked for: a missing cookie makes the page show something else.
    const own = files.filter((f) => f.includes(episode.key));
    if (!own.length) throw new ProviderError('INVALID_RESULT', 'AnimeHeaven: the player page is for another episode', { step: 'key' });

    // The first source is the file; the others are the player's "on error" fallbacks, which answered 404
    // when tried on 2026-11-24, so only the first is offered.
    return { streams: [{ url: own[0], type: 'mp4', headers: { Referer: `${site}/`, Origin: site }, ...audioFields('sub', true) }] };
  },
});
