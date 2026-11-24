/**
 * The entry point for provider authors. `defineProvider` checks the manifest when the module is
 * loaded, so a malformed provider fails at start-up (and in its tests), not on a viewer's request.
 */
import { validateManifest } from './registry.js';
import { CONTRACT_VERSION, type ProviderManifest, type ProviderModule } from './types.js';

type ManifestInput = Omit<ProviderManifest, 'contract'> & { contract?: typeof CONTRACT_VERSION };

export function defineProvider(provider: Omit<ProviderModule, 'manifest'> & { manifest: ManifestInput }): ProviderModule {
  const manifest: ProviderManifest = { ...provider.manifest, contract: CONTRACT_VERSION };
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`Invalid provider manifest: ${errors.join('; ')}`);
  if (typeof provider.getSources !== 'function') throw new Error(`Provider "${manifest.id}" has no getSources()`);
  return Object.freeze({ ...provider, manifest: Object.freeze(manifest) });
}
