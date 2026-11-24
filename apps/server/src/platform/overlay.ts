/**
 * The control plane's mutable state: what an operator (or the recovery job) has changed on top of
 * what ships in the provider pack. Stage, rank and domain configuration per provider, each change
 * audited, domain changes reversible. It is a small JSON file; no database.
 *
 * Nothing here changes extraction logic. That only ever changes by shipping a new provider version.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { rollbackDomain, validateDomainConfig, type DomainAuditEntry, type DomainConfig, type DomainProposal, type Stage } from '@charcoal/provider-sdk';

export interface ProviderOverride {
  stage?: Stage;
  rank?: number;
  /** Replaces the pack's domain config while present (and not expired). */
  domains?: DomainConfig;
  /** Epoch ms after which the domain override lapses by itself (automatic fail-overs are temporary). */
  domainsExpireAt?: number;
  /** Earlier effective configs, newest last, to roll back to. */
  domainHistory?: DomainConfig[];
}

export interface AuditEntry {
  at: string;
  by: string;
  provider: string;
  action: 'set-stage' | 'set-rank' | 'set-domains' | 'rollback-domains' | 'propose-domains' | 'dismiss-proposal' | 'restore';
  detail?: Record<string, unknown>;
}

interface OverlayFile {
  version: number;
  providers: Record<string, ProviderOverride>;
  proposals: Record<string, DomainProposal>;
  audit: AuditEntry[];
}

const MAX_AUDIT = 500;
const MAX_HISTORY = 10;

export class Overlay {
  private state: OverlayFile = { version: 0, providers: {}, proposals: {}, audit: [] };

  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {
    if (file && existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<OverlayFile>;
        this.state = { version: Number(parsed.version) || 0, providers: parsed.providers ?? {}, proposals: parsed.proposals ?? {}, audit: parsed.audit ?? [] };
      } catch (e) {
        console.warn(`[platform] couldn't read ${file}; starting with no overrides (${(e as Error).message})`);
      }
    }
  }

  /** Increases with every change; part of the registry's version. */
  get version() {
    return this.state.version;
  }

  get(id: string): ProviderOverride | undefined {
    return this.state.providers[id];
  }

  /** The domain override in force for a provider, if any (an expired one no longer counts). */
  domains(id: string): DomainConfig | undefined {
    const o = this.state.providers[id];
    if (!o?.domains) return undefined;
    if (o.domainsExpireAt && o.domainsExpireAt < this.now()) return undefined;
    return o.domains;
  }

  proposals(): Record<string, DomainProposal> {
    return { ...this.state.proposals };
  }

  audit(limit = 100): AuditEntry[] {
    return this.state.audit.slice(-limit).reverse();
  }

  private change(entry: Omit<AuditEntry, 'at'>, mutate: (o: ProviderOverride) => void) {
    const o = (this.state.providers[entry.provider] ??= {});
    mutate(o);
    this.state.version++;
    this.state.audit = [...this.state.audit, { at: new Date(this.now()).toISOString(), ...entry }].slice(-MAX_AUDIT);
    this.save();
  }

  setStage(id: string, stage: Stage | undefined, by: string, reason?: string) {
    this.change({ by, provider: id, action: 'set-stage', detail: { stage: stage ?? 'default', reason } }, (o) => {
      if (stage) o.stage = stage;
      else delete o.stage;
    });
  }

  setRank(id: string, rank: number | undefined, by: string) {
    this.change({ by, provider: id, action: 'set-rank', detail: { rank: rank ?? 'default' } }, (o) => {
      if (rank === undefined) delete o.rank;
      else o.rank = rank;
    });
  }

  /**
   * Puts a validated domain config in force. `current` is what was in force until now (kept for
   * rollback). `ttlMs` makes it temporary.
   */
  setDomains(id: string, config: DomainConfig, current: DomainConfig | undefined, audit: DomainAuditEntry, ttlMs?: number) {
    const errors = validateDomainConfig(config);
    if (errors.length) throw new Error(`Invalid domain config: ${errors.join('; ')}`);
    if (config.provider !== id) throw new Error(`Domain config is for "${config.provider}", not "${id}"`);
    this.change({ by: audit.by, provider: id, action: 'set-domains', detail: { ...audit, temporary: ttlMs ? `${Math.round(ttlMs / 60000)} min` : false } }, (o) => {
      if (current) o.domainHistory = [...(o.domainHistory ?? []), current].slice(-MAX_HISTORY);
      o.domains = config;
      o.domainsExpireAt = ttlMs ? this.now() + ttlMs : undefined;
    });
    delete this.state.proposals[id];
    this.save();
  }

  /** Back to the config that was in force before the last change. Returns it, or undefined when there is no history. */
  rollbackDomains(id: string, current: DomainConfig, by: string, reason?: string): DomainConfig | undefined {
    const o = this.state.providers[id];
    const previous = o?.domainHistory?.[o.domainHistory.length - 1];
    if (!previous) return undefined;
    const { config, audit } = rollbackDomain(current, previous, by, reason);
    this.change({ by, provider: id, action: 'rollback-domains', detail: { ...audit } }, (x) => {
      x.domainHistory = x.domainHistory!.slice(0, -1);
      x.domains = config;
      x.domainsExpireAt = undefined;
    });
    return config;
  }

  /** Records what recovery found, for an operator to apply or dismiss. */
  propose(id: string, proposal: DomainProposal) {
    const same = this.state.proposals[id];
    if (same && same.to === proposal.to && same.from === proposal.from) return;
    this.state.proposals[id] = proposal;
    this.state.audit = [...this.state.audit, { at: new Date(this.now()).toISOString(), by: proposal.audit.by, provider: id, action: 'propose-domains' as const, detail: { role: proposal.role, from: proposal.from, to: proposal.to } }].slice(-MAX_AUDIT);
    this.save();
  }

  dismissProposal(id: string, by: string) {
    if (!this.state.proposals[id]) return;
    delete this.state.proposals[id];
    this.state.audit = [...this.state.audit, { at: new Date(this.now()).toISOString(), by, provider: id, action: 'dismiss-proposal' as const }].slice(-MAX_AUDIT);
    this.save();
  }

  note(entry: Omit<AuditEntry, 'at'>) {
    this.state.audit = [...this.state.audit, { at: new Date(this.now()).toISOString(), ...entry }].slice(-MAX_AUDIT);
    this.save();
  }

  private save() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      renameSync(tmp, this.file);
    } catch (e) {
      console.warn(`[platform] couldn't save ${this.file}: ${(e as Error).message}`);
    }
  }
}
