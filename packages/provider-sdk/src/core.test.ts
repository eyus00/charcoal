import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatus, classifyTransport, diagnose, FAILURES, looksLikeChallenge, NotFoundError, ProviderError, type RequestTrace } from './errors.js';
import { hostMatches, isPublicHost, isValidHostPattern, PolicyGuard } from './policy.js';
import { compareVersions, satisfies } from './semver.js';
import { canRun, chooseRuntime, describeRuntime, planExecution } from './runtime.js';
import { checkDomains, DomainResolver, hostsOf, normalizeOrigin, promoteDomain, rollbackDomain, switchActive, validateDomainConfig, type DomainConfig } from './domains.js';
import { HealthStore, summarize } from './health.js';
import { acceptRegistry, diffRegistry, generateRegistryKey, rollbackProvider, signRegistry, validateManifest, validateRegistry, verifyRegistry, type RegistryDocument } from './registry.js';
import { mockTransport, simulate } from './testing/index.js';
import type { ProviderManifest } from './types.js';

const manifest = (over: Partial<ProviderManifest> = {}): ProviderManifest => ({
  id: 'example',
  name: 'Example',
  version: '1.0.0',
  contract: 2,
  kinds: ['movie', 'tv'],
  lookup: ['tmdb'],
  runtimes: ['server', 'extension', 'app'],
  domainRoles: ['site'],
  output: { types: ['hls'] },
  ...over,
});

const domains = (over: Partial<DomainConfig['roles']['site']> = {}): DomainConfig => ({
  provider: 'example',
  version: 3,
  updatedAt: '2026-11-01T00:00:00.000Z',
  roles: { site: { active: 'https://a.example.com', alternates: ['https://b.example.net'], ...over } },
});

// ---------- failure taxonomy ----------

test('status codes map to distinct failures, not one "dead provider"', () => {
  assert.equal(classifyStatus(200), null);
  assert.equal(classifyStatus(404), 'NOT_FOUND');
  assert.equal(classifyStatus(429), 'RATE_LIMITED');
  assert.equal(classifyStatus(403), 'ACCESS_DENIED');
  assert.equal(classifyStatus(451), 'ACCESS_DENIED');
  assert.equal(classifyStatus(502), 'HTTP');
  assert.equal(classifyStatus(504), 'TIMEOUT');
  assert.equal(classifyStatus(403, { 'cf-mitigated': 'challenge' }, ''), 'CHALLENGE');
  assert.equal(classifyStatus(503, {}, '<html><title>Just a moment...</title>'), 'CHALLENGE');
});

test('a normal 403 body is not mistaken for a bot check, and a normal page mentioning captcha is not either', () => {
  assert.equal(looksLikeChallenge(403, {}, 'Forbidden'), false);
  assert.equal(looksLikeChallenge(200, {}, '<html><body>We never show a captcha here</body></html>'), false);
  assert.equal(looksLikeChallenge(200, {}, '<html><head><title>Just a moment...</title></head></html>'), true);
});

test('transport errors are told apart by cause', () => {
  const node = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });
  assert.equal(classifyTransport(node('ENOTFOUND')), 'DNS');
  assert.equal(classifyTransport(node('ECONNREFUSED')), 'CONNECT');
  assert.equal(classifyTransport(node('UND_ERR_CONNECT_TIMEOUT')), 'TIMEOUT');
  assert.equal(classifyTransport(node('CERT_HAS_EXPIRED')), 'TLS');
  assert.equal(classifyTransport(Object.assign(new Error('aborted'), { name: 'AbortError' })), 'TIMEOUT');
  assert.equal(classifyTransport(new TypeError('Failed to fetch')), 'NETWORK');
});

test('diagnose: typed errors are kept; untyped ones are explained from the request trace', () => {
  const typed = diagnose(new ProviderError('SELECTOR_MISSING', 'no player', { step: 'css:#player' }));
  assert.equal(typed.code, 'SELECTOR_MISSING');
  assert.equal(typed.scope, 'provider');
  assert.equal(typed.step, 'css:#player');

  const trace: RequestTrace[] = [
    { host: 'a.example.com', role: 'site', path: '/x', method: 'GET', status: 200, ms: 10, outcome: 'ok', attempt: 1 },
    { host: 'a.example.com', role: 'site', path: '/y', method: 'GET', status: 403, ms: 10, outcome: 'ACCESS_DENIED', attempt: 1 },
  ];
  const crash = diagnose(new TypeError("Cannot read properties of undefined (reading 'src')"), trace);
  assert.equal(crash.code, 'ACCESS_DENIED');
  assert.equal(crash.scope, 'runtime');
  assert.equal(crash.host, 'a.example.com');

  const allOk = diagnose(new Error('no token in the page'), [trace[0]]);
  assert.equal(allOk.code, 'STRUCTURE_CHANGED');
  assert.equal(diagnose(new Error('boom'), []).code, 'INTERNAL');
  assert.equal(diagnose(new NotFoundError()).code, 'NOT_FOUND');
  assert.equal(FAILURES.NOT_FOUND.health, 'none');
});

// ---------- network policy ----------

test('private, loopback and disguised addresses are never public', () => {
  for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.9', '169.254.169.254', '100.64.0.1', '[::1]', 'fd00::1', 'router.lan', 'svc.internal', '2130706433', '0x7f000001', '::ffff:10.0.0.1']) {
    assert.equal(isPublicHost(h), false, h);
  }
  for (const h of ['example.com', '8.8.8.8', 'cdn.example.co.uk', '2606:4700::1111']) assert.equal(isPublicHost(h), true, h);
});

test('host patterns', () => {
  assert.equal(hostMatches('api.example.com', 'api.example.com'), true);
  assert.equal(hostMatches('x.api.example.com', 'api.example.com'), false);
  assert.equal(hostMatches('cdn1.example.com', '*.example.com'), true);
  assert.equal(hostMatches('example.com', '*.example.com'), false);
  assert.equal(hostMatches('example.com', '.example.com'), true);
  assert.equal(hostMatches('evilexample.com', '*.example.com'), false);
  assert.equal(isValidHostPattern('*.example.com'), true);
  assert.equal(isValidHostPattern('*'), false);
  assert.equal(isValidHostPattern('*.com'), false);
  assert.equal(isValidHostPattern('https://example.com'), false);
});

test('the guard refuses undeclared hosts, private addresses, and too many requests', async () => {
  const guard = new PolicyGuard({ allow: ['a.example.com'], followDiscovered: true, maxRequests: 2, maxBodyChars: 1000 });
  await guard.check('https://a.example.com/x');
  await assert.rejects(guard.check('https://other.example.org/'), (e: ProviderError) => e.code === 'POLICY');
  await assert.rejects(guard.check('http://127.0.0.1/admin'), (e: ProviderError) => e.code === 'POLICY' && /private/i.test(e.message));
  await assert.rejects(guard.check('file:///etc/passwd'), (e: ProviderError) => e.code === 'POLICY');
  await assert.rejects(guard.check('not a url'), (e: ProviderError) => e.code === 'POLICY');

  // A host named in a response from a declared host becomes fetchable, for GET only.
  guard.noteResponse('a.example.com', '{"playlist":"https:\\/\\/cdn.video.example\\/m.m3u8","internal":"http://10.0.0.5/x"}');
  await guard.check('https://cdn.video.example/m.m3u8');
  await assert.rejects(guard.check('https://cdn.video.example/upload', 'POST'), (e: ProviderError) => /Only GET/.test(e.message));
  assert.deepEqual(guard.discoveredHosts, ['cdn.video.example']);
  // Two allowed requests used the budget (refused ones don't count).
  assert.equal(guard.requestCount, 2);
  await assert.rejects(guard.check('https://a.example.com/again'), (e: ProviderError) => /More than 2 requests/.test(e.message));
});

test('a response from an undeclared host cannot widen the allow-list', async () => {
  const guard = new PolicyGuard({ allow: ['a.example.com'], followDiscovered: true, maxRequests: 10, maxBodyChars: 1000 });
  guard.noteResponse('evil.example.org', 'https://anything.example/');
  await assert.rejects(guard.check('https://anything.example/'), (e: ProviderError) => e.code === 'POLICY');
});

test('a runtime-supplied DNS check can refuse a public name that resolves privately', async () => {
  const guard = new PolicyGuard({ allow: ['rebind.example.com'], followDiscovered: false, maxRequests: 5, maxBodyChars: 10 }, async () => false);
  await assert.rejects(guard.check('https://rebind.example.com/'), (e: ProviderError) => /resolves to a private network/.test(e.message));
});

// ---------- versions and runtimes ----------

test('semver ranges', () => {
  assert.ok(compareVersions('1.2.10', '1.2.9') > 0);
  assert.ok(satisfies('0.1.4', '^0.1.0'));
  assert.ok(!satisfies('0.2.0', '^0.1.0'));
  assert.ok(satisfies('1.4.0', '^1.2.3'));
  assert.ok(!satisfies('2.0.0', '^1.2.3'));
  assert.ok(satisfies('1.2.9', '~1.2.3'));
  assert.ok(satisfies('1.5.0', '>=1.0.0 <2.0.0'));
  assert.ok(!satisfies('2.0.0', '>=1.0.0 <2.0.0'));
  assert.ok(satisfies('0.1.0', undefined));
  assert.ok(!satisfies('garbage', '>=1.0.0'));
});

test('capability matching: features, egress, settings, contract', () => {
  const server = describeRuntime('server');
  const ext = describeRuntime('extension');
  const edge = describeRuntime('edge');
  assert.equal(canRun(manifest(), server).ok, true);
  assert.deepEqual(canRun(manifest({ runtimes: ['extension'] }), server).missing, ['runtime:server']);
  assert.deepEqual(canRun(manifest({ runtimes: ['edge', 'server'], requires: { features: ['node'] } }), edge).missing, ['feature:node']);
  assert.deepEqual(canRun(manifest({ requires: { egress: 'user' } }), server).missing, ['egress:user']);
  assert.equal(canRun(manifest({ requires: { egress: 'user' } }), describeRuntime('server', { egress: 'user' })).ok, true);
  // A personal token: fine in the extension when present, never on a shared server.
  const tokened = manifest({ requires: { setting: 'token' } });
  assert.equal(canRun(tokened, ext, { token: 'abc' }).ok, true);
  assert.deepEqual(canRun(tokened, ext, {}).missing, ['setting:token']);
  assert.deepEqual(canRun(tokened, server).missing, ['setting:token']);
  assert.equal(canRun(tokened, server, { token: 'own-server-token' }).ok, true);
  assert.deepEqual(canRun(manifest({ dependencies: { sdk: '>=9.0.0' } }), server).missing, ['sdk:>=9.0.0']);
});

test('the viewer’s own connection is preferred; an open circuit there falls back to the server', () => {
  const available = [describeRuntime('server'), describeRuntime('extension')];
  assert.equal(chooseRuntime(manifest(), available)?.kind, 'extension');
  const health = { allowed: (_p: string, r: string) => r !== 'extension', reliability: () => 0.5 };
  assert.equal(chooseRuntime(manifest(), available, health)?.kind, 'server');
});

test('execution plan: local when possible, remote otherwise, never a token to a remote runtime', () => {
  const plan = planExecution(
    [manifest({ id: 'both' }), manifest({ id: 'server-only', runtimes: ['server'], requires: { features: ['node'] } }), manifest({ id: 'tokened', requires: { setting: 'token' } }), manifest({ id: 'app-only', runtimes: ['app'] })],
    { local: [describeRuntime('extension')], remote: [describeRuntime('server')], settings: {} },
  );
  assert.deepEqual(plan.map((p) => [p.provider, p.where, p.runtime]), [
    ['both', 'local', 'extension'],
    ['server-only', 'remote', 'server'],
    ['tokened', 'none', undefined],
    ['app-only', 'none', undefined],
  ]);
  // Website with no bridge: everything that can goes remote.
  const web = planExecution([manifest({ id: 'both' })], { local: [], remote: [describeRuntime('server')] });
  assert.equal(web[0].where, 'remote');
  // No bridge and no resolver.
  assert.equal(planExecution([manifest({ id: 'both' })], { local: [] })[0].where, 'none');
});

// ---------- domains ----------

test('domain config validation', () => {
  assert.deepEqual(validateDomainConfig(domains(), ['site']), []);
  assert.match(validateDomainConfig(domains(), ['site', 'api']).join(), /role "api" is used by the provider but not configured/);
  assert.match(validateDomainConfig(domains({ active: 'https://a.example.com/path' })).join(), /not an origin/);
  assert.match(validateDomainConfig(domains({ active: 'http://192.168.0.2' })).join(), /private or internal/);
  assert.match(validateDomainConfig(domains({ alternates: ['https://a.example.com'] })).join(), /listed twice/);
  assert.equal(normalizeOrigin('https://Example.COM/'), 'https://example.com');
  assert.throws(() => normalizeOrigin('https://example.com/x'));
  assert.deepEqual(hostsOf(domains({ aliases: ['www.a.example.com'] })).sort(), ['a.example.com', 'b.example.net', 'www.a.example.com']);
});

test('the resolver fails over to the next alternate and rebases URLs; extraction code never sees the change', () => {
  const r = new DomainResolver(domains());
  assert.equal(r.url('site', '/api/movie/1'), 'https://a.example.com/api/movie/1');
  assert.equal(r.roleOf('b.example.net'), 'site');
  assert.equal(r.failover('site', 'DNS'), 'https://b.example.net');
  assert.equal(r.url('site', 'api/movie/1'), 'https://b.example.net/api/movie/1');
  assert.equal(r.rebase('https://a.example.com/api/movie/1?x=1', 'site'), 'https://b.example.net/api/movie/1?x=1');
  assert.equal(r.failover('site', 'DNS'), null);
  assert.deepEqual(r.failovers, [{ role: 'site', from: 'https://a.example.com', to: 'https://b.example.net', reason: 'DNS' }]);
  // Origins already known to be down are skipped from the start.
  assert.equal(new DomainResolver(domains(), { site: ['https://a.example.com'] }).origin('site'), 'https://b.example.net');
});

test('domain checks tell DNS failure, bot check, server error and unexpected content apart', async () => {
  const cfg: DomainConfig = {
    provider: 'example',
    version: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    roles: {
      site: { active: 'https://gone.example.com', alternates: ['https://up.example.com', 'https://challenged.example.com', 'https://broken.example.com', 'https://parked.example.com'], health: { path: '/ping', expectText: 'pong' } },
    },
  };
  const transport = mockTransport({
    'https://up.example.com/ping': { body: 'pong' },
    'https://challenged.example.com/ping': simulate.challenge(),
    'https://broken.example.com/ping': simulate.serverError(500),
    'https://parked.example.com/ping': simulate.html('<h1>This domain is for sale</h1>'),
  });
  const checks = await checkDomains(cfg, transport);
  const by = Object.fromEntries(checks.map((c) => [new URL(c.origin).hostname.split('.')[0], c]));
  assert.equal(by.gone.failure, 'DNS');
  assert.equal(by.gone.position, 'active');
  assert.equal(by.up.ok, true);
  assert.equal(by.challenged.failure, 'CHALLENGE');
  assert.equal(by.broken.failure, 'HTTP');
  assert.equal(by.parked.failure, 'UNEXPECTED_CONTENT');
});

test('a domain change is validated before it is promoted, versioned, audited, and can be rolled back', async () => {
  const v3 = domains();
  const transport = mockTransport({ 'https://new.example.org/': { body: 'ok' }, 'https://dead.example.org/': simulate.refused() });

  // Rejected: the candidate doesn't answer. Nothing changes.
  const rejected = await promoteDomain(v3, { role: 'site', origin: 'https://dead.example.org', by: 'ops' }, transport);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.config, v3);
  assert.equal(rejected.audit.validation?.ok, false);
  assert.equal(rejected.audit.toVersion, 3);

  // Rejected: the endpoint answers but a real extraction through it doesn't work.
  const probeFails = await promoteDomain(v3, { role: 'site', origin: 'https://new.example.org', by: 'ops' }, transport, async () => ({ ok: false }));
  assert.equal(probeFails.accepted, false);
  assert.equal(probeFails.config.version, 3);

  // Accepted.
  const accepted = await promoteDomain(v3, { role: 'site', origin: 'https://new.example.org', by: 'ops', reason: 'moved' }, transport, async (c) => ({ ok: c.roles.site.active === 'https://new.example.org' }));
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.config.version, 4);
  assert.equal(accepted.config.roles.site.active, 'https://new.example.org');
  assert.deepEqual(accepted.config.roles.site.alternates, ['https://a.example.com', 'https://b.example.net']);
  assert.deepEqual([accepted.audit.from, accepted.audit.to, accepted.audit.fromVersion, accepted.audit.toVersion, accepted.audit.by], ['https://a.example.com', 'https://new.example.org', 3, 4, 'ops']);
  assert.equal(v3.roles.site.active, 'https://a.example.com', 'the original document is untouched');

  // Rollback: old content, new version number.
  const back = rollbackDomain(accepted.config, v3, 'ops');
  assert.equal(back.config.version, 5);
  assert.equal(back.config.roles.site.active, 'https://a.example.com');
  assert.equal(back.audit.action, 'rollback');
  assert.throws(() => switchActive(v3, 'nope', 'https://x.example.com'));
  await assert.rejects(promoteDomain(v3, { role: 'site', origin: 'http://10.0.0.1', by: 'ops' }, transport), /private or internal/);
});

// ---------- health ----------

test('circuit breaker: opens after repeated hard failures, half-opens for one trial, doubles its cool-down, closes on success', () => {
  let now = 1_000_000;
  const h = new HealthStore({ now: () => now, baseCooldownMs: 60_000, failuresToOpen: 3 });
  const fail = (code: 'ACCESS_DENIED' | 'TIMEOUT' | 'NOT_FOUND' | 'AUTH_REQUIRED' | 'STRUCTURE_CHANGED') => h.record('p', 'server', { kind: 'failure', diagnosis: { code, ...FAILURES[code], message: code } }, 100);

  fail('ACCESS_DENIED');
  fail('ACCESS_DENIED');
  assert.equal(h.allow('p', 'server').allowed, true);
  fail('ACCESS_DENIED');
  assert.deepEqual([h.allow('p', 'server').allowed, h.status('p', 'server')], [false, 'benched']);
  // Another runtime is unaffected.
  assert.equal(h.allow('p', 'extension').allowed, true);

  now += 60_001;
  assert.deepEqual(h.allow('p', 'server'), { allowed: true, state: 'half-open' });
  assert.equal(h.allow('p', 'server').allowed, false, 'only one trial at a time');
  fail('ACCESS_DENIED');
  assert.equal(h.get('p', 'server')!.openUntil, now + 120_000, 'cool-down doubled');

  now += 120_001;
  assert.equal(h.allow('p', 'server').allowed, true);
  h.record('p', 'server', { kind: 'ok' }, 80);
  assert.deepEqual([h.get('p', 'server')!.circuit, h.get('p', 'server')!.opens, h.allow('p', 'server').allowed], ['closed', 0, true]);
});

test('"not found", missing account details and cancellations never count against a provider', () => {
  const h = new HealthStore();
  for (let i = 0; i < 10; i++) h.record('p', 'server', { kind: 'failure', diagnosis: { code: 'NOT_FOUND', ...FAILURES.NOT_FOUND, message: '' } }, 50);
  for (let i = 0; i < 10; i++) h.record('p', 'server', { kind: 'failure', diagnosis: { code: 'AUTH_REQUIRED', ...FAILURES.AUTH_REQUIRED, message: '' } }, 50);
  for (let i = 0; i < 10; i++) h.record('p', 'server', { kind: 'failure', diagnosis: { code: 'CANCELLED', ...FAILURES.CANCELLED, message: '' } }, 50);
  const r = h.get('p', 'server')!;
  assert.deepEqual([r.failed, r.empty, r.circuit], [0, 10, 'closed']);
  assert.equal(h.status('p', 'server'), 'ok');
  assert.ok(h.reliability('p', 'server') > 0.9);
  assert.ok(h.hitRate('p', 'server') < 0.1);
});

test('soft failures count half; a changed site is flagged for an update; a new version starts clean', () => {
  const h = new HealthStore({ failuresToOpen: 3 });
  const soft = { code: 'TIMEOUT' as const, ...FAILURES.TIMEOUT, message: 'slow' };
  for (let i = 0; i < 5; i++) h.record('p', 'server', { kind: 'failure', diagnosis: soft }, 9000, '1.0.0');
  assert.equal(h.get('p', 'server')!.circuit, 'closed', '5 soft failures = 2.5');
  h.record('p', 'server', { kind: 'failure', diagnosis: soft }, 9000, '1.0.0');
  assert.equal(h.get('p', 'server')!.circuit, 'open');

  h.record('q', 'server', { kind: 'failure', diagnosis: { code: 'STRUCTURE_CHANGED', ...FAILURES.STRUCTURE_CHANGED, message: 'no token', host: 'x.example.com' } }, 300, '1.0.0');
  assert.equal(h.status('q', 'server'), 'needs-update');
  const s = summarize(h).find((x) => x.provider === 'q')!;
  assert.deepEqual([s.lastFailure?.code, s.lastFailure?.host], ['STRUCTURE_CHANGED', 'x.example.com']);

  h.record('q', 'server', { kind: 'ok' }, 200, '1.1.0');
  assert.deepEqual([h.status('q', 'server'), h.get('q', 'server')!.failures.length], ['ok', 0]);
});

test('health survives a restart through snapshot and load', () => {
  const a = new HealthStore();
  a.record('p', 'server', { kind: 'ok' }, 120, '1.0.0');
  a.record('p', 'extension', { kind: 'failure', diagnosis: { code: 'DNS', ...FAILURES.DNS, message: 'x' } }, 30);
  const b = new HealthStore();
  b.load(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(b.get('p', 'server')!.ok, 1);
  assert.equal(b.get('p', 'extension')!.failures[0].code, 'DNS');
});

// ---------- registry ----------

const registry = (over: Partial<RegistryDocument> = {}): RegistryDocument => ({
  schema: 1,
  version: 7,
  generatedAt: '2026-11-24T12:00:00.000Z',
  channel: 'stable',
  endpoints: { resolvers: ['https://resolver.example.com'] },
  providers: [{ manifest: manifest(), stage: 'stable', domains: { ...domains(), provider: 'example' }, release: { version: '1.0.0', at: '2026-11-20T00:00:00.000Z' } }],
  ...over,
});

test('manifest and registry validation catch the mistakes that matter', () => {
  assert.deepEqual(validateManifest(manifest()), []);
  assert.match(validateManifest(manifest({ id: 'Bad Id' })).join(), /lowercase/);
  assert.match(validateManifest(manifest({ version: '1.0' })).join(), /not x\.y\.z/);
  assert.match(validateManifest(manifest({ extraHosts: ['*'] })).join(), /not a host pattern/);
  assert.match(validateManifest(manifest({ domainRoles: [], extraHosts: [] })).join(), /declares no hosts/);
  assert.deepEqual(validateManifest(manifest({ domainRoles: [], network: 'open' })), []);

  assert.deepEqual(validateRegistry(registry()), []);
  const noDomains = registry();
  delete noDomains.providers[0].domains;
  assert.match(validateRegistry(noDomains).join(), /has no domain config/);
  const mismatch = registry();
  mismatch.providers[0].release.version = '0.9.0';
  assert.match(validateRegistry(mismatch).join(), /does not match manifest version/);
  const secret = registry();
  secret.providers[0].manifest = manifest({ config: { apiKey: { type: 'string', secret: true } } });
  secret.providers[0].config = { apiKey: 'hunter2' };
  assert.match(validateRegistry(secret).join(), /secret and must not be published/);
  const dup = registry();
  dup.providers.push(dup.providers[0]);
  assert.match(validateRegistry(dup).join(), /listed twice/);
});

test('registries are signed, verified against pinned keys, and tampering or unknown keys are rejected', async () => {
  const key = await generateRegistryKey('test-2026');
  const other = await generateRegistryKey('other');
  const signed = await signRegistry(registry(), key);
  const trusted = { [key.keyId]: key.publicKey };

  const doc = await verifyRegistry(signed, trusted, { sdk: '0.1.0' });
  assert.equal(doc.version, 7);

  await assert.rejects(verifyRegistry({ ...signed, payload: signed.payload.replace('"stable"', '"canary"') }, trusted), /Signature does not match/);
  await assert.rejects(verifyRegistry(signed, { [other.keyId]: other.publicKey }), /unknown key/);
  await assert.rejects(verifyRegistry(signed, { [key.keyId]: other.publicKey }), /Signature does not match/);
  await assert.rejects(verifyRegistry(await signRegistry(registry({ minSdk: '9.0.0' }), key), trusted, { sdk: '0.1.0' }), /needs SDK 9\.0\.0/);
  await assert.rejects(signRegistry(registry({ version: 0 }), key), /refusing to sign/);
});

test('a reader keeps its last good registry: bad or older documents are not accepted', async () => {
  const key = await generateRegistryKey('k');
  const trusted = { k: key.publicKey };
  const current = registry({ version: 7 });
  const newer = await signRegistry(registry({ version: 8 }), key);
  const older = await signRegistry(registry({ version: 6 }), key);

  assert.equal((await acceptRegistry(current, newer, trusted)).doc?.version, 8);
  const replay = await acceptRegistry(current, older, trusted);
  assert.deepEqual([replay.accepted, replay.doc?.version], [false, 7]);
  const forged = await acceptRegistry(current, { ...newer, signature: older.signature }, trusted);
  assert.deepEqual([forged.accepted, forged.doc?.version], [false, 7]);
  assert.equal((await acceptRegistry(undefined, { ...newer, signature: 'AAAA' }, trusted)).doc, undefined);
});

test('registry diff and per-provider rollback', () => {
  const v7 = registry();
  const v8 = registry({ version: 8 });
  v8.providers[0] = { ...v8.providers[0], manifest: manifest({ version: '1.1.0' }), stage: 'canary', rank: 50, domains: { ...domains(), version: 4 }, release: { version: '1.1.0', at: '2026-11-24T00:00:00.000Z', previous: '1.0.0' } };
  v8.providers.push({ manifest: manifest({ id: 'second', domainRoles: [], extraHosts: ['api.second.example'] }), stage: 'stable', release: { version: '1.0.0', at: '2026-11-24T00:00:00.000Z' } });
  assert.deepEqual(
    diffRegistry(v7, v8).map((c) => `${c.provider}:${c.kind}`),
    ['example:domains', 'example:rank', 'example:stage', 'example:version', 'second:added'],
  );
  const back = rollbackProvider(v8, v7, 'example', new Date('2026-11-25T00:00:00Z'));
  assert.equal(back.version, 9);
  const e = back.providers.find((p) => p.manifest.id === 'example')!;
  assert.deepEqual([e.manifest.version, e.stage, e.release.previous, e.domains?.version], ['1.0.0', 'stable', '1.1.0', 5]);
  assert.equal(back.providers.length, 2, 'other providers are untouched');
  assert.deepEqual(validateRegistry(back), []);
  assert.throws(() => rollbackProvider(v8, v7, 'second'), /not in registry version 7/);
});
