/**
 * The registry as files: the current document, every earlier version, and an append-only audit
 * log. Publishing is copying `registry.json` (or its signed form) to static hosting; rolling back
 * is one command because nothing is ever overwritten without a copy.
 *
 *   <dir>/registry.json            the current document (unsigned, reviewable in a diff)
 *   <dir>/registry.signed.json     what clients fetch
 *   <dir>/history/v<version>.json  every version that was ever current
 *   <dir>/audit.log                one JSON line per change
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTRACT_VERSION,
  defineRuleProvider,
  diffRegistry,
  promoteDomain,
  REGISTRY_SCHEMA,
  rollbackDomain,
  rollbackProvider,
  switchActive,
  validateRegistry,
  validateRulePack,
  type DomainAuditEntry,
  type DomainConfig,
  type Fetcher,
  type RegistryChange,
  type RegistryDocument,
  type RegistryEntry,
  type Stage,
} from '@charcoal/provider-sdk';

export interface AuditLine {
  at: string;
  by: string;
  action: string;
  fromVersion?: number;
  toVersion: number;
  changes: RegistryChange[];
  note?: string;
  detail?: unknown;
}

export class RegistryStore {
  constructor(readonly dir: string) {}

  private path(name: string) {
    return join(this.dir, name);
  }

  exists(): boolean {
    return existsSync(this.path('registry.json'));
  }

  read(): RegistryDocument {
    if (!this.exists()) throw new Error(`No registry at ${this.path('registry.json')} (run "build" first)`);
    return JSON.parse(readFileSync(this.path('registry.json'), 'utf8')) as RegistryDocument;
  }

  versions(): number[] {
    const dir = this.path('history');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((f) => /^v(\d+)\.json$/.exec(f)?.[1])
      .filter((v): v is string => !!v)
      .map(Number)
      .sort((a, b) => a - b);
  }

  readVersion(version: number): RegistryDocument {
    const file = this.path(`history/v${version}.json`);
    if (!existsSync(file)) throw new Error(`No registry version ${version} in history (have: ${this.versions().join(', ') || 'none'})`);
    return JSON.parse(readFileSync(file, 'utf8')) as RegistryDocument;
  }

  audit(): AuditLine[] {
    const file = this.path('audit.log');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditLine);
  }

  /**
   * Makes `doc` the current registry. Refuses an invalid document, a version that doesn't move
   * forward, and a "change" that changes nothing. Keeps the previous version and logs the change.
   */
  write(doc: RegistryDocument, by: string, action: string, note?: string, detail?: unknown): AuditLine {
    const errors = validateRegistry(doc);
    for (const e of doc.providers) if (e.rules) errors.push(...validateRulePack(e.rules, e.manifest).map((x) => `${e.manifest.id}: ${x}`));
    if (errors.length) throw new Error(`Refusing to write an invalid registry:\n  ${errors.join('\n  ')}`);
    const before = this.exists() ? this.read() : undefined;
    if (before && doc.version <= before.version) throw new Error(`Version ${doc.version} doesn't move forward from ${before.version}`);
    const changes = diffRegistry(before, doc);
    if (before && !changes.length && action !== 'build') throw new Error('Nothing changed');
    mkdirSync(this.path('history'), { recursive: true });
    writeFileSync(this.path(`history/v${doc.version}.json`), JSON.stringify(doc, null, 2) + '\n');
    writeFileSync(this.path('registry.json'), JSON.stringify(doc, null, 2) + '\n');
    const line: AuditLine = { at: doc.generatedAt, by, action, fromVersion: before?.version, toVersion: doc.version, changes, note, detail };
    appendFileSync(this.path('audit.log'), JSON.stringify(line) + '\n');
    return line;
  }
}

const bump = (doc: RegistryDocument, now: Date): RegistryDocument => ({ ...doc, version: doc.version + 1, generatedAt: now.toISOString() });

const entryOf = (doc: RegistryDocument, id: string): RegistryEntry => {
  const e = doc.providers.find((p) => p.manifest.id === id);
  if (!e) throw new Error(`No provider "${id}" in the registry (have: ${doc.providers.map((p) => p.manifest.id).join(', ')})`);
  return e;
};

const replace = (doc: RegistryDocument, id: string, f: (e: RegistryEntry) => RegistryEntry): RegistryDocument => ({ ...doc, providers: doc.providers.map((p) => (p.manifest.id === id ? f(p) : p)) });

/**
 * The registry built from the provider pack (the starting point, and what `build` refreshes after
 * a provider's code or rules changed). Stages, ranks and domain overrides already in `previous`
 * are carried over: a rebuild never silently undoes an operator's decisions.
 */
export function buildFromPack(
  pack: { code: { manifest: RegistryEntry['manifest']; stage: Stage }[]; rules: { manifest: RegistryEntry['manifest']; rules: NonNullable<RegistryEntry['rules']>; stage: Stage }[]; domains: Record<string, DomainConfig> },
  opts: { previous?: RegistryDocument; resolvers?: string[]; mirrors?: string[]; channel?: 'stable' | 'canary'; now?: Date },
): RegistryDocument {
  const now = opts.now ?? new Date();
  const prev = new Map((opts.previous?.providers ?? []).map((p) => [p.manifest.id, p]));
  const entry = (manifest: RegistryEntry['manifest'], stage: Stage, rules?: RegistryEntry['rules']): RegistryEntry => {
    const old = prev.get(manifest.id);
    const sameVersion = old?.manifest.version === manifest.version;
    const packDomains = pack.domains[manifest.id];
    // Keep a newer domain config that was promoted in the registry; the pack's is only the default.
    const domains = old?.domains && (!packDomains || old.domains.version >= packDomains.version) ? old.domains : packDomains;
    if (rules) defineRuleProvider(manifest, rules); // throws when the pack doesn't fit the manifest
    return {
      manifest: { ...manifest, contract: CONTRACT_VERSION },
      // A new version of a provider always starts in the stage the pack ships it in.
      stage: sameVersion ? old!.stage : stage,
      ...(sameVersion && old!.rank !== undefined ? { rank: old!.rank } : {}),
      ...(manifest.domainRoles.length && domains ? { domains } : {}),
      ...(rules ? { rules } : {}),
      release: sameVersion ? old!.release : { version: manifest.version, at: now.toISOString(), ...(old ? { previous: old.manifest.version } : {}) },
    };
  };
  return {
    schema: REGISTRY_SCHEMA,
    version: (opts.previous?.version ?? 0) + 1,
    generatedAt: now.toISOString(),
    channel: opts.channel ?? opts.previous?.channel ?? 'stable',
    endpoints: { resolvers: opts.resolvers ?? opts.previous?.endpoints.resolvers ?? [], ...((opts.mirrors ?? opts.previous?.endpoints.mirrors)?.length ? { mirrors: opts.mirrors ?? opts.previous?.endpoints.mirrors } : {}) },
    ...(opts.previous?.ranking ? { ranking: opts.previous.ranking } : {}),
    providers: [...pack.code.map((c) => entry(c.manifest, c.stage)), ...pack.rules.map((r) => entry(r.manifest, r.stage, r.rules))],
  };
}

export function setStage(doc: RegistryDocument, id: string, stage: Stage, now = new Date()): RegistryDocument {
  entryOf(doc, id);
  return replace(bump(doc, now), id, (e) => ({ ...e, stage }));
}

export function setRank(doc: RegistryDocument, id: string, rank: number | undefined, now = new Date()): RegistryDocument {
  entryOf(doc, id);
  return replace(bump(doc, now), id, (e) => {
    const { rank: _old, ...rest } = e;
    void _old;
    return rank === undefined ? rest : { ...rest, rank };
  });
}

/**
 * Promotes a new address for a domain role. With a fetcher, the address must pass its endpoint
 * check first; with `null` (a machine that can't reach the site) the change is made unchecked and
 * the audit entry says so. Returns the audit entry either way.
 */
export async function setDomain(doc: RegistryDocument, id: string, role: string, origin: string, by: string, fetcher: Fetcher | null, reason?: string, now = new Date()) {
  const e = entryOf(doc, id);
  if (!e.domains) throw new Error(`"${id}" has no domain config`);
  if (!fetcher) {
    if (!e.domains.roles[role]) throw new Error(`Unknown role "${role}"`);
    const config = switchActive(e.domains, role, origin, now);
    const audit: DomainAuditEntry = { provider: id, at: now.toISOString(), by, action: 'switch-active', role, from: e.domains.roles[role].active, to: config.roles[role].active, fromVersion: e.domains.version, toVersion: config.version, reason };
    return { accepted: true, audit, doc: replace(bump(doc, now), id, (x) => ({ ...x, domains: config })) };
  }
  const result = await promoteDomain(e.domains, { role, origin, by, reason }, fetcher, undefined, now);
  return { accepted: result.accepted, audit: result.audit, doc: result.accepted ? replace(bump(doc, now), id, (x) => ({ ...x, domains: result.config })) : doc };
}

/** Puts one provider's domains back to what an earlier registry version had. */
export function rollbackDomains(doc: RegistryDocument, earlier: RegistryDocument, id: string, by: string, now = new Date()): RegistryDocument {
  const cur = entryOf(doc, id);
  const old = entryOf(earlier, id);
  if (!cur.domains || !old.domains) throw new Error(`"${id}" has no domain config in one of the versions`);
  const { config } = rollbackDomain(cur.domains, old.domains, by, undefined, now);
  return replace(bump(doc, now), id, (x) => ({ ...x, domains: config }));
}

/** Puts one provider entirely back to how an earlier registry version had it. */
export function rollback(doc: RegistryDocument, earlier: RegistryDocument, id: string, now = new Date()): RegistryDocument {
  return rollbackProvider(doc, earlier, id, now);
}
