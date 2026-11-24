/**
 * End-to-end smoke test of source discovery and playback hand-off, in a real (headless) browser.
 *
 * Nothing outside this machine is contacted: TMDB is answered from canned JSON, the resolver API
 * is a small local server speaking /v2, and the "streams" are a generated test clip served
 * locally. It checks what unit tests can't: that the built site really starts playing from the
 * first result while providers are still answering, falls back to an embed at once when nothing
 * is found or the resolver is down, and runs providers in the page when a bridge is present.
 *
 *   npm run build --workspace apps/web   (with VITE_JELLY_URL=http://localhost:18181)
 *   node apps/web/e2e/smoke.mjs
 *
 * Needs `playwright` (with a Chromium) and `ffmpeg` on the machine; it is not part of `npm test`.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Resolved the CommonJS way so a globally installed Playwright (NODE_PATH) is found too.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const API = 18181;
const SITE = 18182;
const base = `http://localhost:${API}`;
if (!existsSync(join(dist, 'index.html'))) throw new Error('Build the site first: VITE_JELLY_URL=http://localhost:18181 npm run build --workspace apps/web');

// ---------- a clip any Chromium can play (VP9 + Opus in WebM) ----------
const media = mkdtempSync(join(tmpdir(), 'charcoal-e2e-'));
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=8:size=320x180:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libvpx-vp9', '-b:v', '120k', '-c:a', 'libopus', '-shortest', join(media, 'clip.webm')]);
const clip = readFileSync(join(media, 'clip.webm'));

// ---------- the resolver API and the stream origin ----------
const stream = (provider, quality) => ({
  id: `${provider}:1`, dedupKey: `localhost/${provider}.webm`, url: `${base}/media/${provider}.webm`, type: 'webm', quality, headers: {}, audio: [{ lang: 'en', label: 'English' }],
  provider: { id: provider, name: provider[0].toUpperCase() + provider.slice(1), version: '1.0.0' }, runtime: 'server', relay: `${base}/v2/relay?x=${provider}`,
});
const result = (provider, quality) => ({ t: 'result', provider: { id: provider, name: provider[0].toUpperCase() + provider.slice(1), version: '1.0.0' }, outcome: 'ok', ms: 120, streams: [stream(provider, quality)], captions: [], requests: 2 });
const failed = (provider, code) => ({ t: 'result', provider: { id: provider, name: provider, version: '1.0.0' }, outcome: 'error', code, scope: 'runtime', message: code, ms: 80, streams: [], captions: [], requests: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

const api = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (url.pathname.startsWith('/media/')) {
    log.push({ at: Date.now(), what: `media ${url.pathname}` });
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Number(range[2]) : clip.length - 1;
    return res.writeHead(range ? 206 : 200, { ...cors, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) }).end(clip.subarray(start, end + 1));
  }
  if (url.pathname === '/v2/registry') return res.writeHead(404, cors).end('{}');
  if (url.pathname === '/v2/report') return res.writeHead(202, { ...cors, 'Content-Type': 'application/json' }).end('{"accepted":0}');
  if (url.pathname === '/v2/sources') {
    const tmdb = url.searchParams.get('tmdb');
    log.push({ at: Date.now(), what: `sources ${tmdb}`, skip: url.searchParams.get('skip') });
    res.writeHead(200, { ...cors, 'Content-Type': 'application/x-ndjson' });
    const write = (e) => res.write(JSON.stringify(e) + '\n');
    if (tmdb === '2') {
      write({ t: 'plan', runtime: 'server', providers: [{ id: 'alpha', name: 'Alpha', wave: 1 }, { id: 'beta', name: 'Beta', wave: 1 }], skipped: [] });
      await sleep(150);
      write(failed('alpha', 'ACCESS_DENIED'));
      write(failed('beta', 'CHALLENGE'));
      write({ t: 'done', ms: 150, ok: 0, empty: 0, failed: 2 });
      return res.end();
    }
    write({ t: 'plan', runtime: 'server', providers: [{ id: 'alpha', name: 'Alpha', wave: 1 }, { id: 'beta', name: 'Beta', wave: 1 }, { id: 'slow', name: 'Slow', wave: 1 }], skipped: [] });
    await sleep(100);
    write(result('alpha', '720'));
    log.push({ at: Date.now(), what: 'first result written' });
    await sleep(2500);
    write(result('beta', '1080'));
    await sleep(1500);
    write(failed('slow', 'TIMEOUT'));
    write({ t: 'done', ms: 4100, ok: 2, empty: 0, failed: 1 });
    log.push({ at: Date.now(), what: 'done written' });
    return res.end();
  }
  res.writeHead(404, cors).end('{}');
});
await new Promise((r) => api.listen(API, r));

const preview = spawn('npx', ['vite', 'preview', '--port', String(SITE), '--strictPort'], { cwd: join(here, '..'), stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  if (await fetch(`http://localhost:${SITE}/`).then((r) => r.ok, () => false)) break;
  await sleep(200);
}

// ---------- the browser ----------
const details = (id) => ({ id, title: `Test Film ${id}`, original_title: `Test Film ${id}`, release_date: '2020-01-01', runtime: 100, overview: 'A test.', poster_path: null, backdrop_path: null, vote_average: 7, genres: [], original_language: 'en', imdb_id: 'tt0000001', external_ids: { imdb_id: 'tt0000001' }, videos: { results: [] }, credits: { cast: [] }, recommendations: { results: [] }, similar: { results: [] }, images: { logos: [] }, release_dates: { results: [] } });
const browser = await chromium.launch();
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

async function open(path, { bridge = false, resolverDown = false } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost') {
      if (resolverDown && u.port === String(API) && u.pathname.startsWith('/v2/')) return route.abort();
      return route.continue();
    }
    if (u.hostname === 'api.themoviedb.org') {
      const id = Number(u.pathname.split('/')[3]);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(details(id)) });
    }
    return route.abort(); // images, the cast SDK, embeds, analytics: nothing leaves this machine
  });
  if (bridge) {
    // An app shell's bridge: it answers the protocol, and can only reach this machine.
    await page.addInitScript(() => {
      window.__bridgeCalls = [];
      window.__charcoalBridge = {
        async call(type, payload) {
          window.__bridgeCalls.push({ type, url: payload?.url, host: payload?.host });
          if (type === 'hello') return { ok: true, result: { version: '9.9.9', protocol: 2, kind: 'app', capabilities: ['request', 'allowStream', 'releaseStreams', 'cookies', 'status'], hasPermission: true } };
          if (type === 'request') return { ok: false, error: 'Couldn’t reach the site (offline test)', code: 'NETWORK' };
          return { ok: true, result: {} };
        },
      };
    });
  }
  const started = Date.now();
  await page.goto(`http://localhost:${SITE}${path}`);
  return { page, context, errors, started };
}

// 1. Progressive: playback starts on the first result, long before the last provider answers.
{
  log.length = 0;
  const { page, context, errors, started } = await open('/watch/movie/1');
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.2; }, null, { timeout: 15000 }).catch(() => {});
  const playingAt = Date.now();
  const v = await page.evaluate(() => { const el = document.querySelector('video'); return el ? { src: el.currentSrc, t: el.currentTime, err: el.error?.message } : null; });
  const done = log.find((l) => l.what === 'done written');
  check('video plays from the first provider’s stream', !!v && v.t > 0.2 && /\/media\/alpha\.webm$/.test(v.src), v ? `${v.src} at ${v.t.toFixed(2)}s` : 'no video element');
  check('playback started before the slowest provider answered', !done || playingAt < done.at, `playing after ${playingAt - started} ms; resolver finished ${done ? done.at - started : '∞'} ms after load`);
  check('the stream was loaded from its origin, not through a relay', log.some((l) => l.what === 'media /media/alpha.webm'));
  await page.waitForTimeout(4500);
  const still = await page.evaluate(() => { const el = document.querySelector('video'); return el ? { src: el.currentSrc, t: el.currentTime } : null; });
  check('a better source arriving later does not interrupt what is playing', !!still && /alpha\.webm$/.test(still.src) && still.t > v.t, still ? `still ${still.src.split('/').pop()} at ${still.t.toFixed(2)}s` : '');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 2. Nothing playable: straight to an embed, no blind retry.
{
  log.length = 0;
  const { page, context, started } = await open('/watch/movie/2');
  await page.waitForSelector('iframe', { timeout: 15000 }).catch(() => {});
  const ms = Date.now() - started;
  const src = await page.evaluate(() => document.querySelector('iframe')?.src ?? '');
  check('no sources → the embedded player takes over', /vidlink\.pro\/movie\/2/.test(src), src);
  check('…within 3 s of opening the page', ms < 3000, `${ms} ms`);
  check('…after exactly one request to the resolver', log.filter((l) => l.what === 'sources 2').length === 1);
  await context.close();
}

// 3. Resolver unreachable: same, promptly.
{
  const { page, context, started } = await open('/watch/movie/3', { resolverDown: true });
  await page.waitForSelector('iframe', { timeout: 15000 }).catch(() => {});
  check('resolver down → the embedded player takes over', !!(await page.$('iframe')), `${Date.now() - started} ms`);
  await context.close();
}

// 4. A bridge is present: providers run in the page, their failures stay their own, the rest still plays.
{
  log.length = 0;
  const { page, context, errors } = await open('/watch/movie/1', { bridge: true });
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.2; }, null, { timeout: 20000 }).catch(() => {});
  const v = await page.evaluate(() => { const el = document.querySelector('video'); return el ? { src: el.currentSrc, t: el.currentTime } : null; });
  const calls = await page.evaluate(() => window.__bridgeCalls ?? []);
  const asked = log.find((l) => l.what === 'sources 1');
  check('with a bridge, bundled providers ran in the page', calls.some((c) => c.type === 'request'), `${calls.filter((c) => c.type === 'request').length} requests through the bridge`);
  check('the resolver was told which providers the page runs itself', !!asked?.skip && asked.skip.split(',').includes('castle'), `skip=${asked?.skip?.slice(0, 80)}`);
  check('local failures did not stop remote sources from playing', !!v && v.t > 0.2, v ? `${v.src.split('/').pop()} at ${v.t.toFixed(2)}s` : 'no video');
  check('no page errors with the bridge', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
preview.kill();
api.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
