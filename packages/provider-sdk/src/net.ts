/**
 * The fetch a provider is given. It wraps a runtime's transport with: the provider's network
 * policy, a per-request timeout, one careful retry, failover to a configured alternate domain, and
 * a trace of every request with its classified outcome. Providers still see an ordinary response
 * (they decide what a 404 means); the trace is what diagnostics are built from.
 */
import { classifyStatus, classifyTransport, FAILURES, ProviderError, type FailureCode, type RequestTrace } from './errors.js';
import type { DomainResolver } from './domains.js';
import type { PolicyGuard } from './policy.js';
import type { Fetcher, FetchOptions, FetchResponse } from './types.js';

/** Plain fetch() as a transport: Node, an edge runtime, or anywhere headers and CORS aren't restricted. */
export const fetchTransport: Fetcher = async (url, o = {}) => {
  const res = await fetch(url, { method: o.method ?? 'GET', headers: o.headers, body: o.body, signal: o.signal, redirect: 'follow' });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { status: res.status, ok: res.ok, url: res.url || url, headers, body: await res.text() };
};

export interface InstrumentOptions {
  guard: PolicyGuard;
  domains: DomainResolver;
  /** The run's signal: aborting it cancels every request. */
  signal: AbortSignal;
  trace: RequestTrace[];
  /** Per request, in ms. */
  timeoutMs?: number;
  /** Extra attempts for idempotent requests on a network failure or a 502/503/504. */
  retries?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRY_STATUS = new Set([502, 503, 504]);
const DOMAIN_SCOPED = new Set<FailureCode>(['DNS', 'CONNECT', 'TLS']);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Aborts when either signal aborts; also returns whether the timeout (not the caller) fired. */
function withTimeout(outer: AbortSignal, timeoutMs: number, extra?: AbortSignal) {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  if (outer.aborted || extra?.aborted) ctrl.abort();
  outer.addEventListener('abort', onAbort);
  extra?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done() {
      clearTimeout(timer);
      outer.removeEventListener('abort', onAbort);
      extra?.removeEventListener('abort', onAbort);
    },
  };
}

export function instrumentFetch(transport: Fetcher, opts: InstrumentOptions): Fetcher {
  const { guard, domains, trace } = opts;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  return async function providerFetch(rawUrl: string, options: FetchOptions = {}): Promise<FetchResponse> {
    const method = options.method ?? 'GET';
    const idempotent = method === 'GET' || method === 'HEAD';
    let url = rawUrl;
    let attempt = 0;

    for (;;) {
      attempt++;
      if (opts.signal.aborted) throw new ProviderError('CANCELLED');
      const u = await guard.check(url, method);
      const role = domains.roleOf(u.hostname);
      const started = Date.now();
      const record = (outcome: RequestTrace['outcome'], status?: number) =>
        trace.push({ host: u.hostname, role, path: u.pathname, method, status, ms: Date.now() - started, outcome, attempt });

      const t = withTimeout(opts.signal, timeoutMs, options.signal);
      let res: FetchResponse;
      try {
        res = await transport(url, { ...options, method, signal: t.signal });
      } catch (e) {
        t.done();
        if (opts.signal.aborted || options.signal?.aborted) {
          record('CANCELLED');
          throw new ProviderError('CANCELLED');
        }
        const code: FailureCode = t.timedOut() ? 'TIMEOUT' : classifyTransport(e);
        record(code);
        // An address that doesn't resolve or connect: move to the next configured one, if any.
        if (role && DOMAIN_SCOPED.has(code)) {
          const next = domains.failover(role, code);
          if (next) {
            url = domains.rebase(url, role);
            continue;
          }
        }
        if (idempotent && FAILURES[code].retryable && attempt <= retries) {
          await sleep(200 + Math.floor(random() * 400));
          continue;
        }
        throw new ProviderError(code, `${FAILURES[code].label} (${u.hostname})`, { host: u.hostname, role });
      }
      t.done();

      // A redirect may have left the allow-list; the body is only handed over if the final host is allowed.
      let finalHost = u.hostname;
      try {
        finalHost = new URL(res.url).hostname;
      } catch {
        /* keep the requested host */
      }
      if (finalHost !== u.hostname && !guard.isDeclared(finalHost) && !guard.discoveredHosts.includes(finalHost.toLowerCase())) {
        // One of the provider's own addresses sending us elsewhere means it has moved: that is a
        // matter for its domain config (after validation), not something to follow blindly.
        if (role) {
          record('REDIRECTED', res.status);
          throw new ProviderError('REDIRECTED', `${u.hostname} now redirects to ${finalHost}`, { host: u.hostname, role, redirectedTo: finalHost });
        }
        record('POLICY', res.status);
        throw new ProviderError('POLICY', `Redirected to a host outside the allow-list: ${finalHost}`, { host: finalHost });
      }

      const failure = classifyStatus(res.status, res.headers, res.body);
      record(failure ?? 'ok', res.status);
      if (failure && idempotent && RETRY_STATUS.has(res.status) && attempt <= retries) {
        await sleep(200 + Math.floor(random() * 400));
        continue;
      }
      const body = res.body.length > guard.policy.maxBodyChars ? res.body.slice(0, guard.policy.maxBodyChars) : res.body;
      if (!failure) guard.noteResponse(u.hostname, body);
      // A bot check is never content: no provider should try to parse it.
      if (failure === 'CHALLENGE') throw new ProviderError('CHALLENGE', `${FAILURES.CHALLENGE.label} (${u.hostname})`, { host: u.hostname, role, status: res.status });
      return body === res.body ? res : { ...res, body };
    }
  };
}

/** Throws the typed failure a response stands for; returns the response when it is a success. */
export function expectOk(res: FetchResponse, what?: string): FetchResponse {
  const code = classifyStatus(res.status, res.headers, res.body);
  if (!code) return res;
  let host: string | undefined;
  try {
    host = new URL(res.url).hostname;
  } catch {
    /* unknown */
  }
  throw new ProviderError(code, `${what ? `${what}: ` : ''}${FAILURES[code].label}${host ? ` (${host}, ${res.status})` : ` (${res.status})`}`, { host, status: res.status });
}

/** GET (or POST) and parse JSON. A body that isn't JSON means the site changed. */
export async function getJson<T>(fetcher: Fetcher, url: string, options?: FetchOptions, what?: string): Promise<T> {
  const res = expectOk(await fetcher(url, options), what);
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new ProviderError('STRUCTURE_CHANGED', `${what ? `${what}: ` : ''}expected JSON from ${safeHost(url)}`, { host: safeHost(url), status: res.status });
  }
}

const safeHost = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};
