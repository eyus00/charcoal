/**
 * Failure taxonomy. Every way a provider run can go wrong has one code, and every code says who is
 * affected (its scope) and how it should count against health. "The provider is dead" is only one
 * of many answers, and usually the wrong one.
 */

export type FailureCode =
  /** The title simply isn't on this source. Not a failure of the source. */
  | 'NOT_FOUND'
  /** The host name didn't resolve. */
  | 'DNS'
  /** Resolved, but the connection was refused or reset. */
  | 'CONNECT'
  /** TLS handshake or certificate problem. */
  | 'TLS'
  /** One of the provider's own addresses now redirects to a host it doesn't list: it has probably moved. */
  | 'REDIRECTED'
  /** No answer in time. */
  | 'TIMEOUT'
  /** Any other network-level failure the runtime couldn't classify (e.g. inside a browser). */
  | 'NETWORK'
  /** A 5xx, or another status the provider didn't expect. */
  | 'HTTP'
  /** 429. */
  | 'RATE_LIMITED'
  /** The source wants a login or token the viewer hasn't supplied, or rejected it. */
  | 'AUTH_REQUIRED'
  /** 401 / 403 / 451 from this network position. */
  | 'ACCESS_DENIED'
  /** A bot-check page came back instead of content. Reported, never solved. */
  | 'CHALLENGE'
  /** The site answered normally but the page no longer has the shape the extraction expects. */
  | 'STRUCTURE_CHANGED'
  /** One required selector / path matched nothing. */
  | 'SELECTOR_MISSING'
  /** Extraction "worked" but what came out isn't a usable stream. */
  | 'INVALID_RESULT'
  /** A playback URL was already past its expiry. */
  | 'EXPIRED'
  /** Streams were found, but in no format this client accepts. */
  | 'UNSUPPORTED_FORMAT'
  /** The provider tried something its network policy forbids. */
  | 'POLICY'
  /** The provider can't run in this runtime (missing feature or setting). */
  | 'UNSUPPORTED_RUNTIME'
  /** The caller went away. */
  | 'CANCELLED'
  /** A bug in the provider or the framework. */
  | 'INTERNAL';

/**
 * Who a failure says something about:
 * - title:     this title only
 * - domain:    one address of the provider (try a configured alternate)
 * - runtime:   this network position (the provider may be fine elsewhere)
 * - provider:  the extraction logic itself (needs a new provider version)
 * - user:      the viewer's own configuration
 * - transient: nobody yet; try again later
 * - client:    the caller
 */
export type FailureScope = 'title' | 'domain' | 'runtime' | 'provider' | 'user' | 'transient' | 'client';

export interface FailureInfo {
  scope: FailureScope;
  /** none: ignore for health. soft: counts a little. hard: counts fully towards opening the circuit. */
  health: 'none' | 'soft' | 'hard';
  /** Whether the same request is worth repeating as it is. */
  retryable: boolean;
  /** For people. */
  label: string;
}

export const FAILURES: Record<FailureCode, FailureInfo> = {
  NOT_FOUND: { scope: 'title', health: 'none', retryable: false, label: 'Doesn’t have this title' },
  DNS: { scope: 'domain', health: 'hard', retryable: true, label: 'Its address doesn’t resolve' },
  CONNECT: { scope: 'domain', health: 'hard', retryable: true, label: 'Couldn’t connect to it' },
  TLS: { scope: 'domain', health: 'hard', retryable: false, label: 'Its certificate was rejected' },
  REDIRECTED: { scope: 'domain', health: 'hard', retryable: false, label: 'Has moved to another address' },
  TIMEOUT: { scope: 'transient', health: 'soft', retryable: true, label: 'Took too long to answer' },
  NETWORK: { scope: 'transient', health: 'soft', retryable: true, label: 'Couldn’t be reached' },
  HTTP: { scope: 'transient', health: 'soft', retryable: true, label: 'Answered with an error' },
  RATE_LIMITED: { scope: 'runtime', health: 'soft', retryable: false, label: 'Is rate-limiting requests' },
  AUTH_REQUIRED: { scope: 'user', health: 'none', retryable: false, label: 'Needs your account details' },
  ACCESS_DENIED: { scope: 'runtime', health: 'hard', retryable: false, label: 'Refuses this connection' },
  CHALLENGE: { scope: 'runtime', health: 'hard', retryable: false, label: 'Is behind a bot check here' },
  STRUCTURE_CHANGED: { scope: 'provider', health: 'hard', retryable: false, label: 'Changed its site; needs an update' },
  SELECTOR_MISSING: { scope: 'provider', health: 'hard', retryable: false, label: 'Changed its site; needs an update' },
  INVALID_RESULT: { scope: 'provider', health: 'hard', retryable: false, label: 'Returned something unusable' },
  EXPIRED: { scope: 'transient', health: 'soft', retryable: true, label: 'Its link had already expired' },
  UNSUPPORTED_FORMAT: { scope: 'client', health: 'none', retryable: false, label: 'Has nothing this device can play' },
  POLICY: { scope: 'provider', health: 'hard', retryable: false, label: 'Tried a request it isn’t allowed to make' },
  UNSUPPORTED_RUNTIME: { scope: 'client', health: 'none', retryable: false, label: 'Can’t run here' },
  CANCELLED: { scope: 'client', health: 'none', retryable: false, label: 'Cancelled' },
  INTERNAL: { scope: 'provider', health: 'hard', retryable: false, label: 'Failed unexpectedly' },
};

export interface FailureDetail {
  host?: string;
  /** Domain role of the host, when it is one of the provider's own. */
  role?: string;
  status?: number;
  /** The extraction step or selector that failed. */
  step?: string;
  /** For REDIRECTED: the host it now sends visitors to (a candidate for the domain config, once validated). */
  redirectedTo?: string;
}

export class ProviderError extends Error {
  readonly code: FailureCode;
  readonly detail: FailureDetail;
  constructor(code: FailureCode, message?: string, detail: FailureDetail = {}) {
    super(message ?? FAILURES[code].label);
    this.name = 'ProviderError';
    this.code = code;
    this.detail = detail;
  }
}

/** The title isn't on this source. Kept as a named class because existing providers throw it. */
export class NotFoundError extends ProviderError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

const CHALLENGE_BODY = /just a moment\.\.\.|attention required!|cf-chl-|challenge-platform|checking your browser|verify you are human|captcha-delivery|_incapsula_resource|ddos-guard/i;

/** True when a response is a bot-check interstitial rather than content. */
export function looksLikeChallenge(status: number, headers: Record<string, string>, body: string): boolean {
  const h = lower(headers);
  if (h['cf-mitigated'] === 'challenge') return true;
  if (![403, 429, 503].includes(status) && status < 400) {
    // A 200 challenge page is rare but exists; only trust strong markers there.
    return /<title>\s*just a moment\.\.\.\s*<\/title>/i.test(body.slice(0, 2000));
  }
  return CHALLENGE_BODY.test(body.slice(0, 6000));
}

const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

/** The failure a response status stands for, or null when it is a success. */
export function classifyStatus(status: number, headers: Record<string, string> = {}, body = ''): FailureCode | null {
  if (looksLikeChallenge(status, headers, body)) return 'CHALLENGE';
  if (status >= 200 && status < 400) return null;
  if (status === 404 || status === 410) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 401 || status === 403 || status === 451) return 'ACCESS_DENIED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return 'HTTP';
}

const TRANSPORT_CODES: Record<string, FailureCode> = {
  ENOTFOUND: 'DNS',
  EAI_AGAIN: 'DNS',
  EAI_NODATA: 'DNS',
  ECONNREFUSED: 'CONNECT',
  ECONNRESET: 'CONNECT',
  EHOSTUNREACH: 'CONNECT',
  ENETUNREACH: 'CONNECT',
  EPIPE: 'CONNECT',
  UND_ERR_SOCKET: 'CONNECT',
  ETIMEDOUT: 'TIMEOUT',
  UND_ERR_CONNECT_TIMEOUT: 'TIMEOUT',
  UND_ERR_HEADERS_TIMEOUT: 'TIMEOUT',
  UND_ERR_BODY_TIMEOUT: 'TIMEOUT',
  CERT_HAS_EXPIRED: 'TLS',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS',
  SELF_SIGNED_CERT_IN_CHAIN: 'TLS',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS',
  ERR_SSL_WRONG_VERSION_NUMBER: 'TLS',
};

/**
 * The failure a thrown transport error stands for. Node's fetch puts the real reason in
 * `error.cause.code`; a browser only says "Failed to fetch", which stays NETWORK.
 */
export function classifyTransport(error: unknown): FailureCode {
  if (error instanceof ProviderError) return error.code;
  const seen = new Set<unknown>();
  let e: unknown = error;
  while (e && typeof e === 'object' && !seen.has(e)) {
    seen.add(e);
    const o = e as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (typeof o.code === 'string' && TRANSPORT_CODES[o.code]) return TRANSPORT_CODES[o.code];
    if (typeof o.code === 'string' && /^(CERT_|ERR_TLS|ERR_SSL)/.test(o.code)) return 'TLS';
    if (o.name === 'AbortError' || o.name === 'TimeoutError') return 'TIMEOUT';
    const m = typeof o.message === 'string' ? o.message : '';
    if (/getaddrinfo|name not resolved|dns/i.test(m)) return 'DNS';
    if (/certificate|ssl|tls/i.test(m)) return 'TLS';
    if (/timed? ?out|took too long/i.test(m)) return 'TIMEOUT';
    if (/refused|reset|unreachable|socket hang up/i.test(m)) return 'CONNECT';
    e = o.cause;
  }
  return 'NETWORK';
}

/** One request a provider made, as recorded by the instrumented fetch. */
export interface RequestTrace {
  host: string;
  /** Domain role of the host, when it is one of the provider's own. */
  role?: string;
  path: string;
  method: string;
  status?: number;
  ms: number;
  outcome: 'ok' | FailureCode;
  attempt: number;
}

/** A classified failure with enough context to act on. */
export interface Diagnosis extends FailureInfo {
  code: FailureCode;
  message: string;
  host?: string;
  role?: string;
  status?: number;
  step?: string;
  redirectedTo?: string;
}

/**
 * Turns whatever a provider threw into a diagnosis. A typed error is taken at its word; an untyped
 * one (legacy providers, bugs) is explained from the last request that went wrong, so "TypeError:
 * Cannot read properties of undefined" after a 403 is reported as the 403 it was.
 */
export function diagnose(error: unknown, trace: RequestTrace[] = []): Diagnosis {
  if (error instanceof ProviderError) {
    return { code: error.code, ...FAILURES[error.code], message: error.message, ...error.detail };
  }
  const message = error instanceof Error ? error.message : String(error);
  const failed = [...trace].reverse().find((t) => t.outcome !== 'ok' && t.outcome !== 'NOT_FOUND');
  if (failed) {
    const code = failed.outcome as FailureCode;
    return { code, ...FAILURES[code], message: `${FAILURES[code].label} (${failed.host}${failed.status ? `, ${failed.status}` : ''})`, host: failed.host, role: failed.role, status: failed.status };
  }
  const transport = classifyTransport(error);
  if (transport !== 'NETWORK') return { code: transport, ...FAILURES[transport], message };
  // Every request was answered, yet the provider gave up or its code fell over: the site no longer
  // has the shape the extraction expects. With no requests at all, it is a bug.
  const code: FailureCode = trace.length ? 'STRUCTURE_CHANGED' : 'INTERNAL';
  return { code, ...FAILURES[code], message };
}
