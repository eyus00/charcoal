/**
 * Domain management. A provider's addresses are data, kept apart from its extraction logic:
 * the logic asks for "the api role" and gets whatever address is currently configured for it.
 *
 * A DomainConfig is a small versioned document. Changing an address means publishing a new
 * version of that document: no provider code changes and no application release. Every change is
 * validated first and leaves an audit entry, and the previous version stays available to roll back
 * to.
 */
import { classifyStatus, classifyTransport, ProviderError, type FailureCode } from './errors.js';
import { isPublicHost } from './policy.js';
import type { Fetcher } from './types.js';

export interface DomainHealthCheck {
  /** Path to request on the origin (default "/"). */
  path?: string;
  /** Statuses that mean "up" (default: any status below 500 that isn't a bot check). */
  expectStatus?: number[];
  /** Text the body must contain, when the endpoint has a recognisable answer. */
  expectText?: string;
  headers?: Record<string, string>;
}

export interface DomainRole {
  /** The origin in use: "https://host" (optionally with a port), no path. */
  active: string;
  /** Other origins that serve the same thing, in order of preference. */
  alternates?: string[];
  /** Hosts that are the same site under another name (allowed for requests, never chosen). */
  aliases?: string[];
  health?: DomainHealthCheck;
}

export interface DomainConfig {
  provider: string;
  /** Increases by one with every change. */
  version: number;
  updatedAt: string;
  roles: Record<string, DomainRole>;
}

export interface DomainAuditEntry {
  provider: string;
  at: string;
  by: string;
  action: 'create' | 'switch-active' | 'add-alternate' | 'remove-alternate' | 'rollback' | 'edit';
  role?: string;
  from?: string;
  to?: string;
  fromVersion: number;
  toVersion: number;
  reason?: string;
  /** What the validation run found before the change was accepted. */
  validation?: { ok: boolean; checks: DomainCheckResult[] };
}

const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

/** "https://Example.com/" → "https://example.com"; throws on anything that isn't an origin. */
export function normalizeOrigin(value: string): string {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`Not an address: ${value}`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`Not an http(s) address: ${value}`);
  if (u.pathname !== '/' || u.search || u.hash) throw new Error(`A domain is an origin without a path: ${value}`);
  return u.origin.toLowerCase();
}

export const hostOf = (origin: string) => new URL(origin).hostname.toLowerCase();

/** Problems with a config, as sentences. Empty when it is valid. */
export function validateDomainConfig(config: DomainConfig, requiredRoles: string[] = []): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') return ['Domain config is not an object'];
  if (!/^[a-z0-9-]+$/.test(config.provider ?? '')) errors.push('provider must be a lowercase id');
  if (!Number.isInteger(config.version) || config.version < 1) errors.push('version must be a positive integer');
  if (!config.roles || typeof config.roles !== 'object' || !Object.keys(config.roles).length) errors.push('at least one role is required');
  for (const role of requiredRoles) if (!config.roles?.[role]) errors.push(`role "${role}" is used by the provider but not configured`);
  for (const [name, role] of Object.entries(config.roles ?? {})) {
    const all = [role.active, ...(role.alternates ?? [])];
    for (const o of all) {
      if (typeof o !== 'string' || !ORIGIN.test(o)) errors.push(`${name}: "${o}" is not an origin like https://example.com`);
      else if (!isPublicHost(hostOf(o))) errors.push(`${name}: "${o}" is a private or internal address`);
    }
    if (new Set(all.map((o) => String(o).toLowerCase())).size !== all.length) errors.push(`${name}: the same origin is listed twice`);
    for (const a of role.aliases ?? []) if (!/^[a-z0-9.-]+$/i.test(a) || !isPublicHost(a)) errors.push(`${name}: alias "${a}" is not a public host name`);
    if (role.health?.path && !role.health.path.startsWith('/')) errors.push(`${name}: health path must start with "/"`);
  }
  return errors;
}

/** Every host a config makes reachable (active, alternates, aliases). */
export function hostsOf(config: DomainConfig | undefined): string[] {
  if (!config) return [];
  const out = new Set<string>();
  for (const role of Object.values(config.roles)) {
    for (const o of [role.active, ...(role.alternates ?? [])]) out.add(hostOf(o));
    for (const a of role.aliases ?? []) out.add(a.toLowerCase());
  }
  return [...out];
}

/**
 * Resolves roles to origins for one provider run, and fails over within the run: when the origin
 * in use turns out to be unreachable, the next configured alternate takes its place for the rest
 * of the run. Nothing is written back; the caller reports what happened so health and recovery can
 * act on it.
 */
export class DomainResolver {
  private readonly current = new Map<string, string>();
  private readonly dead = new Map<string, Set<string>>();
  readonly failovers: { role: string; from: string; to: string; reason: FailureCode }[] = [];

  constructor(
    readonly config: DomainConfig | undefined,
    /** Origins to avoid from the start (known to be down right now), per role. */
    avoid: Record<string, string[]> = {},
  ) {
    for (const [name, role] of Object.entries(config?.roles ?? {})) {
      const skip = new Set((avoid[name] ?? []).map((o) => o.toLowerCase()));
      const candidates = [role.active, ...(role.alternates ?? [])].map((o) => o.toLowerCase());
      this.current.set(name, candidates.find((o) => !skip.has(o)) ?? candidates[0]);
      this.dead.set(name, new Set());
    }
  }

  origin(role: string): string {
    const o = this.current.get(role);
    if (!o) throw new ProviderError('INTERNAL', `No domain configured for role "${role}"`);
    return o;
  }

  url(role: string, path: string): string {
    return this.origin(role) + (path.startsWith('/') ? path : `/${path}`);
  }

  /** The role a host belongs to, if it is one of this provider's own. */
  roleOf(hostname: string): string | undefined {
    const h = hostname.toLowerCase();
    for (const [name, role] of Object.entries(this.config?.roles ?? {})) {
      if ([role.active, ...(role.alternates ?? [])].some((o) => hostOf(o) === h) || (role.aliases ?? []).some((a) => a.toLowerCase() === h)) return name;
    }
    return undefined;
  }

  /**
   * Marks the role's current origin as down and moves to the next alternate. Returns the new
   * origin, or null when there is nowhere left to go.
   */
  failover(role: string, reason: FailureCode): string | null {
    const cfg = this.config?.roles[role];
    const from = this.current.get(role);
    if (!cfg || !from) return null;
    const dead = this.dead.get(role)!;
    dead.add(from);
    const next = [cfg.active, ...(cfg.alternates ?? [])].map((o) => o.toLowerCase()).find((o) => !dead.has(o));
    if (!next) return null;
    this.current.set(role, next);
    this.failovers.push({ role, from, to: next, reason });
    return next;
  }

  /** The same URL on the role's current origin (used after a failover). */
  rebase(rawUrl: string, role: string): string {
    const u = new URL(rawUrl);
    return this.origin(role) + u.pathname + u.search;
  }
}

export interface DomainCheckResult {
  role: string;
  origin: string;
  /** Which entry of the role it is. */
  position: 'active' | 'alternate';
  ok: boolean;
  status?: number;
  ms: number;
  /** Why it isn't ok. */
  failure?: FailureCode | 'UNEXPECTED_CONTENT';
}

/** One endpoint availability check. A DNS, connection or TLS failure, a 5xx or a bot check is "down". */
export async function checkOrigin(origin: string, role: string, position: 'active' | 'alternate', check: DomainHealthCheck | undefined, fetcher: Fetcher, timeoutMs = 8000): Promise<DomainCheckResult> {
  const started = Date.now();
  const done = (r: Partial<DomainCheckResult>): DomainCheckResult => ({ role, origin, position, ok: false, ms: Date.now() - started, ...r });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(origin + (check?.path ?? '/'), { method: 'GET', headers: check?.headers, signal: ctrl.signal });
    const failure = classifyStatus(res.status, res.headers, res.body);
    if (check?.expectStatus) {
      if (!check.expectStatus.includes(res.status)) return done({ status: res.status, failure: failure ?? 'HTTP' });
    } else if (failure === 'CHALLENGE' || res.status >= 500) {
      // Without an explicit expectation, any answer from the site itself (even a 404 on "/") counts as up.
      return done({ status: res.status, failure: failure ?? 'HTTP' });
    }
    if (check?.expectText && !res.body.includes(check.expectText)) return done({ status: res.status, failure: 'UNEXPECTED_CONTENT' });
    return done({ ok: true, status: res.status });
  } catch (e) {
    return done({ failure: ctrl.signal.aborted ? 'TIMEOUT' : classifyTransport(e) });
  } finally {
    clearTimeout(timer);
  }
}

/** Checks every origin of every role (active and alternates). */
export async function checkDomains(config: DomainConfig, fetcher: Fetcher, timeoutMs?: number): Promise<DomainCheckResult[]> {
  const jobs: Promise<DomainCheckResult>[] = [];
  for (const [name, role] of Object.entries(config.roles)) {
    jobs.push(checkOrigin(role.active, name, 'active', role.health, fetcher, timeoutMs));
    for (const alt of role.alternates ?? []) jobs.push(checkOrigin(alt, name, 'alternate', role.health, fetcher, timeoutMs));
  }
  return Promise.all(jobs);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * A new config version with `origin` as the role's active address (the old active becomes the
 * first alternate). Pure: nothing is published. Throws when the result wouldn't be valid.
 */
export function switchActive(config: DomainConfig, role: string, origin: string, now = new Date()): DomainConfig {
  const next = clone(config);
  const r = next.roles[role];
  if (!r) throw new Error(`Unknown role "${role}"`);
  const target = normalizeOrigin(origin);
  const previous = r.active.toLowerCase();
  if (previous === target) return config;
  r.alternates = [previous, ...(r.alternates ?? []).map((o) => o.toLowerCase()).filter((o) => o !== target && o !== previous)];
  r.active = target;
  next.version = config.version + 1;
  next.updatedAt = now.toISOString();
  const errors = validateDomainConfig(next);
  if (errors.length) throw new Error(`Invalid domain config: ${errors.join('; ')}`);
  return next;
}

export interface DomainChangeResult {
  accepted: boolean;
  config: DomainConfig;
  audit: DomainAuditEntry;
}

/**
 * Validates a candidate address and, only if it passes, returns the new config version together
 * with its audit entry. A candidate that fails its check is never promoted: the returned config is
 * the unchanged current one and the audit entry records the rejection.
 *
 * `probe` lets the caller add a real extraction test (a canary scrape with the candidate config);
 * without it only the endpoint check runs.
 */
export async function promoteDomain(
  config: DomainConfig,
  change: { role: string; origin: string; by: string; reason?: string },
  fetcher: Fetcher,
  probe?: (candidate: DomainConfig) => Promise<{ ok: boolean; detail?: string }>,
  now = new Date(),
): Promise<DomainChangeResult> {
  const role = config.roles[change.role];
  if (!role) throw new Error(`Unknown role "${change.role}"`);
  const target = normalizeOrigin(change.origin);
  if (!isPublicHost(hostOf(target))) throw new Error(`"${target}" is a private or internal address`);
  const checks = [await checkOrigin(target, change.role, 'alternate', role.health, fetcher)];
  let ok = checks[0].ok;
  let candidate = config;
  if (ok) {
    candidate = switchActive(config, change.role, target, now);
    if (probe) {
      const p = await probe(candidate);
      ok = p.ok;
    }
  }
  const audit: DomainAuditEntry = {
    provider: config.provider,
    at: now.toISOString(),
    by: change.by,
    action: 'switch-active',
    role: change.role,
    from: role.active,
    to: target,
    fromVersion: config.version,
    toVersion: ok ? candidate.version : config.version,
    reason: change.reason,
    validation: { ok, checks },
  };
  return { accepted: ok, config: ok ? candidate : config, audit };
}

/** The config to publish when rolling back to an earlier version: its content, under a new version number. */
export function rollbackDomain(current: DomainConfig, previous: DomainConfig, by: string, reason?: string, now = new Date()): DomainChangeResult {
  if (previous.provider !== current.provider) throw new Error('Rollback target belongs to another provider');
  const config: DomainConfig = { ...clone(previous), version: current.version + 1, updatedAt: now.toISOString() };
  return {
    accepted: true,
    config,
    audit: { provider: current.provider, at: now.toISOString(), by, action: 'rollback', fromVersion: current.version, toVersion: config.version, reason: reason ?? `Back to the content of version ${previous.version}` },
  };
}
