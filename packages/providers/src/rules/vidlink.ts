/**
 * VidLink as a declarative provider that needs a browser.
 *
 * VidLink is an embed service: its player page builds the stream address in page JavaScript. There
 * is nothing to fetch and parse, so this pack opens the player page in the browser runtime and
 * emits what the page itself asks for (measured on 2026-11-24 from a cloud address: a DASH
 * manifest, requested without any interaction, verified at manifest level up to 1080p).
 *
 * It runs only where a browser worker exists (`js-render`). Everywhere else the same page is what
 * the website's embed list already offers in a frame.
 */
import type { ProviderManifest, RulePack } from '@charcoal/provider-sdk';

export const vidlinkManifest: ProviderManifest = {
  id: 'vidlink',
  name: 'VidLink',
  version: '1.0.0',
  description: 'An embed player page, opened in a browser; emits the manifest the page asks for.',
  contract: 2,
  kinds: ['movie', 'tv'],
  lookup: ['tmdb'],
  runtimes: ['server'],
  requires: { features: ['js-render'] },
  domainRoles: ['site'],
  followDiscovered: true,
  output: { types: ['dash', 'hls', 'mp4'] },
  limits: { timeoutMs: 25_000, maxRequests: 4 },
  rank: 115,
};

export const vidlinkRules: RulePack = {
  schema: 1,
  id: 'vidlink',
  version: '1.0.0',
  steps: [
    { require: '{{media.ids.tmdb}}', code: 'NOT_FOUND', message: 'needs a TMDB id' },
    { when: 'movie', set: 'path', value: '/movie/{{media.ids.tmdb}}' },
    { when: 'tv', set: 'path', value: '/tv/{{media.ids.tmdb}}/{{media.season}}/{{media.episode}}' },
    { render: '{{domain.site}}{{path}}', as: 'page', waitFor: 'media', capture: 'found', captureCaptions: 'subs', timeoutMs: 15_000, noMediaIs: 'NOT_FOUND' },
  ],
  // Whatever the page sent with the request (its Referer) is attached by the engine.
  emit: [{ each: 'found', url: '{{item}}', type: 'auto' }],
  captions: [{ each: 'subs', url: '{{item}}', label: 'Subtitles' }],
};
