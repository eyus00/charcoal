/**
 * Why an address does not work, looked at from the outside: does the name exist, does the site
 * answer, where does it send visitors, is it asking for a browser check?
 *
 * Name resolution goes through DNS-over-HTTPS, so the same check runs on a server, in an edge
 * function and in a browser, and says what public DNS says rather than what one machine's resolver
 * (or a proxy in front of it) happens to answer.
 */
import { classifyStatus, classifyTransport, FAILURES, type FailureCode } from './errors.js';
import { hostOf, sameSite, type DomainConfig } from './domains.js';
import type { Fetcher } from './types.js';

export interface DomainDiagnosis {
  origin: string;
  host: string;
  role?: string;
  /** Which entry of the role it is. */
  position?: 'active' | 'alternate' | 'candidate';
  dns: { status: 'ok' | 'nxdomain' | 'no-record' | 'unknown'; addresses: string[]; ms?: number };
  http?: { status?: number; ms: number; redirectedTo?: string; server?: string; failure?: FailureCode };
  /** 'ok' when a site answers at this address; otherwise the failure that best describes it. */
  verdict: 'ok' | FailureCode;
  summary: string;
  checkedAt: string;
}

export interface DiagnoseOptions {
  path?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** DNS-over-HTTPS endpoints that speak the JSON form, tried in order. */
  resolvers?: string[];
  now?: () => number;
}

const RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** A and AAAA records of a name, as public DNS sees them. */
export async function resolveOverHttps(host: string, fetcher: Fetcher, o: Pick<DiagnoseOptions, 'resolvers' | 'timeoutMs'> = {}): Promise<DomainDiagnosis['dns']> {
  const started = Date.now();
  for (const resolver of o.resolvers ?? RESOLVERS) {
    try {
      const addresses: string[] = [];
      let exists = true;
      for (const type of ['A', 'AAAA']) {
        const res = await withTimeout(o.timeoutMs ?? 6000, (signal) => fetcher(`${resolver}?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal }));
        if (res.status !== 200) throw new Error(`resolver answered ${res.status}`);
        const body = JSON.parse(res.body) as { Status?: number; Answer?: { type: number; data: string }[] };
        if (body.Status === 3) {
          exists = false;
          break;
        }
        if (body.Status !== 0) throw new Error(`resolver status ${body.Status}`);
        for (const a of body.Answer ?? []) if (a.type === 1 || a.type === 28) addresses.push(a.data);
        if (addresses.length) break; // an A record is enough; AAAA is only asked when there is none
      }
      return { status: !exists ? 'nxdomain' : addresses.length ? 'ok' : 'no-record', addresses, ms: Date.now() - started };
    } catch {
      /* try the next resolver */
    }
  }
  return { status: 'unknown', addresses: [], ms: Date.now() - started };
}

export async function diagnoseDomain(origin: string, fetcher: Fetcher, o: DiagnoseOptions = {}): Promise<DomainDiagnosis> {
  const host = hostOf(origin);
  const timeoutMs = o.timeoutMs ?? 10_000;
  const [dns, http] = await Promise.all([
    resolveOverHttps(host, fetcher, o),
    (async (): Promise<NonNullable<DomainDiagnosis['http']>> => {
      const started = Date.now();
      try {
        const res = await withTimeout(timeoutMs, (signal) => fetcher(origin + (o.path ?? '/'), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', Accept: 'text/html,*/*;q=0.8', ...(o.headers ?? {}) }, signal, maxBytes: 16_384 }));
        const ms = Date.now() - started;
        let landed = host;
        try {
          landed = new URL(res.url).hostname.toLowerCase();
        } catch {
          /* keep the host asked for */
        }
        const status = classifyStatus(res.status, res.headers, res.body);
        // A 404 at the root still means a site is answering here.
        const moved = !sameSite(landed, host);
        const failure = moved ? 'REDIRECTED' : status && status !== 'NOT_FOUND' ? status : undefined;
        return { status: res.status, ms, redirectedTo: moved ? landed : undefined, server: res.headers.server, failure };
      } catch (e) {
        const timedOut = Date.now() - started >= timeoutMs - 50;
        return { ms: Date.now() - started, failure: timedOut ? 'TIMEOUT' : classifyTransport(e) };
      }
    })(),
  ]);

  let verdict: DomainDiagnosis['verdict'] = http.failure ?? 'ok';
  let summary: string;
  if (dns.status === 'nxdomain' || dns.status === 'no-record') {
    verdict = 'DNS';
    summary = dns.status === 'nxdomain' ? `The name ${host} no longer exists in DNS` : `The name ${host} exists but has no address`;
  } else if (http.failure === 'REDIRECTED') summary = `${host} now sends visitors to ${http.redirectedTo}`;
  else if (http.failure === 'CHALLENGE') summary = `${host} answers with a browser check from this network`;
  else if (http.failure === 'ACCESS_DENIED') summary = `${host} refuses this network (HTTP ${http.status})`;
  else if (http.failure) summary = `${host} resolves${dns.status === 'ok' ? ` (${dns.addresses[0]})` : ''} but: ${FAILURES[http.failure].label.toLowerCase()}`;
  else summary = `${host} answers (HTTP ${http.status}, ${http.ms} ms)`;
  return { origin, host, dns, http, verdict, summary, checkedAt: new Date((o.now ?? Date.now)()).toISOString() };
}

/** Every address a provider is configured with: active, alternates and any candidate, role by role. */
export async function diagnoseDomains(config: DomainConfig, fetcher: Fetcher, o: DiagnoseOptions = {}): Promise<DomainDiagnosis[]> {
  const jobs: Promise<DomainDiagnosis>[] = [];
  for (const [role, r] of Object.entries(config.roles)) {
    const entries: [string, DomainDiagnosis['position']][] = [[r.active, 'active'], ...(r.alternates ?? []).map((a): [string, DomainDiagnosis['position']] => [a, 'alternate']), ...(r.candidate ? [[r.candidate.origin, 'candidate'] as [string, DomainDiagnosis['position']]] : [])];
    for (const [origin, position] of entries) jobs.push(diagnoseDomain(origin, fetcher, { ...o, path: r.health?.path ?? o.path, headers: r.health?.headers ?? o.headers }).then((d) => ({ ...d, role, position })));
  }
  return Promise.all(jobs);
}
