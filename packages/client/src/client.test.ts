import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineProvider, generateRegistryKey, getJson, HealthStore, NotFoundError, signRegistry, type DomainConfig, type LoadedProvider, type PlaybackCapabilities, type ProviderManifest, type ProviderModule, type RegistryDocument, type Stream } from '@charcoal/provider-sdk';
import { createHarness, domainsFor, mockTransport, simulate, TITLES, type MockRoute } from '@charcoal/provider-sdk/testing';
import { BridgeError, bridgeFetcher, bridgeRuntime, connectBridge, negotiate, type Bridge, type BridgeCall } from './bridge.js';
import { RegistryClient } from './registry-client.js';
import { applyRegistry, resolveSources, type RemoteEvent, type ResolveState, type ResolverDeps } from './resolver.js';

// ---------- bridge negotiation ----------

test('protocol negotiation: a v1 bridge keeps its original capabilities; a v2 bridge says what it has', () => {
  assert.equal(negotiate(null), null);
  const v1 = negotiate({ version: '0.1.0', hasPermission: true })!;
  assert.deepEqual([v1.protocol, v1.kind, v1.usable, v1.capabilities], [1, 'extension', true, ['request', 'allowStream', 'releaseStreams', 'cookies']]);
  const v2 = negotiate({ version: '0.2.0', protocol: 2, kind: 'app', capabilities: ['request', 'allowStream', 'releaseStreams', 'status', 'time-travel'], hasPermission: true })!;
  assert.deepEqual([v2.protocol, v2.kind, v2.capabilities], [2, 'app', ['request', 'allowStream', 'releaseStreams', 'status']]);
  // A bridge from the future is spoken to in the newest protocol this page knows.
  assert.equal(negotiate({ version: '9.0.0', protocol: 7, capabilities: ['request', 'allowStream'], hasPermission: true })!.protocol, 2);
  // Installed but not yet allowed to reach sites (Firefox): present, not usable.
  assert.equal(negotiate({ version: '0.2.0', protocol: 2, capabilities: ['request', 'allowStream'], hasPermission: false })!.usable, false);
  // Can fetch but can't help the player: not enough to run providers locally.
  assert.equal(negotiate({ version: '0.2.0', protocol: 2, capabilities: ['request'], hasPermission: true })!.usable, false);

  assert.deepEqual(bridgeRuntime(v2).features, ['forbidden-headers', 'session', 'user-settings']);
  assert.ok(bridgeRuntime(v1).features.includes('cookies'));
  assert.deepEqual([bridgeRuntime(v1).kind, bridgeRuntime(v1).egress, bridgeRuntime(v2).kind], ['extension', 'user', 'app']);
});

test('connecting: hello is retried once, later calls go through, and a silent bridge is "no bridge"', async () => {
  let hellos = 0;
  const calls: string[] = [];
  const call: BridgeCall = async <T>(type: string, payload: unknown) => {
    calls.push(type);
    if (type === 'hello') {
      if (++hellos === 1) throw new BridgeError('no answer', 'DISCONNECTED');
      assert.deepEqual(payload, { protocol: 2 });
      return { version: '0.2.0', protocol: 2, capabilities: ['request', 'allowStream', 'releaseStreams'], hasPermission: true } as T;
    }
    if (type === 'request') return { status: 200, ok: true, url: (payload as { url: string }).url, headers: {}, body: 'hi' } as T;
    return {} as T;
  };
  const bridge = (await connectBridge(call))!;
  assert.equal(bridge.info.protocol, 2);
  assert.equal((await bridge.fetcher('https://a.example.com/x')).body, 'hi');
  await Promise.all([bridge.allowStream('cdn.example.net', { Referer: 'https://a.example.com/' }), bridge.allowStream('cdn.example.net')]);
  assert.equal(calls.filter((c) => c === 'allowStream').length, 1, 'one rule per host');
  assert.equal(await connectBridge(async () => Promise.reject(new BridgeError('no answer', 'DISCONNECTED'))), null);
});

test('a bridge that stops answering mid-request is a cancelled run and marks the bridge lost; a slow site is a timeout', async () => {
  let lost = false;
  const dead = bridgeFetcher(async () => Promise.reject(new BridgeError('didn’t answer', 'DISCONNECTED')), 1000, () => (lost = true));
  await assert.rejects(dead('https://a.example.com/'), (e: { code?: string }) => e.code === 'CANCELLED');
  assert.equal(lost, true);
  const slow = bridgeFetcher(async () => Promise.reject(new BridgeError('The site took too long to answer', 'TIMEOUT')));
  await assert.rejects(slow('https://a.example.com/'), (e: Error) => e.name === 'TimeoutError');
});

// ---------- registry client ----------

const manifest = (id: string, over: Partial<ProviderManifest> = {}): ProviderManifest => ({ id, name: id, version: '1.0.0', contract: 2, kinds: ['movie', 'tv'], lookup: ['tmdb'], runtimes: ['server', 'extension', 'app'], domainRoles: ['site'], followDiscovered: true, output: { types: ['hls', 'mp4', 'mkv'] }, ...over });
const doc = (version: number, providers: RegistryDocument['providers'] = []): RegistryDocument => ({ schema: 1, version, generatedAt: '2026-11-24T00:00:00.000Z', channel: 'stable', endpoints: { resolvers: ['https://resolver.test'] }, providers });

test('registry client: verifies signatures when keys are pinned, keeps the last good copy, survives a restart', async () => {
  const key = await generateRegistryKey('k1');
  const good = await signRegistry(doc(5), key);
  const newer = await signRegistry(doc(6), key);
  const responses: Record<string, unknown> = {};
  const memory = new Map<string, string>();
  const storage = { get: (k: string) => memory.get(k) ?? null, set: (k: string, v: string) => void memory.set(k, v) };
  let now = 1_000_000;
  const make = () => new RegistryClient({ urls: () => ['https://primary.test/v2/registry', 'https://mirror.test/registry.signed.json'], fetchJson: async (url) => (url in responses ? responses[url] : Promise.reject(new Error('unreachable'))), trustedKeys: { k1: key.publicKey }, storage, now: () => now, minIntervalMs: 60_000 });

  const c = make();
  assert.equal(c.current(), undefined);
  assert.deepEqual(await c.refresh(), { accepted: false, reason: 'https://mirror.test/registry.signed.json: unreachable' });

  // The primary is down; the mirror has it.
  responses['https://mirror.test/registry.signed.json'] = good;
  assert.equal((await c.refresh()).reason, 'fresh', 'not refetched within the interval');
  now += 61_000;
  assert.equal((await c.refresh()).accepted, true);
  assert.equal(c.current()!.version, 5);

  // Tampered, unsigned, and replayed-older documents change nothing.
  now += 61_000;
  responses['https://primary.test/v2/registry'] = { signed: { ...newer, payload: newer.payload.replace('"stable"', '"canary"') } };
  responses['https://mirror.test/registry.signed.json'] = { document: doc(99) };
  const rejected = await c.refresh();
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reason!, /only accepts signed registries/);
  assert.equal(c.current()!.version, 5);
  now += 61_000;
  responses['https://primary.test/v2/registry'] = { signed: await signRegistry(doc(4), key) };
  delete responses['https://mirror.test/registry.signed.json'];
  await c.refresh();
  assert.equal(c.current()!.version, 5);

  // A good newer one is adopted, and a new session starts from it.
  now += 61_000;
  responses['https://primary.test/v2/registry'] = { signed: newer };
  assert.equal((await c.refresh()).accepted, true);
  assert.equal(make().current()!.version, 6);

  // Without pinned keys, the resolver's own unsigned registry is accepted.
  const open = new RegistryClient({ urls: () => ['https://primary.test/v2/registry'], fetchJson: async () => ({ document: doc(3) }) });
  assert.equal((await open.refresh()).accepted, true);
  assert.equal(open.current()!.version, 3);
});

// ---------- the unified resolver ----------

const provider = (id: string, over: Partial<ProviderManifest> = {}): ProviderModule =>
  defineProvider({
    manifest: { ...manifest(id, over), contract: undefined } as never,
    async getSources(media, ctx) {
      const d = await getJson<{ url?: string; headers?: Record<string, string>; language?: string; note?: string }>(ctx.fetch, ctx.url('site', `/api/${media.kind}/${media.ids.tmdb}`), { signal: ctx.signal }, id);
      if (!d.url) throw new NotFoundError();
      return { streams: [{ url: d.url, type: undefined as never, headers: d.headers, language: d.language, note: d.note }] };
    },
  });
const site = (id: string) => `https://${id}.example.com`;
const api = (id: string) => `${site(id)}/api/movie/27205`;
const loaded = (m: ProviderModule, stage: LoadedProvider['stage'] = 'stable'): LoadedProvider => ({ module: m, stage, domains: domainsFor(m.manifest.id, { site: site(m.manifest.id) }) });

const BROWSER: Omit<PlaybackCapabilities, 'bridge' | 'relay'> = { hls: true, dash: false, mp4: true, mkv: false, webm: true, frames: true };

/** A resolver API backed by a real engine over a mock network: genuine events, with relay links added as the server does. */
function fakeServer(providers: LoadedProvider[], routes: Record<string, MockRoute>) {
  const h = createHarness({ providers, routes, engine: { cacheTtlMs: 0, negativeCacheTtlMs: 0 } });
  const queries: URLSearchParams[] = [];
  const remote: ResolverDeps['remote'] = async function* (base, q, signal) {
    queries.push(q);
    const list = (k: string) => q.get(k)?.split(',').filter(Boolean);
    for await (const e of h.engine.resolve({ media: TITLES.movie, signal, skip: list('skip'), only: list('only'), accept: list('accept') as never })) {
      yield (e.t === 'result' ? { ...e, streams: e.streams.map((s) => ({ ...s, relay: `${base}/v2/relay?data=${encodeURIComponent(s.url)}&sig=x` })) } : e) as RemoteEvent;
    }
  };
  return { remote, queries, harness: h };
}

function deps(over: Partial<ResolverDeps> & { packList: LoadedProvider[] }): ResolverDeps {
  return {
    pack: async () => over.packList,
    bridge: async () => null,
    registry: () => undefined,
    servers: () => ['https://resolver.test'],
    remote: async function* () {},
    settings: () => ({}),
    device: () => BROWSER,
    preferences: () => ({ language: 'en' }),
    health: new HealthStore(),
    ...over,
  };
}

const bridgeOver = (routes: Record<string, MockRoute>, lostAfter?: number): Bridge => {
  const transport = mockTransport(routes);
  let lost = false;
  let n = 0;
  return {
    info: negotiate({ version: '0.2.0', protocol: 2, capabilities: ['request', 'allowStream', 'releaseStreams', 'cookies'], hasPermission: true })!,
    fetcher: bridgeFetcher(async <T>(_type: string, payload: unknown) => {
      if (lostAfter !== undefined && ++n > lostAfter) throw new BridgeError('didn’t answer', 'DISCONNECTED');
      const p = payload as { url: string; method?: 'GET'; headers?: Record<string, string>; body?: string };
      return (await transport(p.url, p)) as T;
    }, 1000, () => (lost = true)),
    get lost() {
      return lost;
    },
    allowStream: async () => {},
    releaseStreams: () => {},
  };
};

const cdn = (id: string, file = '1080/master.m3u8') => `https://cdn.${id}.example.net/v/${file}`;

test('website with no bridge: everything is resolved remotely and arrives progressively; delivery is chosen per stream', async () => {
  const pack = [loaded(provider('plain')), loaded(provider('needy')), loaded(provider('slow')), loaded(provider('files'))];
  const server = fakeServer(pack, {
    [api('plain')]: { body: { url: cdn('plain') } },
    [api('needy')]: { body: { url: cdn('needy'), headers: { Referer: `${site('needy')}/` } } },
    [api('slow')]: { body: { url: cdn('slow', '720/master.m3u8') }, delayMs: 120 },
    [api('files')]: { body: { url: 'https://cdn.files.example.net/Movie.2160p.x265.mkv' } },
  });
  const updates: ResolveState[] = [];
  const final = await resolveSources(TITLES.movie, deps({ packList: pack, remote: server.remote }), { onUpdate: (s) => updates.push(s) });

  assert.deepEqual(final.mode, { bridge: null, server: 'https://resolver.test' });
  assert.deepEqual(final.sources.map((s) => [s.provider.id, s.delivery, s.local]), [['plain', 'direct', false], ['needy', 'relay', false], ['slow', 'direct', false]]);
  assert.equal(final.sources[0].playUrl, cdn('plain'), 'a plain stream plays from its origin: no bytes through the relay');
  assert.match(final.sources[1].playUrl, /^https:\/\/resolver\.test\/v2\/relay\?/, 'a header-bound stream needs the relay');
  // The server was told what this device plays, so the MKV-only provider is reported as such, not as "not found".
  const files = final.providers.find((p) => p.id === 'files')!;
  assert.deepEqual([files.state, files.code, files.reason], ['error', 'UNSUPPORTED_FORMAT', 'Has nothing this device can play']);
  assert.equal(server.queries[0].get('skip'), null, 'nothing runs locally, so nothing is skipped');
  assert.equal(server.queries[0].get('accept'), 'hls,mp4,webm');

  // Progressive: a playable source was shown while the slow provider was still pending.
  const firstWithSource = updates.findIndex((u) => u.sources.length > 0);
  assert.ok(firstWithSource >= 0 && !updates[firstWithSource].done);
  assert.ok(updates[firstWithSource].providers.some((p) => p.id === 'slow' && p.state === 'pending'));
  assert.equal(updates[updates.length - 1].done, true);
  assert.deepEqual(final.providers.map((p) => `${p.id}:${p.state}:${p.where}`).sort(), ['files:error:remote', 'needy:ok:remote', 'plain:ok:remote', 'slow:ok:remote']);
});

test('with a bridge: providers run on the viewer’s connection, the server is told to skip them, and duplicates collapse to the local copy', async () => {
  const pack = [loaded(provider('both')), loaded(provider('homeonly', { requires: { egress: 'user' } })), loaded(provider('serveronly', { runtimes: ['server'] })), loaded(provider('tokened', { requires: { setting: 'token' } }))];
  const same = { url: cdn('shared'), headers: { Referer: 'https://shared.example.com/' } };
  const routes = {
    [api('both')]: { body: same },
    [api('homeonly')]: { body: { url: cdn('homeonly') } },
    [api('serveronly')]: { body: { ...same, url: `${cdn('shared')}?token=server-side` } },
    [api('tokened')]: { body: { url: cdn('tokened') } },
  };
  const server = fakeServer(pack, routes);
  const reports: unknown[] = [];
  const bridge = bridgeOver(routes);
  const final = await resolveSources(TITLES.movie, deps({ packList: pack, remote: server.remote, bridge: async () => bridge, settings: () => ({ token: 'personal-secret' }), report: (r) => reports.push(...r) }));

  assert.equal(final.mode.bridge, 'extension');
  assert.equal(server.queries[0].get('skip'), 'both,homeonly,tokened');
  assert.ok(![...server.queries[0].values()].some((v) => v.includes('personal-secret')), 'a personal setting never leaves the device');
  const by = Object.fromEntries(final.providers.map((p) => [p.id, p]));
  assert.deepEqual([by.both.where, by.homeonly.where, by.tokened.where, by.serveronly.where], ['local', 'local', 'local', 'remote']);
  // "both" (local) and "serveronly" (remote) found the same upstream file: one entry, the local one.
  assert.deepEqual(final.sources.map((s) => `${s.provider.id}:${s.delivery}:${s.local}`).sort(), ['both:headers:true', 'homeonly:headers:true', 'tokened:headers:true']);
  assert.ok(final.sources.every((s) => s.playUrl === s.url), 'played from the origin through the bridge');
  assert.deepEqual((reports as { provider: string; runtime: string; outcome: string }[]).map((r) => `${r.provider}:${r.runtime}:${r.outcome}`).sort(), ['both:extension:ok', 'homeonly:extension:ok', 'tokened:extension:ok']);
});

test('remote execution unavailable: the own server is tried, then the hosted one; with neither, a bridge still works and the website says so honestly', async () => {
  const pack = [loaded(provider('alpha'))];
  const hosted = fakeServer(pack, { [api('alpha')]: { body: { url: cdn('alpha') } } });
  const tried: string[] = [];
  const remote: ResolverDeps['remote'] = async function* (base, q, signal) {
    tried.push(base);
    if (base !== 'https://hosted.test') throw new Error(`${base} is unreachable`);
    yield* hosted.remote(base, q, signal);
  };
  const viaHosted = await resolveSources(TITLES.movie, deps({ packList: pack, remote, servers: () => ['http://localhost:8080', 'https://hosted.test'] }));
  assert.deepEqual(tried, ['http://localhost:8080', 'https://hosted.test']);
  assert.deepEqual([viaHosted.mode.server, viaHosted.sources.length, viaHosted.remoteError], ['https://hosted.test', 1, undefined]);

  const down: ResolverDeps['remote'] = async function* (base) {
    throw new Error(`${base} is unreachable`);
  };
  const none = await resolveSources(TITLES.movie, deps({ packList: pack, remote: down }));
  assert.deepEqual([none.sources.length, none.done, none.remoteError], [0, true, 'https://resolver.test is unreachable']);

  const local = await resolveSources(TITLES.movie, deps({ packList: pack, remote: down, bridge: async () => bridgeOver({ [api('alpha')]: { body: { url: cdn('alpha') } } }) }));
  assert.deepEqual(local.sources.map((s) => `${s.provider.id}:${s.local}`), ['alpha:true'], 'local execution does not depend on the resolver');
  const offline = await resolveSources(TITLES.movie, deps({ packList: pack, servers: () => [], bridge: async () => bridgeOver({ [api('alpha')]: { body: { url: cdn('alpha') } } }) }));
  assert.equal(offline.sources.length, 1);
});

test('extension disconnected mid-run: what it was running is handed to the resolver, and nothing is blamed on the providers', async () => {
  const pack = [loaded(provider('first')), loaded(provider('second'))];
  const routes = { [api('first')]: { body: { url: cdn('first') } }, [api('second')]: { body: { url: cdn('second') }, delayMs: 30 } };
  const server = fakeServer(pack, routes);
  const health = new HealthStore();
  const bridge = bridgeOver(routes, 0); // answers hello-less: every request fails as disconnected
  const final = await resolveSources(TITLES.movie, deps({ packList: pack, remote: server.remote, bridge: async () => bridge, health }));
  assert.equal(bridge.lost, true);
  assert.deepEqual(server.queries.map((q) => [q.get('skip'), q.get('only')]), [['first,second', null], [null, 'first,second']]);
  assert.deepEqual(final.sources.map((s) => `${s.provider.id}:${s.local}`).sort(), ['first:false', 'second:false']);
  assert.equal(final.mode.bridge, null);
  assert.deepEqual(health.list(), [], 'a lost bridge is not a provider failure');
});

test('a provider resting locally after repeated failures is left to the resolver instead of being skipped everywhere', async () => {
  const pack = [loaded(provider('tired'))];
  const server = fakeServer(pack, { [api('tired')]: { body: { url: cdn('tired') } } });
  const health = new HealthStore();
  const bridge = () => bridgeOver({ [api('tired')]: simulate.forbidden() });
  for (let i = 0; i < 3; i++) await resolveSources(TITLES.movie, deps({ packList: pack, remote: server.remote, bridge: async () => bridge(), health }));
  assert.equal(health.status('tired', 'extension'), 'benched');
  server.queries.length = 0;
  const final = await resolveSources(TITLES.movie, deps({ packList: pack, remote: server.remote, bridge: async () => bridge(), health }));
  assert.equal(server.queries[0].get('skip'), null);
  assert.deepEqual(final.sources.map((s) => `${s.provider.id}:${s.local}`), ['tired:false']);
});

test('the registry changes what a client runs without a new build: stages, domains, and whole providers delivered as data', async () => {
  const pack = [loaded(provider('kept')), loaded(provider('retired')), loaded(provider('moved'))];
  const movedDomains: DomainConfig = { ...domainsFor('moved', { site: ['https://moved.example.org', site('moved')] }), version: 2 };
  const registry = doc(9, [
    { manifest: manifest('kept'), stage: 'stable', domains: domainsFor('kept', { site: site('kept') }), release: { version: '1.0.0', at: 'x' } },
    { manifest: manifest('retired'), stage: 'disabled', domains: domainsFor('retired', { site: site('retired') }), release: { version: '1.0.0', at: 'x' } },
    { manifest: manifest('moved'), stage: 'stable', rank: 250, domains: movedDomains, release: { version: '1.0.0', at: 'x' } },
    {
      manifest: manifest('brandnew', { domainRoles: ['site'], output: { types: ['hls'] } }),
      stage: 'stable',
      domains: domainsFor('brandnew', { site: site('brandnew') }),
      rules: { schema: 1, id: 'brandnew', version: '1.0.0', steps: [{ fetch: '{{domain.site}}/find/{{media.ids.tmdb}}', as: 'r' }, { extract: 'json', from: 'r', expr: '$.playlist', as: 'u', required: true }], emit: [{ url: '{{u}}', type: 'hls' }] },
      release: { version: '1.0.0', at: 'x' },
    },
  ]);
  const applied = applyRegistry(pack, registry);
  assert.deepEqual(applied.map((p) => `${p.module.manifest.id}:${p.stage}`), ['kept:stable', 'retired:disabled', 'moved:stable', 'brandnew:stable']);
  assert.deepEqual([applied[2].rank, applied[2].domains?.roles.site.active], [250, 'https://moved.example.org']);
  assert.equal(applyRegistry(pack, undefined), pack);

  const bridge = bridgeOver({
    [api('kept')]: { body: { url: cdn('kept') } },
    [api('retired')]: { body: { url: cdn('retired') } },
    'https://moved.example.org/api/movie/27205': { body: { url: cdn('moved') } },
    'https://brandnew.example.com/find/27205': { body: { playlist: cdn('brandnew') } },
  });
  const final = await resolveSources(TITLES.movie, deps({ packList: pack, registry: () => registry, bridge: async () => bridge, servers: () => [] }));
  assert.deepEqual(final.sources.map((s) => s.provider.id).sort(), ['brandnew', 'kept', 'moved']);
});

test('ranking for this viewer: language first, then quality; a stream that needs a bridge nobody has is listed as unplayable with the reason', async () => {
  const pack = [loaded(provider('hindi4k')), loaded(provider('english720')), loaded(provider('original1080')), loaded(provider('needy'))];
  const server = fakeServer(pack, {
    [api('hindi4k')]: { body: { url: cdn('hindi4k', '2160/master.m3u8'), language: 'Hindi' } },
    [api('english720')]: { body: { url: cdn('english720', '720/master.m3u8'), language: 'English' } },
    [api('original1080')]: { body: { url: cdn('original1080') } },
    [api('needy')]: { body: { url: cdn('needy'), headers: { Origin: 'https://needy.example.com' } } },
  });
  // A resolver that resolves but offers no relay (relay links stripped).
  const noRelay: ResolverDeps['remote'] = async function* (base, q, signal) {
    for await (const e of server.remote(base, q, signal)) yield (e.t === 'result' ? { ...e, streams: e.streams.map(({ relay: _r, ...s }: Stream & { relay?: string }) => s) } : e) as RemoteEvent;
  };
  const final = await resolveSources(TITLES.movie, deps({ packList: pack, remote: noRelay }));
  assert.deepEqual(final.sources.map((s) => s.provider.id), ['original1080', 'english720', 'hindi4k']);
  assert.ok(final.sources[0].score! > final.sources[1].score! && final.sources[1].score! > final.sources[2].score!);
  assert.deepEqual(final.unplayable, [{ provider: 'needy', reason: 'Needs the helper extension or the app to play' }]);
  // The same list for a Hindi-speaking viewer on a small screen.
  const hindi = await resolveSources(TITLES.movie, deps({ packList: pack, remote: noRelay, preferences: () => ({ language: 'hi' }), device: () => ({ ...BROWSER, maxHeight: 1080 }) }));
  assert.equal(hindi.sources[0].provider.id, 'hindi4k');
});

test('cancelling stops both sides', async () => {
  const pack = [loaded(provider('slowpoke'))];
  const server = fakeServer(pack, { [api('slowpoke')]: simulate.hang() });
  const ctrl = new AbortController();
  const started = Date.now();
  const run = resolveSources(TITLES.movie, deps({ packList: pack, remote: server.remote }), { signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 30);
  const final = await run;
  assert.ok(Date.now() - started < 1000);
  assert.equal(final.sources.length, 0);
});
