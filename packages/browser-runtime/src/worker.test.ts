/**
 * The browser worker against a local fixture site, in a real headless Chromium.
 *
 * The fixture hosts (*.fixture.example) are resolved to this machine by the egress guard's injected
 * lookup, so they look like public sites to the policy while everything stays local. These tests prove the
 * runtime's behaviour (rendering, capture, policy, limits, sessions, health). They say nothing
 * about any real site.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { defineProvider, defineRuleProvider, describeRuntime, DomainResolver, Engine, fetchTransport, HealthStore, isPublicHost, NotFoundError, PolicyGuard, ProviderError, type BrowserRun, type DomainConfig, type ProviderAuth, type ProviderManifest, type RequestTrace, type RulePack } from '@charcoal/provider-sdk';
import { BrowserWorker, cookiesToKeep, memorySessionStore, readSuppliedSession, type StoredCookie } from './index.js';

let server: http.Server;
let port = 0;
const hits = new Map<string, number>();
const seenCookies: string[] = [];
const site = () => `http://site.fixture.example:${port}`;
const embed = () => `http://embed.fixture.example:${port}`;
const other = () => `http://other.fixture.example:${port}`;

const PAGES: Record<string, (req: http.IncomingMessage) => { status?: number; type?: string; headers?: Record<string, string>; body: string } | undefined> = {
  // Content that exists only after the page's script ran, and a playlist the script asks for.
  '/watch/27205': () => ({
    body: `<!doctype html><title>Fixture</title><div id="app"></div><script>
      setTimeout(async () => {
        const info = await (await fetch('/api/title/27205')).json();
        document.getElementById('app').innerHTML = '<h1 id="title">' + info.title + '</h1><div id="player" data-ready="1"></div>';
        window.playerState = { file: info.file, tracks: [{ lang: 'en' }] };
        fetch(info.file); fetch('/media/captions.en.vtt');
      }, 150);
    </script>`,
  }),
  '/api/title/27205': () => ({ type: 'application/json', body: JSON.stringify({ title: 'Inception', file: '/media/master.m3u8' }) }),
  '/media/master.m3u8': () => ({ type: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\n1080/index.m3u8\n' }),
  '/media/captions.en.vtt': () => ({ type: 'text/vtt', body: 'WEBVTT\n' }),
  '/media/film.mp4': () => ({ type: 'video/mp4', body: 'x'.repeat(4096) }),
  '/media/seg0.ts': () => ({ type: 'video/mp2t', body: 'G'.repeat(4096) }),
  // A page whose player lives in a frame on another host and needs a click to start.
  '/embedded/27205': () => ({ body: `<!doctype html><h1>Embedded</h1><iframe id="frame" src="${embed()}/player/27205" width="640" height="360"></iframe>` }),
  '/player/27205': () => ({
    body: `<!doctype html><button id="play" style="width:200px;height:80px">Play</button><video id="v"></video><script>
      document.getElementById('play').addEventListener('click', () => { window.open('${other()}/ad'); fetch('/media/film.mp4'); fetch('/media/seg0.ts'); fetch('/stream/playlist'); });
    </script>`,
  }),
  // A playlist with no telling extension: only its content type says what it is.
  '/stream/playlist': () => ({ type: 'application/x-mpegURL', body: '#EXTM3U\n' }),
  '/ad': () => ({ body: '<h1>ad</h1>' }),
  // What a page must never reach.
  '/internal': () => ({ body: 'secret' }),
  '/ssrf': () => ({ body: `<!doctype html><div id="done"></div><script>
      Promise.allSettled([fetch('http://127.0.0.1:${port}/internal'), fetch('http://localhost:${port}/internal'), fetch('http://169.254.169.254/latest/meta-data/'), fetch('http://10.0.0.5/admin')]).then((r) => { document.getElementById('done').textContent = r.map((x) => x.status).join(','); });
    </script>` }),
  '/moved': () => ({ status: 302, headers: { location: `${other()}/landing` }, body: '' }),
  // Redirects are how a page would try to slip past request interception.
  '/hop-internal': () => ({ status: 302, headers: { location: `http://127.0.0.1:${port}/internal` }, body: '' }),
  '/hop-rebind': () => ({ status: 302, headers: { location: `http://rebind.fixture.example:${port}/internal` }, body: '' }),
  '/ssrf-redirect': () => ({ body: `<!doctype html><div id="done"></div><script>
      Promise.allSettled([fetch('/hop-internal'), fetch('/hop-rebind')]).then((r) => { document.getElementById('done').textContent = r.map((x) => x.status === 'fulfilled' ? x.value.status : x.status).join(','); });
    </script>` }),
  '/landing': () => ({ body: '<h1>new home</h1>' }),
  '/challenge': () => ({ status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>' }),
  '/widget': () => ({ body: '<!doctype html><h1>Verify you are human</h1><div class="g-recaptcha"></div>' }),
  '/hang': () => undefined,
  '/missing': () => ({ status: 404, body: 'Not found' }),
  '/chatty': () => ({ body: `<!doctype html><div id="n">0</div><script>
      (async () => { let ok = 0; for (let i = 0; i < 40; i++) { try { await fetch('/api/ping?' + i); ok++; } catch {} } document.getElementById('n').textContent = String(ok); document.body.dataset.done = '1'; })();
    </script>` }),
  '/api/ping': () => ({ type: 'application/json', body: '{}' }),
  // Sessions: the site sets a visitor cookie and shows whether it got one back.
  '/session': (req) => ({ headers: { 'set-cookie': 'visitor=v1; Path=/; Max-Age=3600' }, body: `<!doctype html><div id="cookie">${(req.headers.cookie ?? 'none').replace(/[<>]/g, '')}</div>` }),
  // An account area: signed-out visitors are sent to /login.
  '/account/library': (req) => (/(^|; )sid=good(;|$)/.test(req.headers.cookie ?? '') ? { body: '<!doctype html><div id="library">Your library</div>' } : { status: 302, headers: { location: '/login?next=/account/library' }, body: '' }),
  '/login': () => ({ body: '<!doctype html><form id="login-form"><input name="user"></form>' }),
};

before(async () => {
  server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    hits.set(`${req.headers.host?.split(':')[0]}${path}`, (hits.get(`${req.headers.host?.split(':')[0]}${path}`) ?? 0) + 1);
    if (path === '/session') seenCookies.push(req.headers.cookie ?? '');
    const page = PAGES[path]?.(req);
    if (!PAGES[path]) return void res.writeHead(404).end('not found');
    if (!page) return; // never answers
    res.writeHead(page.status ?? 200, { 'content-type': page.type ?? 'text/html; charset=utf-8', 'access-control-allow-origin': '*', ...(page.headers ?? {}) });
    res.end(page.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

const workers: BrowserWorker[] = [];
const makeWorker = (extra: ConstructorParameters<typeof BrowserWorker>[0] = {}) => {
  // The fixture names resolve to this machine and count as public sites; everything else is judged as usual.
  const w = new BrowserWorker({
    proxy: '',
    navigationTimeoutMs: 4000,
    egress: {
      lookup: async (host) => {
        if (host === 'dead.fixture.example') throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
        if (host === 'rebind.fixture.example') return ['93.184.216.34', '127.0.0.1'];
        return host.endsWith('.fixture.example') ? ['127.0.0.1'] : [];
      },
      allowAddress: (address, host) => (host.endsWith('.fixture.example') && host !== 'rebind.fixture.example' ? address === '127.0.0.1' : isPublicHost(address)),
    },
    ...extra,
  });
  workers.push(w);
  return w;
};
let shared: BrowserWorker;
before(() => void (shared = makeWorker()));
after(async () => {
  await Promise.all(workers.map((w) => w.close()));
  await new Promise((r) => server.close(r));
});

function makeRun(o: { id?: string; allow?: string[]; settings?: Record<string, unknown>; auth?: ProviderAuth; follow?: boolean } = {}) {
  const id = o.id ?? 'fixture';
  const config: DomainConfig = { provider: id, version: 1, updatedAt: '2026-01-01T00:00:00.000Z', roles: { site: { active: site() } } };
  const ctrl = new AbortController();
  const trace: RequestTrace[] = [];
  const logs: string[] = [];
  const run: BrowserRun = {
    providerId: id,
    guard: new PolicyGuard({ allow: o.allow ?? ['site.fixture.example'], followDiscovered: o.follow ?? true, maxRequests: 40, maxBodyChars: 1e6 }),
    domains: new DomainResolver(config),
    signal: ctrl.signal,
    trace,
    settings: o.settings ?? {},
    auth: o.auth,
    budgetMs: 15_000,
    log: (event) => logs.push(event),
  };
  return { run, ctrl, trace, logs };
}
const failure = async (p: Promise<unknown>): Promise<ProviderError> => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ProviderError, `expected a ProviderError, got ${e}`);
    return e;
  }
  assert.fail('expected a failure');
};

test('renders a page whose content only exists after its script ran, and reports what the page asked for', async () => {
  const { run, trace } = makeRun();
  const s = shared.session(run);
  try {
    const page = await s.open(`${site()}/watch/27205`, { waitFor: { selector: '#player[data-ready]' } });
    assert.equal(page.status, 200);
    assert.deepEqual(await page.select('#title'), ['Inception']);
    assert.match(await page.html(), /<h1 id="title">Inception<\/h1>/);
    assert.deepEqual(await page.evaluate('window.playerState'), { file: '/media/master.m3u8', tracks: [{ lang: 'en' }] });
    await page.waitFor({ media: true });
    const media = page.media();
    const playlist = media.find((m) => m.type === 'hls');
    assert.equal(playlist?.url, `${site()}/media/master.m3u8`);
    assert.equal(playlist?.headers.Referer, `${site()}/watch/27205`);
    assert.ok(media.some((m) => m.type === 'captions'));
    assert.deepEqual(trace.map((t) => [t.host, t.path, t.status, t.outcome]), [['site.fixture.example', '/watch/27205', 200, 'ok']]);
  } finally {
    await s.dispose();
  }
});

test('finds a player embedded in a frame on another host, clicks it, and never downloads video', async () => {
  for (const k of [...hits.keys()]) if (k.includes('/media/')) hits.delete(k);
  const { run } = makeRun();
  const s = shared.session(run);
  try {
    const page = await s.open(`${site()}/embedded/27205`);
    assert.deepEqual(page.frames().map((f) => new URL(f.url).hostname).sort(), ['embed.fixture.example', 'site.fixture.example']);
    await page.click('#play', { frames: true });
    await page.waitFor({ media: true });
    await page.waitFor({ ms: 300 });
    const media = page.media();
    const file = media.find((m) => m.type === 'mp4');
    assert.equal(file?.url, `${embed()}/media/film.mp4`);
    assert.equal(file?.frameUrl, `${embed()}/player/27205`);
    assert.ok(media.some((m) => m.type === 'hls' && m.url.endsWith('/stream/playlist')), 'a playlist recognised by its content type');
    // The file and the segment were noted and cancelled before they reached the site.
    assert.equal(hits.get('embed.fixture.example/media/film.mp4') ?? 0, 0);
    assert.equal(hits.get('embed.fixture.example/media/seg0.ts') ?? 0, 0);
  } finally {
    await s.dispose();
  }
});

test('a page cannot reach private or internal addresses, whatever its script asks for', async () => {
  hits.delete('127.0.0.1/internal');
  hits.delete('localhost/internal');
  const before = shared.health().policyBlocks;
  const { run } = makeRun();
  const s = shared.session(run);
  try {
    const page = await s.open(`${site()}/ssrf`);
    await page.waitFor({ selector: '#done:not(:empty)' });
    assert.deepEqual(await page.select('#done'), ['rejected,rejected,rejected,rejected']);
    assert.equal(hits.get('127.0.0.1/internal') ?? 0, 0);
    assert.equal(hits.get('localhost/internal') ?? 0, 0);
    assert.ok(shared.health().policyBlocks >= before + 4);
  } finally {
    await s.dispose();
  }
});

test('redirects cannot carry a page to a private address either: the egress guard refuses the connection', async () => {
  hits.delete('127.0.0.1/internal');
  hits.delete('rebind.fixture.example/internal');
  const before = shared.health().policyBlocks;
  const a = makeRun();
  const s = shared.session(a.run);
  try {
    // From a script: one redirect to a loopback address, one to a name that also resolves to one.
    const page = await s.open(`${site()}/ssrf-redirect`);
    await page.waitFor({ selector: '#done:not(:empty)' });
    const outcome = (await page.select('#done'))[0];
    assert.ok(!outcome.includes('200'), `neither redirect reached the internal page (${outcome})`);
    // As the page's own navigation.
    const direct = await failure(s.open(`${site()}/hop-internal`));
    assert.ok(['POLICY', 'REDIRECTED', 'CONNECT', 'NETWORK'].includes(direct.code), direct.code);
    assert.equal(hits.get('127.0.0.1/internal') ?? 0, 0);
    assert.equal(hits.get('rebind.fixture.example/internal') ?? 0, 0);
    assert.ok(shared.health().policyBlocks >= before + 3);
  } finally {
    await s.dispose();
  }
});

test('the page itself only navigates where the provider policy allows; a moved site is REDIRECTED', async () => {
  const a = makeRun({ follow: false });
  const s1 = shared.session(a.run);
  try {
    assert.equal((await failure(s1.open(`${other()}/landing`))).code, 'POLICY');
  } finally {
    await s1.dispose();
  }

  const b = makeRun({ follow: false });
  const s2 = shared.session(b.run);
  try {
    const moved = await failure(s2.open(`${site()}/moved`));
    assert.equal(moved.code, 'REDIRECTED');
    assert.equal(moved.detail.redirectedTo, 'other.fixture.example');
    assert.equal(b.trace.at(-1)?.outcome, 'REDIRECTED');
  } finally {
    await s2.dispose();
  }

  // With discovery on, a redirect to a host the page never named is still refused.
  const d = makeRun();
  const s4 = shared.session(d.run);
  try {
    assert.equal((await failure(s4.open(`${site()}/moved`))).code, 'REDIRECTED');
  } finally {
    await s4.dispose();
  }

  // A DNS-level check supplied by the runtime is honoured too.
  const strict = makeWorker({ resolveCheck: async (h) => h !== 'site.fixture.example' });
  const c = makeRun();
  const s3 = strict.session(c.run);
  try {
    assert.ok(['POLICY', 'CONNECT', 'NETWORK'].includes((await failure(s3.open(`${site()}/watch/27205`))).code));
  } finally {
    await s3.dispose();
  }
});

test('a bot check is reported as CHALLENGE at once and nothing tries to pass it', async () => {
  const before = shared.health().challenges;
  const a = makeRun();
  const s1 = shared.session(a.run);
  const started = Date.now();
  const e = await failure(s1.open(`${site()}/challenge`));
  assert.equal(e.code, 'CHALLENGE');
  assert.ok(Date.now() - started < 3000, 'reported without waiting');
  assert.equal(a.trace.at(-1)?.outcome, 'CHALLENGE');
  await s1.dispose();

  // A human-verification widget explains content that never appears.
  const b = makeRun();
  const s2 = shared.session(b.run);
  const page = await s2.open(`${site()}/widget`);
  assert.equal((await failure(page.waitFor({ selector: '#player' }, 600))).code, 'CHALLENGE');
  await s2.dispose();
  assert.equal(shared.health().challenges, before + 2);
});

test('failures are told apart: DNS, a site that never answers, a missing selector, a 404', async () => {
  const a = makeRun({ allow: ['dead.fixture.example', 'site.fixture.example'] });
  const s = shared.session(a.run);
  try {
    assert.equal((await failure(s.open(`http://dead.fixture.example:${port}/`))).code, 'DNS');
    assert.equal((await failure(s.open(`${site()}/hang`, { timeoutMs: 700 }))).code, 'TIMEOUT');
    const page = await s.open(`${site()}/missing`);
    assert.equal(page.status, 404);
    assert.equal(a.trace.at(-1)?.outcome, 'NOT_FOUND');
    assert.equal((await failure(page.waitFor({ selector: '#never' }, 300))).code, 'SELECTOR_MISSING');
  } finally {
    await s.dispose();
  }
});

test('limits: pages per run, requests per run, and cancellation', async () => {
  const tight = makeWorker({ maxPagesPerSession: 1, maxRequestsPerSession: 12 });
  const a = makeRun();
  const s1 = tight.session(a.run);
  const page = await s1.open(`${site()}/chatty`);
  await page.waitFor({ selector: 'body[data-done]' });
  // 40 requests were attempted; the budget (12, including the page itself) let only some through.
  const ok = Number((await page.select('#n'))[0]);
  assert.ok(ok > 0 && ok <= 11, `${ok} requests got through`);
  assert.equal((await failure(s1.open(`${site()}/watch/27205`))).code, 'POLICY');
  await s1.dispose();

  const b = makeRun();
  const s2 = tight.session(b.run);
  const pending = failure(s2.open(`${site()}/hang`, { timeoutMs: 10_000 }));
  setTimeout(() => b.ctrl.abort(), 200);
  assert.equal((await pending).code, 'CANCELLED');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(tight.health().sessionsOpen, 0);
});

test('concurrency: sessions beyond the limit queue, and a full or slow queue is RATE_LIMITED', async () => {
  const w = makeWorker({ maxSessions: 1, maxQueue: 1, queueTimeoutMs: 400 });
  const first = w.session(makeRun().run);
  await first.open(`${site()}/session`);
  assert.equal(w.health().state, 'busy');
  const second = w.session(makeRun().run);
  const third = w.session(makeRun().run);
  const waiting = second.open(`${site()}/session`);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(w.health().queued, 1);
  assert.equal((await failure(third.open(`${site()}/session`))).code, 'RATE_LIMITED'); // the queue is full
  await first.dispose(); // frees the slot for the one that was waiting
  const page = await waiting;
  assert.equal(page.status, 200);
  await second.dispose();
  await third.dispose();
  assert.equal(w.health().sessionsOpen, 0);
  assert.equal(w.health().sessionsServed, 2);
});

test('cookie lifecycle: kept per provider between runs, never shared, expired in time', async () => {
  let clock = Date.now();
  const store = memorySessionStore();
  const w = makeWorker({ sessions: store, now: () => clock });
  const visit = async (id: string) => {
    const s = w.session(makeRun({ id }).run);
    const page = await s.open(`${site()}/session`);
    const shown = (await page.select('#cookie'))[0];
    await s.dispose();
    return shown;
  };
  assert.equal(await visit('alpha'), 'none');
  assert.equal(await visit('alpha'), 'visitor=v1', 'the second run of the same provider is the same visitor');
  assert.equal(await visit('beta'), 'none', 'another provider has its own jar');
  assert.equal(store.load('alpha').length, 1);
  clock += 2 * 3600_000; // past the cookie's lifetime
  assert.equal(await visit('alpha'), 'none');

  // What is kept is bounded: only the provider's own hosts, with a capped lifetime.
  const now = Date.now();
  const cookies: StoredCookie[] = [
    { name: 'a', value: '1', domain: 'site.fixture.example', path: '/', expires: -1 },
    { name: 'b', value: '2', domain: '.tracker.example', path: '/', expires: now / 1000 + 86_400 },
    { name: 'c', value: '3', domain: '.fixture.example', path: '/', expires: now / 1000 + 365 * 86_400 },
    { name: 'd', value: '4', domain: 'site.fixture.example', path: '/', expires: now / 1000 - 10 },
  ];
  const kept = cookiesToKeep(cookies, ['site.fixture.example'], now);
  assert.deepEqual(kept.map((c) => c.name), ['a', 'c']);
  assert.ok(kept[0].expires > now / 1000 && kept[0].expires <= now / 1000 + 2 * 3600 + 1);
  assert.ok(kept[1].expires <= now / 1000 + 7 * 86_400 + 1);
});

test('a viewer’s own session: used when supplied, never stored; signed-out and expired sessions are AUTH_REQUIRED', async () => {
  const store = memorySessionStore();
  const w = makeWorker({ sessions: store });
  const auth: ProviderAuth = { setting: 'fixtureSession', loginUrl: '/login' };
  const good = [{ name: 'sid', value: 'good', domain: 'site.fixture.example', path: '/', expires: Date.now() / 1000 + 3600 }];

  const a = makeRun({ auth, settings: { fixtureSession: good } });
  const s1 = w.session(a.run);
  const page = await s1.open(`${site()}/account/library`);
  assert.deepEqual(await page.select('#library'), ['Your library']);
  await s1.dispose();
  assert.deepEqual(store.load('fixture'), [], 'an account session is never written to the store');

  const b = makeRun({ auth });
  const s2 = w.session(b.run);
  const signedOut = await failure(s2.open(`${site()}/account/library`));
  assert.equal(signedOut.code, 'AUTH_REQUIRED');
  assert.equal(b.trace.at(-1)?.outcome, 'AUTH_REQUIRED');
  await s2.dispose();

  // The site no longer accepts the session (it redirects to the login page).
  const c = makeRun({ auth, settings: { fixtureSession: [{ ...good[0], value: 'revoked' }] } });
  const s3 = w.session(c.run);
  assert.match((await failure(s3.open(`${site()}/account/library`))).message, /no longer accepted/);
  await s3.dispose();

  // Expired by its own dates: reported before any page is opened.
  const d = makeRun({ auth, settings: { fixtureSession: JSON.stringify({ cookies: [{ ...good[0], expires: Date.now() / 1000 - 60 }] }) } });
  const s4 = w.session(d.run);
  const expired = await failure(s4.open(`${site()}/account/library`));
  assert.equal(expired.code, 'AUTH_REQUIRED');
  assert.match(expired.message, /expired/);
  assert.equal(d.trace.length, 0);
  await s4.dispose();

  assert.equal(readSuppliedSession('not json', Date.now()), undefined);
  assert.equal(readSuppliedSession({ cookies: [] }, Date.now()), undefined);
});

test('health: a probe, crash counting, automatic relaunch, and a cool-off after repeated crashes', async () => {
  let clock = 1_800_000_000_000;
  const w = makeWorker({ maxCrashes: 2, crashWindowMs: 60_000, coolOffMs: 30_000, now: () => clock });
  assert.equal(w.health().state, 'stopped');
  assert.equal((await w.probe()).ok, true);
  assert.equal(w.health().state, 'ready');
  assert.match(w.health().browserVersion ?? '', /^\d+\./);

  const crash = async () => {
    const internal = (w as unknown as { browser?: { close(): Promise<void> } }).browser!;
    await internal.close(); // from the worker's point of view: the process went away by itself
    await new Promise((r) => setTimeout(r, 50));
  };
  await crash();
  assert.equal(w.health().crashes, 1);
  assert.equal(w.health().state, 'stopped');
  // The next use simply starts a new browser.
  const s = w.session(makeRun().run);
  assert.equal((await s.open(`${site()}/session`)).status, 200);
  await s.dispose();
  assert.equal(w.health().launches, 2);

  await crash();
  assert.equal(w.health().crashes, 2);
  assert.equal(w.health().state, 'down');
  const refused = w.session(makeRun().run);
  assert.equal((await failure(refused.open(`${site()}/session`))).code, 'UNSUPPORTED_RUNTIME');
  await refused.dispose();
  assert.equal((await w.probe()).ok, false);
  clock += 31_000;
  assert.equal((await w.probe()).ok, true);
  assert.equal(w.health().state, 'ready');
});

// ---------- through the engine ----------

const DOMAINS = (id: string): DomainConfig => ({ provider: id, version: 1, updatedAt: '2026-01-01T00:00:00.000Z', roles: { site: { active: site() } } });

test('engine: a provider that needs a browser is planned only where there is one, and runs under its policy', async () => {
  const rendered = defineProvider({
    manifest: { id: 'rendered', name: 'Rendered', version: '1.0.0', kinds: ['movie'], lookup: ['tmdb'], runtimes: ['server'], requires: { features: ['js-render'] }, domainRoles: ['site'], followDiscovered: true, output: { types: ['hls'] } },
    async getSources(media, { browser, url }) {
      if (!browser) throw new ProviderError('UNSUPPORTED_RUNTIME');
      const page = await browser.open(url('site', `/watch/${media.ids.tmdb}`), { waitFor: { media: true } });
      const found = page.media().filter((m) => m.type === 'hls');
      if (!found.length) throw new NotFoundError();
      return { streams: found.map((m) => ({ url: m.url, type: 'hls' as const, headers: m.headers })) };
    },
  });
  const media = { kind: 'movie' as const, ids: { tmdb: '27205' }, title: 'Inception' };
  const providers = [{ module: rendered, stage: 'stable' as const, domains: DOMAINS('rendered') }];

  const plain = new Engine({ providers, runtime: describeRuntime('server'), transport: fetchTransport, health: new HealthStore() });
  const plan = plain.plan({ media });
  assert.equal(plan.run.length, 0);
  assert.match(plan.skipped[0].reason, /js-render/);

  const withBrowser = new Engine({ providers, runtime: { ...describeRuntime('server'), features: [...describeRuntime('server').features, 'js-render'] }, transport: fetchTransport, health: new HealthStore(), browser: shared });
  const r = await withBrowser.runProvider(providers[0], media);
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams[0].url, `${site()}/media/master.m3u8`);
  assert.equal(r.streams[0].headers.Referer, `${site()}/watch/27205`);
  assert.equal(r.requests, 1, 'the navigation is in the request trace');
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(shared.health().sessionsOpen, 0, 'the session ended with the run');

  // The same provider against a bot check: diagnosed like any other run.
  const challenged = defineProvider({ ...rendered, manifest: { ...rendered.manifest, id: 'challenged' }, getSources: async (_m, { browser, url }) => (await browser!.open(url('site', '/challenge')), { streams: [] }) });
  const c = await withBrowser.runProvider({ module: challenged, stage: 'stable', domains: DOMAINS('challenged') }, media);
  assert.equal(c.outcome, 'error');
  assert.equal(c.code, 'CHALLENGE');
});

test('engine: a rule pack can render a page and emit what it asked for, with no code', async () => {
  const manifest: ProviderManifest = { id: 'render-rules', name: 'Render rules', version: '1.0.0', contract: 2, kinds: ['movie'], lookup: ['tmdb'], runtimes: ['server'], requires: { features: ['js-render'] }, domainRoles: ['site'], followDiscovered: true, output: { types: ['hls'] } };
  const rules: RulePack = {
    schema: 1,
    id: 'render-rules',
    version: '1.0.0',
    steps: [
      { render: '{{domain.site}}/watch/{{media.ids.tmdb}}', as: 'page', waitFor: 'media', capture: 'found', captureCaptions: 'subs' },
      { extract: 'css', from: 'page', expr: '#title', as: 'title', required: true },
    ],
    emit: [{ each: 'found', url: '{{item}}', type: 'auto', note: '{{title}}' }],
    captions: [{ each: 'subs', url: '{{item}}', label: 'English', lang: 'en' }],
  };
  const module = defineRuleProvider(manifest, rules);
  const engine = new Engine({ providers: [{ module, stage: 'stable', domains: DOMAINS('render-rules') }], runtime: { ...describeRuntime('server'), features: [...describeRuntime('server').features, 'js-render'] }, transport: fetchTransport, health: new HealthStore(), browser: shared });
  const r = await engine.runProvider(engine.providers()[0], { kind: 'movie', ids: { tmdb: '27205' }, title: 'Inception' });
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams[0].url, `${site()}/media/master.m3u8`);
  assert.equal(r.streams[0].note, 'Inception');
  assert.equal(r.streams[0].headers.Referer, `${site()}/watch/27205`);
  assert.equal(r.captions.length, 1);
  // Without the feature in the manifest, the pack is refused before it can run; so is a reserved variable name.
  assert.throws(() => defineRuleProvider({ ...manifest, requires: {} }, rules), /js-render/);
  assert.throws(() => defineRuleProvider(manifest, { ...rules, steps: [{ render: '{{domain.site}}/x', as: 'page', capture: 'media' }] }), /reserved/);
});
