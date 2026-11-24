/**
 * Provider health, kept per provider AND per runtime: a provider refused from a data centre can be
 * perfectly healthy from a viewer's connection, so one runtime's failures never bench another's.
 *
 * Each key has a circuit breaker (closed → open after repeated hard failures → half-open for one
 * trial after a cool-down that doubles each time → closed again on success), rolling reliability
 * numbers for ranking, and a short history of classified failures for diagnostics.
 */
import { FAILURES, type Diagnosis, type FailureCode } from './errors.js';
import type { RuntimeKind } from './types.js';

export type CircuitState = 'closed' | 'open' | 'half-open';
export type HealthStatus = 'unknown' | 'ok' | 'degraded' | 'benched' | 'needs-update';

export interface FailureRecord {
  at: number;
  code: FailureCode;
  message: string;
  host?: string;
  role?: string;
  status?: number;
  redirectedTo?: string;
}

export interface HealthRecord {
  provider: string;
  runtime: RuntimeKind;
  /** Provider version the numbers were last recorded for. */
  version?: string;
  ok: number;
  empty: number;
  failed: number;
  /** Weighted consecutive failures (hard = 1, soft = 0.5). */
  streak: number;
  circuit: CircuitState;
  openUntil: number;
  /** Times the circuit has opened in a row (drives the cool-down). */
  opens: number;
  /** Last outcomes, oldest first: o = found streams, e = answered with nothing, f = failed. */
  recent: string;
  avgMs: number;
  lastOkAt?: number;
  lastAnswerAt?: number;
  lastFailureAt?: number;
  lastCode?: FailureCode;
  /** A provider-scoped failure was seen: the extraction logic itself needs attention. */
  needsUpdate?: boolean;
  failures: FailureRecord[];
  /** Start of the trial run while half-open. */
  trialAt?: number;
  /** Streams of this provider that answered with media when tried, and that did not. */
  verified?: number;
  unverified?: number;
}

/**
 * What the measurements say about running a provider in one runtime:
 * - works        it answered there recently
 * - blocked      that runtime's network is refused (a browser check, a refusal): try another runtime
 * - unreachable  its address does not answer from there (DNS, connection, a moved site)
 * - broken       its extraction no longer fits the site: nowhere will do until it is updated
 * - unknown      nothing recent to go on
 */
export type Placement = 'works' | 'blocked' | 'unreachable' | 'broken' | 'unknown';

const BLOCKED = new Set<FailureCode>(['CHALLENGE', 'ACCESS_DENIED']);
const UNREACHABLE = new Set<FailureCode>(['DNS', 'CONNECT', 'TLS', 'TIMEOUT', 'NETWORK', 'REDIRECTED']);
const BROKEN = new Set<FailureCode>(['STRUCTURE_CHANGED', 'SELECTOR_MISSING', 'INVALID_RESULT']);

export interface HealthOptions {
  failuresToOpen?: number;
  baseCooldownMs?: number;
  maxCooldownMs?: number;
  /** How long one half-open trial blocks other trials. */
  trialWindowMs?: number;
  historySize?: number;
  now?: () => number;
}

export type Outcome = { kind: 'ok' } | { kind: 'empty' } | { kind: 'failure'; diagnosis: Diagnosis };

const WINDOW = 50;
const key = (provider: string, runtime: RuntimeKind) => `${provider}@${runtime}`;

export class HealthStore {
  private readonly records = new Map<string, HealthRecord>();
  private readonly failuresToOpen: number;
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly trialWindowMs: number;
  private readonly historySize: number;
  private readonly now: () => number;

  constructor(opts: HealthOptions = {}) {
    this.failuresToOpen = opts.failuresToOpen ?? 3;
    this.baseCooldownMs = opts.baseCooldownMs ?? 5 * 60_000;
    this.maxCooldownMs = opts.maxCooldownMs ?? 60 * 60_000;
    this.trialWindowMs = opts.trialWindowMs ?? 30_000;
    this.historySize = opts.historySize ?? 20;
    this.now = opts.now ?? Date.now;
  }

  private rec(provider: string, runtime: RuntimeKind): HealthRecord {
    const k = key(provider, runtime);
    let r = this.records.get(k);
    if (!r) {
      r = { provider, runtime, ok: 0, empty: 0, failed: 0, streak: 0, circuit: 'closed', openUntil: 0, opens: 0, recent: '', avgMs: 0, failures: [] };
      this.records.set(k, r);
    }
    return r;
  }

  get(provider: string, runtime: RuntimeKind): HealthRecord | undefined {
    return this.records.get(key(provider, runtime));
  }

  list(): HealthRecord[] {
    return [...this.records.values()];
  }

  /**
   * Whether a run may start. An open circuit refuses until its cool-down ends, then lets exactly
   * one trial through (half-open).
   */
  allow(provider: string, runtime: RuntimeKind): { allowed: boolean; state: CircuitState; retryInMs?: number } {
    const r = this.records.get(key(provider, runtime));
    if (!r || r.circuit === 'closed') return { allowed: true, state: 'closed' };
    const now = this.now();
    if (r.circuit === 'open') {
      if (now < r.openUntil) return { allowed: false, state: 'open', retryInMs: r.openUntil - now };
      r.circuit = 'half-open';
      r.trialAt = now;
      return { allowed: true, state: 'half-open' };
    }
    // half-open: one trial at a time
    if (r.trialAt !== undefined && now - r.trialAt < this.trialWindowMs) return { allowed: false, state: 'half-open', retryInMs: this.trialWindowMs - (now - r.trialAt) };
    r.trialAt = now;
    return { allowed: true, state: 'half-open' };
  }

  record(provider: string, runtime: RuntimeKind, outcome: Outcome, ms: number, version?: string): HealthRecord | undefined {
    if (outcome.kind === 'failure') {
      // "Not here" is a proper answer. Failures that say nothing about the provider (the viewer's
      // settings, the caller going away) leave no trace at all.
      if (outcome.diagnosis.code === 'NOT_FOUND') return this.record(provider, runtime, { kind: 'empty' }, ms, version);
      if (FAILURES[outcome.diagnosis.code].health === 'none') return this.records.get(key(provider, runtime));
    }
    const r = this.rec(provider, runtime);
    const now = this.now();
    // A new provider version starts with a clean slate: old failures say nothing about new logic.
    if (version && r.version && r.version !== version) {
      Object.assign(r, { streak: 0, circuit: 'closed', openUntil: 0, opens: 0, recent: '', needsUpdate: false, failures: [], trialAt: undefined });
    }
    if (version) r.version = version;

    if (outcome.kind === 'failure') {
      const info = FAILURES[outcome.diagnosis.code];
      r.failed++;
      r.lastFailureAt = now;
      r.lastCode = outcome.diagnosis.code;
      r.recent = (r.recent + 'f').slice(-WINDOW);
      r.failures = [...r.failures, { at: now, code: outcome.diagnosis.code, message: outcome.diagnosis.message.slice(0, 240), host: outcome.diagnosis.host, role: outcome.diagnosis.role, status: outcome.diagnosis.status, redirectedTo: outcome.diagnosis.redirectedTo }].slice(-this.historySize);
      if (info.scope === 'provider') r.needsUpdate = true;
      r.streak += info.health === 'hard' ? 1 : 0.5;
      if (r.circuit === 'half-open' || r.streak >= this.failuresToOpen) {
        const cooldown = Math.min(this.maxCooldownMs, this.baseCooldownMs * 2 ** r.opens);
        r.circuit = 'open';
        r.openUntil = now + cooldown;
        r.opens++;
        r.trialAt = undefined;
      }
    } else {
      if (outcome.kind === 'ok') {
        r.ok++;
        r.lastOkAt = now;
      } else r.empty++;
      r.lastAnswerAt = now;
      r.recent = (r.recent + (outcome.kind === 'ok' ? 'o' : 'e')).slice(-WINDOW);
      r.streak = 0;
      r.circuit = 'closed';
      r.openUntil = 0;
      r.opens = 0;
      r.trialAt = undefined;
      // It answered in the expected shape, so the logic is evidently current again.
      r.needsUpdate = false;
    }
    r.avgMs = r.avgMs ? Math.round(r.avgMs * 0.8 + ms * 0.2) : Math.round(ms);
    return r;
  }

  /**
   * Probability the provider answers properly here, 0..1, from the recent window with a neutral
   * prior (so one failure doesn't sink a provider and one success doesn't crown it). 0.5 when unknown.
   */
  reliability(provider: string, runtime: RuntimeKind): number {
    const r = this.records.get(key(provider, runtime));
    if (!r || !r.recent) return 0.5;
    const failed = r.recent.split('f').length - 1;
    const answered = r.recent.length - failed;
    return (answered + 1) / (r.recent.length + 2);
  }

  /** Share of its proper answers that actually had streams (how often it has the title), 0..1. */
  hitRate(provider: string, runtime: RuntimeKind): number {
    const r = this.records.get(key(provider, runtime));
    if (!r) return 0.5;
    const hits = r.recent.split('o').length - 1;
    const answers = hits + (r.recent.split('e').length - 1);
    return (hits + 1) / (answers + 2);
  }

  /** Notes whether a stream of this provider answered with media when it was tried. */
  recordVerification(provider: string, runtime: RuntimeKind, verified: boolean) {
    const r = this.rec(provider, runtime);
    if (verified) r.verified = (r.verified ?? 0) + 1;
    else r.unverified = (r.unverified ?? 0) + 1;
  }

  /** Share of its tried streams that answered with media, 0..1 with a neutral prior (0.5 when untried). */
  verifyRate(provider: string, runtime: RuntimeKind): number {
    const r = this.records.get(key(provider, runtime));
    const v = r?.verified ?? 0;
    const u = r?.unverified ?? 0;
    return (v + 1) / (v + u + 2);
  }

  /** Where the measurements put this provider in this runtime (see Placement). */
  placement(provider: string, runtime: RuntimeKind): Placement {
    const r = this.records.get(key(provider, runtime));
    if (!r || !r.recent) return 'unknown';
    if (!r.recent.endsWith('f')) return 'works';
    // The failures at the end of the window, newest last.
    const trailing = r.recent.length - r.recent.replace(/f+$/, '').length;
    const codes = r.failures.slice(-trailing).map((f) => f.code);
    if (!codes.length) return 'unknown';
    if (codes.some((c) => BROKEN.has(c))) return 'broken';
    if (codes.length >= 2 && codes.every((c) => BLOCKED.has(c))) return 'blocked';
    if (codes.length >= 2 && codes.every((c) => UNREACHABLE.has(c) || BLOCKED.has(c))) return codes.some((c) => BLOCKED.has(c)) ? 'blocked' : 'unreachable';
    // One failure after answers is not a verdict yet.
    return r.recent.includes('o') || r.recent.includes('e') ? 'works' : 'unknown';
  }

  status(provider: string, runtime: RuntimeKind): HealthStatus {
    const r = this.records.get(key(provider, runtime));
    if (!r || !r.recent) return 'unknown';
    if (r.needsUpdate) return 'needs-update';
    if (r.circuit !== 'closed') return 'benched';
    // Failing right now, though not often enough to rest. (Past trouble shows in `reliability`, not here.)
    if (r.streak > 0) return 'degraded';
    return 'ok';
  }

  /** Manually close a circuit (an operator restoring a provider). History is kept. */
  restore(provider: string, runtime: RuntimeKind) {
    const r = this.records.get(key(provider, runtime));
    if (!r) return;
    Object.assign(r, { streak: 0, circuit: 'closed', openUntil: 0, opens: 0, trialAt: undefined });
  }

  /** Serialisable copy, to survive a restart or to publish. */
  snapshot(): HealthRecord[] {
    return this.list().map((r) => ({ ...r, failures: [...r.failures] }));
  }

  load(records: HealthRecord[]) {
    for (const r of records ?? []) {
      if (r && typeof r.provider === 'string' && typeof r.runtime === 'string') this.records.set(key(r.provider, r.runtime), { ...r, failures: [...(r.failures ?? [])], trialAt: undefined });
    }
  }
}

/** A compact public view of one record (what the health endpoint and the registry overlay carry). */
export interface HealthSummary {
  provider: string;
  runtime: RuntimeKind;
  version?: string;
  status: HealthStatus;
  reliability: number;
  hitRate: number;
  averageMs: number;
  ok: number;
  empty: number;
  failed: number;
  benchedForSeconds: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailure?: { code: FailureCode; label: string; message: string; host?: string; redirectedTo?: string };
  placement: Placement;
  /** Streams tried and found to answer with media / not to. */
  verified: number;
  unverified: number;
}

/** A provider across every runtime that has measurements of it. */
export interface PlacementSummary {
  provider: string;
  worksOn: RuntimeKind[];
  blockedOn: RuntimeKind[];
  unreachableOn: RuntimeKind[];
  brokenOn: RuntimeKind[];
  /**
   * works            answers somewhere
   * works-elsewhere  refused or unreachable in some runtimes, answers in others: not broken
   * blocked          refused wherever it was tried (other runtimes may still do)
   * unreachable      its address answers nowhere it was tried
   * broken           its extraction needs updating
   */
  verdict: 'works' | 'works-elsewhere' | 'blocked' | 'unreachable' | 'broken' | 'unknown';
}

/** Rolls per-runtime placements up to one line per provider. Pass every store that has measurements (a server's own runs, what clients report). */
export function summarizePlacement(...stores: HealthStore[]): PlacementSummary[] {
  const by = new Map<string, PlacementSummary>();
  for (const store of stores) {
    for (const r of store.list()) {
      const s = by.get(r.provider) ?? { provider: r.provider, worksOn: [], blockedOn: [], unreachableOn: [], brokenOn: [], verdict: 'unknown' as const };
      by.set(r.provider, s);
      const p = store.placement(r.provider, r.runtime);
      const list = p === 'works' ? s.worksOn : p === 'blocked' ? s.blockedOn : p === 'unreachable' ? s.unreachableOn : p === 'broken' ? s.brokenOn : undefined;
      if (list && !list.includes(r.runtime)) list.push(r.runtime);
    }
  }
  for (const s of by.values()) {
    // A runtime in which it works outweighs an older verdict against the same runtime from another store.
    for (const list of [s.blockedOn, s.unreachableOn, s.brokenOn]) for (const rt of s.worksOn) if (list.includes(rt)) list.splice(list.indexOf(rt), 1);
    const troubled = s.blockedOn.length + s.unreachableOn.length + s.brokenOn.length;
    s.verdict = s.worksOn.length ? (troubled ? 'works-elsewhere' : 'works') : s.brokenOn.length ? 'broken' : s.blockedOn.length ? 'blocked' : s.unreachableOn.length ? 'unreachable' : 'unknown';
  }
  return [...by.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}

export function summarize(store: HealthStore, now = Date.now()): HealthSummary[] {
  const iso = (t?: number) => (t ? new Date(t).toISOString() : undefined);
  return store
    .list()
    .map((r) => {
      const last = r.failures[r.failures.length - 1];
      return {
        provider: r.provider,
        runtime: r.runtime,
        version: r.version,
        status: store.status(r.provider, r.runtime),
        reliability: Math.round(store.reliability(r.provider, r.runtime) * 100) / 100,
        hitRate: Math.round(store.hitRate(r.provider, r.runtime) * 100) / 100,
        averageMs: r.avgMs,
        ok: r.ok,
        empty: r.empty,
        failed: r.failed,
        benchedForSeconds: r.circuit === 'open' ? Math.max(0, Math.ceil((r.openUntil - now) / 1000)) : 0,
        lastSuccessAt: iso(r.lastOkAt),
        lastFailureAt: iso(r.lastFailureAt),
        lastFailure: last ? { code: last.code, label: FAILURES[last.code].label, message: last.message, host: last.host, redirectedTo: last.redirectedTo } : undefined,
        placement: store.placement(r.provider, r.runtime),
        verified: r.verified ?? 0,
        unverified: r.unverified ?? 0,
      };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.runtime.localeCompare(b.runtime));
}
