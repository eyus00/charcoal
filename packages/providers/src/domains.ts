/**
 * Where each provider lives. Addresses are data, kept apart from the extraction code: a provider
 * asks for a role ("api", "site") and gets whatever is configured here, or whatever a newer domain
 * config from the registry says. Changing an address never touches a provider's code.
 *
 * These are the defaults that ship with the pack. To change one, bump its `version`, set
 * `updatedAt`, and move the old address into `alternates` (see docs/platform/DOMAINS.md).
 */
import type { DomainConfig } from '@charcoal/provider-sdk';

export const DEFAULT_DOMAINS: Record<string, DomainConfig> = {
  castle: {
    provider: 'castle',
    version: 1,
    updatedAt: '2026-11-24T00:00:00.000Z',
    roles: { api: { active: 'https://api.hlowb.com', health: { path: '/v0.1/system/getSecurityKey/1?channel=IndiaA&clientType=1&lang=en-US', expectText: '"code"' } } },
  },
  vixsrc: {
    provider: 'vixsrc',
    version: 1,
    updatedAt: '2026-11-24T00:00:00.000Z',
    roles: { site: { active: 'https://vixsrc.to' } },
  },
  febbox: {
    provider: 'febbox',
    version: 1,
    updatedAt: '2026-11-24T00:00:00.000Z',
    roles: {
      showbox: { active: 'https://www.showbox.media' },
      febbox: { active: 'https://www.febbox.com', aliases: ['febbox.com'] },
    },
  },
  'cinesu-rules': {
    provider: 'cinesu-rules',
    version: 1,
    updatedAt: '2026-11-24T00:00:00.000Z',
    roles: { site: { active: 'https://cine.su' } },
  },
};
