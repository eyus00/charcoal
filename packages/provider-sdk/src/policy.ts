/**
 * Outbound network policy for one provider run.
 *
 * A provider may only reach: the addresses of its own domain roles, the extra hosts its manifest
 * lists, and (when the manifest allows it) hosts that literally appeared in a response from one of
 * those. Private and internal addresses are always refused. This is what keeps a provider, and a
 * remote runtime executing it, from being used as a general-purpose proxy.
 */
import { ProviderError } from './errors.js';

/** True for a public http(s) host name. Literal private, loopback and link-local addresses are not. */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(h)) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (h.includes(':')) {
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicHost(mapped[1]);
    return !(h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('ff'));
  }
  // A bare number or hex literal is an address in disguise ("2130706433" is 127.0.0.1).
  if (/^(0x[0-9a-f]+|\d+)$/.test(h)) return false;
  return true;
}

/**
 * Host patterns: "example.com" matches that host only; "*.example.com" matches its subdomains;
 * ".example.com" matches both.
 */
export function hostMatches(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
  if (p.startsWith('.')) return h === p.slice(1) || h.endsWith(p);
  return h === p;
}

export function isValidHostPattern(pattern: string): boolean {
  const body = pattern.replace(/^\*\.|^\./, '');
  // No bare wildcards, no schemes or paths, at least one dot (no "*.com"-style TLD patterns via "*.").
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(body) && !body.includes('*');
}

export interface NetworkPolicy {
  /** Host patterns always allowed. */
  allow: string[];
  /** Any public host is allowed (vendored packs whose hosts aren't declared one by one). */
  open?: boolean;
  /** Also allow hosts seen in responses from allowed hosts (GET and HEAD only). */
  followDiscovered: boolean;
  maxRequests: number;
  /** Largest response body kept, in characters. */
  maxBodyChars: number;
}

export const DEFAULT_LIMITS = { maxRequests: 40, maxBodyChars: 8 * 1024 * 1024, maxDiscoveredHosts: 64, maxDiscoveryDepth: 3 };

const URL_IN_TEXT = /https?:\/\/[a-z0-9.-]+(?::\d+)?/gi;
/** `src="//host/path"`: an address without a scheme, as markup writes them. */
const SCHEMELESS_IN_TEXT = /["'(=\s]\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?=[/"'?:\s)])/gi;

/** Enforces a NetworkPolicy and counts requests for one run. */
export class PolicyGuard {
  private requests = 0;
  /** Discovered host → how many hops from a declared host it was found (1 = named by a declared host). */
  private readonly discovered = new Map<string, number>();
  /** The www / non-www twin of a declared host, once the site has answered under it. */
  private readonly sameSiteHosts = new Set<string>();
  constructor(
    readonly policy: NetworkPolicy,
    /** Extra check a runtime can add (the server resolves DNS and refuses private answers). */
    private readonly resolveCheck?: (hostname: string) => Promise<boolean>,
  ) {}

  get requestCount() {
    return this.requests;
  }
  get discoveredHosts(): string[] {
    return [...this.discovered.keys()];
  }

  /** Whether the host is one the policy names (as opposed to one it merely discovered). */
  isDeclared(hostname: string): boolean {
    return !!this.policy.open || this.policy.allow.some((p) => hostMatches(hostname, p)) || this.sameSiteHosts.has(hostname.toLowerCase());
  }

  /** Throws ProviderError('POLICY') when the request isn't allowed. Counts it when it is. */
  async check(rawUrl: string, method = 'GET'): Promise<URL> {
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      throw new ProviderError('POLICY', `Not a valid address: ${String(rawUrl).slice(0, 80)}`);
    }
    const host = u.hostname;
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ProviderError('POLICY', `Protocol not allowed: ${u.protocol}`, { host });
    if (!isPublicHost(host)) throw new ProviderError('POLICY', `Private or internal address refused: ${host}`, { host });
    const declared = this.isDeclared(host);
    if (!declared) {
      const viaDiscovery = this.policy.followDiscovered && this.discovered.has(host.toLowerCase());
      if (!viaDiscovery) throw new ProviderError('POLICY', `Host is not in this provider's allow-list: ${host}`, { host });
      if (method !== 'GET' && method !== 'HEAD') throw new ProviderError('POLICY', `Only GET is allowed on a discovered host: ${host}`, { host });
    }
    if (this.requests >= this.policy.maxRequests) throw new ProviderError('POLICY', `More than ${this.policy.maxRequests} requests in one run`, { host });
    if (this.resolveCheck && !(await this.resolveCheck(host))) throw new ProviderError('POLICY', `Address resolves to a private network: ${host}`, { host });
    this.requests++;
    return u;
  }

  /**
   * Remembers hosts named in a response, so a later GET to them is allowed. A declared host's
   * response opens the hosts it names; so does a discovered host's, up to a few hops (an embed page
   * names a player page, which names a playlist), and never beyond the cap on hosts.
   */
  noteResponse(fromHost: string, body: string) {
    if (!this.policy.followDiscovered) return;
    const from = fromHost.toLowerCase();
    const depth = this.isDeclared(from) ? 1 : (this.discovered.get(from) ?? Infinity) + 1;
    if (depth > DEFAULT_LIMITS.maxDiscoveryDepth) return;
    this.noteText(body, depth);
  }

  /** Addresses a provider decoded itself (an encrypted answer): treated like ones named by a declared host. */
  noteDecoded(text: string) {
    if (this.policy.followDiscovered) this.noteText(text, 1);
  }

  private noteText(body: string, depth: number) {
    // JSON often escapes slashes ("https:\/\/cdn…").
    const text = (body.length > 400_000 ? body.slice(0, 400_000) : body).replace(/\\\//g, '/');
    const add = (host: string) => {
      const h = host.toLowerCase();
      if (this.discovered.size >= DEFAULT_LIMITS.maxDiscoveredHosts && !this.discovered.has(h)) return;
      if (isPublicHost(h) && (this.discovered.get(h) ?? Infinity) > depth) this.discovered.set(h, depth);
    };
    for (const m of text.matchAll(URL_IN_TEXT)) {
      try {
        add(new URL(m[0]).hostname);
      } catch {
        /* not a URL after all */
      }
    }
    for (const m of text.matchAll(SCHEMELESS_IN_TEXT)) add(m[1]);
  }

  /** Lets the engine allow a redirect target or a host a provider derived from allowed data. */
  noteHost(hostname: string) {
    if (isPublicHost(hostname) && this.discovered.size < DEFAULT_LIMITS.maxDiscoveredHosts) this.sameSiteHosts.add(hostname.toLowerCase());
    if (this.policy.followDiscovered && isPublicHost(hostname) && this.discovered.size < DEFAULT_LIMITS.maxDiscoveredHosts) this.discovered.set(hostname.toLowerCase(), 1);
  }
}
