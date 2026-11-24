/**
 * Test utilities for provider authors and for the platform's own tests. Nothing here touches the
 * network: a mock transport answers from routes you define, and the failure helpers produce the
 * same error shapes real runtimes do.
 */
import type { DomainConfig } from '../domains.js';
import { Engine, type EngineOptions, type LoadedProvider } from '../engine.js';
import { HealthStore } from '../health.js';
import { validateManifest } from '../registry.js';
import { describeRuntime } from '../runtime.js';
import type { Fetcher, FetchOptions, Media, ProviderModule, RuntimeDescriptor } from '../types.js';

export interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  /** Objects are sent as JSON. */
  body?: string | object;
  /** Final URL to report (a redirect). */
  url?: string;
  /** Throw this instead of answering. */
  error?: unknown;
  /** Answer after this long (aborts are honoured). */
  delayMs?: number;
}

export interface MockRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type MockRoute = MockResponse | ((req: MockRequest) => MockResponse | Promise<MockResponse>);

export type MockTransport = Fetcher & { calls: MockRequest[]; routes: Record<string, MockRoute> };

const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

/**
 * A transport that answers from a route table. Keys, most specific first:
 *   "POST https://host/path"   method + origin + path
 *   "https://host/path"        any method
 *   "https://host/prefix*"     prefix match
 *   "host"                     everything on a host
 * A request with no route fails like an unresolvable host, so a provider that wanders off its
 * fixtures is noticed.
 */
export function mockTransport(routes: Record<string, MockRoute> = {}): MockTransport {
  const calls: MockRequest[] = [];
  const find = (u: URL, method: string): MockRoute | undefined => {
    const base = u.origin + u.pathname;
    const exact = routes[`${method} ${base}${u.search}`] ?? routes[`${base}${u.search}`] ?? routes[`${method} ${base}`] ?? routes[base];
    if (exact) return exact;
    const prefix = Object.keys(routes)
      .filter((k) => k.endsWith('*'))
      .sort((a, b) => b.length - a.length)
      .find((k) => {
        const [m, pattern] = k.includes(' ') ? k.split(' ') : [undefined, k];
        return (!m || m === method) && (u.origin + u.pathname + u.search).startsWith(pattern.slice(0, -1));
      });
    return prefix ? routes[prefix] : routes[u.hostname];
  };
  const transport = (async (rawUrl: string, o: FetchOptions = {}) => {
    const u = new URL(rawUrl);
    const method = o.method ?? 'GET';
    const req: MockRequest = { url: u, method, headers: o.headers ?? {}, body: o.body };
    calls.push(req);
    if (o.signal?.aborted) throw abortError();
    const route = find(u, method);
    if (!route) throw simulate.dns().error;
    const r = typeof route === 'function' ? await route(req) : route;
    if (r.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, r.delayMs);
        o.signal?.addEventListener('abort', () => (clearTimeout(t), reject(abortError())), { once: true });
      });
    }
    if (r.error) throw r.error;
    const status = r.status ?? 200;
    const body = typeof r.body === 'object' && r.body !== null ? JSON.stringify(r.body) : (r.body ?? '');
    const headers = { ...(typeof r.body === 'object' && r.body !== null ? { 'content-type': 'application/json' } : {}), ...(r.headers ?? {}) };
    return { status, ok: status >= 200 && status < 300, url: r.url ?? rawUrl, headers, body };
  }) as MockTransport;
  transport.calls = calls;
  transport.routes = routes;
  return transport;
}

const nodeError = (code: string, message: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(message), { code }) });

/** Ready-made failures, shaped like the real thing. */
export const simulate = {
  dns: (): MockResponse => ({ error: nodeError('ENOTFOUND', 'getaddrinfo ENOTFOUND') }),
  refused: (): MockResponse => ({ error: nodeError('ECONNREFUSED', 'connect ECONNREFUSED') }),
  reset: (): MockResponse => ({ error: nodeError('ECONNRESET', 'read ECONNRESET') }),
  tls: (): MockResponse => ({ error: nodeError('CERT_HAS_EXPIRED', 'certificate has expired') }),
  /** Never answers; the caller's timeout ends it. */
  hang: (): MockResponse => ({ delayMs: 3_600_000 }),
  /** What a browser gives you for any network failure. */
  browserNetworkError: (): MockResponse => ({ error: new TypeError('Failed to fetch') }),
  challenge: (): MockResponse => ({ status: 403, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' }, body: '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>' }),
  forbidden: (): MockResponse => ({ status: 403, body: 'Forbidden' }),
  rateLimited: (): MockResponse => ({ status: 429, body: 'Too Many Requests' }),
  serverError: (status = 502): MockResponse => ({ status, body: 'Bad Gateway' }),
  notFound: (): MockResponse => ({ status: 404, body: 'Not Found' }),
  html: (body: string): MockResponse => ({ status: 200, headers: { 'content-type': 'text/html' }, body }),
  json: (body: object): MockResponse => ({ status: 200, body }),
  playlist: (variants: number[] = [1080, 720]): MockResponse => ({
    status: 200,
    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    body: '#EXTM3U\n' + variants.map((h) => `#EXT-X-STREAM-INF:BANDWIDTH=${h * 4000},RESOLUTION=${Math.round((h * 16) / 9)}x${h}\n${h}/index.m3u8`).join('\n') + '\n',
  }),
};

/** Known titles for tests and canaries. */
export const TITLES = {
  movie: { kind: 'movie', ids: { tmdb: '27205', imdb: 'tt1375666' }, title: 'Inception', year: 2010, runtime: 148 } satisfies Media,
  episode: { kind: 'tv', ids: { tmdb: '1396', imdb: 'tt0903747' }, title: 'Breaking Bad', year: 2008, season: 2, episode: 3 } satisfies Media,
  anime: { kind: 'anime', ids: { anilist: '16498', mal: '16498', tmdb: '1429' }, title: 'Attack on Titan', altTitles: ['Shingeki no Kyojin'], episode: 1, season: 1, seasonEpisode: 1 } satisfies Media,
};

export interface TestHarness {
  engine: Engine;
  health: HealthStore;
  transport: MockTransport;
  /** Advance the harness clock (health cool-downs, cache lifetimes). */
  advance(ms: number): void;
  now(): number;
}

/** An engine wired to a mock transport and a controllable clock. */
export function createHarness(opts: {
  providers: (ProviderModule | LoadedProvider)[];
  routes?: Record<string, MockRoute>;
  domains?: Record<string, DomainConfig>;
  runtime?: RuntimeDescriptor;
  engine?: Partial<EngineOptions>;
  startAt?: number;
}): TestHarness {
  let clock = opts.startAt ?? 1_800_000_000_000;
  const now = () => clock;
  const transport = mockTransport(opts.routes ?? {});
  const health = new HealthStore({ now });
  const providers: LoadedProvider[] = opts.providers.map((p) => ('module' in p ? p : { module: p, stage: 'stable', domains: opts.domains?.[p.manifest.id] }));
  const engine = new Engine({ providers, runtime: opts.runtime ?? describeRuntime('server'), transport, health, now, waveDelayMs: 50, requestTimeoutMs: 400, providerTimeoutMs: 1500, ...opts.engine });
  return { engine, health, transport, now, advance: (ms) => void (clock += ms) };
}

/** A one-role domain config for tests. */
export function domainsFor(provider: string, roles: Record<string, string | string[]>): DomainConfig {
  return {
    provider,
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    roles: Object.fromEntries(Object.entries(roles).map(([name, v]) => [name, Array.isArray(v) ? { active: v[0], alternates: v.slice(1) } : { active: v }])),
  };
}

/**
 * Contract checks every provider must pass, whatever it scrapes. Returns the problems found
 * (empty = conforms). Run it in a provider's own test with fixtures for its happy path.
 */
export async function checkContract(module: ProviderModule, fixture: { media: Media; routes: Record<string, MockRoute>; domains?: DomainConfig; runtime?: RuntimeDescriptor; settings?: Record<string, unknown> }): Promise<string[]> {
  const problems: string[] = [...validateManifest(module.manifest)];
  const loaded: LoadedProvider = { module, stage: 'stable', domains: fixture.domains };
  const make = (routes: Record<string, MockRoute>, extra: Partial<EngineOptions> = {}) => createHarness({ providers: [loaded], routes, runtime: fixture.runtime, engine: { settings: fixture.settings, ...extra } });

  // 1. Happy path: valid, normalisable streams of a declared type.
  const ok = make(fixture.routes);
  const good = await ok.engine.runProvider(loaded, fixture.media);
  if (good.outcome !== 'ok') problems.push(`happy path: expected streams, got ${good.outcome}${good.code ? ` (${good.code}: ${good.message})` : ''}`);
  for (const s of good.streams) if (!module.manifest.output.types.includes(s.type)) problems.push(`returned a ${s.type} stream but the manifest only declares ${module.manifest.output.types.join(', ')}`);
  if (good.rejected?.length) problems.push(`some streams were unusable: ${good.rejected.join(', ')}`);

  // 2. Every request stayed inside the declared hosts (the policy would have thrown otherwise).
  if (good.code === 'POLICY') problems.push(`network policy violation: ${good.message}`);

  // 3. A dead network is reported as a network failure, not as "not found" and not as a crash.
  const dead = make({});
  const down = await dead.engine.runProvider(loaded, fixture.media);
  if (down.outcome !== 'error' || !['DNS', 'CONNECT', 'NETWORK', 'TIMEOUT'].includes(down.code ?? '')) problems.push(`unreachable site: expected a network failure, got ${down.outcome} ${down.code ?? ''}`);

  // 4. A bot check is reported as CHALLENGE.
  const hosts = [...new Set(ok.transport.calls.map((c) => c.url.hostname))];
  const challenged = make(Object.fromEntries(hosts.map((h) => [h, simulate.challenge()])));
  const ch = await challenged.engine.runProvider(loaded, fixture.media);
  if (ch.code !== 'CHALLENGE') problems.push(`bot check: expected CHALLENGE, got ${ch.outcome} ${ch.code ?? ''}`);

  // 5. It stops when cancelled.
  const slow = make(Object.fromEntries(hosts.map((h) => [h, simulate.hang()])), { providerTimeoutMs: 60_000, requestTimeoutMs: 60_000 });
  const ctrl = new AbortController();
  const pending = slow.engine.runProvider(loaded, fixture.media, ctrl.signal);
  setTimeout(() => ctrl.abort(), 20);
  const cancelled = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), 1000))]);
  if (!cancelled) problems.push('cancellation: the run did not end within 1s of being aborted');
  else if (cancelled.code !== 'CANCELLED') problems.push(`cancellation: expected CANCELLED, got ${cancelled.outcome} ${cancelled.code ?? ''}`);

  return problems;
}
