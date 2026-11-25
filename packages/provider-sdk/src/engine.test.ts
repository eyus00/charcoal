import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineProvider } from './define.js';
import { collect, mediaKey, type EngineEvent } from './engine.js';
import { NotFoundError, ProviderError } from './errors.js';
import { expectOk, getJson } from './net.js';
import { hashId, languageCode, mergeStreams, normalizeStream, upstreamKey } from './normalize.js';
import { checkCompatibility, classifyPlaybackError, codecFamilies, decideDelivery, needsRefresh, type PlaybackCapabilities } from './playback.js';
import { rankStreams } from './rank.js';
import { runCanary, runRecovery } from './recovery.js';
import { defineRuleProvider, renderTemplate, validateRulePack, type RulePack } from './rules.js';
import { describeRuntime } from './runtime.js';
import { checkContract, createHarness, domainsFor, simulate, TITLES } from './testing/index.js';
import type { ProviderManifest, ProviderModule, RawStream, Stream } from './types.js';

const base = (id: string, over: Partial<ProviderManifest> = {}): Omit<ProviderManifest, 'contract'> => ({
  id,
  name: id.toUpperCase(),
  version: '1.0.0',
  kinds: ['movie', 'tv'],
  lookup: ['tmdb'],
  runtimes: ['server', 'extension', 'app'],
  domainRoles: ['site'],
  followDiscovered: true,
  output: { types: ['hls', 'mp4'] },
  ...over,
});

/** A provider that asks its site for JSON {url} and returns one stream. */
const simple = (id: string, over: Partial<ProviderManifest> = {}): ProviderModule =>
  defineProvider({
    manifest: base(id, over),
    async getSources(media, ctx) {
      const data = await getJson<{ url?: string; quality?: string }>(ctx.fetch, ctx.url('site', `/api/${media.kind}/${media.ids.tmdb}`), { signal: ctx.signal }, id);
      if (!data.url) throw new NotFoundError();
      return { streams: [{ url: data.url, type: 'hls', quality: data.quality }] };
    },
  });

const site = (id: string) => `https://${id}.example.com`;
const api = (id: string) => `${site(id)}/api/movie/27205`;
const stream = (id: string, q = '1080') => ({ body: { url: `https://cdn.${id}.example.net/v/${q}/master.m3u8`, quality: q } });

// ---------- progressive, concurrent, isolated ----------

test('results arrive as each provider finishes; a slow or failing provider holds nobody up', async () => {
  const h = createHarness({
    providers: [simple('fast'), simple('slow'), simple('broken'), simple('empty')],
    domains: { fast: domainsFor('fast', { site: site('fast') }), slow: domainsFor('slow', { site: site('slow') }), broken: domainsFor('broken', { site: site('broken') }), empty: domainsFor('empty', { site: site('empty') }) },
    routes: {
      [api('fast')]: stream('fast'),
      [api('slow')]: { ...stream('slow', '720'), delayMs: 120 },
      [api('broken')]: simulate.forbidden(),
      [api('empty')]: simulate.notFound(),
    },
  });
  const order: string[] = [];
  const events: EngineEvent[] = [];
  const started = Date.now();
  let firstStreamAt = 0;
  for await (const e of h.engine.resolve({ media: TITLES.movie })) {
    events.push(e);
    if (e.t === 'result') {
      order.push(`${e.provider.id}:${e.outcome}${e.code ? `:${e.code}` : ''}`);
      if (e.streams.length && !firstStreamAt) firstStreamAt = Date.now() - started;
    }
  }
  assert.equal(events[0].t, 'plan');
  assert.equal(events[events.length - 1].t, 'done');
  assert.equal(order[order.length - 1], 'slow:ok', 'the slow one is last');
  assert.deepEqual([...order].sort(), ['broken:error:ACCESS_DENIED', 'empty:empty:NOT_FOUND', 'fast:ok', 'slow:ok']);
  assert.ok(firstStreamAt < 100, `first stream after ${firstStreamAt}ms, before the slow provider's 120ms`);
  const done = events[events.length - 1] as Extract<EngineEvent, { t: 'done' }>;
  assert.deepEqual([done.ok, done.empty, done.failed], [2, 1, 1]);
});

test('a provider that throws, hangs, returns garbage or breaks policy is contained and classified', async () => {
  const crash = defineProvider({ manifest: base('crash'), getSources: async () => (undefined as unknown as { x: { y: string } }).x.y as never });
  const hang = defineProvider({ manifest: base('hang', { limits: { timeoutMs: 1000 } }), getSources: () => new Promise(() => {}) });
  const garbage = defineProvider({ manifest: base('garbage'), getSources: async () => ({ streams: [{ url: 'javascript:alert(1)', type: 'hls' }, { url: '', type: 'mp4' }] as RawStream[] }) });
  const wander = defineProvider({
    manifest: base('wander'),
    async getSources(_m, ctx) {
      await ctx.fetch('https://internal-admin.example.org/secrets');
      return { streams: [] };
    },
  });
  const inside = defineProvider({
    manifest: base('inside'),
    async getSources(_m, ctx) {
      await ctx.fetch('http://169.254.169.254/latest/meta-data/');
      return { streams: [] };
    },
  });
  const good = simple('good');
  const h = createHarness({
    providers: [crash, hang, garbage, wander, inside, good],
    domains: Object.fromEntries(['crash', 'hang', 'garbage', 'wander', 'inside', 'good'].map((id) => [id, domainsFor(id, { site: site(id) })])),
    routes: { [api('good')]: stream('good') },
    engine: { providerTimeoutMs: 300 },
  });
  const { results } = await collect(h.engine.resolve({ media: TITLES.movie }));
  const by = Object.fromEntries(results.map((r) => [r.provider.id, r]));
  assert.equal(by.good.outcome, 'ok');
  assert.deepEqual([by.crash.outcome, by.crash.code], ['error', 'INTERNAL']);
  assert.deepEqual([by.hang.outcome, by.hang.code], ['error', 'TIMEOUT']);
  assert.deepEqual([by.garbage.outcome, by.garbage.code], ['error', 'INVALID_RESULT']);
  assert.deepEqual([by.wander.code, by.inside.code], ['POLICY', 'POLICY']);
  assert.match(by.inside.message ?? '', /Private or internal/);
  assert.equal(h.transport.calls.some((c) => c.url.hostname !== 'good.example.com'), false, 'no forbidden request ever left');
});

test('identical requests made together share one run; a finished run is reused briefly, then not', async () => {
  let hits = 0;
  const h = createHarness({
    providers: [simple('one')],
    domains: { one: domainsFor('one', { site: site('one') }) },
    routes: { 'https://one.example.com/api/*': () => (hits++, { ...stream('one'), delayMs: 30 }) },
    engine: { cacheTtlMs: 60_000 },
  });
  const [a, b, c] = await Promise.all([collect(h.engine.resolve({ media: TITLES.movie })), collect(h.engine.resolve({ media: TITLES.movie })), collect(h.engine.resolve({ media: TITLES.movie }))]);
  assert.equal(hits, 1);
  assert.deepEqual([a.streams.length, b.streams.length, c.streams.length], [1, 1, 1]);
  await collect(h.engine.resolve({ media: TITLES.movie }));
  assert.equal(hits, 1, 'served from the finished run');
  await collect(h.engine.resolve({ media: TITLES.episode }));
  assert.equal(hits, 2, 'a different title is a different run');
  h.advance(61_000);
  await collect(h.engine.resolve({ media: TITLES.movie }));
  assert.equal(hits, 3, 'expired from the cache');
  assert.notEqual(mediaKey(TITLES.movie), mediaKey(TITLES.episode));
});

test('a run is never reused past the expiry of its links, and a run that found nothing is retried soon', async () => {
  let hits = 0;
  const expiring = defineProvider({
    manifest: base('exp'),
    async getSources(_m, ctx) {
      hits++;
      await ctx.fetch(ctx.url('site', '/x'));
      return { streams: [{ url: 'https://cdn.exp.example.net/a.m3u8', type: 'hls', expiresAt: ctx.runtime ? 1_800_000_000_000 + 90_000 : 0 }] };
    },
  });
  const h = createHarness({ providers: [expiring], domains: { exp: domainsFor('exp', { site: site('exp') }) }, routes: { 'exp.example.com': { body: 'ok' } }, engine: { cacheTtlMs: 600_000 } });
  await collect(h.engine.resolve({ media: TITLES.movie }));
  h.advance(20_000);
  await collect(h.engine.resolve({ media: TITLES.movie }));
  assert.equal(hits, 1, 'still valid for a while');
  h.advance(20_000); // 40s in: link has 50s left, inside the one-minute safety margin
  await collect(h.engine.resolve({ media: TITLES.movie }));
  assert.equal(hits, 2);

  const none = createHarness({ providers: [simple('none')], domains: { none: domainsFor('none', { site: site('none') }) }, routes: { [api('none')]: simulate.notFound() }, engine: { negativeCacheTtlMs: 5000 } });
  await collect(none.engine.resolve({ media: TITLES.movie }));
  none.advance(6000);
  await collect(none.engine.resolve({ media: TITLES.movie }));
  assert.equal(none.transport.calls.length, 2);
});

test('when every listener leaves, the providers are stopped', async () => {
  let aborted = false;
  const patient = defineProvider({
    manifest: base('patient'),
    getSources: (_m, ctx) =>
      new Promise((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('stopped'));
        });
      }),
  });
  const h = createHarness({ providers: [patient], domains: { patient: domainsFor('patient', { site: site('patient') }) }, engine: { providerTimeoutMs: 5000 } });
  const ctrl = new AbortController();
  const run = collect(h.engine.resolve({ media: TITLES.movie, signal: ctrl.signal }));
  setTimeout(() => ctrl.abort(), 20);
  await run;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(aborted, true);
  assert.equal(h.health.get('patient', 'server'), undefined, 'a cancelled run says nothing about health');
});

test('waves: the next wave starts after the delay without waiting for a slow first wave', async () => {
  const ids = ['wa', 'wb', 'wc'];
  const h = createHarness({
    providers: ids.map((id) => simple(id)),
    domains: Object.fromEntries(ids.map((id) => [id, domainsFor(id, { site: site(id) })])),
    routes: { [api('wa')]: { ...stream('wa'), delayMs: 200 }, [api('wb')]: { ...stream('wb'), delayMs: 200 }, [api('wc')]: stream('wc') },
    engine: { waveSize: 2, waveDelayMs: 40 },
  });
  const seen: string[] = [];
  let plan: Extract<EngineEvent, { t: 'plan' }> | undefined;
  for await (const e of h.engine.resolve({ media: TITLES.movie })) {
    if (e.t === 'plan') plan = e;
    if (e.t === 'result') seen.push(e.provider.id);
  }
  assert.deepEqual(plan!.providers.map((p) => p.wave), [1, 1, 2]);
  assert.equal(seen[0], 'wc', 'wave 2 answered while wave 1 was still waiting');
});

// ---------- selection: kinds, stages, filters, runtime ----------

test('the plan respects kinds, stages, only/skip, accepted types, runtime fit and network strictness', async () => {
  const providers = [
    { module: simple('stable'), stage: 'stable' as const, domains: domainsFor('stable', { site: site('stable') }) },
    { module: simple('canary'), stage: 'canary' as const, domains: domainsFor('canary', { site: site('canary') }) },
    { module: simple('off'), stage: 'disabled' as const, domains: domainsFor('off', { site: site('off') }) },
    { module: simple('anime-only', { kinds: ['anime'] }), stage: 'stable' as const, domains: domainsFor('anime-only', { site: site('anime-only') }) },
    { module: simple('mkv-only', { output: { types: ['mkv'] } }), stage: 'stable' as const, domains: domainsFor('mkv-only', { site: site('mkv-only') }) },
    { module: simple('home-only', { requires: { egress: 'user' } }), stage: 'stable' as const, domains: domainsFor('home-only', { site: site('home-only') }) },
    { module: simple('needs-token', { requires: { setting: 'token' } }), stage: 'stable' as const, domains: domainsFor('needs-token', { site: site('needs-token') }) },
    { module: simple('open-net', { network: 'open', domainRoles: ['site'] }), stage: 'stable' as const, domains: domainsFor('open-net', { site: site('open-net') }) },
  ];
  const h = createHarness({ providers, engine: { strictNetwork: true } });
  const p = h.engine.plan({ media: TITLES.movie, accept: ['hls', 'mp4'] });
  assert.deepEqual(p.run.map((x) => x.module.manifest.id), ['stable']);
  const why = Object.fromEntries(p.skipped.map((s) => [s.id, s.reason]));
  assert.equal(why.canary, 'canary');
  assert.equal(why.off, 'disabled');
  assert.equal(why['mkv-only'], 'no accepted stream type');
  assert.match(why['home-only'], /egress:user/);
  assert.match(why['needs-token'], /setting:token/);
  assert.match(why['open-net'], /network policy "open"/);
  assert.equal(why['anime-only'], undefined, 'a provider for another kind is simply not part of the plan');

  // Asking for a canary by name runs it (that's how canaries are tested).
  assert.deepEqual(h.engine.plan({ media: TITLES.movie, only: ['canary'] }).run.map((x) => x.module.manifest.id), ['canary']);
  assert.deepEqual(h.engine.plan({ media: TITLES.movie, skip: ['stable'], accept: ['hls', 'mp4'] }).run.length, 0);

  // The same providers in the extension with the viewer's token: home-only and needs-token now run.
  const ext = createHarness({ providers, runtime: describeRuntime('extension'), engine: { settings: { token: 'abc' } } });
  assert.deepEqual(ext.engine.plan({ media: TITLES.movie }).run.map((x) => x.module.manifest.id).sort(), ['home-only', 'mkv-only', 'needs-token', 'open-net', 'stable']);
});

test('streams in a format the client did not ask for are reported as such, not as "not found"', async () => {
  const mkv = defineProvider({ manifest: base('files', { output: { types: ['mkv', 'mp4'] } }), getSources: async () => ({ streams: [{ url: 'https://cdn.files.example.net/movie.2160p.x265.mkv', type: 'mkv' }] }) });
  const h = createHarness({ providers: [mkv], domains: { files: domainsFor('files', { site: site('files') }) } });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie, undefined, ['hls', 'mp4']);
  assert.deepEqual([r.outcome, r.code, r.scope], ['error', 'UNSUPPORTED_FORMAT', 'client']);
  assert.equal(h.health.get('files', 'server'), undefined, 'and it does not count against the provider');
});

test('already-expired links are an EXPIRED failure', async () => {
  const stale = defineProvider({ manifest: base('stale'), getSources: async () => ({ streams: [{ url: 'https://cdn.stale.example.net/a.m3u8?expires=1799999940', type: 'hls' }] }) }); // a minute before the harness clock
  const h = createHarness({ providers: [stale], domains: { stale: domainsFor('stale', { site: site('stale') }) } });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.deepEqual([r.outcome, r.code], ['error', 'EXPIRED']);
});

// ---------- network behaviour ----------

test('domain changed: the run fails over to the configured alternate without the provider knowing', async () => {
  const h = createHarness({
    providers: [simple('moved')],
    domains: { moved: domainsFor('moved', { site: ['https://old.moved.example.com', 'https://new.moved.example.org'] }) },
    routes: { 'old.moved.example.com': simulate.dns(), 'https://new.moved.example.org/api/movie/27205': stream('moved') },
  });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok');
  assert.deepEqual(r.failovers, [{ role: 'site', from: 'https://old.moved.example.com', to: 'https://new.moved.example.org', reason: 'DNS' }]);
  assert.deepEqual(h.transport.calls.map((c) => c.url.hostname), ['old.moved.example.com', 'new.moved.example.org']);
});

test('provider unavailable: DNS failure with no alternate is a domain-scoped failure and opens the circuit after three', async () => {
  const h = createHarness({ providers: [simple('gone')], domains: { gone: domainsFor('gone', { site: site('gone') }) }, routes: {}, engine: { negativeCacheTtlMs: 0 } });
  const first = (await collect(h.engine.resolve({ media: TITLES.movie }))).results[0];
  assert.deepEqual([first.outcome, first.code, first.scope, first.host], ['error', 'DNS', 'domain', 'gone.example.com']);
  for (let i = 0; i < 2; i++) {
    h.advance(1);
    await collect(h.engine.resolve({ media: TITLES.movie }));
  }
  h.advance(1);
  const after = await collect(h.engine.resolve({ media: TITLES.movie }));
  assert.equal(after.results.length, 0);
  // The reason says what kind of rest it is: an address that does not answer, not a broken provider.
  assert.match(after.plan!.skipped[0].reason, /resting for \d+s: its address does not answer from here/);
  assert.equal(h.health.status('gone', 'server'), 'benched');
});

test('transient failures are retried once; refusals and bot checks are not', async () => {
  let n = 0;
  const flaky = createHarness({ providers: [simple('flaky')], domains: { flaky: domainsFor('flaky', { site: site('flaky') }) }, routes: { [api('flaky')]: () => (++n === 1 ? simulate.serverError(503) : stream('flaky')) } });
  assert.equal((await flaky.engine.runProvider(flaky.engine.providers()[0], TITLES.movie)).outcome, 'ok');
  assert.equal(n, 2);

  for (const [name, response, code] of [['refused', simulate.forbidden(), 'ACCESS_DENIED'], ['bots', simulate.challenge(), 'CHALLENGE'], ['limited', simulate.rateLimited(), 'RATE_LIMITED']] as const) {
    const h = createHarness({ providers: [simple(name)], domains: { [name]: domainsFor(name, { site: site(name) }) }, routes: { [api(name)]: response } });
    const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
    assert.deepEqual([r.code, r.scope, h.transport.calls.length], [code, 'runtime', 1], name);
  }
});

test('provider timeout: one request hanging is cut off by the request timeout and classified', async () => {
  const h = createHarness({ providers: [simple('stuck')], domains: { stuck: domainsFor('stuck', { site: site('stuck') }) }, routes: { [api('stuck')]: simulate.hang() }, engine: { requestTimeoutMs: 60, providerTimeoutMs: 1000 } });
  const started = Date.now();
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.deepEqual([r.outcome, r.code, r.scope], ['error', 'TIMEOUT', 'transient']);
  assert.ok(Date.now() - started < 900);
  assert.equal(r.requests, 2, 'tried twice');
});

test('a redirect that leaves the allow-list is refused; a discovered CDN host is allowed', async () => {
  const follower = defineProvider({
    manifest: base('follow'),
    async getSources(_m, ctx) {
      const page = expectOk(await ctx.fetch(ctx.url('site', '/watch')));
      const playlist = /"(https:[^"]+\.m3u8)"/.exec(page.body)![1];
      const res = expectOk(await ctx.fetch(playlist));
      return { streams: [{ url: res.url, type: 'hls' }] };
    },
  });
  const ok = createHarness({
    providers: [follower],
    domains: { follow: domainsFor('follow', { site: site('follow') }) },
    routes: { 'https://follow.example.com/watch': simulate.html('<script>var src="https://cdn9.videohost.example/a/master.m3u8"</script>'), 'cdn9.videohost.example': simulate.playlist() },
  });
  assert.equal((await ok.engine.runProvider(ok.engine.providers()[0], TITLES.movie)).outcome, 'ok');

  const hijack = createHarness({ providers: [follower], domains: { follow: domainsFor('follow', { site: site('follow') }) }, routes: { 'https://follow.example.com/watch': { body: 'x', url: 'https://somewhere-else.example.org/landing' } } });
  // The provider's own address sending us to an unlisted host: it has moved. Reported as such,
  // with where it points, and never followed.
  const r = await hijack.engine.runProvider(hijack.engine.providers()[0], TITLES.movie);
  assert.deepEqual([r.code, r.scope, r.message], ['REDIRECTED', 'domain', 'follow.example.com now redirects to somewhere-else.example.org']);
  assert.equal(hijack.health.get('follow', 'server')!.failures[0].redirectedTo, 'somewhere-else.example.org');
  const [action] = await runRecovery({ engine: hijack.engine, health: hijack.health, transport: hijack.transport, canaries: { movie: [TITLES.movie] } });
  assert.equal(action.action, 'no-working-domain');
  assert.match(action.detail, /now redirects to somewhere-else\.example\.org.*validated with a test extraction/);
});

// ---------- normalisation, duplicates, playback, ranking ----------

const ctxN = { provider: { id: 'p', name: 'P', version: '1.0.0' }, runtime: 'server' as const, now: 1_800_000_000_000 };
const norm = (raw: RawStream, provider = 'p') => normalizeStream(raw, { ...ctxN, provider: { ...ctxN.provider, id: provider } }) as Stream;

test('normaliser fills type, quality, language and expiry, and gives stable ids', () => {
  const s = norm({ url: 'https://cdn.example.net/films/Dune.2021.1080p.BluRay/master.m3u8?token=abc&expires=1800003600', type: undefined as never, language: 'Hindi' });
  assert.deepEqual([s.type, s.quality, s.audio[0].lang, s.expiresAt], ['hls', '1080', 'hi', 1_800_003_600_000]);
  const again = norm({ url: 'https://cdn.example.net/films/Dune.2021.1080p.BluRay/master.m3u8?token=DIFFERENT&expires=1800009999', type: 'hls' });
  assert.equal(s.id, again.id, 'a re-resolve with a new token is the same stream');
  assert.equal(upstreamKey('https://CDN.example.net//a//b.m3u8?sig=1&lang=en'), 'cdn.example.net/a/b.m3u8?lang=en');
  assert.equal(hashId('abc'), hashId('abc'));
  assert.notEqual(hashId('abc'), hashId('abd'));
  assert.deepEqual(['English', 'hin', 'pt-BR', 'Original', 'Tamil 5.1', undefined].map(languageCode), ['en', 'hi', 'pt', 'und', 'ta', 'und']);
  assert.deepEqual(normalizeStream({ url: 'ftp://x/y.mp4', type: 'mp4' }, ctxN), { rejected: 'unsupported scheme ftp:' });
  assert.deepEqual(normalizeStream({ url: 'https://x.example/y', type: undefined as never }, ctxN), { rejected: 'unknown stream type' });
  assert.equal(norm({ url: 'https://x.example/a.mp4', type: 'mp4', quality: '4K' }).quality, '2160');
  assert.equal(norm({ url: 'data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQ==', type: 'hls' }).type, 'hls');
});

test('multiple providers returning duplicates: the same upstream file appears once', () => {
  const a = norm({ url: 'https://cdn.shared.example/v/123/master.m3u8?token=aaa', type: 'hls' }, 'first');
  const b = norm({ url: 'https://cdn.shared.example/v/123/master.m3u8?token=bbb', type: 'hls' }, 'second');
  const c = norm({ url: 'https://cdn.other.example/v/123/master.m3u8', type: 'hls' }, 'second');
  assert.notEqual(a.id, b.id, 'ids stay per provider');
  assert.equal(a.dedupKey, b.dedupKey);
  const merged = mergeStreams(mergeStreams([], [a]), [b, c]);
  assert.deepEqual(merged.map((s) => s.provider.id), ['first', 'second']);
  assert.equal(merged.length, 2);
  assert.equal(mergeStreams([a], [b], () => true)[0].provider.id, 'second', 'a caller may prefer the newcomer');
});

const browser: PlaybackCapabilities = { bridge: false, relay: true, hls: true, dash: false, mp4: true, mkv: false, webm: true, frames: true };

test('playback: compatibility, delivery choice and expiry tracking', () => {
  assert.equal(checkCompatibility(norm({ url: 'https://x.example/a.mkv', type: 'mkv' }), browser).playable, false);
  assert.match(checkCompatibility(norm({ url: 'https://x.example/a.mp4', type: 'mp4', note: 'BluRay · x265 10bit · DTS-HD' }), browser).reason ?? '', /HEVC/);
  assert.match(checkCompatibility(norm({ url: 'https://x.example/a.mp4', type: 'mp4', note: 'WEB-DL · H.264 · DDP5.1' }), browser).reason ?? '', /EAC3/);
  assert.equal(checkCompatibility(norm({ url: 'https://x.example/a.mp4', type: 'mp4', note: 'WEB-DL · H.264 · AAC' }), browser).playable, true);
  assert.equal(checkCompatibility(norm({ url: 'https://x.example/a.mkv', type: 'mkv', note: 'x265 DTS' }), { ...browser, mkv: true, videoCodecs: ['avc', 'hevc'], audioCodecs: ['aac', 'dts'] }).playable, true);
  assert.deepEqual(codecFamilies('hvc1.2.4.L153,ec-3'), ['hevc', 'eac3']);

  const plain = norm({ url: 'https://x.example/a.m3u8', type: 'hls' });
  const needy = norm({ url: 'https://x.example/b.m3u8', type: 'hls', headers: { Referer: 'https://site.example/', 'User-Agent': 'x' } });
  const uaOnly = norm({ url: 'https://x.example/c.m3u8', type: 'hls', headers: { 'User-Agent': 'x' } });
  const bound = norm({ url: 'https://x.example/d.m3u8', type: 'hls', ipBound: true });
  const frame = norm({ url: 'https://player.example/embed/1', type: 'frame' });
  // Resolved on a server, played in a plain browser tab.
  assert.deepEqual([plain, needy, uaOnly, bound, frame].map((s) => decideDelivery(s, browser, false)), ['direct', 'relay', 'direct', 'relay', 'frame']);
  // No relay either: header-bound streams can't play; say so instead of failing later.
  assert.deepEqual([needy, bound].map((s) => decideDelivery(s, { ...browser, relay: false }, false)), ['unplayable', 'unplayable']);
  // Resolved here through a bridge: everything plays from the origin.
  assert.deepEqual([plain, needy].map((s) => decideDelivery(s, { ...browser, bridge: true }, true)), ['headers', 'headers']);

  const expiring = { expiresAt: 1_000_000 };
  assert.deepEqual([needsRefresh(expiring, 900_000), needsRefresh(expiring, 980_000), needsRefresh({ expiresAt: undefined }, 5)], [false, true, false]);
  assert.deepEqual([classifyPlaybackError(403, expiring, 1_100_000), classifyPlaybackError(403, {}, 1), classifyPlaybackError(404, {}, 1), classifyPlaybackError(0, {}, 1)], ['expired', 'refused', 'gone', 'network']);
});

test('ranking is by measurable factors: playability, language, quality, reliability, delivery', () => {
  const s = (id: string, raw: Partial<RawStream>, provider = id) => ({ ...norm({ url: `https://cdn.${id}.example/a.m3u8`, type: 'hls', ...raw }, provider) });
  const list = [
    s('dub4k', { quality: '2160', language: 'Hindi' }),
    s('orig1080', { quality: '1080' }),
    s('eng720', { quality: '720', language: 'English' }),
    s('flaky1080', { quality: '1080', language: 'English' }),
    s('mkv', { url: 'https://cdn.mkv.example/a.mkv', type: 'mkv', quality: '2160' }),
    s('relay1080', { quality: '1080', language: 'English', headers: { Referer: 'https://r.example/' } }),
  ];
  const ranked = rankStreams(list, {
    preferredLanguage: 'en',
    compatibility: (x) => checkCompatibility(x, browser),
    delivery: (x) => decideDelivery(x, browser, false),
    reliability: (x) => (x.provider.id === 'flaky1080' ? 0.1 : 0.9),
  });
  const order = ranked.map((x) => x.provider.id);
  assert.equal(order[order.length - 1], 'mkv', 'unplayable goes last, with a reason');
  assert.match(ranked[ranked.length - 1].reasons!.join(), /MKV/);
  assert.ok(order.indexOf('dub4k') > order.indexOf('eng720'), 'the right language beats more pixels');
  assert.ok(order.indexOf('orig1080') < order.indexOf('flaky1080'), 'a reliable provider beats an unreliable one at the same quality');
  assert.ok(order.indexOf('orig1080') < order.indexOf('relay1080') || order.indexOf('flaky1080') > order.indexOf('relay1080'));
  // A data-saver cap makes 1080p worth no more than 720p.
  const capped = rankStreams([s('a', { quality: '1080', language: 'English' }), s('b', { quality: '720', language: 'English' })], { preferredLanguage: 'en', maxHeight: 720, compatibility: () => ({ playable: true }), delivery: () => 'direct', reliability: () => 0.5 });
  assert.equal(capped[0].provider.id, 'b');
  // Weights are data.
  const speedFirst = rankStreams([s('slow', { quality: '2160' }), s('quick', { quality: '480' })], { compatibility: () => ({ playable: true }), delivery: () => 'direct', reliability: () => 0.5, averageMs: (x) => (x.provider.id === 'slow' ? 12_000 : 300), weights: { speed: 500 } });
  assert.equal(speedFirst[0].provider.id, 'quick');
});

// ---------- declarative providers ----------

const rulesManifest: ProviderManifest = { ...base('ruled'), contract: 2, domainRoles: ['api', 'site'] };
const pack: RulePack = {
  schema: 1,
  id: 'ruled',
  version: '1.0.0',
  steps: [
    { when: 'movie', fetch: '{{domain.api}}/movie/{{media.ids.tmdb}}', as: 'info', headers: { Referer: '{{domain.site}}/' } },
    { when: 'tv', fetch: '{{domain.api}}/tv/{{media.ids.tmdb}}/{{media.season}}/{{media.episode}}', as: 'info' },
    { extract: 'json', from: 'info', expr: '$.src', as: 'src', required: true },
    { fetch: '{{domain.site}}{{src}}', as: 'page' },
    { extract: 'regex', from: 'page', expr: "token['\"]?\\s*:\\s*['\"]([^'\"]+)", as: 'token', required: true },
    { extract: 'css', from: 'page', expr: 'video > source', attr: 'src', as: 'playlist', required: true },
    { extract: 'xpath', from: 'page', expr: '//track/@src', all: true, as: 'subs' },
    { set: 'master', value: '{{playlist}}?token={{token | urlencode}}' },
    { require: '{{master}}' },
  ],
  emit: [{ url: '{{master}}', type: 'hls', quality: 'auto', headers: { Referer: '{{domain.site}}/' } }],
  captions: [{ each: 'subs', url: '{{item}}', label: 'English', lang: 'en' }],
};
const ruledDomains = domainsFor('ruled', { api: 'https://api.ruled.example.com', site: 'https://ruled.example.com' });
const ruledPage = `<html><body><script>window.cfg = { token: 'a b/c', expires: '1800009999' };</script><video><source src="/hls/27205/master.m3u8"></video><track kind="subtitles" src="/subs/en.vtt"></body></html>`;

test('a rule pack is a whole provider as data: fetch, extract with css / xpath / json / regex, emit', async () => {
  assert.deepEqual(validateRulePack(pack, rulesManifest), []);
  const provider = defineRuleProvider(rulesManifest, pack);
  const h = createHarness({
    providers: [provider],
    domains: { ruled: ruledDomains },
    routes: { 'https://api.ruled.example.com/movie/27205': { body: { src: '/embed/abc' } }, 'https://api.ruled.example.com/tv/1396/2/3': { body: { src: '/embed/ep' } }, 'https://ruled.example.com/embed/*': simulate.html(ruledPage) },
  });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams[0].url, 'https://ruled.example.com/hls/27205/master.m3u8?token=a%20b%2Fc');
  assert.deepEqual(r.streams[0].headers, { Referer: 'https://ruled.example.com/' });
  assert.deepEqual(r.captions.map((c) => [c.url, c.lang]), [['https://ruled.example.com/subs/en.vtt', 'en']]);
  assert.equal(h.transport.calls[0].headers.Referer, 'https://ruled.example.com/');
  assert.equal((await h.engine.runProvider(h.engine.providers()[0], TITLES.episode)).outcome, 'ok');
  assert.equal(h.transport.calls.some((c) => c.url.pathname === '/tv/1396/2/3'), true);
});

test('changed page structure: a missing required selector is SELECTOR_MISSING with the step that failed, and flags the provider for an update', async () => {
  const provider = defineRuleProvider(rulesManifest, pack);
  const h = createHarness({
    providers: [provider],
    domains: { ruled: ruledDomains },
    routes: { 'https://api.ruled.example.com/movie/27205': { body: { src: '/embed/abc' } }, 'https://ruled.example.com/embed/abc': simulate.html('<html><body><div id="new-player-v2"></div></body></html>') },
  });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.deepEqual([r.outcome, r.code, r.scope], ['error', 'SELECTOR_MISSING', 'provider']);
  assert.equal(h.health.status('ruled', 'server'), 'needs-update');
  // 404 on the API is simply "not here".
  const none = createHarness({ providers: [provider], domains: { ruled: ruledDomains }, routes: { 'https://api.ruled.example.com/movie/27205': simulate.notFound() } });
  assert.equal((await none.engine.runProvider(none.engine.providers()[0], TITLES.movie)).outcome, 'empty');
  // The same domain change as a code provider: rules follow the configured address.
  const moved = createHarness({
    providers: [provider],
    domains: { ruled: domainsFor('ruled', { api: ['https://api.ruled.example.com', 'https://api2.ruled.example.org'], site: 'https://ruled.example.com' }) },
    routes: { 'api.ruled.example.com': simulate.refused(), 'https://api2.ruled.example.org/movie/27205': { body: { src: '/embed/abc' } }, 'https://ruled.example.com/embed/abc': simulate.html(ruledPage) },
  });
  assert.equal((await moved.engine.runProvider(moved.engine.providers()[0], TITLES.movie)).outcome, 'ok');
});

test('rule packs are validated: undeclared roles, reads before writes, dangerous patterns', () => {
  const bad: RulePack = {
    schema: 1,
    id: 'ruled',
    version: '1.0.0',
    steps: [
      { fetch: '{{domain.cdn}}/x', as: 'a' },
      { extract: 'css', from: 'nope', expr: 'a', as: 'b' },
      { extract: 'regex', from: 'a', expr: '(a+)+$', as: 'c' },
      { fetch: '/relative', as: 'd' },
      { extract: 'regex', from: 'a', expr: '([', as: 'e' },
    ],
    emit: [{ url: '{{a}}' }],
  };
  const errors = validateRulePack(bad, rulesManifest).join('\n');
  assert.match(errors, /domain role "cdn", which the manifest doesn't declare/);
  assert.match(errors, /reads "nope" before anything sets it/);
  assert.match(errors, /repeats a repeating group/);
  assert.match(errors, /must start with a \{\{domain\.role\}\} or an absolute URL/);
  assert.match(errors, /pattern doesn't compile/);
  assert.throws(() => defineRuleProvider(rulesManifest, bad), /not valid/);
  assert.equal(renderTemplate('S{{media.season | pad2}}E{{media.episode | pad2}}', { media: { season: 2, episode: 3 } }), 'S02E03');
  assert.deepEqual(renderTemplate('{{list}}', { list: [1, 2] }), [1, 2]);
  assert.equal(renderTemplate('{{missing | default:none}}', {}), 'none');
});

// ---------- monitoring and recovery ----------

test('recovery: an address that died is diagnosed, the alternate is validated with a real extraction, and a reversible proposal comes back', async () => {
  // No fail-over inside the run here: alternates listed only after the outage, as an operator would.
  const routes: Record<string, ReturnType<typeof simulate.dns>> = { 'old.site.example.com': simulate.dns() };
  const h = createHarness({ providers: [{ module: simple('site'), stage: 'stable', domains: domainsFor('site', { site: 'https://old.site.example.com' }) }], routes, engine: { negativeCacheTtlMs: 0 } });
  for (let i = 0; i < 3; i++) {
    h.advance(1);
    await collect(h.engine.resolve({ media: TITLES.movie }));
  }
  assert.equal(h.health.status('site', 'server'), 'benched');

  // An alternate is configured; one candidate answers but serves nothing useful, the other works.
  const loaded = h.engine.providers()[0];
  loaded.domains = domainsFor('site', { site: ['https://old.site.example.com', 'https://parked.site.example.net', 'https://new.site.example.org'] });
  routes['parked.site.example.net'] = simulate.html('<h1>Buy this domain</h1>');
  routes['https://new.site.example.org/'] = simulate.html('home');
  routes['https://new.site.example.org/api/movie/27205'] = stream('site');

  const [action] = await runRecovery({ engine: h.engine, health: h.health, transport: h.transport, canaries: { movie: [TITLES.movie] }, actor: 'test' });
  assert.equal(action.action, 'switch-domain');
  assert.deepEqual([action.cause?.code, action.proposal?.from, action.proposal?.to], ['DNS', 'https://old.site.example.com', 'https://new.site.example.org']);
  assert.equal(action.proposal!.config.version, 2);
  assert.equal(action.proposal!.audit.validation?.ok, true);
  assert.equal(loaded.domains.roles.site.active, 'https://old.site.example.com', 'nothing was applied; it is a proposal');
  assert.equal(h.health.status('site', 'server'), 'benched', 'validation probes do not touch health');

  // Applying it (what the control plane does) and probing again restores the provider.
  loaded.domains = action.proposal!.config;
  const [after] = await runRecovery({ engine: h.engine, health: h.health, transport: h.transport, canaries: { movie: [TITLES.movie] } });
  assert.equal(after.action, 'restored');
  assert.equal(h.health.status('site', 'server'), 'ok');
});

test('recovery: each cause gets its own response; an extraction change is never auto-fixed', async () => {
  const ids = ['blocked', 'changed', 'flaky', 'fine', 'dead'];
  const routes: Record<string, unknown> = {
    [api('blocked')]: simulate.challenge(),
    [api('changed')]: simulate.html('<html>new layout</html>'),
    [api('flaky')]: simulate.serverError(500),
    [api('fine')]: stream('fine'),
  };
  const h = createHarness({
    providers: ids.map((id) => ({ module: simple(id), stage: 'stable' as const, domains: domainsFor(id, { site: id === 'dead' ? [site('dead'), 'https://also-dead.example.net'] : site(id) }) })),
    routes: routes as never,
    engine: { negativeCacheTtlMs: 0, cacheTtlMs: 0 },
  });
  for (let i = 0; i < 3; i++) {
    h.advance(1);
    await collect(h.engine.resolve({ media: TITLES.movie }));
  }
  routes[api('flaky')] = stream('flaky'); // the transient problem passed
  const actions = Object.fromEntries((await runRecovery({ engine: h.engine, health: h.health, transport: h.transport, canaries: { movie: [TITLES.movie] } })).map((a) => [a.provider, a]));
  assert.equal(actions.fine.action, 'healthy');
  assert.equal(actions.blocked.action, 'blocked-here');
  assert.match(actions.blocked.detail, /other runtimes are unaffected/);
  assert.equal(actions.changed.action, 'needs-update');
  assert.equal(actions.changed.cause?.code, 'STRUCTURE_CHANGED');
  assert.equal(actions.flaky.action, 'restored');
  assert.equal(actions.dead.action, 'no-working-domain');
  assert.equal(h.health.status('changed', 'server'), 'needs-update', 'still flagged');
  assert.equal(h.health.status('blocked', 'server'), 'benched', 'still resting here');
});

test('canary runs feed the health store', async () => {
  const h = createHarness({ providers: [simple('up'), simple('down')], domains: { up: domainsFor('up', { site: site('up') }), down: domainsFor('down', { site: site('down') }) }, routes: { [api('up')]: stream('up'), 'https://up.example.com/api/tv/1396': stream('up') } });
  const results = await runCanary(h.engine, { movie: [TITLES.movie], tv: [TITLES.episode] });
  assert.deepEqual(results.map((r) => [r.provider, r.passed, r.runs.length]), [['up', true, 2], ['down', false, 2]]);
  assert.equal(h.health.get('up', 'server')!.ok, 2);
  assert.equal(h.health.get('down', 'server')!.failed, 2);
});

// ---------- the contract every provider must meet ----------

test('contract check passes for a well-behaved provider and names the problems of a sloppy one', async () => {
  const good = await checkContract(simple('good'), { media: TITLES.movie, domains: domainsFor('good', { site: site('good') }), routes: { [api('good')]: stream('good') } });
  assert.deepEqual(good, []);

  const sloppy = defineProvider({
    manifest: base('sloppy', { output: { types: ['mp4'] } }),
    async getSources(_m, ctx) {
      try {
        await ctx.fetch(ctx.url('site', '/x'));
      } catch {
        return { streams: [] }; // swallows every failure as "nothing found"
      }
      return { streams: [{ url: 'https://cdn.sloppy.example.net/a.m3u8', type: 'hls' }] };
    },
  });
  const problems = (await checkContract(sloppy, { media: TITLES.movie, domains: domainsFor('sloppy', { site: site('sloppy') }), routes: { 'sloppy.example.com': { body: 'ok' } } })).join('\n');
  assert.match(problems, /returned a hls stream but the manifest only declares mp4/);
  assert.match(problems, /unreachable site: expected a network failure, got empty/);
  assert.match(problems, /bot check: expected CHALLENGE/);
});

test('defineProvider refuses a malformed manifest at load time', () => {
  assert.throws(() => defineProvider({ manifest: base('Bad Id'), getSources: async () => ({ streams: [] }) }), /Invalid provider manifest/);
  assert.throws(() => defineProvider({ manifest: base('x1', { domainRoles: [], extraHosts: [] }), getSources: async () => ({ streams: [] }) }), /declares no hosts/);
  assert.throws(() => simple('ok-id').manifest.id.toUpperCase() && Object.assign(simple('frozen').manifest, { id: 'changed' }), TypeError);
  assert.throws(() => new ProviderError('NOT_FOUND') && defineProvider({ manifest: base('nofn') } as never), /no getSources/);
});
