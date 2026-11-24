/**
 * The provider registry: one signed document that says which providers exist, what each can do,
 * where its domains are, which version is current, which stage it is in, and how to rank them.
 *
 * It is data. A client or server reads it to discover providers; changing a rank, a stage, a
 * domain or a rule pack means publishing a new registry version, not shipping an application.
 * Documents are signed (Ed25519) and verified against keys pinned in the reader; a reader that
 * gets a bad document keeps the last good one.
 */
import { validateDomainConfig, type DomainConfig } from './domains.js';
import type { Stage } from './engine.js';
import type { HealthSummary } from './health.js';
import { isValidHostPattern } from './policy.js';
import type { RankWeights } from './rank.js';
import type { RulePack } from './rules.js';
import { isVersion, satisfies } from './semver.js';
import { CONTRACT_VERSION, type ProviderManifest, type RuntimeKind } from './types.js';

export const REGISTRY_SCHEMA = 1;

export interface ReleaseInfo {
  version: string;
  at: string;
  notes?: string;
  /** The version this one replaced, kept so a rollback knows where to go. */
  previous?: string;
}

export interface RegistryEntry {
  manifest: ProviderManifest;
  stage: Stage;
  /** Overrides the manifest's rank. */
  rank?: number;
  domains?: DomainConfig;
  /** Present for declarative providers: the extraction rules themselves, as data. */
  rules?: RulePack;
  /** Present for code providers shipped as a separate bundle (optional; first-party code ships with the app). */
  bundle?: { url: string; sha256: string };
  release: ReleaseInfo;
  /** Values for the manifest's non-secret config fields. */
  config?: Record<string, string | number | boolean>;
  /** Measured health per runtime, as last published by the pipeline. */
  health?: HealthSummary[];
}

export interface RegistryDocument {
  schema: typeof REGISTRY_SCHEMA;
  /** Increases with every publication. */
  version: number;
  generatedAt: string;
  channel: 'stable' | 'canary';
  /** Readers older than this must ignore the document. */
  minSdk?: string;
  endpoints: {
    /** Resolver API bases, in order of preference. */
    resolvers: string[];
    /** Other places this same registry is published. */
    mirrors?: string[];
  };
  ranking?: Partial<RankWeights>;
  providers: RegistryEntry[];
}

export interface SignedRegistry {
  /** The exact JSON text that was signed. */
  payload: string;
  /** base64 */
  signature: string;
  keyId: string;
  alg: 'Ed25519';
}

const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const RUNTIMES = new Set<RuntimeKind>(['server', 'edge', 'extension', 'app', 'browser', 'frame', 'remote']);

/** Problems with a manifest, as sentences. */
export function validateManifest(m: ProviderManifest): string[] {
  const e: string[] = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  if (!ID.test(m.id ?? '')) e.push(`id "${m.id}" must be lowercase letters, digits and dashes`);
  const at = `${m.id}:`;
  if (!m.name) e.push(`${at} name is required`);
  if (!isVersion(m.version ?? '')) e.push(`${at} version "${m.version}" is not x.y.z`);
  if (m.contract !== CONTRACT_VERSION) e.push(`${at} contract ${m.contract} is not supported (this SDK speaks ${CONTRACT_VERSION})`);
  if (!Array.isArray(m.kinds) || !m.kinds.length) e.push(`${at} kinds is empty`);
  if (!Array.isArray(m.lookup) || !m.lookup.length) e.push(`${at} lookup is empty`);
  if (!Array.isArray(m.runtimes) || !m.runtimes.length) e.push(`${at} runtimes is empty`);
  for (const r of m.runtimes ?? []) if (!RUNTIMES.has(r)) e.push(`${at} unknown runtime "${r}"`);
  if (!Array.isArray(m.domainRoles)) e.push(`${at} domainRoles must be a list (it may be empty)`);
  if (!m.output?.types?.length) e.push(`${at} output.types is empty`);
  for (const h of m.extraHosts ?? []) if (!isValidHostPattern(h)) e.push(`${at} extraHosts entry "${h}" is not a host pattern`);
  if (m.network && !['declared', 'open', 'unmanaged'].includes(m.network)) e.push(`${at} unknown network policy "${m.network}"`);
  if ((m.network ?? 'declared') === 'declared' && !(m.domainRoles ?? []).length && !(m.extraHosts ?? []).length) e.push(`${at} declares no hosts at all`);
  if (m.limits?.timeoutMs !== undefined && (m.limits.timeoutMs < 1000 || m.limits.timeoutMs > 60_000)) e.push(`${at} limits.timeoutMs must be between 1000 and 60000`);
  if (m.limits?.maxRequests !== undefined && (m.limits.maxRequests < 1 || m.limits.maxRequests > 200)) e.push(`${at} limits.maxRequests must be between 1 and 200`);
  if (m.requires?.setting && !m.runtimes.some((r) => r === 'extension' || r === 'app' || r === 'server')) e.push(`${at} requires a personal setting but lists no runtime that can hold one`);
  return e;
}

/** Problems with a whole registry document, as sentences. Empty when it can be published. */
export function validateRegistry(doc: RegistryDocument): string[] {
  const e: string[] = [];
  if (!doc || typeof doc !== 'object') return ['registry is not an object'];
  if (doc.schema !== REGISTRY_SCHEMA) e.push(`schema ${doc.schema} is not supported`);
  if (!Number.isInteger(doc.version) || doc.version < 1) e.push('version must be a positive integer');
  if (!doc.generatedAt || Number.isNaN(Date.parse(doc.generatedAt))) e.push('generatedAt is not a date');
  if (doc.channel !== 'stable' && doc.channel !== 'canary') e.push('channel must be stable or canary');
  if (!Array.isArray(doc.endpoints?.resolvers)) e.push('endpoints.resolvers must be a list');
  for (const r of [...(doc.endpoints?.resolvers ?? []), ...(doc.endpoints?.mirrors ?? [])]) if (!/^https?:\/\//.test(r)) e.push(`endpoint "${r}" is not a URL`);
  const ids = new Set<string>();
  for (const entry of doc.providers ?? []) {
    const m = entry.manifest;
    e.push(...validateManifest(m));
    if (!m) continue;
    if (ids.has(m.id)) e.push(`${m.id}: listed twice`);
    ids.add(m.id);
    if (!['stable', 'canary', 'disabled'].includes(entry.stage)) e.push(`${m.id}: unknown stage "${entry.stage}"`);
    if (entry.release?.version !== m.version) e.push(`${m.id}: release.version ${entry.release?.version} does not match manifest version ${m.version}`);
    if ((m.domainRoles ?? []).length) {
      if (!entry.domains) e.push(`${m.id}: uses domain roles but has no domain config`);
      else {
        if (entry.domains.provider !== m.id) e.push(`${m.id}: domain config belongs to "${entry.domains.provider}"`);
        e.push(...validateDomainConfig(entry.domains, m.domainRoles).map((x) => `${m.id}: ${x}`));
      }
    }
    if (entry.rules && entry.rules.id !== m.id) e.push(`${m.id}: rule pack belongs to "${entry.rules.id}"`);
    if (entry.rules && entry.rules.version !== m.version) e.push(`${m.id}: rule pack version ${entry.rules.version} does not match manifest version ${m.version}`);
    if (entry.bundle && !/^[0-9a-f]{64}$/.test(entry.bundle.sha256)) e.push(`${m.id}: bundle sha256 is not a hex digest`);
    for (const dep of m.dependencies?.providers ?? []) if (!(doc.providers ?? []).some((p) => p.manifest?.id === dep)) e.push(`${m.id}: depends on "${dep}", which is not in the registry`);
    for (const [k, v] of Object.entries(entry.config ?? {})) {
      const field = m.config?.[k];
      if (!field) e.push(`${m.id}: config "${k}" is not declared in the manifest`);
      else if (field.secret) e.push(`${m.id}: config "${k}" is secret and must not be published`);
      else if (typeof v !== field.type) e.push(`${m.id}: config "${k}" should be a ${field.type}`);
    }
  }
  return e;
}

/** Whether a reader with this SDK and contract can use an entry. */
export function isCompatible(entry: RegistryEntry, reader: { sdk: string; contract: number }): boolean {
  return entry.manifest.contract === reader.contract && satisfies(reader.sdk, entry.manifest.dependencies?.sdk);
}

// ---------- signing ----------

const b64 = {
  encode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(text: string): Uint8Array {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export interface RegistryKeyPair {
  keyId: string;
  /** base64 raw public key (32 bytes): what readers pin. */
  publicKey: string;
  /** base64 PKCS#8 private key: a secret for the publishing pipeline only. */
  privateKey: string;
}

export async function generateRegistryKey(keyId: string): Promise<RegistryKeyPair> {
  // Typed through exportKey's own parameter so this compiles with or without the DOM lib.
  type Key = Parameters<typeof crypto.subtle.exportKey>[1];
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as unknown as { publicKey: Key; privateKey: Key };
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { keyId, publicKey: b64.encode(pub), privateKey: b64.encode(priv) };
}

export async function signRegistry(doc: RegistryDocument, key: { keyId: string; privateKey: string }): Promise<SignedRegistry> {
  const errors = validateRegistry(doc);
  if (errors.length) throw new Error(`Registry is not valid, refusing to sign: ${errors.slice(0, 5).join('; ')}`);
  const payload = JSON.stringify(doc);
  const k = await crypto.subtle.importKey('pkcs8', buf(b64.decode(key.privateKey)), { name: 'Ed25519' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, k, buf(new TextEncoder().encode(payload))));
  return { payload, signature: b64.encode(sig), keyId: key.keyId, alg: 'Ed25519' };
}

export class RegistryError extends Error {}

/**
 * Checks the signature against the pinned keys, then the document itself. Throws RegistryError on
 * any problem; the caller keeps whatever registry it already had.
 */
export async function verifyRegistry(signed: SignedRegistry, trustedKeys: Record<string, string>, reader?: { sdk: string }): Promise<RegistryDocument> {
  if (!signed || signed.alg !== 'Ed25519' || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') throw new RegistryError('Not a signed registry');
  const pub = trustedKeys[signed.keyId];
  if (!pub) throw new RegistryError(`Signed with an unknown key "${signed.keyId}"`);
  let ok = false;
  try {
    const k = await crypto.subtle.importKey('raw', buf(b64.decode(pub)), { name: 'Ed25519' }, false, ['verify']);
    ok = await crypto.subtle.verify({ name: 'Ed25519' }, k, buf(b64.decode(signed.signature)), buf(new TextEncoder().encode(signed.payload)));
  } catch (e) {
    throw new RegistryError(`Signature could not be checked: ${(e as Error).message}`);
  }
  if (!ok) throw new RegistryError('Signature does not match');
  let doc: RegistryDocument;
  try {
    doc = JSON.parse(signed.payload) as RegistryDocument;
  } catch {
    throw new RegistryError('Signed payload is not JSON');
  }
  const errors = validateRegistry(doc);
  if (errors.length) throw new RegistryError(`Registry is not valid: ${errors.slice(0, 3).join('; ')}`);
  if (reader && doc.minSdk && !satisfies(reader.sdk, `>=${doc.minSdk}`)) throw new RegistryError(`Registry needs SDK ${doc.minSdk} or newer`);
  return doc;
}

/**
 * Accepts a newly fetched registry only if it verifies and is not older than the one in hand
 * (a replayed old document must not undo a kill-switch). Returns the document to use.
 */
export async function acceptRegistry(current: RegistryDocument | undefined, candidate: SignedRegistry, trustedKeys: Record<string, string>, reader?: { sdk: string }): Promise<{ doc: RegistryDocument | undefined; accepted: boolean; reason?: string }> {
  try {
    const doc = await verifyRegistry(candidate, trustedKeys, reader);
    if (current && doc.version < current.version) return { doc: current, accepted: false, reason: `older (${doc.version}) than the one in use (${current.version})` };
    return { doc, accepted: true };
  } catch (e) {
    return { doc: current, accepted: false, reason: (e as Error).message };
  }
}

// ---------- changes ----------

export interface RegistryChange {
  provider: string;
  kind: 'added' | 'removed' | 'version' | 'stage' | 'rank' | 'domains' | 'rules' | 'config';
  from?: string;
  to?: string;
}

/** What differs between two registry versions (for audit logs and release notes). */
export function diffRegistry(before: RegistryDocument | undefined, after: RegistryDocument): RegistryChange[] {
  const changes: RegistryChange[] = [];
  const a = new Map((before?.providers ?? []).map((p) => [p.manifest.id, p]));
  const b = new Map(after.providers.map((p) => [p.manifest.id, p]));
  for (const [id, p] of b) {
    const old = a.get(id);
    if (!old) {
      changes.push({ provider: id, kind: 'added', to: p.manifest.version });
      continue;
    }
    if (old.manifest.version !== p.manifest.version) changes.push({ provider: id, kind: 'version', from: old.manifest.version, to: p.manifest.version });
    if (old.stage !== p.stage) changes.push({ provider: id, kind: 'stage', from: old.stage, to: p.stage });
    if ((old.rank ?? old.manifest.rank) !== (p.rank ?? p.manifest.rank)) changes.push({ provider: id, kind: 'rank', from: String(old.rank ?? old.manifest.rank), to: String(p.rank ?? p.manifest.rank) });
    if ((old.domains?.version ?? 0) !== (p.domains?.version ?? 0)) changes.push({ provider: id, kind: 'domains', from: String(old.domains?.version ?? 0), to: String(p.domains?.version ?? 0) });
    if (JSON.stringify(old.rules ?? null) !== JSON.stringify(p.rules ?? null)) changes.push({ provider: id, kind: 'rules', from: old.rules?.version, to: p.rules?.version });
    if (JSON.stringify(old.config ?? null) !== JSON.stringify(p.config ?? null)) changes.push({ provider: id, kind: 'config' });
  }
  for (const id of a.keys()) if (!b.has(id)) changes.push({ provider: id, kind: 'removed' });
  return changes.sort((x, y) => x.provider.localeCompare(y.provider) || x.kind.localeCompare(y.kind));
}

/**
 * A registry in which one provider is put back to how an earlier registry had it (version, rules,
 * domains, rank). The result gets a new, higher version number: a rollback is a publication.
 */
export function rollbackProvider(current: RegistryDocument, previous: RegistryDocument, providerId: string, now = new Date()): RegistryDocument {
  const old = previous.providers.find((p) => p.manifest.id === providerId);
  if (!old) throw new Error(`"${providerId}" is not in registry version ${previous.version}`);
  if (!current.providers.some((p) => p.manifest.id === providerId)) throw new Error(`"${providerId}" is not in the current registry`);
  // Domain versions only ever go up, also across a rollback.
  const cur = current.providers.find((p) => p.manifest.id === providerId)!;
  const domains = old.domains ? { ...old.domains, version: Math.max(old.domains.version, cur.domains?.version ?? 0) + 1, updatedAt: now.toISOString() } : undefined;
  const entry: RegistryEntry = { ...old, domains, release: { ...old.release, at: now.toISOString(), notes: `Rolled back from ${cur.manifest.version}`, previous: cur.manifest.version } };
  return { ...current, version: current.version + 1, generatedAt: now.toISOString(), providers: current.providers.map((p) => (p.manifest.id === providerId ? entry : p)) };
}
