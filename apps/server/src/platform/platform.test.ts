import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { defineProvider, describeRuntime, Engine, generateRegistryKey, getJson, HealthStore, NotFoundError, validateRegistry, verifyRegistry, type EngineEvent, type ProviderModule } from '@charcoal/provider-sdk';
import { domainsFor, mockTransport, simulate, TITLES, type MockRoute } from '@charcoal/provider-sdk/testing';
import { domainFeedback, BadRequest, mediaFromQuery, RateLimiter, registerApi, type WireStream } from './api.js';
import { Catalog } from './catalog.js';
import { legacyModule, platformId } from './legacy.js';
import { Overlay } from './overlay.js';
import { decodeRelayUrl, relayQuery, signRelayData, signRelayUrl, verifyRelayData } from './relay.js';
import { registerRelay } from './relay-routes.js';

// ---------- relay signing ----------

test('relay links are signed; a changed target, a forged or missing signature and an expired link are refused', () => {
  const now = 1_800_000_000_000;
  const data = JSON.stringify({ url: 'https://cdn.example.net/a/master.m3u8', headers: { Referer: 'https://site.example/' } });
  const { exp, sig } = signRelayData(data, now);
  assert.equal(verifyRelayData(data, String(exp), sig, now), 'ok');
  assert.equal(verifyRelayData(data.replace('cdn.example.net', 'internal.example.net'), String(exp), sig, now), 'invalid');
  assert.equal(verifyRelayData(data, String(exp + 9999), sig, now), 'invalid', 'the expiry is part of what is signed');
  assert.equal(verifyRelayData(data, String(exp), 'ab'.repeat(32), now), 'invalid');
  assert.equal(verifyRelayData(data, String(exp), 'not-hex', now), 'invalid');
  assert.equal(verifyRelayData(data, undefined, undefined, now), 'missing');
  assert.equal(verifyRelayData(data, String(exp), sig, now + 13 * 3600_000), 'expired');
  assert.equal(verifyRelayData(data, String(exp), sig, now, 'another-servers-secret'), 'invalid');

  // A framework-built /v1/proxy URL gets a signature appended; other URLs are left alone.
  const v1 = `https://jelly.example/v1/proxy?data=${encodeURIComponent(data)}`;
  const signed = new URL(signRelayUrl(v1, now));
  assert.equal(verifyRelayData(signed.searchParams.get('data')!, signed.searchParams.get('exp'), signed.searchParams.get('sig'), now), 'ok');
  assert.equal(signRelayUrl(signed.toString(), now), signed.toString(), 'not signed twice');
  assert.equal(signRelayUrl('https://cdn.example.net/a.vtt'), 'https://cdn.example.net/a.vtt');
  assert.deepEqual(decodeRelayUrl(`/v1/proxy?${relayQuery('https://x.example/a.ts', { Origin: 'https://y.example' }, now)}`), { url: 'https://x.example/a.ts', headers: { Origin: 'https://y.example' } });
});

// ---------- legacy adapter ----------

const fakeLegacy = (result: () => Promise<{ sources: unknown[]; subtitles: unknown[]; diagnostics: { message: string }[] }>) =>
  ({ id: 'CineSu', name: 'CineSu', enabled: true, BASE_URL: 'https://cine.su', HEADERS: {}, capabilities: { supportedContentTypes: ['movies', 'tv'] }, getMovieSources: result, getTVSources: result }) as never;

test('a legacy server-only class becomes a platform module: manifest says what it is, relay URLs are unwrapped, failures are classified', async () => {
  const data = encodeURIComponent(JSON.stringify({ url: 'https://cine.su/v1/stream/master/movie/27205.m3u8', headers: { Referer: 'https://cine.su/en/watch' } }));
  const ok = async () => ({ sources: [{ url: `http://localhost:8080/v1/proxy?data=${data}`, type: 'hls', quality: '1080', audioTracks: [{ language: 'eng', label: 'English' }], provider: { id: 'CineSu', name: 'CineSu' } }], subtitles: [], diagnostics: [] });
  const legacy = fakeLegacy(ok);
  const m = legacyModule(legacy, { getMovieSources: ok as never, getTVSources: ok as never });
  assert.deepEqual([m.manifest.id, m.manifest.runtimes, m.manifest.network, m.manifest.requires?.features], ['cinesu', ['server'], 'unmanaged', ['node']]);
  assert.equal(platformId('Mafia Embed!'), 'mafia-embed');
  const r = await m.getSources(TITLES.movie, {} as never);
  assert.deepEqual(r.streams, [{ url: 'https://cine.su/v1/stream/master/movie/27205.m3u8', type: 'hls', quality: '1080', headers: { Referer: 'https://cine.su/en/watch' }, language: 'English', languageCode: 'eng' }]);

  const failing = (message: string) => legacyModule(legacy, { getMovieSources: (async () => ({ sources: [], subtitles: [], diagnostics: [{ message }] })) as never, getTVSources: ok as never });
  for (const [message, code] of [['CineSu: Stream URL is not accessible', 'NOT_FOUND'], ['CineSu timed out after 15000ms', 'TIMEOUT'], ['HTTP 403 from cine.su', 'ACCESS_DENIED'], ['fetch failed', 'NETWORK'], ['Failed to decrypt API response', 'STRUCTURE_CHANGED']] as const) {
    await assert.rejects(failing(message).getSources(TITLES.movie, {} as never), (e: { code: string }) => e.code === code, message);
  }
  await assert.rejects(m.getSources(TITLES.anime, {} as never), NotFoundError);
});

// ---------- control-plane state ----------

test('overrides are audited, persisted, reversible, and a temporary domain override lapses by itself', () => {
  let now = 1_800_000_000_000;
  const file = join(mkdtempSync(join(tmpdir(), 'charcoal-overlay-')), 'state', 'overlay.json');
  const o = new Overlay(file, () => now);
  const v1 = domainsFor('demo', { site: 'https://a.demo.example' });
  const v2 = { ...domainsFor('demo', { site: ['https://b.demo.example', 'https://a.demo.example'] }), version: 2 };
  const audit = { provider: 'demo', at: 'x', by: 'ops', action: 'switch-active' as const, fromVersion: 1, toVersion: 2 };

  o.setStage('demo', 'disabled', 'ops', 'site is down');
  o.setRank('demo', 10, 'ops');
  o.setDomains('demo', v2, v1, audit, 60_000);
  assert.deepEqual([o.get('demo')?.stage, o.get('demo')?.rank, o.domains('demo')?.roles.site.active, o.version], ['disabled', 10, 'https://b.demo.example', 3]);
  assert.throws(() => o.setDomains('demo', { ...v2, provider: 'other' }, v1, audit), /is for "other"/);
  assert.throws(() => o.setDomains('demo', domainsFor('demo', { site: 'http://10.0.0.1' }), v1, audit), /private or internal/);

  // Persisted: a new process sees the same state.
  const reloaded = new Overlay(file, () => now);
  assert.equal(reloaded.get('demo')?.stage, 'disabled');
  assert.deepEqual(reloaded.audit().map((a) => a.action), ['set-domains', 'set-rank', 'set-stage']);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).version, 3);

  // Roll back to what was in force before: old content, higher version.
  const back = o.rollbackDomains('demo', v2, 'ops');
  assert.deepEqual([back?.roles.site.active, back?.version], ['https://a.demo.example', 3]);
  assert.equal(o.rollbackDomains('demo', back!, 'ops'), undefined, 'no more history');

  // A temporary override stops applying after its time.
  o.setDomains('demo', { ...v2, version: 4 }, back, audit, 60_000);
  assert.equal(o.domains('demo')?.version, 4);
  now += 61_000;
  assert.equal(o.domains('demo'), undefined);

  o.setStage('demo', undefined, 'ops');
  assert.equal(o.get('demo')?.stage, undefined);
});

// ---------- the API ----------

const fake = (id: string, over: Partial<ProviderModule['manifest']> = {}): ProviderModule =>
  defineProvider({
    manifest: { id, name: id, version: '1.0.0', kinds: ['movie', 'tv'], lookup: ['tmdb'], runtimes: ['server', 'extension', 'app'], domainRoles: [], extraHosts: [`${id}.example.com`], followDiscovered: true, output: { types: ['hls', 'mp4'] }, ...over },
    async getSources(media, ctx) {
      const d = await getJson<{ url?: string }>(ctx.fetch, `https://${id}.example.com/api/${media.kind}/${media.ids.tmdb}`, { signal: ctx.signal }, id);
      if (!d.url) throw new NotFoundError();
      return { streams: [{ url: d.url, type: 'hls', headers: { Referer: `https://${id}.example.com/` } }] };
    },
  });

async function harness(routes: Record<string, MockRoute>, opts: { adminToken?: string; signing?: boolean; limits?: { sourcesPerMinute?: number }; autoFailoverTtlMs?: number; modules?: ProviderModule[] } = {}) {
  const transport = mockTransport(routes);
  const health = new HealthStore();
  const overlay = new Overlay();
  const key = opts.signing ? await generateRegistryKey('test') : undefined;
  const catalog = await Catalog.create({ legacy: opts.modules ?? [fake('alpha'), fake('beta'), fake('gamma')], overlay, health, fallback: false, publicUrl: 'https://resolver.test', signingKey: key });
  const engine = new Engine({ providers: () => catalog.providers(), runtime: describeRuntime('server'), transport, health, waveDelayMs: 30, requestTimeoutMs: 300, providerTimeoutMs: 1000, cacheTtlMs: 0, negativeCacheTtlMs: 0, onOutcome: domainFeedback(catalog, overlay) });
  const app = Fastify();
  const relayed: string[] = [];
  registerRelay(app as never, { requireSignature: true, proxy: async (t) => (relayed.push(t.url), { data: Buffer.from('#EXTM3U\n'), contentType: 'application/vnd.apple.mpegurl', statusCode: 200, headers: {} }) });
  const platform = registerApi({ app: app as never, engine, catalog, overlay, health, transport, lookup: async (kind, id) => (id === '27205' ? { title: 'Inception', year: 2010, imdb: 'tt1375666' } : kind === 'tv' && id === '1396' ? { title: 'Breaking Bad', year: 2008 } : null), publicUrl: 'https://resolver.test', canaries: { movie: [TITLES.movie] }, adminToken: opts.adminToken, limits: opts.limits, autoFailoverTtlMs: opts.autoFailoverTtlMs });
  await app.ready();
  const sources = async (query: string) => {
    const res = await app.inject({ method: 'GET', url: `/v2/sources?${query}` });
    const events = res.statusCode === 200 ? (res.body.trim().split('\n').map((l) => JSON.parse(l)) as (EngineEvent & { streams?: WireStream[] })[]) : [];
    return { res, events, results: events.filter((e) => e.t === 'result') as (Extract<EngineEvent, { t: 'result' }> & { streams: WireStream[] })[] };
  };
  return { app, transport, health, overlay, catalog, engine, platform, key, relayed, sources };
}

/** An hour from now, in the seconds a signed URL carries. */
const EXPIRES = Math.floor(Date.now() / 1000) + 3600;
const stream = (id: string) => ({ body: { url: `https://cdn.${id}.example.net/v/1080/master.m3u8?expires=${EXPIRES}` } });
const ROUTES = {
  'https://alpha.example.com/api/movie/27205': stream('alpha'),
  'https://beta.example.com/api/movie/27205': { ...stream('beta'), delayMs: 80 },
  'https://gamma.example.com/api/movie/27205': simulate.challenge(),
};
const ONLY = 'only=alpha,beta,gamma';

test('GET /v2/sources streams one line per provider as each finishes; streams are normalised and carry a signed relay link', async () => {
  const h = await harness(ROUTES);
  const { res, events, results } = await h.sources(`kind=movie&tmdb=27205&${ONLY}`);
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['content-type']), /application\/x-ndjson/);
  assert.deepEqual([events[0].t, events[events.length - 1].t], ['plan', 'done']);
  assert.deepEqual(results.map((r) => `${r.provider.id}:${r.outcome}${r.code ? `:${r.code}` : ''}`).sort(), ['alpha:ok', 'beta:ok', 'gamma:error:CHALLENGE']);
  assert.ok(results.findIndex((r) => r.provider.id === 'alpha') < results.findIndex((r) => r.provider.id === 'beta'), 'the faster provider is written first');

  const s = results.find((r) => r.provider.id === 'alpha')!.streams[0];
  assert.deepEqual([s.type, s.quality, s.runtime, s.expiresAt, s.headers.Referer], ['hls', '1080', 'server', EXPIRES * 1000, 'https://alpha.example.com/']);
  // The relay link is one this server will honour…
  const relay = new URL(s.relay!);
  assert.equal(relay.origin + relay.pathname, 'https://resolver.test/v2/relay');
  const ok = await h.app.inject({ method: 'GET', url: relay.pathname + relay.search });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(h.relayed, [`https://cdn.alpha.example.net/v/1080/master.m3u8?expires=${EXPIRES}`]);
  // …and nothing else is.
  const forged = `/v2/relay?data=${encodeURIComponent(JSON.stringify({ url: 'https://example.org/anything.mp4' }))}`;
  assert.equal((await h.app.inject({ method: 'GET', url: forged })).statusCode, 403);
  assert.equal((await h.app.inject({ method: 'GET', url: `${forged}&exp=${relay.searchParams.get('exp')}&sig=${relay.searchParams.get('sig')}` })).statusCode, 403);
  assert.equal((await h.app.inject({ method: 'GET', url: `/v1/proxy?data=${encodeURIComponent(JSON.stringify({ url: 'https://example.org/x.mp4' }))}` })).statusCode, 403);
  assert.equal(h.relayed.length, 1, 'no unsigned request reached the relay');
});

test('GET /v2/sources: title lookup, skip/only/accept, bad requests', async () => {
  const h = await harness(ROUTES);
  // The server looked the title up itself; a client-supplied title avoids that round trip.
  assert.equal((await h.sources(`kind=movie&tmdb=27205&only=alpha`)).results[0].outcome, 'ok');
  assert.equal((await h.sources(`kind=movie&tmdb=27205&title=Inception&only=alpha`)).results[0].outcome, 'ok');
  // A client running some providers itself asks the server to skip them.
  assert.deepEqual((await h.sources(`kind=movie&tmdb=27205&${ONLY}&skip=alpha,gamma`)).results.map((r) => r.provider.id), ['beta']);
  // Nothing in a format the client can use.
  const mkvOnly = await h.sources(`kind=movie&tmdb=27205&only=alpha&accept=mkv`);
  assert.equal(mkvOnly.results.length, 0);
  assert.match((mkvOnly.events[0] as Extract<EngineEvent, { t: 'plan' }>).skipped[0].reason, /no accepted stream type/);

  for (const bad of ['kind=movie', 'kind=movie&tmdb=abc', 'kind=tv&tmdb=1396', 'kind=movie&tmdb=999999', 'kind=anime&e=1', 'kind=live', 'kind=podcast&tmdb=1&title=x']) {
    assert.equal((await h.sources(bad)).res.statusCode, 400, bad);
  }
  assert.deepEqual(await mediaFromQuery({ kind: 'tv', tmdb: '1396', s: '2', e: '3' }, async () => ({ title: 'Breaking Bad', year: 2008 })), { kind: 'tv', ids: { tmdb: '1396' }, title: 'Breaking Bad', year: 2008, altTitles: undefined, originalLanguage: undefined, runtime: undefined, season: 2, episode: 3 });
  assert.equal((await mediaFromQuery({ kind: 'anime', anilist: '16498', e: '5', title: 'Attack on Titan', audio: 'dub' }, async () => null)).kind, 'anime');
  assert.equal((await mediaFromQuery({ kind: 'live', event: 'thesportsdb:1', title: 'Final' }, async () => null)).kind, 'live');
  await assert.rejects(mediaFromQuery({ kind: 'movie', tmdb: '1;drop' }, async () => null), BadRequest);
});

test('rate limits: a burst is cut off with 429 and refills over time', async () => {
  let now = 0;
  const limiter = new RateLimiter(60, 3, () => now);
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take('1.2.3.4')), [true, true, true, false]);
  assert.equal(limiter.take('5.6.7.8'), true, 'another client is unaffected');
  now += 1000; // one token per second at 60/min
  assert.deepEqual([limiter.take('1.2.3.4'), limiter.take('1.2.3.4')], [true, false]);

  const h = await harness(ROUTES, { limits: { sourcesPerMinute: 1 } });
  const codes: number[] = [];
  for (let i = 0; i < 25; i++) codes.push((await h.sources(`kind=movie&tmdb=27205&only=alpha`)).res.statusCode);
  assert.ok(codes.slice(0, 20).every((c) => c === 200) && codes.slice(21).every((c) => c === 429), codes.join(','));
});

test('GET /v2/registry: a valid document; signed when a key is configured and verifiable with the pinned public key', async () => {
  const plain = await harness(ROUTES);
  const body = JSON.parse((await plain.app.inject({ method: 'GET', url: '/v2/registry' })).body);
  assert.deepEqual(validateRegistry(body.document), []);
  const ids = body.document.providers.map((p: { manifest: { id: string } }) => p.manifest.id);
  for (const id of ['febbox', 'castle', 'vixsrc', 'cinesu', 'alpha']) assert.ok(ids.includes(id), id);
  const cinesu = body.document.providers.find((p: { manifest: { id: string } }) => p.manifest.id === 'cinesu');
  assert.deepEqual([cinesu.stage, cinesu.rules.steps.length > 0, cinesu.domains.roles.site.active], ['canary', true, 'https://cine.su']);
  assert.deepEqual(body.document.endpoints.resolvers, ['https://resolver.test']);

  const signed = await harness(ROUTES, { signing: true });
  const res = JSON.parse((await signed.app.inject({ method: 'GET', url: '/v2/registry' })).body);
  assert.equal(res.document, undefined);
  const doc = await verifyRegistry(res.signed, { test: signed.key!.publicKey });
  assert.equal(doc.providers.length, body.document.providers.length);
  await assert.rejects(verifyRegistry({ ...res.signed, payload: res.signed.payload.replace('"canary"', '"stable"') }, { test: signed.key!.publicKey }), /Signature does not match/);
});

test('health and reports: server health is per provider and runtime; client reports are kept apart and validated', async () => {
  const h = await harness(ROUTES);
  await h.sources(`kind=movie&tmdb=27205&${ONLY}`);
  const report = await h.app.inject({
    method: 'POST',
    url: '/v2/report',
    payload: { reports: [{ provider: 'alpha', runtime: 'extension', outcome: 'ok', ms: 400, version: '1.0.0' }, { provider: 'alpha', runtime: 'extension', outcome: 'ACCESS_DENIED', ms: 90 }, { provider: 'nope', runtime: 'extension', outcome: 'ok' }, { provider: 'alpha', runtime: 'server', outcome: 'DNS' }, { provider: 'alpha', runtime: 'app', outcome: 'made-up' }, 'junk'] },
  });
  assert.deepEqual([report.statusCode, JSON.parse(report.body).accepted], [202, 2]);
  const health = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/health' })).body);
  const server = Object.fromEntries(health.providers.map((p: { provider: string; status: string; lastFailure?: { code: string } }) => [p.provider, p]));
  assert.deepEqual([server.alpha.status, server.gamma.status, server.gamma.lastFailure.code], ['ok', 'degraded', 'CHALLENGE']);
  assert.deepEqual(health.fleet.map((f: { provider: string; runtime: string; ok: number; failed: number }) => [f.provider, f.runtime, f.ok, f.failed]), [['alpha', 'extension', 1, 1]]);
  assert.equal(h.health.get('alpha', 'server')!.failed, 0, 'a client cannot change what the server believes about its own runtime');
});

test('control plane: needs the token; disabling a provider takes effect on the next request with no restart', async () => {
  const closed = await harness(ROUTES);
  assert.equal((await closed.app.inject({ method: 'GET', url: '/v2/admin/providers' })).statusCode, 404, 'absent without ADMIN_TOKEN');

  const h = await harness(ROUTES, { adminToken: 's3cret-token' });
  assert.equal((await h.app.inject({ method: 'GET', url: '/v2/admin/providers' })).statusCode, 401);
  assert.equal((await h.app.inject({ method: 'GET', url: '/v2/admin/providers', headers: { authorization: 'Bearer wrong-token!!' } })).statusCode, 401);
  const auth = { authorization: 'Bearer s3cret-token' };
  const list = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/admin/providers', headers: auth })).body);
  assert.deepEqual(list.problems, []);

  const before = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/registry' })).body).document.version;
  const res = await h.app.inject({ method: 'POST', url: '/v2/admin/providers/alpha', headers: auth, payload: { stage: 'disabled', rank: 5, reason: 'testing', by: 'ops' } });
  assert.equal(res.statusCode, 200);
  const after = await h.sources(`kind=movie&tmdb=27205&${ONLY}`);
  assert.deepEqual(after.results.map((r) => r.provider.id).sort(), ['beta', 'gamma']);
  assert.deepEqual((after.events[0] as Extract<EngineEvent, { t: 'plan' }>).skipped, [{ id: 'alpha', name: 'alpha', reason: 'disabled' }]);
  const doc = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/registry' })).body).document;
  assert.ok(doc.version > before, 'the registry version moved');
  assert.deepEqual([doc.providers.find((p: { manifest: { id: string } }) => p.manifest.id === 'alpha').stage, doc.providers.find((p: { manifest: { id: string } }) => p.manifest.id === 'alpha').rank], ['disabled', 5]);

  await h.app.inject({ method: 'POST', url: '/v2/admin/providers/alpha', headers: auth, payload: { stage: null } });
  assert.equal((await h.sources(`kind=movie&tmdb=27205&only=alpha`)).results[0].outcome, 'ok', 're-enabled');
  assert.equal((await h.app.inject({ method: 'POST', url: '/v2/admin/providers/nope', headers: auth, payload: { stage: 'disabled' } })).statusCode, 404);
  assert.equal((await h.app.inject({ method: 'POST', url: '/v2/admin/providers/alpha', headers: auth, payload: { stage: 'bogus' } })).statusCode, 400);
  const audit = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/admin/audit', headers: auth })).body).audit;
  assert.deepEqual(audit.map((a: { action: string; by: string }) => `${a.action}:${a.by}`), ['set-stage:admin', 'set-rank:ops', 'set-stage:ops']);
});

test('control plane: a domain change is validated with a real extraction before it takes effect, and can be rolled back', async () => {
  // The pack's own "castle" with its real domain config (api → https://api.hlowb.com) and a mock network.
  const routes: Record<string, MockRoute> = {
    'api.hlowb.com': simulate.dns(),
    'https://parked.example.net/': simulate.html('for sale'),
    'https://parked.example.net/v0.1/system/getSecurityKey/1?channel=IndiaA&clientType=1&lang=en-US': simulate.html('for sale'),
  };
  const h = await harness(routes, { adminToken: 't0ken-t0ken' });
  const auth = { authorization: 'Bearer t0ken-t0ken' };
  const post = (path: string, payload: object) => h.app.inject({ method: 'POST', url: path, headers: auth, payload });

  // A candidate that doesn't serve the API is refused; nothing changes.
  const refused = await post('/v2/admin/providers/castle/domains', { role: 'api', origin: 'https://parked.example.net', by: 'ops' });
  assert.equal(refused.statusCode, 422);
  assert.equal(h.catalog.domains('castle')!.roles.api.active, 'https://api.hlowb.com');
  assert.equal((await post('/v2/admin/providers/castle/domains', { role: 'api', origin: 'http://10.0.0.8' })).statusCode, 400);
  assert.equal((await post('/v2/admin/providers/castle/domains', { role: 'nope', origin: 'https://x.example.com' })).statusCode, 400);
  assert.equal((await post('/v2/admin/providers/castle/domains/rollback', {})).statusCode, 409, 'nothing to roll back to yet');
});

test('monitoring and recovery through the API: a dead address with a working configured alternate is failed over temporarily and audited', async () => {
  const dead = defineProvider({
    manifest: { id: 'homes', name: 'Homes', version: '1.0.0', kinds: ['movie'], lookup: ['tmdb'], runtimes: ['server'], domainRoles: ['site'], followDiscovered: true, output: { types: ['hls'] } },
    async getSources(media, ctx) {
      const d = await getJson<{ url: string }>(ctx.fetch, ctx.url('site', `/api/movie/${media.ids.tmdb}`), { signal: ctx.signal });
      return { streams: [{ url: d.url, type: 'hls' }] };
    },
  });
  const h2 = await harness({ 'old.homes.example.com': simulate.refused(), 'https://new.homes.example.org/': simulate.html('ok'), 'https://new.homes.example.org/api/movie/27205': stream('homes') }, { adminToken: 't0ken-t0ken', autoFailoverTtlMs: 3_600_000, modules: [dead] });
  // No fail-over inside a run: the alternate is only known to the control plane after the outage.
  const single = domainsFor('homes', { site: 'https://old.homes.example.com' });
  h2.overlay.setDomains('homes', single, undefined, { provider: 'homes', at: 'x', by: 'setup', action: 'create', fromVersion: 0, toVersion: 1 });
  for (let i = 0; i < 3; i++) await h2.sources('kind=movie&tmdb=27205&only=homes');
  assert.equal(h2.health.status('homes', 'server'), 'benched');
  h2.overlay.setDomains('homes', { ...domainsFor('homes', { site: ['https://old.homes.example.com', 'https://new.homes.example.org'] }), version: 2 }, single, { provider: 'homes', at: 'x', by: 'ops', action: 'add-alternate', fromVersion: 1, toVersion: 2 });

  const res = await h2.app.inject({ method: 'POST', url: '/v2/admin/recover', headers: { authorization: 'Bearer t0ken-t0ken' }, payload: { by: 'ops' } });
  const actions = JSON.parse(res.body).actions as { provider: string; action: string; cause?: { code: string } }[];
  const mine = actions.find((a) => a.provider === 'homes')!;
  assert.deepEqual([mine.action, mine.cause?.code], ['switch-domain', 'CONNECT']);
  // Applied as a temporary override (auto fail-over is on), with the old config kept for rollback.
  assert.equal(h2.catalog.domains('homes')!.roles.site.active, 'https://new.homes.example.org');
  assert.ok(h2.overlay.get('homes')!.domainsExpireAt! > Date.now());
  assert.equal(h2.overlay.audit()[0].action, 'set-domains');

  // The canary inside that pass already succeeded (through the alternate), so it is back in rotation…
  assert.equal(h2.health.status('homes', 'server'), 'ok');
  // …and the next pass has nothing left to do: the override is in force, no fail-over is needed.
  const again = JSON.parse((await h2.app.inject({ method: 'POST', url: '/v2/admin/recover', headers: { authorization: 'Bearer t0ken-t0ken' }, payload: {} })).body).actions as { provider: string; action: string }[];
  assert.equal(again.find((a) => a.provider === 'homes')!.action, 'healthy');
  assert.equal((await h2.sources('kind=movie&tmdb=27205&only=homes')).results[0].outcome, 'ok');

  // And an operator can still undo it.
  const back = await h2.app.inject({ method: 'POST', url: '/v2/admin/providers/homes/domains/rollback', headers: { authorization: 'Bearer t0ken-t0ken' }, payload: { reason: 'prefer the old one' } });
  assert.equal(JSON.parse(back.body).domains.roles.site.active, 'https://old.homes.example.com');
});

test('control plane: a new address is put on trial, promoted by clean runs, and rolled back by itself when it then fails', async () => {
  const moving = defineProvider({
    manifest: { id: 'moving', name: 'Moving', version: '1.0.0', kinds: ['movie'], lookup: ['tmdb'], runtimes: ['server'], domainRoles: ['site'], followDiscovered: true, output: { types: ['hls'] } },
    async getSources(media, ctx) {
      const d = await getJson<{ url: string }>(ctx.fetch, ctx.url('site', `/api/movie/${media.ids.tmdb}`), { signal: ctx.signal });
      return { streams: [{ url: d.url, type: 'hls' }] };
    },
  });
  const routes: Record<string, MockRoute> = {
    'https://old.moving.example.com/api/movie/27205': stream('old'),
    'https://new.moving.example.org/': simulate.html('ok'),
    'https://new.moving.example.org/api/movie/27205': stream('new'),
  };
  const h = await harness(routes, { adminToken: 't0ken-t0ken', modules: [moving] });
  h.overlay.setDomains('moving', domainsFor('moving', { site: 'https://old.moving.example.com' }), undefined, { provider: 'moving', at: 'x', by: 'setup', action: 'create', fromVersion: 0, toVersion: 1 });
  const auth = { authorization: 'Bearer t0ken-t0ken' };
  const post = (path: string, payload: object) => h.app.inject({ method: 'POST', url: path, headers: auth, payload });
  const play = async () => (await h.sources('kind=movie&tmdb=27205&title=Inception&only=moving')).results[0];

  // An address that does not serve the API cannot even start a trial.
  assert.equal((await post('/v2/admin/providers/moving/domains/stage', { role: 'site', origin: 'https://parked.example.net' })).statusCode, 422);
  assert.equal((await h.app.inject({ method: 'POST', url: '/v2/admin/providers/moving/domains/stage', payload: { role: 'site', origin: 'https://new.moving.example.org' } })).statusCode, 401);

  const staged = await post('/v2/admin/providers/moving/domains/stage', { role: 'site', origin: 'https://new.moving.example.org', share: 1, by: 'ops', reason: 'site announced a move' });
  assert.equal(staged.statusCode, 200, staged.body);
  assert.equal(h.catalog.domains('moving')!.roles.site.active, 'https://old.moving.example.com', 'the address in use is unchanged while the trial runs');
  assert.equal(h.catalog.domains('moving')!.roles.site.candidate?.origin, 'https://new.moving.example.org');

  // Five clean runs on the candidate promote it; nobody had to do anything.
  for (let i = 0; i < 5; i++) assert.match((await play()).streams[0].url, /cdn\.new\./);
  const promoted = h.catalog.domains('moving')!;
  assert.deepEqual([promoted.roles.site.active, promoted.roles.site.alternates, promoted.roles.site.candidate], ['https://new.moving.example.org', ['https://old.moving.example.com'], undefined]);

  // The new address then breaks: three failed runs inside the watch window bring the old one back.
  // (In-run fail-over already keeps viewers served from the alternate; the config follows.)
  h.transport.routes['https://new.moving.example.org/api/movie/27205'] = simulate.serverError(500);
  for (let i = 0; i < 3; i++) assert.equal((await play()).outcome, 'error');
  const back = h.catalog.domains('moving')!;
  assert.equal(back.roles.site.active, 'https://old.moving.example.com');
  assert.match((await play()).streams[0].url, /cdn\.old\./);
  const actions = h.overlay.audit(20).map((a) => (a.detail as { action?: string } | undefined)?.action).filter(Boolean);
  for (const a of ['stage-candidate', 'promote-candidate', 'auto-rollback']) assert.ok(actions.includes(a), `${a} is in the audit trail (${actions.join(', ')})`);

  // Diagnosis of a provider's addresses, from the server.
  const d = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/admin/providers/moving/diagnose', headers: auth })).body) as { addresses: { host: string; position: string; verdict: string }[] };
  assert.deepEqual(d.addresses.map((a) => [a.position, a.host]), [['active', 'old.moving.example.com'], ['alternate', 'new.moving.example.org']]);
  assert.equal((await h.app.inject({ method: 'GET', url: '/v2/admin/providers/moving/diagnose' })).statusCode, 401);
});

test('GET /v2/sources: discovered streams are followed by a verdict for each; health keeps count and places providers', async () => {
  const media = '#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n';
  const h = await harness({
    ...ROUTES,
    'cdn.alpha.example.net': (req) => (req.url.pathname.endsWith('.m3u8') ? { body: media } : { body: 'G' + '\0'.repeat(187) + 'G' }),
    'cdn.beta.example.net': simulate.notFound(),
  });
  const { events } = await h.sources(`kind=movie&tmdb=27205&title=Inception&${ONLY}`);
  const kinds = events.map((e) => (e as { t: string }).t);
  assert.equal(kinds.at(-1), 'done');
  const verdicts = Object.fromEntries((events as unknown as { t: string; provider: string; verification: { state: string; level: string; code?: string } }[]).filter((e) => e.t === 'verify').map((e) => [e.provider, [e.verification.state, e.verification.level, e.verification.code]]));
  assert.deepEqual(verdicts, { alpha: ['verified', 'segment', undefined], beta: ['failed', 'none', 'EXPIRED'] });
  // A result line never waits for its verdict.
  assert.ok(kinds.indexOf('verify') > kinds.indexOf('result'));

  const health = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/health' })).body) as { providers: { provider: string; verified: number; unverified: number; placement: string }[]; placement: { provider: string; verdict: string; blockedOn: string[] }[] };
  const row = (id: string) => health.providers.find((p) => p.provider === id)!;
  assert.deepEqual([row('alpha').verified, row('alpha').unverified, row('beta').verified, row('beta').unverified], [1, 0, 0, 1]);
  assert.equal(row('alpha').placement, 'works');
  // gamma answers with a browser check here: after repeated runs it is "blocked", which is not "broken".
  for (let i = 0; i < 2; i++) await h.sources(`kind=movie&tmdb=27205&title=Inception&only=gamma`);
  const after = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/health' })).body) as typeof health;
  assert.deepEqual(after.placement.find((p) => p.provider === 'gamma'), { provider: 'gamma', worksOn: [], blockedOn: ['server'], unreachableOn: [], brokenOn: [], verdict: 'blocked' });
  // A viewer's device reports that it works there: the provider is not written off.
  await h.app.inject({ method: 'POST', url: '/v2/report', payload: { reports: [{ provider: 'gamma', runtime: 'extension', outcome: 'ok', ms: 800 }] } });
  const reported = JSON.parse((await h.app.inject({ method: 'GET', url: '/v2/health' })).body) as typeof health;
  assert.equal(reported.placement.find((p) => p.provider === 'gamma')?.verdict, 'works-elsewhere');

  // Verification can be switched off per request.
  const plain = await h.sources(`kind=movie&tmdb=27205&title=Inception&${ONLY}&verify=0`);
  assert.ok(!plain.events.some((e) => (e as { t: string }).t === 'verify'));
});
