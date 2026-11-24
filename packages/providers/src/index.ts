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
import { castle } from './providers/castle.js';
import { febbox } from './providers/febbox.js';
import { fsharetv } from './providers/fsharetv.js';
import { peachify } from './providers/peachify.js';
import { popr } from './providers/popr.js';
import { streammafia } from './providers/streammafia.js';
import { tulnex } from './providers/tulnex.js';
import { videasy } from './providers/videasy.js';
import { vidnest } from './providers/vidnest.js';
import { vidrock } from './providers/vidrock.js';
import { vidsrc } from './providers/vidsrc.js';
import { vidzee } from './providers/vidzee.js';
import { vixsrc } from './providers/vixsrc.js';
import { cinesuManifest, cinesuRules } from './rules/cinesu.js';
import { icefyManifest, icefyRules } from './rules/icefy.js';

export * from './types.js';
export { nativeFetcher, getJson } from './fetch.js';
export { DEFAULT_DOMAINS } from './domains.js';
export { checkFebboxToken } from './providers/febbox.js';
import { loadFallbackProviders } from './streamviva.js';
export { loadFallbackProviders };
export { primesrc, STREAMVIVA_VERSION } from './streamviva.js';
export { cinesuManifest, cinesuRules } from './rules/cinesu.js';
export { icefyManifest, icefyRules } from './rules/icefy.js';
export { castle, febbox, fsharetv, peachify, popr, streammafia, tulnex, videasy, vidnest, vidrock, vidsrc, vidzee, vixsrc };

/**
 * Providers declared as data: a manifest and its rules.
 *
 * Stages. `stable` runs for every request. `canary` runs only when named, in canary checks and in
 * benchmarks: it is where a provider waits when its extraction has changed and has not been
 * validated against the live site, or when its site cannot be reached at the configured address.
 */
export const RULE_PROVIDERS: { manifest: ProviderManifest; rules: RulePack; stage: Stage }[] = [
  // Its address redirects elsewhere and the new host refuses the playlist path.
  { manifest: cinesuManifest, rules: cinesuRules, stage: 'canary' },
  { manifest: icefyManifest, rules: icefyRules, stage: 'stable' },
];

/** First-party code providers, with the stage each ships in. */
export const CODE_PROVIDERS: { module: ProviderModule; stage: Stage }[] = [
  { module: febbox, stage: 'stable' },
  { module: castle, stage: 'stable' },
  { module: vixsrc, stage: 'stable' },
  // Ported from the server-only classes, same protocol as before.
  { module: vidrock, stage: 'stable' },
  { module: popr, stage: 'stable' },
  { module: fsharetv, stage: 'stable' },
  { module: streammafia, stage: 'stable' },
  // Ported, but the live site no longer speaks the protocol they were written for (or their
  // extraction changed in the port and has not been validated from a network that reaches the site).
  { module: vidsrc, stage: 'canary' },
  { module: videasy, stage: 'canary' },
  { module: vidzee, stage: 'canary' },
  { module: vidnest, stage: 'canary' },
  // Ported, but their API hosts no longer exist in DNS.
  { module: tulnex, stage: 'canary' },
  { module: peachify, stage: 'canary' },
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
