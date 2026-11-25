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
const AL = [alCard(131681, 'Attack on Titan Final Season Part 2', 'Shingeki no Kyojin: The Final Season Part 2'), alCard(21, 'ONE PIECE', 'ONE PIECE')];
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

const current = (page) => page.getByTestId('mode-switch').first().locator('[aria-current="true"]').textContent().catch(() => null);
const railLabels = (page) => page.locator('aside nav[aria-label="Browse"] a').evaluateAll((as) => as.map((a) => a.textContent.replace(/G [A-Z]$/, '').trim()));
const overflow = (page) => page.evaluate(() => ({ page: document.scrollingElement.scrollWidth, window: innerWidth }));
const text = async (locator) => ((await locator.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

// ===================================================================== A. the switch (desktop)
section('A. Screen, Anime, Sports: the switch in the sidebar');
{
  const v = await visitor(DESKTOP, { state: { history: [], watchlist: [], settings: { sidebarOpen: true } } });
  const page = await v.open('/');
  const nav = page.locator('aside').getByTestId('mode-switch');
  await nav.waitFor({ timeout: 10000 }).catch(() => {});
  const links = await nav.locator('a').evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]));
  check('the sidebar has the switch, below the logo and above the navigation', JSON.stringify(links) === JSON.stringify([['Screen', '/'], ['Anime', '/anime'], ['Sports', '/sports']]) && (await page.evaluate(() => {
    const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return top('aside a[aria-label="Charcoal home"]') < top('aside [data-testid="mode-switch"]') && top('aside [data-testid="mode-switch"]') < top('aside nav[aria-label="Browse"]');
  })), JSON.stringify(links));
  check('Screen is the part a new visitor starts in, with its own navigation', (await current(page)) === 'Screen' && JSON.stringify(await railLabels(page)) === JSON.stringify(['Home', 'Discover', 'Movies', 'TV shows', 'Indian cinema']), (await railLabels(page)).join(', '));
  check('…and its search', (await page.getByRole('searchbox').getAttribute('placeholder')) === 'Search movies & TV shows');
  await shot(page, 'screen');

  await nav.getByRole('link', { name: 'Anime' }).click();
  await page.waitForURL(/\/anime$/, { timeout: 5000 }).catch(() => {});
  await page.locator('a[data-anime]').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('Anime: its home, its navigation, its search', (await current(page)) === 'Anime' && JSON.stringify(await railLabels(page)) === JSON.stringify(['Home', 'Series', 'Films']) && (await page.getByRole('searchbox').getAttribute('placeholder')) === 'Search anime', (await railLabels(page)).join(', '));
  const rowsShown = await page.locator('main section h2').allTextContents();
  check('…with rows into AniList’s catalogue', ['Trending now', 'Airing this season', 'Popular series', 'Popular films'].every((t) => rowsShown.includes(t)) && (await page.locator('main a[data-anime="131681"]').count()) > 0, rowsShown.join(' | '));
  check('the logo leads to the home of the part you are in', (await page.locator('aside a[aria-label="Charcoal home"]').getAttribute('href')) === '/anime');
  await shot(page, 'anime');

  // Search in Anime stays in Anime, and finds anime only.
  await page.getByRole('searchbox').fill('attack');
  await page.getByRole('searchbox').press('Enter');
  await page.waitForURL(/\/anime\/browse\?q=attack$/, { timeout: 5000 }).catch(() => {});
  await page.getByRole('heading', { name: '“attack”' }).waitFor({ timeout: 10000 }).catch(() => {});
  await page.getByTestId('anime-grid').waitFor({ timeout: 10000 }).catch(() => {});
  const found = await page.locator('main a[data-anime]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const searched = anilistAsked.find((b) => b.variables?.s === 'attack');
  check('an anime search asks AniList by name and shows its entries', page.url().endsWith('/anime/browse?q=attack') && JSON.stringify(found) === JSON.stringify(['/anime/title/131681']) && !!searched && /format_in: \[TV, TV_SHORT, ONA, OVA, SPECIAL\]/.test(searched.query) && (await current(page)) === 'Anime', `${page.url().replace(site, '')} → ${found.join(', ')}`);
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Films' }).click();
  check('…and switching to films keeps what was searched for', await until(() => /\/anime\/browse\?(q=attack&type=movie|type=movie&q=attack)$/.test(page.url())), page.url().replace(site, ''));

  // A title's page belongs to every part: the switch stays where it was.
  await page.goto(`${site}/tv/37854`);
  await page.getByRole('heading', { name: 'One Piece' }).first().waitFor({ timeout: 10000 }).catch(() => {});
  check('a title opened from Anime keeps Anime selected', (await current(page)) === 'Anime', page.url().replace(site, ''));

  await page.locator('aside').getByTestId('mode-switch').getByRole('link', { name: 'Sports' }).click();
  await page.waitForURL(/\/sports$/, { timeout: 5000 }).catch(() => {});
  await page.getByTestId('live-events').waitFor({ timeout: 10000 }).catch(() => {});
  check('Sports: its home, its navigation, its search', (await current(page)) === 'Sports' && JSON.stringify(await railLabels(page)) === JSON.stringify(['Live', 'Schedule', 'Channels']) && (await page.getByRole('searchbox').getAttribute('placeholder')) === 'Search teams and leagues', (await railLabels(page)).join(', '));
  check('the search field has no title filters outside Screen', (await page.getByRole('button', { name: /^Filters/ }).count()) === 0);

  // Collapsed, the same three are icons with names.
  await page.keyboard.press('[');
  const icons = await page.locator('aside [data-testid="mode-switch"] a').evaluateAll((as) => as.map((a) => [a.getAttribute('aria-label'), a.textContent.trim().length > 0 && !a.querySelector('svg')]));
  check('with the sidebar collapsed the switch is three named icons', await until(async () => (await page.locator('aside').evaluate((a) => a.getBoundingClientRect().width)) <= 80) && JSON.stringify(icons.map((i) => i[0])) === JSON.stringify(['Screen', 'Anime', 'Sports']), JSON.stringify(icons));
  await shot(page, 'sports-collapsed');
  await page.keyboard.press('[');

  // Shortcuts follow the part.
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  check('“g h” goes to the home of the part you are in', await until(() => page.url() === `${site}/sports`), page.url().replace(site, ''));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== B. where Charcoal opens
section('B. Opening Charcoal again');
{
  const v = await visitor(DESKTOP);
  let page = await v.open('/sports');
  await page.getByTestId('live-events').waitFor({ timeout: 10000 }).catch(() => {});
  await page.close();
  page = await v.open('/');
  check('opening the site lands in the part used last', await until(() => page.url() === `${site}/sports`) && (await current(page)) === 'Sports', page.url().replace(site, ''));
  await page.goto(`${site}/discover?type=movie`);
  check('a link to a page still opens that page', page.url() === `${site}/discover?type=movie` && (await current(page)) === 'Screen', page.url().replace(site, ''));
  await page.close();
  page = await v.open('/');
  check('…and after using Screen, the site opens on Screen', page.url() === `${site}/` && (await current(page)) === 'Screen', page.url().replace(site, ''));
  await page.goto(`${site}/sports`);
  await page.locator('aside').getByTestId('mode-switch').getByRole('link', { name: 'Screen' }).click();
  check('choosing Screen in the switch goes to Screen and stays there', await until(() => page.url() === `${site}/`) && (await sleep(400), page.url() === `${site}/`) && (await current(page)) === 'Screen', page.url().replace(site, ''));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== C. sports
section('C. Sports: what is on, and watching it');
{
  const v = await visitor(DESKTOP);
  const page = await v.open('/sports');
  const live = page.getByTestId('live-events');
  await live.waitFor({ timeout: 10000 }).catch(() => {});
  const liveText = await text(live);
  check('the event in progress is under “Live now”, marked live, with its competition and viewers', (await live.locator('li').count()) === 1 && /Live/.test(liveText) && /Gonzaga Bulldogs at Kansas State Wildcats/.test(liveText) && /College Basketball/.test(liveText) && /51/.test(liveText), liveText.slice(0, 140));
  const upcoming = page.getByTestId('upcoming-events');
  const days = await upcoming.locator('h3').allTextContents();
  const order = await upcoming.locator('a[data-listing]').evaluateAll((as) => as.map((a) => a.querySelector('span span').textContent));
  check('what is still to start is under “Coming up”, soonest first, grouped by day', days.length >= 2 && /Tomorrow|^[A-Z][a-z]{2} /.test(days[days.length - 1]) && JSON.stringify(order) === JSON.stringify(['Virginia Cavaliers at Marquette Golden Eagles', 'Sabah FK vs. Barcelona', 'Slavia Prague vs. Villarreal', 'TCU Horned Frogs at Texas Tech Red Raiders']), `${days.join(' | ')} :: ${order.join(' | ')}`);
  const row = upcoming.locator(`a[data-listing="${ID.upcoming}"]`);
  const stamp = await row.locator('time').getAttribute('datetime');
  const local = new Date(stamp).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  check('…with start times in the viewer’s own time zone and how long until then', (await text(row)).includes(local) && /in 2 h 5\d min|in 3 h/.test(await text(row)), `${await text(row)} (expects ${local})`);
  const all = await text(page.locator('main'));
  check('channels and the entertainment marathons are not among the events', !/NFL Network/.test(all) && !/South Park/.test(all));
  check('a row that could not be framed safely is not on the page at all', !/Hostile Row/.test(all));
  check('the page says where the events come from', /third-party directory/.test(all));
  await shot(page, 'sports');

  await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: 'Football', exact: true }).click();
  const listedNow = () => page.locator('main a[data-listing]').count();
  check('a sport’s pill narrows the page to that sport', (await until(async () => (await listedNow()) === 2)) && page.url().endsWith('/sports?sport=Football') && (await page.getByTestId('live-events').count()) === 0, `${page.url().replace(site, '')}: ${await listedNow()} listed`);
  await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: 'All', exact: true }).click();

  await page.getByRole('searchbox').fill('barcelona');
  check('typing in the search narrows the page as you type', await until(async () => page.url().endsWith('/sports?q=barcelona') && (await page.locator('main a[data-listing]').count()) === 1), page.url().replace(site, ''));
  await page.getByRole('searchbox').fill('nfl network');
  check('a search also finds a channel', await until(async () => (await page.locator(`main a[data-listing="${ID.channel}"]`).count()) === 1));
  await page.getByRole('searchbox').fill('zzzz');
  check('a search with no match says so', await until(async () => /Nothing found for “zzzz”/.test(await text(page.locator('main')))));
  await page.getByRole('button', { name: 'Clear search' }).click();
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
  check('nothing but the directory, the two catalogues the search looks in, and the framed player was contacted', v.outside.every((o) => /^(api\.ppv\.st\/api\/streams|api\.themoviedb\.org\/|graphql\.anilist\.co\/|taifood-blog\.asia\/embed\/)/.test(o)), [...new Set(v.outside.map((o) => o.split('/')[0]))].join(', '));
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
  check('with the whole directory down, the page says so and offers the pages that don’t depend on it', await until(async () => /Couldn’t load what’s on/.test(await text(main)), 25000) && (await main.getByRole('link', { name: 'Channels' }).getAttribute('href')) === '/sports/channels' && (await main.getByRole('link', { name: 'Schedule' }).getAttribute('href')) === '/sports/schedule' && (await main.getByRole('button', { name: /try again|retry/i }).count()) === 1, (await text(main)).slice(0, 160));
  await page.goto(`${site}/sports/watch/${ID.live}`);
  const failed = page.getByTestId('sports-message');
  check('…and a stream’s page says the same, with a way to try again', await until(async () => /Couldn’t load this stream/.test(await text(failed)), 25000) && (await failed.getByRole('button', { name: 'Try again' }).count()) === 1, await text(failed));
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}

// ===================================================================== C2. one search for everything
section('C2. A search that looks everywhere');
{
  const v = await visitor(DESKTOP);
  const page = await v.open('/');
  const box = page.getByRole('searchbox');
  await box.click();
  await box.pressSequentially('barcelona', { delay: 20 });
  const preview = page.getByTestId('search-preview');
  await preview.waitFor({ timeout: 8000 }).catch(() => {});
  const groups = async () => preview.getByRole('group').evaluateAll((gs) => gs.map((g) => g.getAttribute('aria-label')));
  await until(async () => (await groups()).includes('Sports') && (await preview.locator('a').count()) >= 2);
  check('typing shows a preview under the field: titles and sports, the part you are in first, kinds with no match left out', JSON.stringify(await groups()) === JSON.stringify(['Movies and TV', 'Sports']) && /Fight Club/.test(await text(preview)) && /Sabah FK vs\. Barcelona/.test(await text(preview)) && page.url() === `${site}/`, `${(await groups()).join(', ')} :: ${(await text(preview)).slice(0, 120)}`);
  await shot(page, 'search-preview');
  await preview.getByRole('link', { name: /Sabah FK vs\. Barcelona/ }).click();
  check('…and a result opens straight from it', await until(() => page.url() === `${site}/sports/watch/${ID.upcoming}`), page.url().replace(site, ''));
  await page.goto(`${site}/sports`);
  await page.getByRole('searchbox').click();
  await page.getByRole('searchbox').pressSequentially('attack', { delay: 20 });
  await until(async () => (await groups()).includes('Anime'));
  check('from Sports the same search finds anime and titles too', (await groups()).includes('Anime') && (await groups()).includes('Movies and TV') && (await preview.locator('a[href="/anime/title/131681"]').count()) === 1, (await groups()).join(', '));
  await preview.getByRole('button', { name: 'See all results' }).click();
  check('“See all results” opens the full results of the part you are in', await until(() => page.url().endsWith('/sports?q=attack')) && (await preview.count()) === 0, page.url().replace(site, ''));
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
  const nav = page.getByTestId('mode-switch');
  await nav.first().waitFor({ timeout: 10000 }).catch(() => {});
  const visible = await page.getByTestId('mode-switch').evaluateAll((navs) => navs.filter((n) => n.getBoundingClientRect().width > 0).map((n) => ({ top: Math.round(n.getBoundingClientRect().top), right: Math.round(innerWidth - n.getBoundingClientRect().right), labels: [...n.querySelectorAll('a')].map((a) => a.textContent.trim()) })));
  check('the switch is at the top of the page (there is no sidebar)', visible.length === 1 && visible[0].top < 76 && visible[0].right >= 8 && JSON.stringify(visible[0].labels) === JSON.stringify(['Screen', 'Anime', 'Sports']) && !(await page.locator('aside').isVisible()), JSON.stringify(visible));
  const bar = () => page.locator('nav[aria-label="Main"] a').evaluateAll((as) => as.map((a) => a.textContent.trim()));
  check('Screen’s bar: Home, Movies, TV, Profile around Search', JSON.stringify(await bar()) === JSON.stringify(['Home', 'Movies', 'TV', 'Profile']), (await bar()).join(', '));
  const fits = async (name) => {
    const o = await overflow(page);
    check(`${name} fits a phone’s width`, o.page <= o.window, `${o.page}px in ${o.window}px`);
  };
  await fits('Screen’s home');
  await shot(page, 'phone-screen');

  await page.getByTestId('mode-switch').getByRole('link', { name: 'Anime' }).tap();
  await page.waitForURL(/\/anime$/, { timeout: 5000 }).catch(() => {});
  await page.locator('a[data-anime]').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('Anime’s bar: Home, Series, Films, Profile', (await current(page)) === 'Anime' && JSON.stringify(await bar()) === JSON.stringify(['Home', 'Series', 'Films', 'Profile']), (await bar()).join(', '));
  await fits('Anime’s home');
  await shot(page, 'phone-anime');

  await page.getByTestId('mode-switch').getByRole('link', { name: 'Sports' }).tap();
  await page.waitForURL(/\/sports$/, { timeout: 5000 }).catch(() => {});
  await page.getByTestId('live-events').waitFor({ timeout: 10000 }).catch(() => {});
  check('Sports’ bar: Live, Schedule, Channels, Profile', (await current(page)) === 'Sports' && JSON.stringify(await bar()) === JSON.stringify(['Live', 'Schedule', 'Channels', 'Profile']), (await bar()).join(', '));
  await fits('Sports');
  await shot(page, 'phone-sports');

  // Search opens from the bar and searches the part you are in.
  await page.getByRole('button', { name: 'Search' }).tap();
  const box = page.getByRole('searchbox');
  check('the search button opens the field for the part you are in', await until(async () => (await box.evaluate((i) => document.activeElement === i && i.getBoundingClientRect().width > 100).catch(() => false))) && (await box.getAttribute('placeholder')) === 'Search teams and leagues');
  await box.fill('villarreal');
  check('…and searching works there', await until(async () => page.url().endsWith('/sports?q=villarreal') && (await page.locator('main a[data-listing]').count()) === 1), page.url().replace(site, ''));
  await fits('Sports with the search field out');

  await page.locator('nav[aria-label="Main"]').getByRole('link', { name: 'Channels' }).tap();
  await page.getByTestId('directory-channels').waitFor({ timeout: 10000 }).catch(() => {});
  await fits('Channels');
  await page.locator('nav[aria-label="Main"]').getByRole('link', { name: 'Schedule' }).tap();
  await page.waitForURL(/\/sports\/schedule$/, { timeout: 5000 }).catch(() => {});
  await fits('Schedule');

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
  const sw = await page.getByTestId('mode-switch').evaluateAll((navs) => navs.filter((n) => n.getBoundingClientRect().width > 0).map((n) => { const r = n.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; }));
  check('at 320 px the switch and the page still fit', o.page <= o.window && sw.length === 1 && sw[0].left >= 0 && sw[0].right <= 320, `${o.page}px in ${o.window}px; switch ${JSON.stringify(sw)}`);
  await shot(page, 'phone-320');
  await v.context.close();
}

// ===================================================================== E. nothing set up
section('E. A first stream with nothing set up');
{
  const v = await visitor(DESKTOP);
  const page = await v.open('/watch/movie/550');
  const started = Date.now();
  const frame = page.locator('iframe');
  const framed = await frame.waitFor({ timeout: 15000 }).then(() => true, () => false);
  const took = Date.now() - started;
  check('with no helper and no server of their own, a viewer whose search is still empty gets the embedded player', framed && asked.length >= 1 && /vidlink\.pro\/movie\/550/.test((await frame.getAttribute('src')) ?? ''), `after ${(took / 1000).toFixed(1)}s`);
  check('…within a few seconds rather than at the end of the search', took > 5000 && took < 11000, `${(took / 1000).toFixed(1)}s`);
  check('…and is told what happened and how to go back', /Jelly hadn’t found a source yet/.test(await text(page.locator('body'))) && /server menu/.test(await text(page.locator('body'))));
  check('the saved choice of server is unchanged', (await page.evaluate(() => JSON.parse(localStorage.getItem('charcoal:v2') ?? '{}').settings?.server ?? 'jelly')) === 'jelly');
  check('no page errors', v.errors.length === 0, v.errors.join(' | '));
  await v.context.close();
}
{
  // A viewer with their own server has chosen to wait for it.
  const v = await visitor(DESKTOP, { state: { history: [], watchlist: [], settings: { serverUrl: base } } });
  const page = await v.open('/watch/movie/550');
  await sleep(9500);
  check('a viewer who set up their own server is not moved to the embedded player while it is still searching', (await page.locator('iframe').count()) === 0 && /Finding sources/.test(await text(page.locator('body'))));
  await v.context.close();
}

await browser.close();
stopPreview();
api.close();
api.closeAllConnections?.();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
