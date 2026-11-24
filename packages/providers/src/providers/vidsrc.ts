/**
 * VidSrc. Two generations of the same site:
 *
 * - The older layout (what the server-only class scraped): the embed page holds an iframe, that page
 *   holds a second address in inline script, and the third page holds `file: "…"` with host
 *   placeholders.
 * - The current layout: the embed page fetches its player frame at run time from a small API, and
 *   the frame's address carries a short-lived token bound to the host. The player behind it is
 *   gated (click-through, automation and dev-tools detection). This integration does not go
 *   through that gate. The site is an embed service, so the supported way to use it is the way it
 *   is meant to be used: its player in a frame, in the viewer's own browser. That is what is
 *   returned for the current layout.
 */
import { defineProvider, expectOk, extract, getJson, NotFoundError, ProviderError, type RawStream } from '@charcoal/provider-sdk';
import { BROWSER_UA } from './shared.js';

/** Placeholders in the older layout's `file:` value and the hosts they stand for. */
const PLAYER_HOSTS: Record<string, string> = { '{v1}': 'neonhorizonworkshops.com', '{v2}': 'wanderlynest.com', '{v3}': 'orchidpixelgardens.com', '{v4}': 'cloudnestra.com' };
const STREAM_REFERER = 'https://cloudnestra.com';

export const vidsrc = defineProvider({
  manifest: {
    id: 'vidsrc',
    name: 'VidSrc',
    version: '2.0.0',
    description: 'An embed service. Streams are read from the older page layout when it is served; otherwise its own player is offered in a frame.',
    kinds: ['movie', 'tv'],
    lookup: ['tmdb'],
    runtimes: ['server', 'edge', 'extension', 'app'],
    requires: { features: ['forbidden-headers'] },
    domainRoles: ['site'],
    followDiscovered: true,
    output: { types: ['hls', 'frame'] },
    limits: { timeoutMs: 12_000, maxRequests: 6 },
    rank: 90,
    origin: 'apps/server/src/providers/vidsrc (cinepro-org/core)',
  },
  async getSources(media, { fetch, signal, url, domain, log }) {
    if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) throw new NotFoundError('VidSrc: needs a TMDB id');
    const site = domain('site');
    const H = { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', Referer: `${site}/` };
    const embed = url('site', media.kind === 'movie' ? `/embed/movie?tmdb=${media.ids.tmdb}` : `/embed/tv?tmdb=${media.ids.tmdb}&season=${media.season}&episode=${media.episode}`);
    const page = expectOk(await fetch(embed, { headers: H, signal }), 'VidSrc');

    // Older layout: the next hop is an iframe with a src in the markup.
    const first = extract.findIframes(page.body, embed).find((f) => f.url && !f.attrs['data-api'])?.url;
    if (first) {
      const second = expectOk(await fetch(first, { headers: H, signal }), 'VidSrc player page');
      const rel = second.body.match(/src:\s*['"]([^'"]+)['"]/i)?.[1];
      if (!rel) throw new ProviderError('SELECTOR_MISSING', 'VidSrc: no player address in the second page', { step: 'src:' });
      const third = expectOk(await fetch(new URL(rel, first).href, { headers: H, signal }), 'VidSrc stream page');
      const file = third.body.match(/file\s*:\s*["']([^"']+)["']/i)?.[1];
      if (!file) throw new ProviderError('SELECTOR_MISSING', 'VidSrc: no file in the stream page', { step: 'file:' });
      const streams: RawStream[] = file
        .split(/\s+or\s+/i)
        .map((template) => Object.entries(PLAYER_HOSTS).reduce((u, [placeholder, host]) => u.replace(placeholder, host), template))
        .filter((u) => !u.includes('{') && !u.includes('}'))
        .map((u) => ({ url: u, type: 'hls', language: 'English', headers: { ...H, Referer: `${STREAM_REFERER}/`, Origin: STREAM_REFERER } }));
      if (!streams.length) throw new ProviderError('STRUCTURE_CHANGED', 'VidSrc: unknown host placeholders in the stream page', { step: 'placeholders' });
      return { streams };
    }

    // Current layout: the frame address comes from an API named in the markup.
    const api = page.body.match(/id=["']player_iframe["'][^>]*?data-api=["']([^"']+)["']/i)?.[1] ?? page.body.match(/data-api=["']([^"']+)["']/i)?.[1];
    if (!api) throw new ProviderError('SELECTOR_MISSING', 'VidSrc: the embed page has neither a player frame nor a frame API', { step: 'player_iframe' });
    // Asked only to learn whether the site has this title; the token it returns is not used.
    const gate = await getJson<{ src?: string }>(fetch, new URL(api.replace(/&amp;/g, '&'), embed).href, { headers: { ...H, Referer: embed }, signal }, 'VidSrc');
    if (!gate.src) throw new NotFoundError('VidSrc: not available');
    log('gated-layout', { note: 'player is behind a run-time gate; offering the frame' });
    return { streams: [{ url: embed, type: 'frame', language: 'English' }] };
  },
});
