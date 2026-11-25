/**
 * @charcoal/providers: the first-party provider pack.
 *
 * Everything here is written against @charcoal/provider-sdk: each provider is a module with a
 * manifest (identity and capabilities), its addresses live in ./domains.ts, and the same modules
 * run on the server, in the page through a bridge, or anywhere else a transport exists. Nothing in
 * this pack knows which runtime it is in.
 */
import { defineRuleProvider, type DomainConfig, type LoadedProvider, type ProviderManifest, type ProviderModule, type RulePack, type Stage } from '@charcoal/provider-sdk';
import { DEFAULT_DOMAINS } from './domains.js';
import { castle, pickCastleRow, sameLength } from './providers/castle.js';
import { febbox } from './providers/febbox.js';
import { fsharetv } from './providers/fsharetv.js';
import { peachify } from './providers/peachify.js';
import { popr } from './providers/popr.js';
import { streammafia } from './providers/streammafia.js';
import { tulnex } from './providers/tulnex.js';
import { videasy } from './providers/videasy.js';
import { cinejoy } from './providers/cinejoy.js';
import { meowtv } from './providers/meowtv.js';
import { vidlink } from './providers/vidlink.js';
import { vidnest } from './providers/vidnest.js';
import { vidrock } from './providers/vidrock.js';
import { vidsrc } from './providers/vidsrc.js';
import { vidzee } from './providers/vidzee.js';
import { vixsrc } from './providers/vixsrc.js';
import { cinesuManifest, cinesuRules } from './rules/cinesu.js';
import { providers as ANIME_PROVIDERS } from './packs/anime.js';
import { icefyManifest, icefyRules } from './rules/icefy.js';

export * from './types.js';
export { nativeFetcher, getJson } from './fetch.js';
export { DEFAULT_DOMAINS } from './domains.js';
export { providers as ANIME_PROVIDERS } from './packs/anime.js';
export { checkFebboxToken } from './providers/febbox.js';
import { loadFallbackProviders } from './streamviva.js';
export { loadFallbackProviders };
export { primesrc, STREAMVIVA_VERSION } from './streamviva.js';
export { cinesuManifest, cinesuRules } from './rules/cinesu.js';
export { icefyManifest, icefyRules } from './rules/icefy.js';
export { castle, pickCastleRow, sameLength, cinejoy, febbox, meowtv, fsharetv, peachify, popr, streammafia, tulnex, videasy, vidlink, vidnest, vidrock, vidsrc, vidzee, vixsrc };

/**
 * Providers declared as data: a manifest and its rules.
 *
 * Stages. `stable` runs for every request; `canary` runs only when named and in monitor checks.
 * Everything that answers anywhere is `stable`: a provider that fails from where a server runs is
 * rested by its health record within a few searches, which costs less than holding back one
 * that works. `canary` is left for providers known to be dead (their address is gone, or the
 * site no longer speaks the protocol): running them would only slow every search down.
 */
export const RULE_PROVIDERS: { manifest: ProviderManifest; rules: RulePack; stage: Stage }[] = [
  // cine.su now redirects to koddo.to, which has no such playlist path (404, checked 2026-11-26):
  // moving the address there does not bring it back. It needs a new extraction for the new site.
  { manifest: cinesuManifest, rules: cinesuRules, stage: 'canary' },
  // The site answers with a browser check from a cloud address; not verified anywhere yet.
  { manifest: icefyManifest, rules: icefyRules, stage: 'stable' },
];

/**
 * First-party code providers, with the stage each ships in.
 *
 * The rule for `stable`: a stream from this provider has been tried and answered with media from a
 * network we could measure (the dated evidence is in docs/platform/PROVIDERS.md), or the provider
 * was already first-party and is unchanged. Everything else is `canary`: it is watched by the
 * monitor, and a server promotes it by itself once it has passed three checks in a row with a
 * verified stream (or a person does, with one command).
 */
export const CODE_PROVIDERS: { module: ProviderModule; stage: Stage }[] = [
  { module: febbox, stage: 'stable' },
  { module: castle, stage: 'stable' },
  { module: vixsrc, stage: 'stable' },
  // Needs a browser worker. Verified through one from a cloud address on 2026-11-24.
  { module: vidnest, stage: 'stable' },
  // Its JSON API, with the id token from a third-party service. Verified from a cloud address on 2026-11-26.
  { module: vidlink, stage: 'stable' },
  // Named servers behind an API whose requests enc-dec.app seals and opens. Each returned streams
  // that verified from a cloud address on 2026-11-26.
  { module: cinejoy, stage: 'stable' },
  { module: meowtv, stage: 'stable' },
  // Ported from the server-only classes with the same protocol, but no stream of theirs could be
  // verified from where this was built: their sites do not connect, answer with a browser check,
  // or return an empty table there. They may well work from a home connection.
  { module: vidrock, stage: 'stable' },
  { module: popr, stage: 'stable' },
  { module: fsharetv, stage: 'stable' },
  { module: streammafia, stage: 'stable' },
  // Ported, but the live site no longer speaks the protocol they were written for (or their
  // extraction changed in the port and has not been validated from a network that reaches the site).
  { module: vidsrc, stage: 'stable' },
  { module: videasy, stage: 'stable' },
  { module: vidzee, stage: 'canary' },
  // Ported, but their API hosts no longer exist in DNS.
  { module: tulnex, stage: 'canary' },
  { module: peachify, stage: 'canary' },
  // Anime, searched by AniList / MyAnimeList id or by title. Each one's stage comes from a live
  // gate; see packs/anime.ts for what was measured.
  ...ANIME_PROVIDERS,
];

export interface PackOptions {
  /** Domain configs that replace the shipped defaults (from a newer registry). */
  domains?: Record<string, DomainConfig>;
  /** Include the vendored StreamViva sources (loaded lazily; they are large). */
  fallback?: boolean;
}

/** The pack as the engine wants it: every module with its stage and its domain config. */
export async function loadPack(opts: PackOptions = {}): Promise<LoadedProvider[]> {
  const domains = { ...DEFAULT_DOMAINS, ...opts.domains };
  const out: LoadedProvider[] = [
    ...CODE_PROVIDERS.map(({ module, stage }) => ({ module, stage, domains: domains[module.manifest.id] })),
    ...RULE_PROVIDERS.map(({ manifest, rules, stage }) => ({ module: defineRuleProvider(manifest, rules), stage, domains: domains[manifest.id] })),
  ];
  // The engine behind these is large; streamviva.ts only downloads it when this is called.
  if (opts.fallback) out.push(...(await loadFallbackProviders()).map((module) => ({ module, stage: 'stable' as Stage })));
  return out;
}

/** Just the first-party modules, without the lazy fallback (synchronous). */
export function loadCorePack(domainOverrides: Record<string, DomainConfig> = {}): LoadedProvider[] {
  const domains = { ...DEFAULT_DOMAINS, ...domainOverrides };
  return [
    ...CODE_PROVIDERS.map(({ module, stage }) => ({ module, stage, domains: domains[module.manifest.id] })),
    ...RULE_PROVIDERS.map(({ manifest, rules, stage }) => ({ module: defineRuleProvider(manifest, rules), stage, domains: domains[manifest.id] })),
  ];
}
