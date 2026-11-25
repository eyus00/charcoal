/**
 * Monitoring and recovery.
 *
 * `runCanary` exercises providers with known titles and records what happens: that is health
 * monitoring. `runRecovery` looks at every provider that isn't healthy, works out WHY from its
 * classified failures, and takes the response that fits the cause:
 *
 *   address down (DNS / connect / TLS)  → check configured alternates; validate one with a real
 *                                          extraction; hand back a proposal for a reversible override
 *   refused or challenged here          → nothing to fix in this runtime; leave it resting here
 *   site changed (extraction broke)     → flag for a new provider version; never guess a fix
 *   transient (timeouts, 5xx)           → probe again; restore on success
 *
 * Nothing here publishes anything. A proposal is data the control plane may apply as a staged,
 * expiring override; an extraction change always needs a human and a new version.
 */
import { checkDomains, switchActive, type DomainAuditEntry, type DomainCheckResult, type DomainConfig } from './domains.js';
import type { Engine, LoadedProvider, ProviderOutcome } from './engine.js';
import { FAILURES, type FailureCode, type FailureScope } from './errors.js';
import type { HealthStore } from './health.js';
import type { Fetcher, Media, MediaKind, Stream } from './types.js';

export type CanaryTitles = Partial<Record<MediaKind, Media[]>>;

export interface CanaryResult {
  provider: string;
  runs: { title: string; outcome: ProviderOutcome['outcome']; code?: FailureCode; ms: number; streams: number }[];
  /** At least one known title produced streams. */
  passed: boolean;
  /** One of those streams was tried and answered with media (only when the caller asked for streams to be tried). */
  verified?: boolean;
  /** Domain fail-overs that happened inside runs that went on to find streams. */
  failovers: { role: string; from: string; to: string; reason: FailureCode }[];
}

/** Runs every (non-disabled) provider against the known titles for the kinds it supports. Outcomes go into the health store. */
export async function runCanary(
  engine: Engine,
  titles: CanaryTitles,
  opts: {
    only?: string[];
    record?: boolean;
    domains?: (p: LoadedProvider) => DomainConfig | undefined;
    signal?: AbortSignal;
    /** Tries one stream of a passing provider (a URL alone proves nothing). Returns whether it answered with media. */
    verify?: (stream: Stream) => Promise<boolean>;
  } = {},
): Promise<CanaryResult[]> {
  const out: CanaryResult[] = [];
  for (const p of engine.providers()) {
    const m = p.module.manifest;
    if (p.stage === 'disabled' || (opts.only && !opts.only.includes(m.id))) continue;
    const mine = m.kinds.flatMap((k) => titles[k] ?? []);
    if (!mine.length) continue;
    const failovers: CanaryResult['failovers'] = [];
    let sample: Stream | undefined;
    const runs = await Promise.all(
      mine.map(async (media) => {
        const r = await engine.runProvider(p, media, opts.signal, undefined, opts.record ?? true, opts.domains?.(p));
        if (r.outcome === 'ok') for (const f of r.failovers ?? []) if (!failovers.some((x) => x.role === f.role && x.to === f.to)) failovers.push(f);
        if (r.outcome === 'ok' && !sample) sample = r.streams.find((s) => s.type !== 'frame');
        return { title: media.title, outcome: r.outcome, code: r.code, ms: r.ms, streams: r.streams.length };
      }),
    );
    const passed = runs.some((r) => r.outcome === 'ok');
    const verified = opts.verify && passed && sample ? await opts.verify(sample).catch(() => false) : undefined;
    out.push({ provider: m.id, runs, passed, verified, failovers });
  }
  return out;
}

export type RecoveryActionKind =
  /** Healthy already; nothing done. */
  | 'healthy'
  /** A probe succeeded; the circuit was closed again. */
  | 'restored'
  /** Still failing for a reason that may pass; left resting. */
  | 'retry-later'
  /** An alternate address works; a validated override is proposed. */
  | 'switch-domain'
  /** Its addresses are down and no configured alternate works. */
  | 'no-working-domain'
  /** Refused or challenged from this network position; resting here, may be fine elsewhere. */
  | 'blocked-here'
  /** The extraction no longer matches the site; needs a new provider version. */
  | 'needs-update';

export interface DomainProposal {
  role: string;
  from: string;
  to: string;
  /** The config with the alternate promoted (a new version of the document). */
  config: DomainConfig;
  audit: DomainAuditEntry;
}

export interface RecoveryAction {
  provider: string;
  action: RecoveryActionKind;
  /** The classified cause that drove the decision. */
  cause?: { code: FailureCode; scope: FailureScope; label: string };
  detail: string;
  checks?: DomainCheckResult[];
  proposal?: DomainProposal;
}

export interface RecoveryOptions {
  engine: Engine;
  health: HealthStore;
  transport: Fetcher;
  canaries: CanaryTitles;
  /**
   * Results of a canary pass that just ran. A provider that only found streams by failing over to
   * an alternate address is "healthy" but pays for a dead address on every run; this lets recovery
   * propose promoting the alternate.
   */
  observed?: CanaryResult[];
  only?: string[];
  now?: () => Date;
  /** Who the audit entries are attributed to. */
  actor?: string;
}

function lastCause(health: HealthStore, provider: string, runtime: Engine['runtime']['kind']) {
  const r = health.get(provider, runtime);
  const last = r?.failures[r.failures.length - 1];
  return last ? { code: last.code, ...FAILURES[last.code] } : undefined;
}

export async function runRecovery(opts: RecoveryOptions): Promise<RecoveryAction[]> {
  const { engine, health, transport, canaries } = opts;
  const runtime = engine.runtime.kind;
  const now = opts.now ?? (() => new Date());
  const actions: RecoveryAction[] = [];

  for (const p of engine.providers()) {
    const id = p.module.manifest.id;
    if (p.stage === 'disabled' || (opts.only && !opts.only.includes(id))) continue;
    const status = health.status(id, runtime);
    if (status === 'ok' || status === 'unknown') {
      const moved = opts.observed?.find((c) => c.provider === id && c.passed)?.failovers[0];
      if (moved && p.domains?.roles[moved.role]?.active.toLowerCase() === moved.from) {
        // It works, but only through the alternate: the canary run itself is the validation.
        const candidate = switchActive(p.domains, moved.role, moved.to, now());
        actions.push({
          provider: id,
          action: 'switch-domain',
          cause: { code: moved.reason, scope: FAILURES[moved.reason].scope, label: FAILURES[moved.reason].label },
          detail: `${moved.from} is down (${moved.reason}); runs already succeed through ${moved.to}, at the cost of a failed attempt each time.`,
          proposal: { role: moved.role, from: moved.from, to: moved.to, config: candidate, audit: { provider: id, at: now().toISOString(), by: opts.actor ?? 'recovery', action: 'switch-active', role: moved.role, from: moved.from, to: moved.to, fromVersion: p.domains.version, toVersion: candidate.version, reason: `Active address failed with ${moved.reason}; a test extraction through the alternate found streams`, validation: { ok: true, checks: [] } } },
        });
        continue;
      }
      actions.push({ provider: id, action: 'healthy', detail: status === 'ok' ? 'Answering normally' : 'No runs recorded yet' });
      continue;
    }
    const found = lastCause(health, id, runtime);
    const cause = found ? { code: found.code, scope: found.scope, label: found.label } : undefined;
    const probe = async (domains?: DomainConfig, record = false) => (await runCanary(engine, canaries, { only: [id], record, domains: domains ? () => domains : undefined }))[0];

    // 1. The extraction itself broke: no automatic change is safe.
    if (cause?.scope === 'provider') {
      actions.push({ provider: id, action: 'needs-update', cause, detail: `${cause.label}. The site answered but not in the shape version ${p.module.manifest.version} expects; a new provider version is needed.` });
      continue;
    }

    // 2. An address is down: look at the configured alternates.
    if (cause?.scope === 'domain' && p.domains) {
      const checks = await checkDomains(p.domains, transport);
      let proposed: RecoveryAction | undefined;
      for (const [role, cfg] of Object.entries(p.domains.roles)) {
        const active = checks.find((c) => c.role === role && c.position === 'active');
        if (!active || active.ok) continue;
        for (const alt of checks.filter((c) => c.role === role && c.position === 'alternate' && c.ok)) {
          const candidate = switchActive(p.domains, role, alt.origin, now());
          // The endpoint answering isn't enough: a real extraction must work through it.
          const validation = await probe(candidate);
          if (!validation?.passed) continue;
          proposed = {
            provider: id,
            action: 'switch-domain',
            cause,
            checks,
            detail: `${cfg.active} is down (${active.failure}); ${alt.origin} answers and a test extraction through it found streams.`,
            proposal: {
              role,
              from: cfg.active,
              to: alt.origin,
              config: candidate,
              audit: { provider: id, at: now().toISOString(), by: opts.actor ?? 'recovery', action: 'switch-active', role, from: cfg.active, to: alt.origin, fromVersion: p.domains.version, toVersion: candidate.version, reason: `Active address failed with ${active.failure}`, validation: { ok: true, checks } },
            },
          };
          break;
        }
        if (proposed) break;
      }
      if (proposed) {
        actions.push(proposed);
        continue;
      }
      const movedTo = health.get(id, runtime)?.failures.slice(-1)[0]?.redirectedTo;
      if (cause.code === 'REDIRECTED' || checks.some((c) => c.position === 'active' && !c.ok)) {
        actions.push({
          provider: id,
          action: 'no-working-domain',
          cause,
          checks,
          detail: movedTo
            ? `Its address now redirects to ${movedTo}, which is not in its domain config. If that is the same service, promote it (the change is validated with a test extraction before it takes effect).`
            : 'The active address is down and no configured alternate passed validation.',
        });
        continue;
      }
      // The addresses answer again: fall through to a normal probe.
    }

    // 3. Refused or challenged from here: a probe would only repeat the refusal.
    if (cause?.scope === 'runtime' && cause.code !== 'RATE_LIMITED') {
      actions.push({ provider: id, action: 'blocked-here', cause, detail: `${cause.label}. It stays deprioritised in the ${runtime} runtime; other runtimes are unaffected.` });
      continue;
    }

    // 4. Anything else: try it for real, and restore it if it works.
    const result = await probe(undefined, true);
    if (result?.passed) {
      health.restore(id, runtime);
      actions.push({ provider: id, action: 'restored', cause, detail: 'A test extraction found streams; it is back in rotation.' });
    } else {
      const code = result?.runs.find((r) => r.code)?.code;
      actions.push({ provider: id, action: 'retry-later', cause, detail: `Still failing${code ? ` (${FAILURES[code].label.toLowerCase()})` : ''}; it keeps resting and will be tried again.` });
    }
  }
  return actions;
}
