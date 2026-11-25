/**
 * End-to-end check of playback itself, in a real (headless) browser: the one player, with every
 * kind of stream it takes (MPEG-DASH through dash.js, HLS through hls.js, a plain MP4 file).
 *
 * Nothing outside this machine is contacted. The streams are generated here with ffmpeg (H.264 +
 * AAC: a DASH stream with two picture qualities and two audio languages, an HLS stream and an MP4
 * file of the same 40 seconds), served by a small local server that is also the resolver API, and
 * TMDB is answered from canned JSON. It checks what a unit test can't:
 *
 *   - a DASH source plays, and its qualities and audio languages are in the player's own menus;
 *   - subtitles (WebVTT and SRT) show over it, and progress is saved from it;
 *   - switching between a DASH, an HLS and an MP4 source keeps the position;
 *   - a DASH source whose manifest is gone fails over to the next source, with the reason;
 *   - a source this browser can't decode, and a DRM-protected one, are skipped with the reason
 *     before any of their video is requested, and no licence is ever asked for;
 *   - a source whose link has expired (before it starts, or while it plays) is resolved again and
 *     carried on with, at the same position;
 *   - a DASH stream whose origin stops answering is restarted where it was once the origin is back,
 *     and given up for the next source (at the same position) when it stays down;
 *   - a source the resolver tried without an answer is left for last, another site's player page
 *     is never loaded, and a stream with no end plays in live mode (no seek bar, no duration).
 *
 *   npm run build --workspace apps/web
 *   node apps/web/e2e/playback.mjs
 *
 * Needs `playwright` (with a Chromium that decodes H.264/AAC) and `ffmpeg`; not part of `npm test`.
 * It uses its own ports and a snapshot of the build, so it can run next to the other e2e scripts.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Resolved the CommonJS way so a globally installed Playwright (NODE_PATH) is found too.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
// The local resolver is given to the site as the viewer's own server (a setting), so this does not
// depend on the address the build was told (VITE_JELLY_URL); that one is never contacted here.
const API = 18185;
const SITE = 18186;
const base = `http://localhost:${API}`;
if (!existsSync(join(dist, 'index.html'))) throw new Error('Build the site first: npm run build --workspace apps/web');

// ---------- the streams ----------
const SECONDS = 40;
const work = mkdtempSync(join(tmpdir(), 'charcoal-playback-'));
// The build as it is now: a rebuild while this runs can't pull files from under the browser.
const site = join(work, 'site');
cpSync(dist, site, { recursive: true });
const media = join(work, 'media');
mkdirSync(media);
for (const d of ['dash', 'hls', 'hevc', 'hevc-hls', 'drm', 'subs']) mkdirSync(join(media, d));
const ffmpeg = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const picture = ['-f', 'lavfi', '-i', `testsrc2=duration=${SECONDS}:size=640x360:rate=15`];
const tone = (hz) => ['-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${SECONDS}`];
const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0'];
const aac = ['-c:a', 'aac', '-b:a', '48k', '-ac', '2'];
// DASH: 360p and 180p video, English and French audio, 2-second segments.
ffmpeg([
  ...picture, ...tone(440), ...tone(880),
  '-map', '0:v', '-map', '0:v', '-map', '1:a', '-map', '2:a',
  ...h264, '-s:v:0', '640x360', '-b:v:0', '300k', '-s:v:1', '320x180', '-b:v:1', '90k',
  ...aac, '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=fra',
  '-seg_duration', '2', '-use_template', '1', '-use_timeline', '1', '-adaptation_sets', 'id=0,streams=v id=1,streams=2 id=2,streams=3',
  '-f', 'dash', join(media, 'dash', 'manifest.mpd'),
]);
// HLS (MPEG-TS segments, a master playlist with the same two qualities) and an MP4 file of the same thing.
ffmpeg([
  ...picture, ...tone(440),
  '-map', '0:v', '-map', '0:v', '-map', '1:a', '-map', '1:a',
  ...h264, '-s:v:0', '640x360', '-b:v:0', '300k', '-s:v:1', '320x180', '-b:v:1', '90k', ...aac,
  '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-master_pl_name', 'index.m3u8', '-var_stream_map', 'v:0,a:0 v:1,a:1',
  '-hls_segment_filename', join(media, 'hls', 'v%v-%03d.ts'), join(media, 'hls', 'v%v.m3u8'),
]);
ffmpeg([...picture, ...tone(440), ...h264, '-b:v', '300k', ...aac, '-movflags', '+faststart', join(media, 'file.mp4')]);
const mpd = readFileSync(join(media, 'dash', 'manifest.mpd'), 'utf8');
const dashHeights = [...mpd.matchAll(/<Representation[^>]*mimeType="video\/mp4"[^>]*height="(\d+)"/g)].map((m) => Number(m[1])).sort((a, b) => b - a);
// The same manifest, claiming a codec this browser has no decoder for (HEVC)…
writeFileSync(join(media, 'hevc', 'manifest.mpd'), mpd.replace(/codecs="avc1\.[0-9a-f]+"/gi, 'codecs="hvc1.1.6.L93.B0"'));
// …an HLS master playlist making the same claim about its only variant…
writeFileSync(join(media, 'hevc-hls', 'index.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360,CODECS="hvc1.1.6.L93.B0,mp4a.40.2"\nv0.m3u8\n');
// …and the DASH manifest claiming to be protected (CENC + Widevine).
writeFileSync(join(media, 'drm', 'manifest.mpd'), mpd.replace(/(<AdaptationSet[^>]*>)/g, '$1<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"/><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>'));
// A live stream: the 360p variant's playlist without its end marker.
const livePlaylist = readFileSync(join(media, 'hls', 'v0.m3u8'), 'utf8').replace(/#EXT-X-PLAYLIST-TYPE:VOD\n/, '').replace(/#EXT-X-ENDLIST\n?/, '');
writeFileSync(join(media, 'subs', 'en.vtt'), `WEBVTT\n\n00:00.000 --> 00:${SECONDS - 1}.000\nHello from the WebVTT track\n`);
writeFileSync(join(media, 'subs', 'fr.srt'), `1\n00:00:00,000 --> 00:00:${SECONDS - 1},000\nBonjour de la piste SRT\n`);

// ---------- the stream origin and the resolver API (one server) ----------
const TYPES = { '.mpd': 'application/dash+xml', '.m4s': 'video/iso.segment', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.srt': 'application/x-subrip' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Every request the page made to this server, in order. */
const log = [];
const asked = (re) => log.filter((l) => re.test(l.path));
/** Signed links: the only token the origin accepts right now, and how many searches each title has had. */
const signed = { valid: 't1' };
const searches = new Map();
/** While on, the "flaky" origin answers 503 to every media segment (its manifest still loads). */
const outage = { on: false };

const provider = (id) => ({ id, name: id[0].toUpperCase() + id.slice(1), version: '1.0.0' });
/** The parts every verification carries: who tried the stream, when, and how long it took. */
const tried = { by: 'server', at: Date.now(), ms: 60 };
const stream = (id, type, path, quality, extra = {}) => ({
  id: `${id}:1`, dedupKey: `localhost/${id}`, url: `${base}${path}`, type, quality, headers: {}, audio: [{ lang: 'und' }],
  provider: provider(id), runtime: 'server', relay: `${base}/v2/relay?x=${id}`, ...extra,
});
const result = (s, captions = []) => ({ t: 'result', provider: s.provider, outcome: 'ok', ms: 40, streams: [s], captions, requests: 1 });
const captions = [
  { url: `${base}/media/subs/en.vtt`, label: 'English', lang: 'en', format: 'vtt' },
  { url: `${base}/media/subs/fr.srt`, label: 'French', lang: 'fr', format: 'srt' },
];
/** What the resolver finds for each test title. Ranking is by quality, so "1080" is tried first. */
const titles = {
  // Every kind of stream, for the menus and for switching between them.
  10: () => [result(stream('dashy', 'dash', '/media/dash/manifest.mpd', '1080'), captions), result(stream('hilsa', 'hls', '/media/hls/index.m3u8', '720')), result(stream('filey', 'mp4', '/media/file.mp4', '480'))],
  // The best source's manifest is gone.
  11: () => [result(stream('gone', 'dash', '/media/gone/manifest.mpd', '1080')), result(stream('filey', 'mp4', '/media/file.mp4', '720'))],
  // Three sources this browser can't play (found out from their manifests), one it can, and one
  // the provider itself describes as HEVC (ruled out by the resolver before the player sees it).
  12: () => [
    result(stream('hevc', 'dash', '/media/hevc/manifest.mpd', '1080')),
    result(stream('locked', 'dash', '/media/drm/manifest.mpd', '720')),
    result(stream('hevchls', 'hls', '/media/hevc-hls/index.m3u8', '480')),
    result(stream('hilsa', 'hls', '/media/hls/index.m3u8', '360')),
    result(stream('declared', 'mp4', '/media/file.mp4', '2160', { video: { codec: 'hvc1.1.6.L93.B0' } })),
    // …and a DASH stream the resolver itself tried: its manifest answered, and lists only HEVC video.
    result(stream('probed', 'dash', '/media/probed/manifest.mpd', '1440', { verification: { ...tried, state: 'verified', level: 'manifest', detail: { container: 'dash', variants: 2, codecs: ['hev1.1.6.L93.B0', 'mp4a.40.2'] } } })),
  ],
  // A signed DASH link that expires four seconds after it was found, next to a file that doesn't.
  13: (n) => [result(stream('filey', 'mp4', '/media/file.mp4', '1080')), result(stream('signed', 'dash', `/media/signed/t${n}/manifest.mpd`, '720', { expiresAt: Date.now() + (n === 1 ? 4000 : 600_000) }))],
  // A signed DASH link whose token the origin stops accepting while it plays.
  14: (n) => [result(stream('signed', 'dash', `/media/signed/t${n}/manifest.mpd`, '1080', { expiresAt: Date.now() + 600_000 }))],
  // The best-looking source did not answer when the resolver tried it; the next one did; and one
  // "stream" is another site's player page.
  16: () => [
    result(stream('dead', 'mp4', '/media/dead.mp4', '1080', { verification: { ...tried, state: 'failed', level: 'none', code: 'HTTP_404', message: 'The video host answered 404' } })),
    result(stream('filey', 'mp4', '/media/file.mp4', '720', { audio: [{ lang: 'en' }, { lang: 'hi', dub: true }], verification: { ...tried, state: 'verified', level: 'header' } })),
    result(stream('framey', 'frame', '/media/frame.html', '2160')),
  ],
  // A stream with no end.
  17: () => [result(stream('channel', 'hls', '/media/live/index.m3u8', '720'))],
  // A DASH stream on an origin that can be switched off, with a file to fall back on.
  15: () => [result(stream('flaky', 'dash', '/media/flaky/manifest.mpd', '1080')), result(stream('filey', 'mp4', '/media/file.mp4', '720'))],
};

const api = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (url.pathname.startsWith('/media/')) {
    let path = url.pathname.slice('/media/'.length);
    const token = /^signed\/([^/]+)\//.exec(path)?.[1];
    const entry = { at: Date.now(), path: url.pathname, status: 200 };
    log.push(entry);
    const send = (status, body = '') => {
      entry.status = status;
      res.writeHead(status, cors).end(body);
    };
    if (path === 'live/index.m3u8') return res.writeHead(200, { ...cors, 'Content-Type': TYPES['.m3u8'], 'Cache-Control': 'no-store' }).end(livePlaylist);
    if (token && token !== signed.valid) return send(403, 'token expired');
    if (outage.on && /^flaky\/.*\.m4s$/.test(path)) return send(503, 'origin down');
    // Signed links are the DASH stream behind a token; the "can't play" manifests sit on real
    // segments, so a player that went on regardless would be seen fetching them.
    if (token) path = path.replace(/^signed\/[^/]+\//, 'dash/');
    else if (path.startsWith('flaky/')) path = path.replace('flaky/', 'dash/');
    else if (path.startsWith('live/')) path = path.replace('live/', 'hls/');
    else if (/^(hevc|drm)\//.test(path) && !path.endsWith('.mpd')) path = path.replace(/^(hevc|drm)\//, 'dash/');
    else if (path.startsWith('hevc-hls/') && path !== 'hevc-hls/index.m3u8') path = path.replace('hevc-hls/', 'hls/');
    const file = normalize(join(media, path));
    if (!file.startsWith(media) || !existsSync(file) || !statSync(file).isFile()) return send(404, 'not found');
    const body = readFileSync(file);
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    entry.status = range ? 206 : 200;
    return res
      .writeHead(entry.status, { ...cors, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${body.length}` } : {}) })
      .end(body.subarray(start, end + 1));
  }
  if (url.pathname === '/v2/registry') return res.writeHead(404, cors).end('{}');
  if (url.pathname === '/v2/report') return res.writeHead(202, { ...cors, 'Content-Type': 'application/json' }).end('{"accepted":0}');
  if (url.pathname === '/v2/sources') {
    const tmdb = url.searchParams.get('tmdb');
    const n = (searches.get(tmdb) ?? 0) + 1;
    searches.set(tmdb, n);
    log.push({ at: Date.now(), path: `/v2/sources ${tmdb}`, status: 200, accept: url.searchParams.get('accept') });
    // A new search hands out a new token, and the origin stops taking the old one.
    if (tmdb === '13' || tmdb === '14') signed.valid = `t${n}`;
    const results = titles[tmdb]?.(n) ?? [];
    res.writeHead(200, { ...cors, 'Content-Type': 'application/x-ndjson' });
    const write = (e) => res.write(JSON.stringify(e) + '\n');
    write({ t: 'plan', runtime: 'server', providers: results.map((r) => ({ id: r.provider.id, name: r.provider.name, wave: 1 })), skipped: [] });
    await sleep(50);
    for (const r of results) write(r);
    write({ t: 'done', ms: 60, ok: results.length, empty: 0, failed: 0 });
    return res.end();
  }
  res.writeHead(404, cors).end('{}');
});
await new Promise((r) => api.listen(API, r));

// In its own process group: `npx` starts the real server as a child, and stopping only `npx` would leave that running.
const preview = spawn('npx', ['vite', 'preview', '--outDir', site, '--port', String(SITE), '--strictPort'], { cwd: join(here, '..'), stdio: 'ignore', detached: true });
const stopPreview = () => {
  try {
    process.kill(-preview.pid);
  } catch {
    preview.kill();
  }
};
// However this ends (a failed check, a thrown error), leave nothing running and nothing on disk.
process.on('exit', () => {
  stopPreview();
  rmSync(work, { recursive: true, force: true });
});
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
const near = (a, b, by) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= by;

async function open(id, settings = {}) {
  log.length = 0;
  searches.delete(String(id));
  signed.valid = 't1';
  outage.on = false;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  const offMachine = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'blob:' || u.protocol === 'data:') return route.continue();
    if (u.hostname === 'localhost') return u.port === String(API) || u.port === String(SITE) ? route.continue() : route.abort();
    if (u.hostname === 'api.themoviedb.org') {
      const tmdb = Number(u.pathname.split('/')[3]);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(details(tmdb)) });
    }
    offMachine.push(u.hostname);
    return route.abort(); // images, fonts, the cast SDK: nothing leaves this machine
  });
  await page.addInitScript((settings) => {
    // The viewer's settings for this run (the site reads them from here when it starts).
    if (!localStorage.getItem('charcoal:v2')) localStorage.setItem('charcoal:v2', JSON.stringify({ history: [], watchlist: [], settings }));
    // Would a licence ever be asked for? Count it.
    window.__emeCalls = 0;
    const eme = navigator.requestMediaKeySystemAccess?.bind(navigator);
    if (eme) navigator.requestMediaKeySystemAccess = (...a) => (window.__emeCalls++, eme(...a));
    // The player's short notices come and go: keep every one that was shown.
    window.__notices = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('div.top-20.rounded-full')) {
        const text = el.textContent.trim();
        if (text && window.__notices.at(-1) !== text) window.__notices.push(text);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, { serverUrl: base, shareHealth: false, ...settings });
  await page.goto(`http://localhost:${SITE}/watch/movie/${id}`);
  return { page, context, errors, offMachine };
}

const video = (page) => page.evaluate(() => {
  const v = document.querySelector('video');
  return v ? { t: v.currentTime, src: v.currentSrc, paused: v.paused, height: v.videoHeight, duration: v.duration, ready: v.readyState, error: v.error?.message ?? null } : null;
});
/** Waits until the video is really playing (past `after` seconds); false if it never does. */
const playing = (page, after = 0.2, timeout = 20000) =>
  page.waitForFunction((after) => { const v = document.querySelector('video'); return !!v && !v.paused && v.readyState >= 3 && v.currentTime > after; }, after, { timeout }).then(() => true, () => false);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
/** Polls something on this side (the request log) until it holds. */
async function eventually(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(50);
  }
  return false;
}
/**
 * Presses a button by the start of its accessible name or of its text. The controls fade out
 * while a video plays, so this is the DOM's own click rather than a mouse at a position.
 */
const press = (page, name, { within = 'body', timeout = 8000 } = {}) =>
  page
    .waitForFunction(
      ([name, within]) => {
        const all = [...document.querySelectorAll(`${within} button`)];
        const hit = all.find((b) => (b.getAttribute('aria-label') ?? '').startsWith(name)) ?? all.find((b) => b.textContent.trim().startsWith(name));
        hit?.click(); // found once, clicked once: the wait ends here
        return !!hit;
      },
      [name, within],
      { timeout },
    )
    .then(() => true, () => false);
/** The rows of the open menu: their text and which one is selected. */
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('[data-popover] button[aria-pressed]')].map((b) => ({ text: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true' })));
/** Closes the open menu the way a viewer would: with the button that opened it. */
const closeMenu = (page) => page.evaluate(() => document.querySelector('[data-popover]')?.parentElement?.querySelector(':scope > button[aria-expanded="true"]')?.click());
/** Opens Settings and one of its cards (Quality, Audio, Source); resolves to that menu's rows. */
async function menu(page, card) {
  if (await page.evaluate(() => !!document.querySelector('[data-popover]'))) await closeMenu(page);
  await press(page, 'Settings');
  await press(page, card, { within: '[data-popover]' });
  await until(page, () => document.querySelectorAll('[data-popover] button[aria-pressed]').length > 0);
  return rows(page);
}
/** Picks a source by the start of its row ("1080p"), and reports the position the new one started playing from. */
async function switchSource(page, row) {
  await menu(page, 'Source');
  const before = await page.evaluate((row) => {
    const v = document.querySelector('video');
    window.__resumedAt = null;
    v.addEventListener('playing', () => (window.__resumedAt = v.currentTime), { once: true });
    const t = v.currentTime;
    [...document.querySelectorAll('[data-popover] button[aria-pressed]')].find((b) => b.textContent.trim().startsWith(row))?.click();
    return t;
  }, row);
  const started = await until(page, () => window.__resumedAt !== null, null, 30000);
  const resumed = started ? await page.evaluate(() => window.__resumedAt) : null;
  return { before, resumed };
}
/** The reason shown on a failed source's ⓘ card. */
async function reasonFor(page, row) {
  await menu(page, 'Source');
  const listed = (await rows(page)).find((r) => r.text.startsWith(row))?.text ?? '';
  await press(page, `About ${row}`);
  await until(page, () => !!document.querySelector('[role="dialog"][aria-label="Source details"]'));
  const card = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Source details"]')?.textContent ?? '');
  await closeMenu(page);
  return { listed, card };
}

/** What the bottom bar and the centre show: a film's seek bar and clock, or the live state. */
const controls = (page) => page.evaluate(() => ({
  seekBar: !!document.querySelector('[role="slider"][aria-label="Seek"]'),
  live: !!document.querySelector('[data-testid="live-state"]'),
  skips: [...document.querySelectorAll('button')].filter((b) => /10 seconds/.test(b.getAttribute('aria-label') ?? '')).length,
  clock: [...document.querySelectorAll('span.tabular-nums')].map((e) => e.textContent.trim()).find((t) => /\d:\d\d \/ \d/.test(t)) ?? '',
}));

/**
 * For breaks the player has to get over by itself: records where the video stops (its stream is
 * taken away) and where the next thing starts playing.
 */
const armResume = (page) => page.evaluate(() => {
  const v = document.querySelector('video');
  window.__stoppedAt = window.__resumedAt = null;
  let last = v.currentTime;
  const tick = () => v.currentTime > 0 && (last = v.currentTime);
  v.addEventListener('timeupdate', tick);
  v.addEventListener('emptied', () => {
    v.removeEventListener('timeupdate', tick);
    window.__stoppedAt = last;
    v.addEventListener('playing', () => (window.__resumedAt = v.currentTime), { once: true });
  }, { once: true });
});
const resumedAfter = async (page, timeout = 40000) =>
  (await until(page, () => typeof window.__resumedAt === 'number', null, timeout)) ? page.evaluate(() => ({ stopped: window.__stoppedAt, resumed: window.__resumedAt })) : { stopped: null, resumed: null };
/** Asks the playing DASH stream for something it hasn't buffered (another audio language or quality), so it needs its origin now. */
async function nudge(page, card, row) {
  if (await page.evaluate(() => !!document.querySelector('[data-popover]'))) await closeMenu(page);
  await press(page, 'Settings', { timeout: 3000 });
  await press(page, card, { within: '[data-popover]', timeout: 3000 });
  return press(page, row, { within: '[data-popover] button[aria-pressed], [data-popover]', timeout: 3000 });
}

// 1. DASH plays in the player, with its qualities, audio languages, subtitles and progress.
{
  const { page, context, errors, offMachine } = await open(10);
  const started = await playing(page);
  const a = await video(page);
  await page.waitForTimeout(1500);
  const b = await video(page);
  const types = log.find((l) => l.path === '/v2/sources 10')?.accept ?? '';
  check('the resolver is asked for DASH streams too', types.split(',').includes('dash'), `accept=${types}`);
  check('a DASH source plays: the video’s time advances', started && !!a && !!b && b.t > a.t + 0.5, a && b ? `${a.t.toFixed(2)}s → ${b.t.toFixed(2)}s` : 'no video');
  check('…through dash.js: the manifest and its segments were loaded, into a MediaSource', !!a && a.src.startsWith('blob:') && asked(/\/media\/dash\/manifest\.mpd$/).length === 1 && asked(/\/media\/dash\/chunk-stream[01]-/).length > 0, `${asked(/\/media\/dash\//).length} requests to the DASH stream`);
  const filmUi = await controls(page);
  check('a film has a seek bar, a duration and ±10 s', filmUi.seekBar && filmUi.skips === 2 && !filmUi.live && /\/ 0:40/.test(filmUi.clock), `clock: ${filmUi.clock}`);
  check('…and only when needed: dash.js came as its own chunk', await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /\/assets\/dash-[\w-]+\.js$/.test(r.name))));

  const quality = await menu(page, 'Quality');
  const want = ['Auto', ...dashHeights.map((h) => `${h}p`)];
  check('the quality menu lists the DASH qualities', JSON.stringify(quality.map((r) => r.text)) === JSON.stringify(want) && quality[0].on, `${quality.map((r) => r.text).join(', ')} (in the manifest: ${dashHeights.join(', ')})`);
  await press(page, '180p', { within: '[data-popover]' });
  const low = await until(page, () => document.querySelector('video').videoHeight === 180);
  await menu(page, 'Quality');
  const lowRows = await rows(page);
  await press(page, '360p', { within: '[data-popover]' });
  const high = await until(page, () => document.querySelector('video').videoHeight === 360);
  check('choosing a quality switches the picture (180p, then 360p)', low && high && !!lowRows.find((r) => r.text === '180p')?.on, `180p shown: ${low}, 360p shown: ${high}`);

  const audio = await menu(page, 'Audio');
  check('the audio menu lists the DASH audio languages, the preferred one playing', JSON.stringify(audio.map((r) => r.text)) === JSON.stringify(['English', 'French']) && audio[0].on, audio.map((r) => `${r.text}${r.on ? ' ✓' : ''}`).join(', '));
  const mark = log.length;
  await press(page, 'French', { within: '[data-popover]' });
  const french = await eventually(() => log.slice(mark).some((l) => /\/media\/dash\/chunk-stream3-/.test(l.path)));
  const audioAfter = await menu(page, 'Audio');
  await closeMenu(page);
  check('choosing French loads the French audio track', french && !!audioAfter.find((r) => r.text === 'French')?.on, audioAfter.map((r) => `${r.text}${r.on ? ' ✓' : ''}`).join(', '));

  await press(page, 'Subtitles');
  const subs = await rows(page);
  await press(page, 'French', { within: '[data-popover]' });
  const srt = await until(page, () => document.body.innerText.includes('Bonjour de la piste SRT'));
  await press(page, 'Subtitles');
  await press(page, 'English', { within: '[data-popover]' });
  const vtt = await until(page, () => document.body.innerText.includes('Hello from the WebVTT track'));
  check('subtitles show over the DASH stream (an SRT track, then a WebVTT one)', srt && vtt && JSON.stringify(subs.map((r) => r.text)) === JSON.stringify(['Off', 'English', 'French']), `tracks: ${subs.map((r) => r.text).join(', ')}`);

  // Switching sources: DASH → HLS → MP4 → DASH, from 12 seconds in.
  await page.evaluate(() => (document.querySelector('video').currentTime = 12));
  await playing(page, 12.2);
  const toHls = await switchSource(page, '720p');
  const onHls = await video(page);
  check('DASH → HLS keeps the position', near(toHls.resumed, toHls.before, 2) && asked(/\/media\/hls\/index\.m3u8$/).length > 0 && onHls.src.startsWith('blob:'), `left at ${toHls.before?.toFixed(2)}s, carried on at ${toHls.resumed?.toFixed(2)}s`);
  // The same menu drives hls.js: its qualities are listed and can be chosen.
  const hlsQuality = await menu(page, 'Quality');
  await press(page, '180p', { within: '[data-popover]' });
  const hlsLow = await until(page, () => document.querySelector('video').videoHeight === 180);
  check('the same quality menu works for the HLS source', JSON.stringify(hlsQuality.map((r) => r.text)) === JSON.stringify(['Auto', '360p', '180p']) && hlsLow, `${hlsQuality.map((r) => r.text).join(', ')}; 180p shown: ${hlsLow}`);
  await playing(page, toHls.resumed + 1);
  const toFile = await switchSource(page, '480p');
  const onFile = await video(page);
  check('HLS → MP4 keeps the position', near(toFile.resumed, toFile.before, 2) && /\/media\/file\.mp4$/.test(onFile.src), `left at ${toFile.before?.toFixed(2)}s, carried on at ${toFile.resumed?.toFixed(2)}s`);
  await playing(page, toFile.resumed + 1);
  const manifests = asked(/\/media\/dash\/manifest\.mpd$/).length;
  const toDash = await switchSource(page, '1080p');
  const onDash = await video(page);
  check('MP4 → DASH keeps the position', near(toDash.resumed, toDash.before, 2) && onDash.src.startsWith('blob:') && asked(/\/media\/dash\/manifest\.mpd$/).length === manifests + 1, `left at ${toDash.before?.toFixed(2)}s, carried on at ${toDash.resumed?.toFixed(2)}s`);

  // Progress: pausing saves where the DASH stream is (the store writes within a second).
  await playing(page, toDash.resumed + 0.5);
  const at = await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); return v.currentTime; });
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('charcoal:v2') ?? '{}').history?.find((h) => h.id === 10)?.progress ?? null);
  check('progress is saved from the DASH stream', !!saved && near(saved.watched, at, 1.5) && near(saved.duration, 40, 1), saved ? `${saved.watched.toFixed(1)}s of ${saved.duration.toFixed(1)}s` : 'nothing saved');
  check('no page errors', errors.length === 0, errors.join(' | '));
  // dash.js would by default keep time with a public clock server; the player turns that off.
  check('the DASH player called nothing outside the site’s own requests', !offMachine.some((h) => /akamai|time\./.test(h)), [...new Set(offMachine)].join(', ') || 'no other hosts at all');
  await context.close();
}

// 1b. The viewer's audio language decides which DASH audio track starts.
{
  const { page, context } = await open(10, { audioLang: 'fr' });
  await playing(page);
  const audio = await menu(page, 'Audio');
  await closeMenu(page);
  check('with French preferred, the DASH stream starts on its French audio', !!audio.find((r) => r.text === 'French')?.on && asked(/chunk-stream3-/).length > 0 && asked(/chunk-stream2-/).length === 0, audio.map((r) => `${r.text}${r.on ? ' ✓' : ''}`).join(', '));
  await context.close();
}

// 2. A DASH source that fails (its manifest is gone) fails over to the next source.
{
  const { page, context, errors } = await open(11);
  const started = await playing(page);
  const v = await video(page);
  const gone = asked(/\/media\/gone\/manifest\.mpd$/);
  const firstFile = log.find((l) => l.path === '/media/file.mp4');
  check('a DASH source whose manifest is gone (404) fails over to the next source', started && !!v && /\/media\/file\.mp4$/.test(v.src), v ? `now playing ${v.src.split('/').pop()} at ${v.t.toFixed(2)}s` : 'no video');
  check('…at once, without retrying the refusal', gone.length === 1 && gone[0].status === 404 && !!firstFile && firstFile.at - gone[0].at < 1500, `${gone.length} request(s) for the manifest; next source asked for ${firstFile ? firstFile.at - gone[0].at : '∞'} ms later`);
  const why = await reasonFor(page, '1080p');
  check('…and the Source menu says why', /Failed/.test(why.listed) && why.card.includes('The video is gone (404)'), why.card.replace(/\s+/g, ' ').trim());
  check('no page errors after a fail-over', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 3. Sources this browser can't play are skipped with the reason, before any of their video is loaded.
{
  const { page, context, errors } = await open(12);
  const opened = Date.now();
  const started = await playing(page);
  const took = Date.now() - opened;
  const v = await video(page);
  const hevc = await page.evaluate(() => MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"'));
  check('(this browser has no HEVC decoder, as the test assumes)', !hevc);
  check('unplayable sources are passed over and the playable one plays, without waiting on any of them', started && !!v && v.src.startsWith('blob:') && asked(/\/media\/hls\/index\.m3u8$/).length > 0 && took < 6000, v ? `playing the fourth source after ${took} ms` : 'no video');
  check('a DASH source in a codec this browser can’t decode: only its manifest was read', asked(/\/media\/hevc\//).length === 1 && asked(/\/media\/hevc\/manifest\.mpd$/).length === 1, `${asked(/\/media\/hevc\//).length} request(s)`);
  check('a DRM-protected DASH source: only its manifest was read, and no licence was asked for', asked(/\/media\/drm\//).length === 1 && (await page.evaluate(() => window.__emeCalls)) === 0, `${asked(/\/media\/drm\//).length} request(s), ${await page.evaluate(() => window.__emeCalls)} key-system requests`);
  check('an HLS source in a codec this browser can’t decode: only its master playlist was read', asked(/\/media\/hevc-hls\//).length === 1, `${asked(/\/media\/hevc-hls\//).length} request(s)`);
  const notices = await page.evaluate(() => window.__notices);
  check('the viewer is told why each was skipped', notices.some((n) => /Skipped source 1: This device can’t decode HEVC video/.test(n)) && notices.some((n) => /Skipped source 2: It is DRM-protected/.test(n)) && notices.some((n) => /Skipped source 3: This device can’t decode HEVC video/.test(n)), notices.join(' | '));
  const codec = await reasonFor(page, '1080p');
  const drm = await reasonFor(page, '720p');
  const hlsCodec = await reasonFor(page, '480p');
  check('the Source menu keeps the reasons', codec.card.includes('This device can’t decode HEVC video') && drm.card.includes('It is DRM-protected, which Charcoal doesn’t play') && hlsCodec.card.includes('This device can’t decode HEVC video'), [codec, drm, hlsCodec].map((r) => r.card.replace(/\s+/g, ' ').trim()).join(' | '));
  const list = await menu(page, 'Source');
  const greyed = await page.evaluate(() => [...document.querySelectorAll('[data-popover] [data-unplayable]')].map((e) => e.textContent.trim()));
  await closeMenu(page);
  check('a source its provider describes as HEVC never reaches the player', list.length === 4 && !list.some((r) => r.text.startsWith('4K')) && asked(/\/media\/file\.mp4$/).length === 0, `${list.length} sources listed`);
  check('an all-HEVC DASH stream found out when the resolver tried it is not attempted at all', !list.some((r) => r.text.startsWith('1440p')) && asked(/\/media\/probed\//).length === 0, `${asked(/\/media\/probed\//).length} requests for it`);
  check('…both are listed greyed in the Source menu, with the reason', greyed.includes('DeclaredThis device can’t decode HEVC video') && greyed.includes('ProbedThis device can’t decode HEVC video'), greyed.join(' | '));
  check('no page errors after skipping sources', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 4. A link that has expired by the time it is chosen: resolved again, then played from the same position.
{
  const { page, context, errors } = await open(13);
  await playing(page);
  await page.evaluate(() => (document.querySelector('video').currentTime = 12));
  await playing(page, 12.2);
  await page.waitForTimeout(4200); // the DASH link found at the start is past its expiry now
  const dashChunk = () => page.evaluate(() => performance.getEntriesByType('resource').some((r) => /\/assets\/dash-[\w-]+\.js$/.test(r.name)));
  const early = await dashChunk();
  const { before, resumed } = await switchSource(page, '720p');
  check('dash.js is not downloaded while an MP4 plays, only once a DASH source is chosen', !early && (await dashChunk()));
  const v = await video(page);
  const notices = await page.evaluate(() => window.__notices);
  check('an expired link is resolved again (one more search), not just skipped', searches.get('13') === 2 && notices.some((n) => /This link expired/.test(n)), `${searches.get('13')} searches; notices: ${notices.join(' | ')}`);
  check('…and the same stream plays from its fresh link, at the same position', !!v && v.src.startsWith('blob:') && near(resumed, before, 2) && asked(/\/media\/signed\/t2\/manifest\.mpd$/).length === 1 && asked(/\/media\/signed\/t1\//).length === 0, `left at ${before?.toFixed(2)}s, carried on at ${resumed?.toFixed(2)}s; expired link requested ${asked(/\/media\/signed\/t1\//).length} times`);
  check('no page errors after renewing a link', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 5. A link whose token runs out while it plays: the refusal is taken as expiry, not as a dead host.
{
  const { page, context, errors } = await open(14);
  await playing(page);
  await page.evaluate(() => (document.querySelector('video').currentTime = 20));
  await playing(page, 20.2);
  await armResume(page);
  const mark = log.length;
  signed.valid = 'nobody'; // the origin stops taking the token it handed out
  // What is buffered keeps playing. Sooner or later the stream needs its origin again; asking for
  // the other audio language makes that now.
  const refusedAlready = () => log.slice(mark).some((l) => l.status === 403);
  if (!(await eventually(refusedAlready, 1000))) await nudge(page, 'Audio', 'French');
  const { stopped, resumed } = await resumedAfter(page);
  const refused = log.slice(mark).filter((l) => l.status === 403);
  const v = await video(page);
  check('a token that runs out mid-stream (403) leads to a new search', refused.length >= 1 && searches.get('14') === 2, `${refused.length} refused request(s), ${searches.get('14')} searches`);
  check('…and playback carries on from the fresh link, where it was', !!v && stopped > 19 && near(resumed, stopped, 2) && asked(/\/media\/signed\/t2\/manifest\.mpd$/).length === 1, `stopped at ${stopped?.toFixed(2)}s, carried on at ${resumed?.toFixed(2)}s`);
  check('no page errors after a mid-stream renewal', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 5b. What the resolver learned by trying a stream is used: a dead one is not the first choice,
//     a site's own player page is never loaded, and each audio language gets its tag.
{
  const { page, context, errors } = await open(16);
  const started = await playing(page);
  const v = await video(page);
  const list = await menu(page, 'Source');
  const row = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-popover] button[aria-pressed]')];
    const playing = rows.find((b) => b.getAttribute('aria-pressed') === 'true');
    return { languages: playing?.querySelector('[data-languages]')?.getAttribute('data-languages') ?? '', tags: [...(playing?.querySelectorAll('[data-languages] > span') ?? [])].map((e) => e.textContent.trim()), verified: !!playing?.querySelector('[aria-label="Verified"]') };
  });
  await closeMenu(page);
  check('a source that did not answer when the resolver tried it is not the first choice', started && !!v && /\/media\/file\.mp4$/.test(v.src) && asked(/\/media\/dead\.mp4$/).length === 0, `playing ${v?.src.split('/').pop()}; ${asked(/\/media\/dead\.mp4$/).length} requests for the dead one`);
  check('…and the Source menu says which answered and which did not', row.verified && /Did not answer/.test(list.find((r) => r.text.startsWith('1080p'))?.text ?? ''), list.map((r) => r.text).join(' | '));
  check('a source shows a tag for each audio language it carries', row.languages === 'en,hi' && JSON.stringify(row.tags) === JSON.stringify(['en', 'hi dub']), `${row.tags.join(', ')}`);
  check('another site’s player page is never handed to the video player', list.length === 2 && asked(/\/media\/frame\.html$/).length === 0, `${list.length} sources listed, ${asked(/\/media\/frame\.html$/).length} requests for the page`);
  check('no page errors with tried sources', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 5c. A stream with no end is live: no seek bar, no duration, no ±10 s.
{
  const { page, context, errors } = await open(17);
  const started = await playing(page);
  const ui = await controls(page);
  // The seek keys do nothing either.
  const before = (await video(page)).t;
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  const after = (await video(page)).t;
  check('a stream with no end plays in live mode: a Live state instead of a seek bar and a duration', started && ui.live && !ui.seekBar && ui.skips === 0 && ui.clock === '', `seek bar: ${ui.seekBar}, live state: ${ui.live}, ±10 s buttons: ${ui.skips}`);
  check('…and the seek keys leave it alone', after >= before - 0.5, `${before.toFixed(2)}s → ${after.toFixed(2)}s`);
  check('no page errors in live mode', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** Plays title 15 to 20 s, switches its origin off, and makes the player need it (the other quality has to be fetched). */
async function breakOrigin(page) {
  await playing(page);
  await page.evaluate(() => (document.querySelector('video').currentTime = 20));
  await playing(page, 20.2);
  const other = (await video(page)).height === 360 ? '180p' : '360p';
  await armResume(page);
  const mark = log.length;
  outage.on = true;
  await nudge(page, 'Quality', other);
  return { other, mark };
}

// 6. The origin of a DASH stream stops answering for a while: the stream is restarted where it was.
{
  const { page, context, errors } = await open(15);
  const { other, mark } = await breakOrigin(page);
  // dash.js retries each segment itself; when it gives up, the player restarts the stream (a second
  // manifest request). The origin comes back at that moment.
  const restarted = await eventually(() => log.slice(mark).some((l) => /\/media\/flaky\/manifest\.mpd$/.test(l.path)), 30000);
  const failedRequests = log.slice(mark).filter((l) => l.status === 503).length;
  outage.on = false;
  const { stopped, resumed } = await resumedAfter(page);
  await playing(page, (resumed ?? 0) + 0.5);
  const v = await video(page);
  const quality = await menu(page, 'Quality');
  await closeMenu(page);
  check('a DASH origin that stops answering: the stream is restarted once dash.js gives up retrying', restarted && failedRequests >= 4, `${failedRequests} refused segment requests before the restart`);
  check('…and carries on from the same source at the same position when the origin is back', !!v && v.src.startsWith('blob:') && stopped > 19 && near(resumed, stopped, 2) && asked(/\/media\/file\.mp4$/).length === 0 && searches.get('15') === 1, `stopped at ${stopped?.toFixed(2)}s, carried on at ${resumed?.toFixed(2)}s`);
  check('…with the quality the viewer had chosen', !!v && `${v.height}p` === other && !!quality.find((r) => r.text === other)?.on, `${v?.height}p showing, ${other} chosen`);
  check('no page errors after a recovery', errors.length === 0, errors.join(' | '));
  await context.close();
}

// 7. The origin stays down: after that one restart the player moves on to the next source.
{
  const { page, context, errors } = await open(15);
  await breakOrigin(page);
  const moved = await until(page, () => /\/media\/file\.mp4$/.test(document.querySelector('video').currentSrc), null, 40000);
  await playing(page, 1);
  const v = await video(page);
  const stopped = await page.evaluate(() => window.__stoppedAt);
  const why = await reasonFor(page, '1080p');
  check('a DASH origin that stays down: one restart, then the next source', moved && asked(/\/media\/flaky\/manifest\.mpd$/).length === 2, `${asked(/\/media\/flaky\/manifest\.mpd$/).length} manifest requests (the first load and one restart)`);
  check('…from the position the stream had reached', !!v && stopped > 19 && v.t >= stopped - 2 && v.t <= stopped + 6, `stopped at ${stopped?.toFixed(2)}s; the file is playing at ${v?.t.toFixed(2)}s`);
  check('…and the Source menu says why', /Failed/.test(why.listed) && why.card.includes('Couldn’t load the video pieces'), why.card.replace(/\s+/g, ' ').trim());
  check('no page errors after giving up on a source', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
api.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
