/**
 * Execution environments and capability matching.
 *
 * A provider says what it needs (features, whose network, a personal setting). A runtime says what
 * it has. Matching the two decides where a provider runs, so no provider is tied to one runtime
 * and no client has to know which runtime served it.
 */
import { satisfies } from './semver.js';
import { CONTRACT_VERSION, SDK_VERSION, type Feature, type ProviderManifest, type RuntimeDescriptor, type RuntimeKind } from './types.js';

const DEFAULTS: Record<RuntimeKind, Pick<RuntimeDescriptor, 'egress' | 'features' | 'label'>> = {
  server: { egress: 'datacenter', features: ['forbidden-headers', 'cookies', 'node', 'session'], label: 'a server' },
  edge: { egress: 'datacenter', features: ['forbidden-headers', 'cookies'], label: 'an edge function' },
  extension: { egress: 'user', features: ['forbidden-headers', 'cookies', 'session', 'user-settings'], label: 'this browser (extension)' },
  app: { egress: 'user', features: ['forbidden-headers', 'cookies', 'session', 'user-settings'], label: 'this device (app)' },
  browser: { egress: 'datacenter', features: ['js-render', 'cookies', 'session'], label: 'an automated browser' },
  frame: { egress: 'user', features: ['js-render'], label: 'an embedded player' },
  remote: { egress: 'datacenter', features: [], label: 'a remote service' },
};

/** A descriptor for a runtime kind with the usual capabilities; override what differs (a server at home has egress 'user'). */
export function describeRuntime(kind: RuntimeKind, overrides: Partial<RuntimeDescriptor> = {}): RuntimeDescriptor {
  return { kind, sdk: SDK_VERSION, contract: CONTRACT_VERSION, ...DEFAULTS[kind], features: [...DEFAULTS[kind].features], ...overrides };
}

export interface Suitability {
  ok: boolean;
  /** Why not, as short machine-readable reasons ("feature:cookies", "egress:user", "setting:febboxToken"). */
  missing: string[];
}

/**
 * Whether a provider can run in a runtime. `settings` are the per-device settings that runtime
 * holds; pass them to check a required setting is actually present.
 */
export function canRun(manifest: ProviderManifest, runtime: RuntimeDescriptor, settings?: Record<string, unknown>): Suitability {
  const missing: string[] = [];
  if (!manifest.runtimes.includes(runtime.kind)) missing.push(`runtime:${runtime.kind}`);
  if (manifest.contract !== runtime.contract) missing.push(`contract:${manifest.contract}`);
  if (!satisfies(runtime.sdk, manifest.dependencies?.sdk)) missing.push(`sdk:${manifest.dependencies?.sdk}`);
  const has = new Set<Feature>(runtime.features);
  for (const f of manifest.requires?.features ?? []) if (!has.has(f)) missing.push(`feature:${f}`);
  if (manifest.requires?.egress === 'user' && runtime.egress !== 'user') missing.push('egress:user');
  const setting = manifest.requires?.setting;
  if (setting) {
    if (!has.has('user-settings') && !(settings && settings[setting])) missing.push(`setting:${setting}`);
    else if (settings && !settings[setting]) missing.push(`setting:${setting}`);
  }
  return { ok: missing.length === 0, missing };
}

/** Local runtimes on the viewer's own connection come first; a frame is the last resort. */
const PREFERENCE: RuntimeKind[] = ['app', 'extension', 'server', 'edge', 'remote', 'browser', 'frame'];

export interface RuntimeHealthView {
  /** False while that provider's circuit is open in that runtime. */
  allowed(provider: string, runtime: RuntimeKind): boolean;
  reliability(provider: string, runtime: RuntimeKind): number;
}

/**
 * The best runtime among those available for one provider, or undefined when none fits. Runtimes
 * on the viewer's network win over data-centre ones; a runtime whose circuit is open is skipped.
 */
export function chooseRuntime(manifest: ProviderManifest, available: RuntimeDescriptor[], health?: RuntimeHealthView, settings?: Record<string, unknown>): RuntimeDescriptor | undefined {
  return available
    .filter((r) => canRun(manifest, r, settings).ok && (health?.allowed(manifest.id, r.kind) ?? true))
    .sort((a, b) => {
      const egress = Number(b.egress === 'user') - Number(a.egress === 'user');
      if (egress) return egress;
      const rel = (health?.reliability(manifest.id, b.kind) ?? 0.5) - (health?.reliability(manifest.id, a.kind) ?? 0.5);
      if (Math.abs(rel) > 0.2) return rel;
      return PREFERENCE.indexOf(a.kind) - PREFERENCE.indexOf(b.kind);
    })[0];
}

export interface PlanEntry {
  provider: string;
  /** local: run here. remote: ask the resolver API. none: nothing can run it right now. */
  where: 'local' | 'remote' | 'none';
  runtime?: RuntimeKind;
  /** Why it landed there (or nowhere). */
  reason: string;
}

/**
 * Capability negotiation for a client: for every provider, run it locally when a local runtime
 * fits (the viewer's own connection resolves links that play from the viewer's own connection),
 * otherwise hand it to the remote resolver if that can run it.
 */
export function planExecution(
  manifests: ProviderManifest[],
  opts: {
    /** Runtimes this client has itself (extension or app bridge). */
    local: RuntimeDescriptor[];
    /** Runtimes the remote resolver offers, when one is reachable. */
    remote?: RuntimeDescriptor[];
    health?: RuntimeHealthView;
    /** Per-device settings the local runtimes hold. */
    settings?: Record<string, unknown>;
  },
): PlanEntry[] {
  return manifests.map((m) => {
    const local = chooseRuntime(m, opts.local, opts.health, opts.settings);
    if (local) return { provider: m.id, where: 'local', runtime: local.kind, reason: `runs on ${local.label ?? local.kind}` };
    // A provider that needs a personal setting never goes to a remote runtime.
    const remote = m.requires?.setting ? undefined : chooseRuntime(m, opts.remote ?? [], opts.health);
    if (remote) return { provider: m.id, where: 'remote', runtime: remote.kind, reason: `runs on ${remote.label ?? remote.kind}` };
    const why = [...new Set([...opts.local, ...(opts.remote ?? [])].flatMap((r) => canRun(m, r, r.features.includes('user-settings') ? opts.settings : undefined).missing))];
    return { provider: m.id, where: 'none', reason: why.length ? `needs ${why.join(', ')}` : 'no runtime available' };
  });
}
