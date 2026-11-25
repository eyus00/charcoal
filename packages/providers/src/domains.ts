/**
 * Where each provider lives. Addresses are data, kept apart from the extraction code: a provider
 * asks for a role ("api", "site") and gets whatever is configured here, or whatever a newer domain
 * config from the registry says. Changing an address never touches a provider's code.
 *
 * These are the defaults that ship with the pack. To change one, bump its `version`, set
 * `updatedAt`, and move the old address into `alternates` (see docs/platform/DOMAINS.md).
 */
import type { DomainConfig } from '@charcoal/provider-sdk';
import { domains as ANIME_DOMAINS } from './packs/anime.js';

/** A domain config with one address per role and nothing else. */
function one(provider: string, roles: Record<string, string>): DomainConfig {
  return { provider, version: 1, updatedAt: '2026-11-24T00:00:00.000Z', roles: Object.fromEntries(Object.entries(roles).map(([role, active]) => [role, { active }])) };
}

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
  cinesu: {
    provider: 'cinesu',
    version: 1,
    updatedAt: '2026-11-24T00:00:00.000Z',
    roles: { site: { active: 'https://cine.su' } },
  },
  icefy: one('icefy', { site: 'https://streams.icefy.top' }),
  vidlink: one('vidlink', { site: 'https://vidlink.pro', decoder: 'https://enc-dec.app' }),
  fsharetv: one('fsharetv', { site: 'https://fsharetv.cc' }),
  popr: one('popr', { site: 'https://popr.ink' }),
  streammafia: one('streammafia', { site: 'https://player.nhdapi.com' }),
  vidrock: one('vidrock', { site: 'https://vidrock.net', subs: 'https://sub.vdrk.site' }),
  vidsrc: one('vidsrc', { site: 'https://vsembed.ru' }),
  vidzee: one('vidzee', { api: 'https://core.vidzee.wtf', player: 'https://player.vidzee.wtf' }),
  vidnest: one('vidnest', { site: 'https://vidnest.fun', api: 'https://new.vidnest.fun' }),
  // The API moved from api.videasy.net (which no longer answers) to the host below; the blob
  // decoder is a third-party service.
  videasy: one('videasy', { api: 'https://api.wecollege.net', player: 'https://vidy.st', decoder: 'https://enc-dec.app' }),
  // These API hosts no longer exist in DNS (checked 2026-11-24). The entries stay so that a new
  // address can be put in force from the control plane without touching the provider.
  tulnex: one('tulnex', { api: 'https://api.tulnex.com' }),
  peachify: one('peachify', { site: 'https://peachify.top', api: 'https://usa.eat-peach.sbs', moviebox: 'https://uwu.eat-peach.sbs' }),
  ...ANIME_DOMAINS,
};
