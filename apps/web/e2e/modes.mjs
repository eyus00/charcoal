/**
 * End-to-end check of the three parts of the built site (Screen, Anime, Sports) in a real
 * (headless) browser: the switch between them in the sidebar and on a phone, each part's own
 * navigation and search, the sports directory (live, coming up, channels, a second address when
 * the first is down), an event in its framed player, phone widths, and a first stream for a
 * viewer who has set nothing up.
 *
 * Nothing outside this machine is contacted. TMDB is answered with a few made-up titles. The
 * sports directory is answered with @charcoal/content's sample of the real API, its times moved
 * to sit around "now"; the player page it points at is a local stand-in, so this proves how the
 * page frames a player, not that the real one plays.
 *
 *   VITE_JELLY_URL=http://localhost:18181 npm run build --workspace apps/web
 *   node apps/web/e2e/modes.mjs
 *
 * Needs `playwright` (with a Chromium); it is not part of `npm test`.
 * Set MODES_E2E_SHOTS to a directory to also save screenshots.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const API = 18181;
const SITE = 18184;
const base = `http://localhost:${API}`;
const site = `http://localhost:${SITE}`;
if (!existsSync(join(here, '..', 'dist', 'index.html'))) throw new Error('Build the site first: VITE_JELLY_URL=http://localhost:18181 npm run build --workspace apps/web');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3_600_000;

// ---------- canned data ----------

function fixture(file, name) {
  const src = readFileSync(join(here, '..', '..', '..', 'packages', 'content', 'src', 'fixtures', file), 'utf8');
  const at = src.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`No fixture ${name} in ${file}`);
  const start = src.indexOf('=', at) + 1;
  const end = src.slice(start).search(/\n[\]}];/) + start + 2;
  return JSON.parse(src.slice(start, end));
}

/** The real sample, with its events placed around now: one live, the rest still to start. */
function directory(now = Date.now()) {
  const sample = fixture('ppv.ts', 'PPV_STREAMS_2026_11_25');
  const at = (ms) => Math.floor(ms / 1000);
  const when = {
    'Gonzaga Bulldogs at Kansas State Wildcats': [now - HOUR, now + 2 * HOUR],
    'Virginia Cavaliers at Marquette Golden Eagles': [now + 2 * HOUR, now + 5 * HOUR],
    'Sabah FK vs. Barcelona': [now + 3 * HOUR, now + 5 * HOUR],
    'Slavia Prague vs. Villarreal': [now + 3 * HOUR, now + 5 * HOUR],
    'TCU Horned Frogs at Texas Tech Red Raiders': [now + 26 * HOUR, now + 30 * HOUR],
  };
  for (const category of sample.streams) {
    for (const s of category.streams) {
      if (!when[s.name]) continue;
      [s.starts_at, s.ends_at] = when[s.name].map(at);
    }
  }
  // A row no page may ever frame: the unit tests cover the parser, this covers the page.
  sample.streams[0].streams.push({ id: 666, name: 'Hostile Row', tag: 'NFL', uri_name: 'x', starts_at: at(now - HOUR), ends_at: at(now + HOUR), always_live: 0, iframe: 'javascript:alert(document.domain)', substreams: [] });
  return sample;
}
const ID = { live: '18223', channel: '18172', upcoming: '18230', several: '18198' };
const rows = fixture('ppv.ts', 'PPV_STREAMS_2026_11_25').streams.flatMap((c) => c.streams);
const idOf = (name) => String(rows.find((s) => s.name === name).id);
ID.live = idOf('Gonzaga Bulldogs at Kansas State Wildcats');
ID.channel = idOf('NFL Network');
ID.upcoming = idOf('Sabah FK vs. Barcelona');
ID.several = idOf('TCU Horned Frogs at Texas Tech Red Raiders');
const EMBED_HOST = 'taifood-blog.asia';

const page1 = (results) => ({ page: 1, results, total_pages: 1, total_results: results.length });
const card = (id, name, lang, genres, extra = {}) => ({ id, title: name, name, original_title: name, original_name: name, original_language: lang, poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, overview: `${name}.`, vote_average: 8.1, vote_count: 900, genre_ids: genres, release_date: '2024-01-05', first_air_date: '2024-01-05', ...extra });
const ANIME = [card(1429, 'Attack on Titan', 'ja', [16, 10759]), card(37854, 'One Piece', 'ja', [16])];
// AniList's catalogue, in the live API's shape: two entries, found by name.
const alCard = (id, english, romaji) => ({ id, idMal: id, format: 'TV', status: 'FINISHED', episodes: 12, seasonYear: 2022, averageScore: 85, genres: ['Action'], title: { romaji, english, native: null }, coverImage: { large: `https://img.anilist.invalid/${id}.jpg` }, bannerImage: null, startDate: { year: 2022 }, nextAiringEpisode: null });
const AL = [alCard(131681, 'Attack on Titan Final Season Part 2', 'Shingeki no Kyojin: The Final Season Part 2'), { ...alCard(21, 'ONE PIECE', 'ONE PIECE'), status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 1181 } }];
const anilistAsked = [];
function anilist(body) {
  anilistAsked.push(body);
  const query = body.query ?? '';
  const names = [...query.matchAll(/(\w+): Page\(/g)].map((m) => m[1]);
  if (names.length) return { data: Object.fromEntries(names.map((n) => [n, { media: AL }])) };
  const search = String(body.variables?.s ?? '').toLowerCase();
  return { data: { Page: { pageInfo: { hasNextPage: false }, media: AL.filter((c) => !search || c.title.english.toLowerCase().includes(search)) } } };
}
const tmdbLog = [];
function tmdb(u) {
  const path = u.pathname.replace(/^\/3\//, '');
  const q = Object.fromEntries(u.searchParams);
  tmdbLog.push({ path, q });
  if (/^discover\/(movie|tv)$/.test(path)) return page1(q.with_original_language === 'ja' ? ANIME : [card(550, 'Fight Club', 'en', [18])]);
  // A name search finds everything Japanese: an anime and a live-action show of a similar name.
  if (path === 'search/multi') return page1([{ ...card(550, 'Fight Club', 'en', [18]), media_type: 'movie' }]);
  if (path === 'search/tv') return page1(/attack/i.test(q.query ?? '') ? [ANIME[0], card(777, 'Attack No. 1 (live action)', 'ja', [18])] : []);
  const show = /^tv\/(\d+)$/.exec(path);
  if (show) {
    const c = ANIME.find((a) => a.id === Number(show[1]));
    return { id: Number(show[1]), name: c?.name ?? 'A show', original_name: c?.name ?? 'A show', original_language: 'ja', origin_country: ['JP'], overview: 'A test.', poster_path: null, backdrop_path: null, vote_average: 8, genres: [{ id: 16, name: 'Animation' }], first_air_date: '2024-01-05', episode_run_time: [24], number_of_seasons: 1, seasons: [{ season_number: 1, episode_count: 3, name: 'Season 1', air_date: '2024-01-05', poster_path: null }], last_episode_to_air: { season_number: 1, episode_number: 3 }, external_ids: {} };
  }
  if (/^tv\/\d+\/season\/\d+$/.test(path)) return { season_number: 1, name: 'Season 1', overview: '', episodes: [1, 2, 3].map((n) => ({ id: 9000 + n, episode_number: n, season_number: 1, name: `Episode ${n}`, overview: '', still_path: null, air_date: '2024-01-05', runtime: 24 })) };
  if (path === 'movie/550') return { id: 550, title: 'Fight Club', original_title: 'Fight Club', original_language: 'en', overview: 'A test.', poster_path: null, backdrop_path: null, vote_average: 8, genres: [{ id: 18, name: 'Drama' }], runtime: 139, release_date: '1999-10-15', imdb_id: 'tt0137523', external_ids: { imdb_id: 'tt0137523' } };
  return page1([]);
}

// ---------- a resolver that never finds anything in time ----------
const asked = [];
const api = createServer((req, res) => {
  const url = new URL(req.url, base);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (url.pathname === '/v2/sources') {
    asked.push(Date.now());
    res.writeHead(200, { ...cors, 'Content-Type': 'application/x-ndjson' });
    // It plans, and then its providers take their time: the connection stays open and silent.
    res.write(JSON.stringify({ t: 'plan', runtime: 'server', providers: [{ id: 'slow', name: 'Slow', wave: 1 }], skipped: [] }) + '\n');
    return;
  }
  // What a server reports about its sources, and its control plane behind a token.
  const json = (body, status = 200) => res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  const run = (provider, over) => ({ provider, runtime: 'server', status: 'ok', reliability: 1, hitRate: 0.9, averageMs: 1800, ok: 9, empty: 1, failed: 0, benchedForSeconds: 0, lastSuccessAt: new Date(Date.now() - 120_000).toISOString(), verified: 8, unverified: 2, placement: 'works', ...over });
  if (url.pathname === '/v2/health') {
    return json({
      generatedAt: new Date().toISOString(), runtime: 'server', egress: 'datacenter', features: [], providers: [
        run('castle', {}),
        run('vidsrc', { status: 'benched', reliability: 0, hitRate: 0, ok: 0, empty: 0, failed: 6, verified: 0, unverified: 0, benchedForSeconds: 240, lastSuccessAt: undefined, lastFailureAt: new Date(Date.now() - 60_000).toISOString(), lastFailure: { code: 'CHALLENGE', label: 'Bot check', message: 'The site asked for a human check', host: 'vidsrc.example' }, placement: 'blocked' }),
      ],
      fleet: [run('vidsrc', { runtime: 'extension', ok: 4, empty: 0, failed: 0 })],
      placement: [{ provider: 'castle', verdict: 'works', worksOn: ['server'], blockedOn: [], unreachableOn: [], brokenOn: [] }, { provider: 'vidsrc', verdict: 'works-elsewhere', worksOn: ['extension'], blockedOn: ['server'], unreachableOn: [], brokenOn: [] }],
      proposals: [{ provider: 'castle', role: 'api', from: 'https://old.example', to: 'https://new.example' }],
    });
  }
  if (url.pathname.startsWith('/v2/admin')) {
    if (req.headers.authorization !== 'Bearer secret') return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    adminCalls.push(`${req.method} ${url.pathname}`);
    if (url.pathname === '/v2/admin/providers') return json({ registryVersion: 3, problems: [], providers: [{ id: 'castle', name: 'Castle', version: '1.2.0', stage: 'stable', rank: 10, runtimes: ['server'], domains: { roles: { api: { active: 'https://old.example', alternates: ['https://new.example'] } } } }, { id: 'vidsrc', name: 'VidSrc', version: '2.0.0', stage: 'canary', rank: 50, runtimes: ['server', 'extension'] }] });
    if (url.pathname === '/v2/admin/audit') return json({ audit: [{ at: new Date(Date.now() - 3_600_000).toISOString(), by: 'monitor', provider: 'vidsrc', action: 'set-stage', detail: { stage: 'canary' } }] });
    if (url.pathname === '/v2/admin/providers/castle/diagnose') return json({ provider: 'castle', addresses: [{ origin: 'https://old.example', host: 'old.example', role: 'api', position: 'active', dns: { status: 'nxdomain', addresses: [] }, verdict: 'DNS_FAILURE', summary: 'The name no longer exists', checkedAt: new Date().toISOString() }, { origin: 'https://new.example', host: 'new.example', role: 'api', position: 'alternate', dns: { status: 'ok', addresses: ['203.0.113.5'] }, http: { status: 200, ms: 120 }, verdict: 'ok', summary: 'Answers 200 in 120 ms', checkedAt: new Date().toISOString() }] });
    return json({ ok: true });
  }
  res.writeHead(404, cors).end('{}');
});
const adminCalls = [];
await new Promise((r) => api.listen(API, r));

const preview = spawn('npx', ['vite', 'preview', '--port', String(SITE), '--strictPort'], { cwd: join(here, '..'), stdio: 'ignore', detached: true });
const stopPreview = () => {
  try {
    process.kill(-preview.pid);
  } catch {
    preview.kill();
  }
};
for (let i = 0; i < 50; i++) {
  if (await fetch(`${site}/`).then((r) => r.ok, () => false)) break;
  await sleep(200);
}

// ---------- the browser ----------
const browser = await chromium.launch();
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
const section = (name) => console.log(`\n${name}`);
const shots = process.env.MODES_E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const shot = (page, name) => (shots ? page.screenshot({ path: join(shots, `${name}.png`) }).catch(() => {}) : undefined);
const until = async (test, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test()) return true;
    await sleep(100);
  }
  return false;
};

const DESKTOP = { viewport: { width: 1366, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/**
 * A browser context whose outside requests are answered here. `ppv` says how each of the
 * directory's addresses behaves: 'ok', 'down', or a function of the request.
 */
async function visitor(device, { ppv = { 'api.ppv.st': 'ok' }, state } = {}) {
  const context = await browser.newContext({ locale: 'en-GB', timezoneId: 'Asia/Kolkata', ...device });
  if (state) await context.addInitScript((s) => localStorage.getItem('charcoal:v2') ?? localStorage.setItem('charcoal:v2', s), JSON.stringify(state));
  const errors = [];
  const outside = [];
  const framed = [];
  /** Names the directory stops listing from now on (an event it has taken off). */
  const delisted = new Set();
  const listedNow = () => {
    const d = directory();
    for (const category of d.streams) category.streams = category.streams.filter((s) => !delisted.has(s.name));
    return d;
  };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.hostname === 'localhost') return route.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    outside.push(`${u.hostname}${u.pathname}`);
    if (u.hostname === 'api.themoviedb.org') return json(tmdb(u));
    if (u.hostname === 'graphql.anilist.co') return json(anilist(JSON.parse(request.postData() ?? '{}')));
    if (u.hostname === 'api.ppv.st' || u.hostname === 'api.ppv.cx') {
      const how = ppv[u.hostname] ?? 'down';
      return how === 'ok' ? json(listedNow()) : route.fulfill({ status: 502, headers, body: 'Bad Gateway' });
    }
    if (u.hostname === EMBED_HOST || u.hostname === 'vidlink.pro') {
      framed.push({ url: u.href, referer: request.headers().referer ?? null });
      return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>stand-in player</title><body style="margin:0;background:#123;color:#fff;font:16px sans-serif">player: ${u.pathname}<script>window.tried = 0; addEventListener('click', () => { window.tried++; window.opened = window.open('https://ads.example.invalid/'); });</script></body>` });
    }
    outside.pop();
    return route.abort(); // images, fonts, analytics: nothing leaves this machine
  });
  const open = async (path) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site}${path}`);
    return page;
  };
  return { context, open, errors, outside, framed, delisted };
}

const railLabels = (page) => page.locator('aside nav[aria-label="Browse"] a').evaluateAll((as) => as.map((a) => a.textContent.replace(/G [A-Z]$/, '').trim()));
const overflow = (page) => page.evaluate(() => ({ page: document.scrollingElement.scrollWidth, window: innerWidth }));
const text = async (locator) => ((await locator.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

// ===================================================================== A. one app
section('A. One app: titles and anime together, Sports beside them');
{
  const v = await visitor(DESKTOP, { state: { history: [], watchlist: [], settings: { sidebarOpen: true } } });
  const page = await v.open('/');
  await page.locator('aside nav[aria-label="Browse"]').waitFor({ timeout: 10000 }).catch(() => {});
  check('the sidebar is Home, Discover (Movies, TV shows) and Sports; there is no switch between parts', JSON.stringify(await railLabels(page)) === JSON.stringify(['Home', 'Discover', 'Movies', 'TV shows', 'Sports']) && (await page.getByTestId('mode-switch').count()) === 0, (await railLabels(page)).join(', '));

  // Anime has its own section on Home, switched by pill.
  const anime = page.getByTestId('anime-section');
  await anime.scrollIntoViewIfNeeded().catch(() => {});
  await anime.locator('a[data-anime]').first().waitFor({ timeout: 10000 }).catch(() => {});
  const pills = await anime.getByRole('group', { name: 'Anime' }).getByRole('button').allTextContents();
  check('Home has an Anime section with its own pills, from AniList in one request', JSON.stringify(pills) === JSON.stringify(['Trending', 'Airing', 'Popular', 'Top rated', 'Films']) && (await anime.locator('a[data-anime="131681"]').count()) === 1 && anilistAsked.filter((b) => /trending: Page/.test(b.query ?? '')).length === 1, pills.join(', '));
  check('…titles as posters, with no episode number on them', !/Ep \d/.test(await text(anime)));
  await anime.getByRole('button', { name: 'Airing' }).click();
  check('…and what is airing as episode banner cards', await until(async () => /Episode 1180/.test(await text(anime))) && (await anime.locator('a[data-anime="21"]').count()) === 1, (await text(anime)).slice(0, 120));
  await shot(page, 'home-anime');

  // Discover narrows by where a title is from.
  await page.goto(`${site}/discover`);
  const from = page.getByRole('group', { name: 'From' });
  await from.waitFor({ timeout: 10000 }).catch(() => {});
  check('Discover can be narrowed to a part of the world', JSON.stringify(await from.getByRole('button').allTextContents()) === JSON.stringify(['Everywhere', 'Western', 'Bollywood', 'Asian', 'Anime']));
  tmdbLog.length = 0;
  await from.getByRole('button', { name: 'Anime' }).click();
  await until(() => tmdbLog.some((r) => r.path === 'discover/tv' && r.q.with_original_language === 'ja'));
  const asked = tmdbLog.find((r) => r.path === 'discover/tv' && r.q.with_original_language === 'ja');
  check('“Anime” asks for Japanese animation', page.url().endsWith('/discover?region=anime') && asked?.q.with_genres === '16', JSON.stringify(asked?.q));
  await from.getByRole('button', { name: 'Asian' }).click();
  await until(() => tmdbLog.some((r) => /ko/.test(r.q.with_original_language ?? '')));
  const asian = tmdbLog.find((r) => /ko/.test(r.q.with_original_language ?? ''));
  check('“Asian” asks for Korean, Chinese, Thai and Japanese titles that are not animation', asian?.q.with_original_language === 'ko|zh|cn|th|ja' && asian?.q.without_genres === '16', JSON.stringify(asian?.q));

  // The old addresses still lead somewhere.
  const redirects = [];
  for (const [old, now] of [['/anime', '/discover?region=anime'], ['/indian', '/discover?region=bollywood'], ['/sports/schedule', '/sports?tab=schedule'], ['/sports/channels', '/sports?tab=channels']]) {
    await page.goto(`${site}${old}`);
    await until(() => page.url() === `${site}${now}`, 4000);
    redirects.push(page.url().replace(site, '') === now);
  }
  check('the pages that were folded in redirect to where their content is now', redirects.every(Boolean), redirects.join(','));
  await page.keyboard.press('g');
  await page.keyboard.press('o');
  check('“g o” opens Sports', await until(() => page.url() === `${site}/sports`), page.url().replace(site, ''));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== C. sports
section('C. Sports: a small app of its own');
{
  const v = await visitor(DESKTOP);
  const page = await v.open('/sports');
  const live = page.getByTestId('live-events');
  await live.waitFor({ timeout: 10000 }).catch(() => {});
  const tabs = await page.getByRole('group', { name: 'Sports' }).getByRole('button').allTextContents();
  check('Sports is one page with Live, Schedule and Channels on top, and no explanatory text', JSON.stringify(tabs) === JSON.stringify(['Live', 'Schedule', 'Channels']) && !/time zone|third-party|coming up/i.test(await text(page.locator('main'))), tabs.join(', '));
  const liveText = await text(live);
  check('Live: the event in progress, as a banner card marked live', (await live.locator('li').count()) === 1 && /Live/.test(liveText) && /Gonzaga Bulldogs at Kansas State Wildcats/.test(liveText) && /College Basketball/.test(liveText), liveText.slice(0, 120));
  await page.getByRole('group', { name: 'Sports' }).getByRole('button', { name: 'Schedule' }).click();
  const upcoming = page.getByTestId('upcoming-events');
  await upcoming.waitFor({ timeout: 8000 }).catch(() => {});
  const days = await upcoming.locator('h2').allTextContents();
  const order = await upcoming.locator('a[data-listing]').evaluateAll((as) => as.map((a) => a.getAttribute('title')));
  check('Schedule: what the player can open later, as banner cards under their day, soonest first', page.url().endsWith('/sports?tab=schedule') && days[0] === 'Today' && days.length >= 2 && JSON.stringify(order) === JSON.stringify(['Virginia Cavaliers at Marquette Golden Eagles', 'Sabah FK vs. Barcelona', 'Slavia Prague vs. Villarreal', 'TCU Horned Frogs at Texas Tech Red Raiders']), `${days.join(' | ')} :: ${order.join(' | ')}`);
  const stamp = await upcoming.locator(`a[data-listing="${ID.upcoming}"]`).locator('xpath=..').locator('time').getAttribute('datetime');
  const local = new Date(stamp).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  check('…each with its start time in the viewer’s own time zone', (await text(upcoming)).includes(local), local);
  check('…and nothing that cannot be opened: no fixtures from elsewhere, no unsafe row', !/Hostile Row/.test(await text(page.locator('main'))) && v.outside.every((o) => !o.includes('thesportsdb')));
  await shot(page, 'sports-schedule');

  await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: 'Football', exact: true }).click();
  const listedNow = () => page.locator('main a[data-listing]').count();
  check('a sport’s pill narrows the view to that sport', (await until(async () => (await listedNow()) === 2)) && /sport=Football/.test(page.url()), `${page.url().replace(site, '')}: ${await listedNow()} listed`);
  await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: 'All', exact: true }).click();

  // Its own search, apart from the app's.
  const own = page.getByRole('searchbox', { name: 'Search sports' });
  await own.fill('barcelona');
  check('Sports has its own search, which narrows the view as you type', await until(async () => /q=barcelona/.test(page.url()) && (await listedNow()) === 1) && (await page.getByTestId('search-preview').count()) === 0, page.url().replace(site, ''));
  await own.fill('zzzz');
  check('…and says when nothing matches', await until(async () => /Nothing found for “zzzz”/.test(await text(page.locator('main')))));
  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  await page.getByRole('group', { name: 'Sports' }).getByRole('button', { name: 'Channels' }).click();
  const chans = page.getByTestId('directory-channels');
  await chans.waitFor({ timeout: 8000 }).catch(() => {});
  check('Channels: the always-on channels, and no entertainment marathons', (await chans.locator(`a[data-listing="${ID.channel}"]`).count()) === 1 && !/South Park/.test(await text(page.locator('main'))));
  await page.getByRole('group', { name: 'Sports' }).getByRole('button', { name: 'Live' }).click();
  await live.waitFor({ timeout: 5000 }).catch(() => {});

  // ---- watching ----
  await live.locator('a[data-listing]').click();
  await page.waitForURL(new RegExp(`/sports/watch/${ID.live}$`), { timeout: 5000 }).catch(() => {});
  const frame = page.locator('iframe');
  await frame.waitFor({ timeout: 8000 }).catch(() => {});
  const attrs = await frame.evaluate((f) => ({ src: f.src, sandbox: f.getAttribute('sandbox'), referrerpolicy: f.getAttribute('referrerpolicy'), allow: f.getAttribute('allow') })).catch(() => null);
  check('a live event opens the directory’s own player in a frame', attrs?.src === `https://${EMBED_HOST}/embed/cbb/2026-11-25/gonz-ksu` && /fullscreen/.test(attrs?.allow ?? ''), JSON.stringify(attrs));
  check('…without telling that site which page framed it', attrs?.referrerpolicy === 'no-referrer' && v.framed.length > 0 && v.framed.every((f) => f.referer === null), JSON.stringify(v.framed[0]));
  const header = await text(page.getByTestId('sports-watch').locator('h1').locator('..'));
  check('…under its name, competition and state', /Gonzaga Bulldogs at Kansas State Wildcats/.test(header) && /College Basketball · Live/.test(header), header);
  const note = page.getByTestId('embed-note');
  check('the first time, it says the player is another site’s', /belongs to another site, not Charcoal/.test(await text(note)));
  await shot(page, 'sports-watch');

  // Pop-ups: allowed as the site's other embedded players are by default, blocked on request.
  const inFrame = page.frameLocator('iframe');
  await inFrame.locator('body').click();
  const before = await page.frames().find((f) => f.url().includes(EMBED_HOST)).evaluate(() => ({ tried: window.tried, opened: !!window.opened }));
  await note.getByRole('button', { name: 'Block pop-ups' }).click();
  await until(async () => (await frame.getAttribute('sandbox')) !== null);
  const sandbox = (await frame.getAttribute('sandbox')) ?? '';
  await page.frameLocator('iframe').locator('body').click();
  const after = await until(async () => (await page.frames().find((f) => f.url().includes(EMBED_HOST))?.evaluate(() => window.tried).catch(() => 0)) === 1).then(() => page.frames().find((f) => f.url().includes(EMBED_HOST)).evaluate(() => ({ tried: window.tried, opened: !!window.opened })));
  check('“Block pop-ups” reloads the frame sandboxed: scripts run, pop-ups and leaving the page do not', before.opened === true && /allow-scripts/.test(sandbox) && !/allow-popups|allow-top-navigation/.test(sandbox) && after.tried === 1 && after.opened === false, `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}, sandbox="${sandbox}"`);
  check('…and the note then says so', /pop-ups from it are blocked/.test(await text(note)));
  await note.getByRole('button', { name: 'Dismiss' }).click();
  // (The store writes itself to disk a moment after a change.)
  check('the note can be dismissed for good', (await note.count()) === 0 && (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem('charcoal:v2') ?? '{}').settings?.embedNoticeOff === true))));

  // Reload: a new frame for the same stream.
  const loads = v.framed.length;
  await page.getByRole('button', { name: /Reload the player/ }).click();
  check('Reload loads the player again', await until(() => v.framed.length === loads + 1));
  await page.keyboard.press('Escape');
  check('Esc closes the player and returns to where it was opened from', await until(() => page.url() === `${site}/sports`), page.url().replace(site, ''));

  // An event with several streams.
  await page.goto(`${site}/sports/watch/${ID.several}`);
  const early = page.getByTestId('not-yet');
  await early.waitFor({ timeout: 8000 }).catch(() => {});
  check('an event that hasn’t started shows when it does instead of a player', /Starts in 1 day|Starts in 2\d h/.test(await text(early)) && /Tomorrow at|at \d/.test(await text(early)) && (await page.locator('iframe').count()) === 0 && v.framed.every((f) => !f.url.includes('tcu-ttu')), (await text(early)).slice(0, 120));
  await shot(page, 'sports-not-yet');
  await early.getByRole('button', { name: 'Open the player now' }).click();
  await page.locator('iframe').waitFor({ timeout: 5000 }).catch(() => {});
  await page.getByRole('button', { name: /^Stream:/ }).click();
  const options = await page.getByRole('menuitemradio').allTextContents();
  check('…and can be opened early, with every stream the directory lists for it', JSON.stringify(options) === JSON.stringify(['HD · ESPN', 'SD · ESPN', 'HD · SkyCast', 'SD · SkyCast']), options.join(' | '));
  await page.getByRole('menuitemradio', { name: 'HD · SkyCast' }).click();
  check('choosing another stream loads that one', await until(async () => (await page.locator('iframe').getAttribute('src')) === `https://${EMBED_HOST}/embed/cfb/2026-11-26/tcu-ttu/skycast`), (await page.locator('iframe').getAttribute('src')) ?? '');
  check('the pop-up choice made earlier still holds', (await page.locator('iframe').getAttribute('sandbox')) !== null);

  await page.goto(`${site}/sports/watch/${ID.channel}`);
  await page.locator('iframe').waitFor({ timeout: 8000 }).catch(() => {});
  check('a channel plays straight away and is “always on”', (await page.locator('iframe').getAttribute('src')) === `https://${EMBED_HOST}/embed/nfl-network` && /American Football · Always on/.test(await text(page.getByTestId('sports-watch'))));

  await page.goto(`${site}/sports/watch/666`);
  const gone = page.getByTestId('sports-message');
  await gone.waitFor({ timeout: 8000 }).catch(() => {});
  check('an entry that isn’t listed (ended, or never safe to frame) gets a plain message and no frame', /isn’t on any more/.test(await text(gone)) && (await page.locator('iframe').count()) === 0 && (await gone.getByRole('link', { name: 'See what’s on' }).getAttribute('href')) === '/sports', await text(gone));
  check('nothing but the directory, TMDB and the framed player was contacted', v.outside.every((o) => /^(api\.ppv\.st\/api\/streams|api\.themoviedb\.org\/|taifood-blog\.asia\/embed\/)/.test(o)), [...new Set(v.outside.map((o) => o.split('/')[0]))].join(', '));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}
{
  // A game in extra time: the clock passes its scheduled end, and the directory takes it off.
  const v = await visitor(DESKTOP);
  const page = await v.context.newPage();
  page.on('pageerror', (e) => v.errors.push(e.message));
  await page.clock.install();
  await page.goto(`${site}/sports/watch/${ID.live}`);
  const frame = page.locator('iframe');
  await frame.waitFor({ timeout: 8000 }).catch(() => {});
  const src = await frame.getAttribute('src').catch(() => null);
  const loads = v.framed.length;
  const asks = () => v.outside.filter((o) => o.startsWith('api.ppv.st')).length;
  const before = asks();
  v.delisted.add('Gonzaga Bulldogs at Kansas State Wildcats');
  await page.clock.fastForward('03:00:00');
  await until(() => asks() > before, 5000);
  await sleep(800);
  check('a player that is open stays open past the scheduled end and after the directory drops the event', asks() > before && (await frame.getAttribute('src').catch(() => null)) === src && !!src && v.framed.length === loads && (await page.getByTestId('ended').count()) === 0 && (await page.getByTestId('sports-message').count()) === 0, `asked again ${asks() - before}×, ${v.framed.length - loads} reloads`);
  await page.goto(`${site}/sports/watch/${ID.live}`);
  check('…while opening it afresh then says it isn’t on any more', await until(async () => /isn’t on any more/.test(await text(page.getByTestId('sports-message')))));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}
{
  const v = await visitor(DESKTOP, { ppv: { 'api.ppv.st': 'down', 'api.ppv.cx': 'ok' } });
  const page = await v.open('/sports');
  const listed = await page.getByTestId('live-events').waitFor({ timeout: 10000 }).then(() => true, () => false);
  check('when the directory’s first address is down, its second one answers', listed && v.outside.includes('api.ppv.st/api/streams') && v.outside.includes('api.ppv.cx/api/streams'), [...new Set(v.outside.filter((o) => o.startsWith('api.ppv')))].join(', '));
  await v.context.close();
}
{
  const v = await visitor(DESKTOP, { ppv: {} });
  const page = await v.open('/sports');
  const main = page.locator('main');
  check('with the whole directory down, the page says so and offers to try again', await until(async () => /Couldn’t load what’s on/.test(await text(main)), 25000) && (await main.getByRole('button', { name: /try again|retry/i }).count()) === 1, (await text(main)).slice(0, 160));
  await page.goto(`${site}/sports/watch/${ID.live}`);
  const failed = page.getByTestId('sports-message');
  check('…and a stream’s page says the same, with a way to try again', await until(async () => /Couldn’t load this stream/.test(await text(failed)), 25000) && (await failed.getByRole('button', { name: 'Try again' }).count()) === 1, await text(failed));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== C2. one search
section('C2. One search for titles and anime');
{
  const v = await visitor(DESKTOP);
  const page = await v.open('/');
  const box = page.getByRole('searchbox', { name: 'Search', exact: true });
  await box.click();
  await box.pressSequentially('attack', { delay: 20 });
  const preview = page.getByTestId('search-preview');
  await preview.waitFor({ timeout: 8000 }).catch(() => {});
  await until(async () => (await preview.locator('a[data-result]').count()) >= 2);
  const results = await preview.locator('a[data-result]').evaluateAll((as) => as.map((a) => a.getAttribute('data-result')));
  check('typing shows one list under the field: titles from TMDB and the anime only AniList has', results[0] === 'movie550' && results.includes('anilist131681') && /Top result/i.test(await text(preview)) && page.url() === `${site}/`, results.join(', '));
  check('…with nothing from Sports in it', v.outside.every((o) => !o.startsWith('api.ppv')) && !/Barcelona/.test(await text(preview)));
  await shot(page, 'search-preview');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check('arrow keys mark a result', (await preview.locator('a[aria-selected="true"]').getAttribute('data-result')) === results[1]);
  await page.keyboard.press('Enter');
  check('…and Enter opens it', await until(() => page.url() === `${site}/anime/title/131681`), page.url().replace(site, ''));
  await page.goto(`${site}/`);
  await page.getByRole('searchbox', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search', exact: true }).pressSequentially('attack', { delay: 20 });
  await preview.waitFor({ timeout: 8000 }).catch(() => {});
  await page.keyboard.press('Enter');
  check('Enter with nothing marked opens the full results', await until(() => page.url() === `${site}/discover?q=attack`), page.url().replace(site, ''));
  const more = page.getByTestId('more-anime');
  check('…where the anime only AniList has are listed too', await more.waitFor({ timeout: 8000 }).then(() => true, () => false) && (await more.locator('a[data-anime="131681"]').count()) === 1);
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== C3. the status page
section('C3. Status of a server’s sources');
{
  const v = await visitor(DESKTOP);
  const page = await v.open('/admin');
  const list = page.getByTestId('admin-providers');
  await list.waitFor({ timeout: 10000 }).catch(() => {});
  const summary = await text(page.getByTestId('admin-summary'));
  check('without a token it shows the public picture: what works, what is in trouble, where it runs from', /Working2/.test(summary) && /1 only from viewers’ connections/.test(summary) && /Data centre/.test(summary) && /80%/.test(summary), summary.slice(0, 200));
  const first = list.locator('li[data-provider]').first();
  check('providers are listed worst first, with the reason', (await first.getAttribute('data-provider')) === 'vidsrc' && /works elsewhere/i.test(await text(first)) && /Bot check · vidsrc\.example/.test(await text(first)), await text(first));
  check('a proposed address change is shown', /castle \(api\): https:\/\/old\.example → https:\/\/new\.example/.test(await text(page.locator('main'))));
  check('…and nothing that needs the token is offered or asked for', (await page.getByRole('button', { name: /recovery/ }).count()) === 0 && adminCalls.length === 0);
  await page.getByPlaceholder('ADMIN_TOKEN of that server').fill('wrong');
  check('a wrong token is said to be refused, and the public status stays', await until(async () => /admin token was refused/.test(await text(page.locator('main')))) && (await list.count()) === 1);
  await page.getByPlaceholder('ADMIN_TOKEN of that server').fill('secret');
  const castle = list.locator('li[data-provider="castle"]');
  await until(async () => /stable/i.test(await text(castle)));
  await castle.getByRole('button').first().click();
  await castle.getByRole('button', { name: 'Check its addresses' }).click();
  const diagnosis = castle.getByTestId('admin-diagnosis');
  await diagnosis.waitFor({ timeout: 8000 }).catch(() => {});
  check('with the token: stages, addresses, and an address check on demand', /The name no longer exists/.test(await text(diagnosis)) && /Answers 200/.test(await text(diagnosis)) && /api https:\/\/old\.example \(\+1 alternate\)/.test(await text(castle)), (await text(diagnosis)).slice(0, 160));
  await castle.getByRole('button', { name: 'Disable' }).click();
  check('…a stage change goes to the control plane, and the audit log is shown', await until(() => adminCalls.includes('POST /v2/admin/providers/castle')) && /vidsrc\s*set stage/.test(await text(page.locator('main'))), adminCalls.slice(-3).join(', '));
  check('the token is kept for this tab only', (await page.evaluate(() => [sessionStorage.getItem('charcoal:admin-token'), JSON.stringify(localStorage).includes('secret')])).join() === 'secret,false');
  await shot(page, 'admin');
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== D. a phone
section('D. On a phone');
{
  const v = await visitor(PHONE);
  const page = await v.open('/');
  await page.locator('nav[aria-label="Main"]').waitFor({ timeout: 10000 }).catch(() => {});
  const bar = () => page.locator('nav[aria-label="Main"] a').evaluateAll((as) => as.map((a) => a.textContent.trim()));
  check('the bar is Home, Movies, TV, Profile around Search; there is no sidebar', JSON.stringify(await bar()) === JSON.stringify(['Home', 'Movies', 'TV', 'Profile']) && !(await page.locator('aside').isVisible()), (await bar()).join(', '));
  const fits = async (name) => {
    const o = await overflow(page);
    check(`${name} fits a phone’s width`, o.page <= o.window, `${o.page}px in ${o.window}px`);
  };
  await page.getByTestId('anime-section').scrollIntoViewIfNeeded().catch(() => {});
  await page.getByTestId('anime-section').locator('a[data-anime]').first().waitFor({ timeout: 10000 }).catch(() => {});
  await fits('Home, with its Anime section');
  await shot(page, 'phone-home');
  await page.getByRole('link', { name: 'Sports', exact: true }).tap();
  await page.waitForURL(/\/sports$/, { timeout: 5000 }).catch(() => {});
  await page.getByTestId('live-events').waitFor({ timeout: 10000 }).catch(() => {});
  check('Home leads to Sports', page.url() === `${site}/sports`);
  await fits('Sports');
  await shot(page, 'phone-sports');
  await page.getByRole('group', { name: 'Sports' }).getByRole('button', { name: 'Schedule' }).tap();
  await page.getByTestId('upcoming-events').waitFor({ timeout: 8000 }).catch(() => {});
  await fits('Sports’ schedule');
  await page.getByRole('group', { name: 'Sports' }).getByRole('button', { name: 'Channels' }).tap();
  await page.getByTestId('directory-channels').waitFor({ timeout: 8000 }).catch(() => {});
  await fits('Sports’ channels');
  await page.goto(`${site}/discover?region=anime`);
  await page.getByRole('group', { name: 'From' }).waitFor({ timeout: 8000 }).catch(() => {});
  await fits('Discover with its region pills');

  // The app's search opens from the bar.
  await page.goto(`${site}/`);
  await page.locator('[data-search-trigger]').tap();
  const box = page.getByRole('searchbox', { name: 'Search', exact: true });
  check('the search button opens the field', await until(async () => (await box.evaluate((i) => document.activeElement === i && i.getBoundingClientRect().width > 100).catch(() => false))));
  await box.pressSequentially('attack', { delay: 20 });
  const preview = page.getByTestId('search-preview');
  await preview.waitFor({ timeout: 8000 }).catch(() => {});
  const previewFits = await preview.evaluate((m) => { const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }).catch(() => false);
  check('…and its preview fits the screen', previewFits);
  await fits('Home with the search preview out');

  await page.goto(`${site}/sports/watch/${ID.several}`);
  await page.getByTestId('not-yet').getByRole('button', { name: 'Open the player now' }).tap();
  await page.locator('iframe').waitFor({ timeout: 8000 }).catch(() => {});
  const box2 = await page.locator('iframe').boundingBox();
  check('the player fills the screen below its header', !!box2 && Math.round(box2.width) === 390 && box2.height > 600, JSON.stringify(box2));
  await page.getByRole('button', { name: /^Stream:/ }).tap();
  const menu = page.getByRole('menu');
  const inside = await menu.evaluate((m) => { const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }).catch(() => false);
  check('the stream menu fits the screen and offers the player in a new tab', inside && (await menu.getByRole('menuitem', { name: /new tab/ }).getAttribute('href')) === `https://${EMBED_HOST}/embed/cfb/2026-11-26/tcu-ttu`);
  await fits('the player page');
  await shot(page, 'phone-watch');
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}
{
  // The narrowest phones still in use.
  const v = await visitor({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  const page = await v.open('/sports');
  await page.getByTestId('live-events').waitFor({ timeout: 10000 }).catch(() => {});
  const o = await overflow(page);
  check('at 320 px the page still fits', o.page <= o.window, `${o.page}px in ${o.window}px`);
  await shot(page, 'phone-320');
  await v.context.close();
}

// ===================================================================== E. nothing set up
section('E. A search that is slow');
{
  // Sources can take a while (and a second search often finds what the first missed): the page
  // waits and offers the embedded player; it does not switch to it by itself mid-search.
  const v = await visitor(DESKTOP);
  const page = await v.open('/watch/movie/550');
  await sleep(9500);
  check('while Jelly is still searching, the viewer is not moved to the embedded player', (await page.locator('iframe').count()) === 0 && /Finding sources/.test(await text(page.locator('body'))));
  const offer = page.getByRole('button', { name: 'Use an embedded player instead' });
  check('…but is offered it after a few seconds', (await offer.count()) === 1);
  await offer.click();
  // The first time, what an embedded player is gets said before switching.
  await page.getByRole('button', { name: 'Continue' }).click();
  check('…and gets it on asking', await page.locator('iframe').waitFor({ timeout: 8000 }).then(() => true, () => false) && /vidlink\.pro\/movie\/550/.test((await page.locator('iframe').getAttribute('src')) ?? ''));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

await browser.close();
stopPreview();
api.close();
api.closeAllConnections?.();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
