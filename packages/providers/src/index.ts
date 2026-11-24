/**
 * @charcoal/providers: the first-party provider pack.
 *
 * Everything here is written against @charcoal/provider-sdk: each provider is a module with a
 * manifest (identity and capabilities), its addresses live in ./domains.ts, and the same modules
 * run on the server, in the page through a bridge, or anywhere else a transport exists. Nothing in
 * this pack knows which runtime it is in.
 */
import { defineRuleProvider, type DomainConfig, type LoadedProvider, type ProviderModule, type Stage } from '@charcoal/provider-sdk';
import { DEFAULT_DOMAINS } from './domains.js';
import { castle } from './providers/castle.js';
import { febbox } from './providers/febbox.js';
import { vixsrc } from './providers/vixsrc.js';
import { cinesuManifest, cinesuRules } from './rules/cinesu.js';

export * from './types.js';
export { nativeFetcher, getJson } from './fetch.js';
export { DEFAULT_DOMAINS } from './domains.js';
export { checkFebboxToken } from './providers/febbox.js';
import { loadFallbackProviders } from './streamviva.js';
export { loadFallbackProviders };
export { primesrc, STREAMVIVA_VERSION } from './streamviva.js';
export { cinesuManifest, cinesuRules } from './rules/cinesu.js';
export { castle, febbox, vixsrc };

/** A provider declared as data: its manifest and its rules. */
export const RULE_PROVIDERS = [{ manifest: cinesuManifest, rules: cinesuRules, stage: 'canary' as Stage }];

/** First-party code providers, with the stage each ships in. */
export const CODE_PROVIDERS: { module: ProviderModule; stage: Stage }[] = [
  { module: febbox, stage: 'stable' },
  { module: castle, stage: 'stable' },
  { module: vixsrc, stage: 'stable' },
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
