/**
 * The provider catalogue of this server: the first-party pack, the vendored fallback pack and the
 * legacy server-only classes, with the control plane's overrides applied. The engine asks it for
 * the current provider list on every request, so a change of stage, rank or domain takes effect
 * immediately, without a restart.
 *
 * It also renders that same state as a registry document, which is what clients discover
 * providers from.
 */
import { CODE_PROVIDERS, DEFAULT_DOMAINS, loadFallbackProviders, RULE_PROVIDERS } from '@charcoal/providers';
import {
  defineRuleProvider,
  REGISTRY_SCHEMA,
  signRegistry,
  summarize,
  validateRegistry,
  type DomainConfig,
  type HealthStore,
  type LoadedProvider,
  type ProviderModule,
  type RankWeights,
  type RegistryDocument,
  type RegistryEntry,
  type RulePack,
  type SignedRegistry,
  type Stage,
} from '@charcoal/provider-sdk';
import type { Overlay } from './overlay.js';

interface BaseEntry {
  module: ProviderModule;
  stage: Stage;
  rules?: RulePack;
}

export interface CatalogOptions {
  legacy: ProviderModule[];
  overlay: Overlay;
  health: HealthStore;
  /** Include the vendored StreamViva sources. */
  fallback: boolean;
  /** Where this resolver is reachable (goes into the registry's endpoint list). */
  publicUrl?: string;
  mirrors?: string[];
  ranking?: Partial<RankWeights>;
  /** base64 PKCS#8 Ed25519 key and its id; without them the registry is served unsigned. */
  signingKey?: { keyId: string; privateKey: string };
  now?: () => number;
}

export class Catalog {
  private base: BaseEntry[] = [];
  private readonly bootedAt: number;
  private signed?: { key: string; value: SignedRegistry };

  private constructor(private readonly opts: CatalogOptions) {
    this.bootedAt = (opts.now ?? Date.now)();
  }

  static async create(opts: CatalogOptions): Promise<Catalog> {
    const c = new Catalog(opts);
    c.base = [
      ...CODE_PROVIDERS.map(({ module, stage }) => ({ module, stage })),
      ...RULE_PROVIDERS.map(({ manifest, rules, stage }) => ({ module: defineRuleProvider(manifest, rules), stage, rules })),
      ...opts.legacy.map((module) => ({ module, stage: 'stable' as Stage })),
    ];
    if (opts.fallback) {
      try {
        c.base.push(...(await loadFallbackProviders()).map((module) => ({ module, stage: 'stable' as Stage })));
      } catch (e) {
        console.warn(`[platform] the fallback pack didn't load: ${(e as Error).message}`);
      }
    }
    const ids = new Set<string>();
    c.base = c.base.filter((b) => {
      const id = b.module.manifest.id;
      if (ids.has(id)) {
        console.warn(`[platform] duplicate provider id "${id}" ignored`);
        return false;
      }
      ids.add(id);
      return true;
    });
    return c;
  }

  has(id: string): boolean {
    return this.base.some((b) => b.module.manifest.id === id);
  }

  /** The domain config in force for a provider: an override if there is one, else the pack's. */
  domains(id: string): DomainConfig | undefined {
    return this.opts.overlay.domains(id) ?? DEFAULT_DOMAINS[id];
  }

  /** What the engine runs, with overrides applied. */
  providers(): LoadedProvider[] {
    return this.base.map((b) => {
      const id = b.module.manifest.id;
      const o = this.opts.overlay.get(id);
      return { module: b.module, stage: o?.stage ?? b.stage, rank: o?.rank, domains: this.domains(id) };
    });
  }

  find(id: string): LoadedProvider | undefined {
    return this.providers().find((p) => p.module.manifest.id === id);
  }

  /** The current state as a registry document. */
  registry(): RegistryDocument {
    const now = (this.opts.now ?? Date.now)();
    const health = summarize(this.opts.health, now);
    const released = new Date(this.bootedAt).toISOString();
    const providers: RegistryEntry[] = this.base.map((b) => {
      const m = b.module.manifest;
      const o = this.opts.overlay.get(m.id);
      const mine = health.filter((h) => h.provider === m.id);
      return {
        manifest: m,
        stage: o?.stage ?? b.stage,
        ...(o?.rank !== undefined ? { rank: o.rank } : {}),
        ...(m.domainRoles.length ? { domains: this.domains(m.id) } : {}),
        ...(b.rules ? { rules: b.rules } : {}),
        release: { version: m.version, at: released },
        ...(mine.length ? { health: mine } : {}),
      };
    });
    return {
      schema: REGISTRY_SCHEMA,
      // Monotonic across restarts (boot time) and across control-plane changes.
      version: Math.floor(this.bootedAt / 1000) + this.opts.overlay.version,
      generatedAt: new Date(now).toISOString(),
      channel: 'stable',
      endpoints: { resolvers: this.opts.publicUrl ? [this.opts.publicUrl] : [], ...(this.opts.mirrors?.length ? { mirrors: this.opts.mirrors } : {}) },
      ...(this.opts.ranking ? { ranking: this.opts.ranking } : {}),
      providers,
    };
  }

  /** Problems that would stop the registry from being published (should be empty). */
  problems(): string[] {
    return validateRegistry(this.registry());
  }

  /**
   * The registry as clients fetch it: signed when a key is configured, plain otherwise. Signing is
   * redone at most once a minute (health numbers inside it change constantly).
   */
  async published(): Promise<{ signed?: SignedRegistry; document?: RegistryDocument }> {
    const doc = this.registry();
    if (!this.opts.signingKey) return { document: doc };
    const key = `${doc.version}:${Math.floor(Date.parse(doc.generatedAt) / 60_000)}`;
    if (this.signed?.key !== key) this.signed = { key, value: await signRegistry(doc, this.opts.signingKey) };
    return { signed: this.signed.value };
  }
}
