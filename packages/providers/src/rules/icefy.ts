/**
 * Icefy as a declarative provider: one API call per title returns `{ stream }`, a playlist address.
 * Ported from the server-only class in apps/server/src/providers/icefy (cinepro-org/core lineage).
 *
 * The site sits behind a browser check for addresses it does not trust (measured from a cloud
 * address on 2026-11-24: HTTP 403 with `cf-mitigated: challenge`). That is reported as CHALLENGE,
 * never worked around; from a viewer's own connection the API answers plain JSON.
 */
import type { ProviderManifest, RulePack } from '@charcoal/provider-sdk';

export const icefyManifest: ProviderManifest = {
  id: 'icefy',
  name: 'Icefy',
  version: '2.0.0',
  description: 'One API call per title returns a playlist address.',
  contract: 2,
  kinds: ['movie', 'tv'],
  languages: ['en'],
  lookup: ['tmdb'],
  runtimes: ['server', 'edge', 'extension', 'app'],
  requires: { features: ['forbidden-headers'] },
  domainRoles: ['site'],
  followDiscovered: true,
  output: { types: ['hls'] },
  limits: { timeoutMs: 10_000, maxRequests: 3 },
  rank: 100,
  origin: 'apps/server/src/providers/icefy (cinepro-org/core)',
};

const HEADERS = { Accept: 'application/json, text/javascript, */*; q=0.01', 'Accept-Language': 'en-US,en;q=0.9', Referer: '{{domain.site}}', Origin: '{{domain.site}}' };

export const icefyRules: RulePack = {
  schema: 1,
  id: 'icefy',
  version: '2.0.0',
  steps: [
    { require: '{{media.ids.tmdb}}', code: 'NOT_FOUND', message: 'needs a TMDB id' },
    { when: 'movie', fetch: '{{domain.site}}/movie/{{media.ids.tmdb}}', as: 'info', headers: HEADERS },
    { when: 'tv', fetch: '{{domain.site}}/tv/{{media.ids.tmdb}}/{{media.season}}/{{media.episode}}', as: 'info', headers: HEADERS },
    { extract: 'json', from: 'info', expr: '$.stream', as: 'stream' },
    { require: '{{stream}}', code: 'NOT_FOUND', message: 'no stream for this title' },
  ],
  emit: [{ url: '{{stream}}', type: 'hls', quality: '1080', language: 'English', headers: HEADERS }],
};
