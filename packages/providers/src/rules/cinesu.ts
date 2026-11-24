/**
 * CineSu as a declarative provider: the whole integration is the data below (no code).
 *
 * It is a port of the server-only class in apps/server/src/providers/cinesu, which builds a
 * playlist address from the TMDB id and checks that it answers. As data it can run in every
 * runtime, its address lives in the domain config, and a fix can be published in the registry
 * without a release.
 *
 * Stage: canary. The address it shipped with (cine.su) now redirects to another host, which
 * refuses the playlist path from a cloud address; until a working address has been validated the
 * provider stays out of ordinary requests.
 */
import type { ProviderManifest, RulePack } from '@charcoal/provider-sdk';

export const cinesuManifest: ProviderManifest = {
  id: 'cinesu',
  name: 'CineSu',
  version: '2.0.1',
  description: 'Playlist address built from the TMDB id, verified by reading the playlist.',
  contract: 2,
  kinds: ['movie', 'tv'],
  languages: ['en'],
  lookup: ['tmdb'],
  runtimes: ['server', 'edge', 'extension', 'app'],
  requires: { features: ['forbidden-headers'] },
  domainRoles: ['site'],
  output: { types: ['hls'] },
  limits: { timeoutMs: 10_000, maxRequests: 4 },
  rank: 120,
  origin: 'apps/server/src/providers/cinesu (CinePro style)',
};

const HEADERS = { Referer: '{{domain.site}}/en/watch', Origin: '{{domain.site}}', Accept: '*/*' };

export const cinesuRules: RulePack = {
  schema: 1,
  id: 'cinesu',
  version: '2.0.1',
  steps: [
    { when: 'movie', set: 'path', value: '/v1/stream/master/movie/{{media.ids.tmdb}}.m3u8' },
    { when: 'tv', set: 'path', value: '/v1/stream/master/tv/{{media.ids.tmdb}}/{{media.season}}/{{media.episode}}.m3u8' },
    { require: '{{media.ids.tmdb}}', code: 'NOT_FOUND', message: 'needs a TMDB id' },
    { fetch: '{{domain.site}}{{path}}', as: 'playlist', headers: HEADERS },
    // A real playlist, not an error page that happens to answer 200.
    { extract: 'hls', from: 'playlist', as: 'hls', required: true },
  ],
  emit: [{ url: '{{domain.site}}{{path}}', type: 'hls', quality: '{{hls.maxHeight | default:auto}}', language: 'English', headers: HEADERS }],
};
