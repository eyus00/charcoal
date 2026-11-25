/**
 * The provider pack against synthetic fixtures: responses written for these tests in the shape
 * each provider expects (no captured third-party content, no network). They prove the extraction
 * logic, the domain separation and the failure classification; they do NOT prove that the live
 * sites still answer this way. That is what the canary is for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRuntime, validateDomainConfig, validateManifest, validateRulePack } from '@charcoal/provider-sdk';
import { checkContract, createHarness, simulate, TITLES, type MockRoute } from '@charcoal/provider-sdk/testing';
import { castle, cinesuManifest, cinesuRules, CODE_PROVIDERS, DEFAULT_DOMAINS, febbox, loadCorePack, loadFallbackProviders, loadPack, RULE_PROVIDERS, vixsrc } from './index.js';

const extension = describeRuntime('extension');
const one = (id: string) => loadCorePack().filter((p) => p.module.manifest.id === id);

test('every provider in the pack has a valid manifest and a domain config for each role it uses', () => {
  for (const { module } of CODE_PROVIDERS) {
    assert.deepEqual(validateManifest(module.manifest), [], module.manifest.id);
    assert.deepEqual(validateDomainConfig(DEFAULT_DOMAINS[module.manifest.id], module.manifest.domainRoles), [], module.manifest.id);
  }
  for (const { manifest, rules } of RULE_PROVIDERS) {
    assert.deepEqual(validateManifest(manifest), [], manifest.id);
    assert.deepEqual(validateRulePack(rules, manifest), [], manifest.id);
    assert.deepEqual(validateDomainConfig(DEFAULT_DOMAINS[manifest.id], manifest.domainRoles), [], manifest.id);
  }
  assert.deepEqual(loadCorePack().filter((p) => p.stage === 'stable').map((p) => p.module.manifest.id), ['febbox', 'castle', 'vixsrc', 'vidrock', 'popr', 'fsharetv', 'streammafia', 'anime-animotvslash', 'anime-shonen', 'anime-zokoanime', 'anime-animeheaven', 'icefy', 'vidlink']);
  assert.deepEqual(loadCorePack().filter((p) => p.stage === 'canary').map((p) => p.module.manifest.id), ['vidsrc', 'videasy', 'vidzee', 'vidnest', 'tulnex', 'peachify', 'anime-megavid', 'cinesu']);
});

test('the vendored fallback pack loads as open-network providers with valid manifests', async () => {
  const fallback = await loadFallbackProviders();
  assert.ok(fallback.length >= 10, `${fallback.length} fallback providers`);
  for (const m of fallback) {
    assert.deepEqual(validateManifest(m.manifest), [], m.manifest.id);
    assert.equal(m.manifest.network, 'open');
    assert.match(m.manifest.id, /^sv-/);
  }
  assert.ok(fallback.some((m) => m.manifest.id === 'sv-lookmovie'));
  assert.equal((await loadPack({ fallback: true })).length, loadCorePack().length + fallback.length);
});

// ---------- VixSrc ----------

const VIX = 'https://vixsrc.to';
const future = Math.floor(Date.now() / 1000) + 3600;
const vixRoutes = (page: string): Record<string, MockRoute> => ({
  [`${VIX}/api/movie/27205`]: { body: { src: '/embed/8842' } },
  [`${VIX}/embed/8842`]: simulate.html(page),
  [`${VIX}/playlist/8842`]: simulate.playlist([1080, 720]),
});
const vixPage = `<script>window.masterPlaylist = { params: { 'token': 'tok_123', 'expires': '${future}' }, url: '${VIX}/playlist/8842' };</script>`;

test('VixSrc: token, expiry and playlist come out of the embed page; the link is marked as expiring and address-bound', async () => {
  // VixSrc reads the real clock for its token check, so the harness clock follows it here.
  const h = createHarness({ providers: one('vixsrc'), routes: vixRoutes(vixPage), runtime: extension, startAt: Date.now() });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  const s = r.streams[0];
  assert.equal(s.url, `${VIX}/playlist/8842?token=tok_123&expires=${future}&h=1`);
  assert.deepEqual([s.type, s.quality, s.expiresAt, s.ipBound, s.headers.Referer, s.headers.Origin], ['hls', '1080', future * 1000, true, `${VIX}/api/movie/27205`, VIX]);
  // Every request carried the configured origin as Referer/Origin: nothing in the code names the host.
  assert.ok(h.transport.calls.every((c) => c.url.origin === VIX && c.headers.Origin === VIX));
});

test('VixSrc: only planned where the viewer’s own connection is used; its failures are told apart', async () => {
  const server = createHarness({ providers: one('vixsrc'), routes: vixRoutes(vixPage) });
  assert.match(server.engine.plan({ media: TITLES.movie }).skipped[0].reason, /egress:user/);

  const cases: [string, Record<string, MockRoute>, string, string][] = [
    ['not on the site', { [`${VIX}/api/movie/27205`]: simulate.notFound() }, 'empty', 'NOT_FOUND'],
    ['page layout changed', vixRoutes('<script>window.player = {}</script>'), 'error', 'SELECTOR_MISSING'],
    ['token already expired', vixRoutes(vixPage.replace(String(future), '1700000000')), 'error', 'EXPIRED'],
    ['bot check', { 'vixsrc.to': simulate.challenge() }, 'error', 'CHALLENGE'],
    ['refused', { 'vixsrc.to': simulate.forbidden() }, 'error', 'ACCESS_DENIED'],
    ['playlist address returns a page', { ...vixRoutes(vixPage), [`${VIX}/playlist/8842`]: simulate.html('<html>') }, 'error', 'INVALID_RESULT'],
  ];
  for (const [name, routes, outcome, code] of cases) {
    const h = createHarness({ providers: one('vixsrc'), routes, runtime: extension, startAt: Date.now() });
    const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
    assert.deepEqual([r.outcome, r.code], [outcome, code], name);
  }
});

test('VixSrc: a domain change is a config change; the extraction code is untouched', async () => {
  const moved = loadCorePack({ vixsrc: { provider: 'vixsrc', version: 2, updatedAt: '2026-12-01T00:00:00.000Z', roles: { site: { active: 'https://vix.example.org', alternates: [VIX] } } } }).filter((p) => p.module.manifest.id === 'vixsrc');
  const NEW = 'https://vix.example.org';
  const h = createHarness({
    providers: moved,
    runtime: extension,
    startAt: Date.now(),
    routes: { [`${NEW}/api/movie/27205`]: { body: { src: '/embed/1' } }, [`${NEW}/embed/1`]: simulate.html(vixPage.replace(VIX, NEW)), [`${NEW}/playlist/8842`]: simulate.playlist([720]) },
  });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  assert.ok(h.transport.calls.every((c) => c.url.origin === NEW));
  assert.equal(r.streams[0].headers.Origin, NEW);
});

// ---------- CineSu (declarative) ----------

const CINE = 'https://cine.su';

test('CineSu rule pack: a provider that is only data finds the stream and reads its quality from the playlist', async () => {
  const h = createHarness({
    providers: one('cinesu'),
    routes: { [`${CINE}/v1/stream/master/movie/27205.m3u8`]: simulate.playlist([1080, 720, 480]), [`${CINE}/v1/stream/master/tv/1396/2/3.m3u8`]: simulate.playlist([720]) },
    engine: { includeCanary: true },
  });
  const movie = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(movie.outcome, 'ok', movie.message);
  assert.deepEqual([movie.streams[0].url, movie.streams[0].quality, movie.streams[0].audio[0].lang, movie.streams[0].headers.Referer], [`${CINE}/v1/stream/master/movie/27205.m3u8`, '1080', 'en', `${CINE}/en/watch`]);
  assert.equal(h.transport.calls[0].headers.Origin, CINE);
  const episode = await h.engine.runProvider(h.engine.providers()[0], TITLES.episode);
  assert.deepEqual([episode.outcome, episode.streams[0]?.quality], ['ok', '720']);
  // Canary stage: not part of a normal plan until promoted.
  const normal = createHarness({ providers: one('cinesu') });
  assert.equal(normal.engine.plan({ media: TITLES.movie }).skipped[0].reason, 'canary');
});

test('CineSu rule pack: a 200 that is not a playlist is a changed site, a 404 is "not here", and it passes the provider contract', async () => {
  const page = createHarness({ providers: one('cinesu'), routes: { 'cine.su': simulate.html('<html>Maintenance</html>') } });
  const changed = await page.engine.runProvider(page.engine.providers()[0], TITLES.movie);
  assert.deepEqual([changed.outcome, changed.code, changed.scope], ['error', 'SELECTOR_MISSING', 'provider']);
  const none = createHarness({ providers: one('cinesu'), routes: { 'cine.su': simulate.notFound() } });
  assert.equal((await none.engine.runProvider(none.engine.providers()[0], TITLES.movie)).outcome, 'empty');

  const loaded = one('cinesu')[0];
  assert.deepEqual(await checkContract(loaded.module, { media: TITLES.movie, domains: loaded.domains, routes: { [`${CINE}/v1/stream/master/movie/27205.m3u8`]: simulate.playlist([1080]) } }), []);
  assert.equal(cinesuRules.id, cinesuManifest.id);
});

// ---------- Castle ----------

const CASTLE = 'https://api.hlowb.com';
const SECURITY_KEY = btoa('0123456789'); // 10 bytes; the provider appends its suffix and pads to 16

/** Encrypts the way Castle's API does, so the provider's real decryption runs in the test. */
async function castleEncrypt(value: unknown): Promise<string> {
  const material = [...Uint8Array.from(atob(SECURITY_KEY), (c) => c.charCodeAt(0)), ...new TextEncoder().encode('T!BgJB')];
  const key = new Uint8Array(16);
  key.set(material.slice(0, 16));
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: key }, k, new TextEncoder().encode(JSON.stringify(value))));
  return btoa(String.fromCharCode(...cipher));
}

async function castleRoutes(video: unknown): Promise<Record<string, MockRoute>> {
  return {
    [`${CASTLE}/v0.1/system/getSecurityKey/1*`]: { body: { code: 200, data: SECURITY_KEY } },
    [`${CASTLE}/film-api/v1.1.0/movie/searchByKeyword*`]: { body: await castleEncrypt({ data: { rows: [{ id: 1, title: 'Inception: The Cobol Job' }, { id: 42, title: 'Inception' }] } }) },
    [`${CASTLE}/film-api/v1.9.9/movie*`]: { body: { data: await castleEncrypt({ data: { episodes: [{ id: 900, number: 1, tracks: [{ languageId: 1, languageName: 'OST', abbreviate: 'EN' }, { languageId: 2, languageName: 'Hindi', abbreviate: 'HI' }] }] } }) } },
    [`POST ${CASTLE}/film-api/v2.0.1/movie/getVideo2*`]: async (req) => {
      const lang = JSON.parse(req.body ?? '{}').languageId;
      return { body: await castleEncrypt({ data: typeof video === 'function' ? (video as (l: string) => unknown)(lang) : video }) };
    },
  };
}

test('Castle: the encrypted API flow works against the configured address and yields one stream per audio language', async () => {
  const routes = await castleRoutes((lang: string) => ({
    videos: [{ url: `https://cdn.castle.example/${lang}/1080/index.m3u8`, resolutionDescription: 'FHD 1080P' }, { url: `https://cdn.castle.example/${lang}/720/index.m3u8`, resolutionDescription: 'HD 720P' }],
    subtitles: lang === '1' ? [{ url: 'https://cdn.castle.example/subs/en.srt', title: 'English' }] : [],
  }));
  const h = createHarness({ providers: one('castle'), routes });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => `${s.quality}:${s.audio[0].lang}:${s.audio[0].label}`), ['1080:und:Original', '1080:hi:Hindi', '720:und:Original', '720:hi:Hindi']);
  assert.deepEqual(r.captions.map((c) => [c.label, c.format, c.lang]), [['English', 'srt', 'en']]);
  assert.ok(h.transport.calls.every((c) => c.url.origin === CASTLE && c.headers.Referer === CASTLE), 'only the configured api origin was contacted');
  assert.ok(h.transport.calls.some((c) => c.url.searchParams.get('movieId') === '42'), 'the exact title match was chosen, not the first search row');
  assert.deepEqual(await checkContract(castle, { media: TITLES.movie, domains: DEFAULT_DOMAINS.castle, routes }), []);
});

test('Castle: no match is "not here"; an API that stops decrypting is a changed site', async () => {
  const base = await castleRoutes({ videoUrl: 'https://cdn.castle.example/x/720/index.m3u8' });
  const none = createHarness({ providers: one('castle'), routes: { ...base, [`${CASTLE}/film-api/v1.1.0/movie/searchByKeyword*`]: { body: await castleEncrypt({ data: { rows: [{ id: 5, title: 'Something Else Entirely' }] } }) } } });
  assert.equal((await none.engine.runProvider(none.engine.providers()[0], TITLES.movie)).outcome, 'empty');
  const garbled = createHarness({ providers: one('castle'), routes: { ...base, [`${CASTLE}/film-api/v1.1.0/movie/searchByKeyword*`]: { body: 'bm90LWVuY3J5cHRlZC1hdC1hbGw=' } } });
  const r = await garbled.engine.runProvider(garbled.engine.providers()[0], TITLES.movie);
  assert.deepEqual([r.outcome, r.code, r.scope], ['error', 'STRUCTURE_CHANGED', 'provider']);
});

// ---------- Febbox ----------

const SHOWBOX = 'https://www.showbox.media';
const FEBBOX = 'https://www.febbox.com';
const febboxRoutes = (qualityList: unknown): Record<string, MockRoute> => ({
  [`${SHOWBOX}/search?keyword=Inception`]: simulate.html('<a href="/movie/m-inception-the-cobol-job-2010">x</a><a href="/movie/m-inception-2010">Inception</a><a href="/tv/t-inception-2010">no</a>'),
  [`${SHOWBOX}/movie/m-inception-2010`]: simulate.html("<script>$.ajax({ url: '/index/share_link', data: { 'id': 3041, 'type': 1 } })</script>"),
  [`${SHOWBOX}/index/share_link?id=3041&type=1`]: { body: { code: 1, data: { link: `${FEBBOX}/share/Zx9Kq2` } } },
  [`${FEBBOX}/file/file_share_list?share_key=Zx9Kq2`]: { body: { data: { file_list: [{ fid: 11, file_name: 'Inception.2010.1080p.BluRay.x264.AAC.mp4', file_size: '2.1 GB', is_dir: 0 }, { fid: 12, file_name: 'extras', is_dir: 1 }] } } },
  [`${FEBBOX}/console/video_quality_list?fid=11&share_key=Zx9Kq2`]: (req) => (req.headers.cookie === 'ui=my-token' || req.headers.Cookie === 'ui=my-token' ? { body: qualityList as object } : { body: { code: -1, msg: 'Please login', login_required: 1 } }),
  'https://cdn1.febbox.example/hls/1080/master.m3u8': { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5200000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"\nv1080/index.m3u8\n' },
  'https://cdn1.febbox.example/hls/720/master.m3u8': { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\nv720/index.m3u8\n' },
});
const QUALITIES = {
  html:
    '<div class="file_quality" data-url="https://cdn1.febbox.example/hls/1080/master.m3u8" data-quality="1080P"><p class="name">1080P</p><p class="size">2.1 GB</p></div>' +
    '<div class="file_quality" data-url="https://cdn1.febbox.example/hls/720/master.m3u8" data-quality="720P"><p class="size">1.2 GB</p></div>' +
    '<div class="file_quality" data-url="https://cdn1.febbox.example/orig/Inception.mp4?k=1&amp;t=2" data-quality="ORG"><p class="size">2.1 GB</p></div>',
};

test('Febbox: runs only where the viewer’s token is; builds one adaptive stream and offers the playable original', async () => {
  const shared = createHarness({ providers: one('febbox'), routes: febboxRoutes(QUALITIES) });
  assert.match(shared.engine.plan({ media: TITLES.movie }).skipped[0].reason, /setting:febboxToken/, 'a shared server never runs it');
  const noToken = createHarness({ providers: one('febbox'), routes: febboxRoutes(QUALITIES), runtime: extension, engine: { settings: {} } });
  assert.match(noToken.engine.plan({ media: TITLES.movie }).skipped[0].reason, /setting:febboxToken/);

  const h = createHarness({ providers: one('febbox'), routes: febboxRoutes(QUALITIES), runtime: extension, engine: { settings: { febboxToken: 'ui=my-token', febboxMaxHeight: 0 } } });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  const [adaptive, original] = r.streams;
  assert.deepEqual([adaptive.type, adaptive.quality, adaptive.levels?.map((l) => l.quality), adaptive.headers.Referer], ['hls', '1080', ['1080', '720'], `${FEBBOX}/`]);
  const playlist = atob(adaptive.url.split(',')[1]);
  assert.match(playlist, /RESOLUTION=1920x1080,CODECS="avc1\.640028,mp4a\.40\.2"\nhttps:\/\/cdn1\.febbox\.example\/hls\/1080\/v1080\/index\.m3u8/);
  assert.match(playlist, /https:\/\/cdn1\.febbox\.example\/hls\/720\/v720\/index\.m3u8/);
  assert.deepEqual([original.type, original.quality, original.url, original.size], ['mp4', 'original', 'https://cdn1.febbox.example/orig/Inception.mp4?k=1&t=2', 2_100_000_000]);
  // The token went to febbox.com only.
  const withCookie = h.transport.calls.filter((c) => c.headers.Cookie || c.headers.cookie);
  assert.deepEqual([...new Set(withCookie.map((c) => c.url.hostname))], ['www.febbox.com']);

  // A data-saver cap drops the higher quality.
  const capped = createHarness({ providers: one('febbox'), routes: febboxRoutes(QUALITIES), runtime: extension, engine: { settings: { febboxToken: 'my-token', febboxMaxHeight: 720 } } });
  assert.equal((await capped.engine.runProvider(capped.engine.providers()[0], TITLES.movie)).streams[0].quality, '720');
});

test('Febbox: a rejected token is the viewer’s matter (AUTH_REQUIRED), never counted against the provider', async () => {
  const h = createHarness({ providers: one('febbox'), routes: febboxRoutes(QUALITIES), runtime: extension, engine: { settings: { febboxToken: 'stale-token' } } });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.deepEqual([r.outcome, r.code, r.scope], ['error', 'AUTH_REQUIRED', 'user']);
  assert.equal(h.health.get('febbox', 'extension'), undefined);
  assert.equal(febbox.manifest.config?.febboxToken.secret, true);
  assert.deepEqual(vixsrc.manifest.requires, { features: ['forbidden-headers'], egress: 'user' });
});
