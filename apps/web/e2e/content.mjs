/**
 * End-to-end check of the three content categories in the built site, in a real (headless) browser:
 * anime (identity mapping, the double search, sub / dub, skip times), Indian cinema (language
 * tabs, alternate titles in the search, audio languages) and sports (fixtures in local time,
 * public channels playing in the player, official links).
 *
 * Nothing outside this machine is contacted. Every public API the pages use is answered from
 * canned JSON: TMDB, AniList, the Fribb anime list, AniSkip, TheIntroDB, TheSportsDB and iptv-org.
 * Where @charcoal/content has a sample of the real API (packages/content/src/fixtures, each taken
 * from the live service), that sample is what is served, so the shapes here are the real ones.
 * The resolver API is a small local server speaking /v2, and the "streams" are generated test
 * clips: a WebM file for titles and a real HLS stream (fragmented MP4) for the channel.
 *
 *   VITE_JELLY_URL=http://localhost:18181 npm run build --workspace apps/web
 *   node apps/web/e2e/content.mjs
 *
 * Needs `playwright` (with a Chromium) and `ffmpeg` on the machine; it is not part of `npm test`.
 * Set CONTENT_E2E_SHOTS to a directory to also save a screenshot of each page it visits.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Resolved the CommonJS way so a globally installed Playwright (NODE_PATH) is found too.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const API = 18181;
const SITE = 18183;
const base = `http://localhost:${API}`;
const site = `http://localhost:${SITE}`;
if (!existsSync(join(dist, 'index.html'))) throw new Error('Build the site first: VITE_JELLY_URL=http://localhost:18181 npm run build --workspace apps/web');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- canned data ----------

/**
 * A constant from @charcoal/content's fixtures. They are samples of the real APIs written as
 * TypeScript constants that hold plain JSON (plus the odd comment line and trailing comma).
 */
function fixture(file, name) {
  const src = readFileSync(join(here, '..', '..', '..', 'packages', 'content', 'src', 'fixtures', file), 'utf8');
  const at = src.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`No fixture ${name} in ${file}`);
  const start = src.indexOf('=', at) + 1;
  const end = src.slice(start).search(/\n[\]}];/) + start + 2;
  const text = src
    .slice(start, end)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(text);
}

// The Fribb list: every row of Attack on Titan (TMDB 1429), One Piece (37854) and two films.
const ANIME_LIST = [...fixture('anime-lists.ts', 'ATTACK_ON_TITAN_ROWS'), ...fixture('anime-lists.ts', 'ONE_PIECE_ROWS'), ...fixture('anime-lists.ts', 'MOVIE_ROWS')];

// AniList: the package's sample for 16498, and two more answers copied from the live API on 2026-11-24.
const ANILIST = {
  16498: fixture('anilist.ts', 'ANILIST_MEDIA_16498'),
  131681: { data: { Media: { id: 131681, idMal: 48583, format: 'TV', episodes: 12, title: { romaji: 'Shingeki no Kyojin: The Final Season Part 2', english: 'Attack on Titan Final Season Part 2', native: '進撃の巨人 The Final Season Part 2' }, synonyms: ['SnK 4', 'AoT 4', "L'attaque des titans Saison Finale Partie 2", 'Shingeki no Kyojin: The Final Season (2022)', "L'Attacco dei Giganti 4 Parte 2", 'Атака титанов: Финал. Часть 2'] } } },
  21: { data: { Media: { id: 21, idMal: 21, format: 'TV', episodes: null, title: { romaji: 'ONE PIECE', english: 'ONE PIECE', native: 'ONE PIECE' }, synonyms: ['ワンピース', '海贼王', 'Vua Hải Tặc', "All'arrembaggio!", 'Ντρέηκ, το Κυνήγι του Θησαυρού', 'OP'] } } },
};
const ANILIST_NOT_FOUND = fixture('anilist.ts', 'ANILIST_NOT_FOUND');

// AniList's catalogue (lists, search, one entry), in the shape the live API answers with.
const alCard = (id, idMal, english, romaji, over = {}) => ({ id, idMal, format: 'TV', status: 'FINISHED', episodes: 12, seasonYear: 2022, averageScore: 85, genres: ['Action', 'Drama'], title: { romaji, english, native: null }, coverImage: { large: `https://img.anilist.invalid/${id}.jpg` }, bannerImage: null, startDate: { year: 2022 }, nextAiringEpisode: null, ...over });
const AL_CATALOG = [
  alCard(131681, 48583, 'Attack on Titan Final Season Part 2', 'Shingeki no Kyojin: The Final Season Part 2'),
  alCard(21, 21, 'ONE PIECE', 'ONE PIECE', { status: 'RELEASING', episodes: null, seasonYear: 1999, nextAiringEpisode: { episode: 1181 } }),
  // An entry TMDB does not list (and so the mapping list has no TMDB title for it).
  alCard(990001, 59001, 'Lantern Shop Stories', 'Chouchin-ya Monogatari', { format: 'ONA', episodes: 3, seasonYear: 2026, title: { romaji: 'Chouchin-ya Monogatari', english: 'Lantern Shop Stories', native: '提灯屋物語' } }),
];
/** Answers a catalogue query; undefined for the older "names of one entry" query, which is answered from ANILIST. */
function anilistCatalog(body) {
  const query = body.query ?? '';
  const page = (media) => ({ pageInfo: { hasNextPage: false }, media });
  if (/description\(asHtml/.test(query)) {
    const card = AL_CATALOG.find((c) => c.id === body.variables?.id);
    return card ? { status: 200, body: { data: { Media: { ...card, description: 'A quiet shop.<br><br><i>Three</i> nights.', synonyms: ['Lantern Tales'], duration: 12, studios: { nodes: [{ name: 'Studio Test' }] } } } } } : { status: 404, body: { errors: [{ message: 'Not Found.', status: 404 }], data: { Media: null } } };
  }
  if (!/Page\(/.test(query)) return undefined;
  const search = String(body.variables?.s ?? '').toLowerCase();
  const films = /format_in: \[MOVIE\]/.test(query);
  const list = films ? [] : AL_CATALOG.filter((c) => !search || `${c.title.english} ${c.title.romaji}`.toLowerCase().includes(search));
  // The home page asks for its rows under names of its own, all in one request.
  const names = [...query.matchAll(/(\w+): Page\(/g)].map((m) => m[1]);
  return { status: 200, body: { data: names.length ? Object.fromEntries(names.map((n) => [n, page(/format_in: \[MOVIE\]/.test(query.split(`${n}: Page(`)[1].split('}')[0]) ? [] : AL_CATALOG)])) : { Page: page(list) } } };
}

// AniSkip: the live answer's shape (MAL 48583, episode 1), with the times moved onto the 60 s test clip.
const CLIP_SECONDS = 60;
const ANISKIP = {
  '48583/1': {
    found: true,
    results: [
      { interval: { startTime: 2, endTime: 12 }, skipType: 'op', skipId: 'fc1857d0-0511-4056-b5a9-e399559397bc', episodeLength: CLIP_SECONDS },
      { interval: { startTime: 50, endTime: 58 }, skipType: 'ed', skipId: '29d5004f-fc2f-4bcd-af1f-29b1e92535ff', episodeLength: CLIP_SECONDS },
    ],
    message: 'Successfully found skip times',
    statusCode: 200,
  },
};
const ANISKIP_NOT_FOUND = fixture('aniskip.ts', 'ANISKIP_NOT_FOUND');

// TheSportsDB: one real row (the package's sample of eventsnextleague.php?id=4328), re-dated around now.
const PPV = fixture('ppv.ts', 'PPV_STREAMS_2026_11_25');
const EPL_ROW = fixture('thesportsdb.ts', 'EVENTS_NEXT_LEAGUE_4328').events[0];
const HOUR = 3_600_000;
const sportsRow = (id, startsAt, over) => {
  const iso = new Date(startsAt).toISOString();
  return { ...EPL_ROW, idEvent: String(id), strTimestamp: iso.slice(0, 19), dateEvent: iso.slice(0, 10), strTime: iso.slice(11, 19), ...over };
};
// Whole minutes, so the expected clock time is exact.
const T0 = Math.floor(Date.now() / 60_000) * 60_000;
const UPCOMING_AT = T0 + 3 * HOUR + 17 * 60_000;
const SPORTS_EVENTS = {
  upcoming: sportsRow(9001, UPCOMING_AT, { strEvent: 'Nottingham Forest vs Chelsea', strStatus: 'NS', intHomeScore: null, intAwayScore: null }),
  live: sportsRow(9002, T0 - 25 * 60_000, { strEvent: 'Santos vs Gremio', strHomeTeam: 'Santos', strAwayTeam: 'Gremio', idLeague: '4351', strLeague: 'Brazilian Serie A', strStatus: '1H', intHomeScore: '1', intAwayScore: '0', strVenue: 'Vila Belmiro', strCountry: 'Brazil' }),
  finished: sportsRow(9003, T0 - 5 * HOUR, { strEvent: 'Gagra vs Dinamo Tbilisi', strHomeTeam: 'Gagra', strAwayTeam: 'Dinamo Tbilisi', idLeague: '4638', strLeague: 'Georgian Erovnuli Liga', strStatus: 'FT', intHomeScore: '0', intAwayScore: '2' }),
};

// iptv-org: the package's sample of the three files. The streams of the two channels that may play
// here are pointed at this machine; one more channel is written by hand to have a dead stream.
const IPTV = {
  'channels.json': [
    ...fixture('iptv-org.ts', 'IPTV_CHANNELS'),
    // HAND-WRITTEN in the real shape: a free-to-air channel whose only stream is gone.
    { id: 'TRTSpor.tr', name: 'TRT Spor', alt_names: [], network: null, owners: ['TRT'], country: 'TR', categories: ['sports'], is_nsfw: false, launched: null, closed: null, replaced_by: null, website: 'https://www.trtspor.com.tr/' },
    // HAND-WRITTEN in the real shape: a free-to-air channel whose playlist answers but whose video is gone.
    { id: 'TRTSporYildiz.tr', name: 'TRT Spor Yildiz', alt_names: [], network: null, owners: ['TRT'], country: 'TR', categories: ['sports'], is_nsfw: false, launched: null, closed: null, replaced_by: null, website: 'https://www.trtspor.com.tr/' },
  ],
  'streams.json': [
    ...fixture('iptv-org.ts', 'IPTV_STREAMS').map((s) => {
      if (s.channel === 'DDSports.in') return { ...s, url: s.url.includes('/1161/') ? `${base}/hls/dd/index.m3u8` : s.url.replace(/^https:\/\/[^/]+/, `${base}/hls/gone`) };
      // Its real rows are an open stream and a "Geo-blocked" one; here both refuse, as abroad.
      if (s.channel === 'ACCDigitalNetwork.us') return { ...s, url: `${base}/hls/geo/${s.labels.length ? 'b' : 'a'}/index.m3u8` };
      return s;
    }),
    { channel: 'TRTSpor.tr', feed: 'SD', title: 'TRT Spor', url: `${base}/hls/dead/index.m3u8`, quality: '720p', labels: [], user_agent: null, referrer: null },
    { channel: 'TRTSporYildiz.tr', feed: 'SD', title: 'TRT Spor Yildiz', url: `${base}/hls/hollow/index.m3u8`, quality: '720p', labels: [], user_agent: null, referrer: null },
  ],
  'blocklist.json': fixture('iptv-org.ts', 'IPTV_BLOCKLIST'),
};

// TMDB, in the shapes the site reads.
const page = (results) => ({ page: 1, results, total_pages: 1, total_results: results.length });
const card = (id, name, lang, extra = {}) => ({ id, title: name, name, original_title: name, original_name: name, original_language: lang, poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, overview: '', vote_average: 7.5, vote_count: 900, popularity: 50, release_date: '2022-06-03', first_air_date: '2013-04-07', genre_ids: [], ...extra });
const full = (id, o) => ({ id, overview: 'A test.', poster_path: null, backdrop_path: null, vote_average: 8, genres: [], runtime: 100, imdb_id: `tt${String(id).padStart(7, '0')}`, external_ids: { imdb_id: `tt${String(id).padStart(7, '0')}` }, videos: { results: [] }, credits: { cast: [] }, recommendations: { results: [] }, similar: { results: [] }, images: { logos: [] }, release_dates: { results: [] }, content_ratings: { results: [] }, ...o });
const seasons = (counts) => counts.map((n, i) => ({ season_number: i + 1, episode_count: n, name: `Season ${i + 1}`, air_date: '2013-04-07', poster_path: null }));
const TITLES = {
  'tv/1429': full(1429, {
    name: 'Attack on Titan', original_name: '進撃の巨人', original_language: 'ja', origin_country: ['JP'], first_air_date: '2013-04-07', episode_run_time: [24],
    genres: [{ id: 16, name: 'Animation' }, { id: 10759, name: 'Action & Adventure' }],
    number_of_seasons: 4, seasons: seasons([25, 12, 22, 30]), last_episode_to_air: { season_number: 4, episode_number: 30 },
    alternative_titles: { results: [{ iso_3166_1: 'JP', title: 'Shingeki no Kyojin', type: 'romaji' }, { iso_3166_1: 'US', title: 'AoT', type: '' }] },
    translations: { translations: [{ iso_639_1: 'ja', iso_3166_1: 'JP', data: { name: '進撃の巨人' } }, { iso_639_1: 'en', iso_3166_1: 'US', data: { name: 'Attack on Titan' } }] },
  }),
  'tv/37854': full(37854, {
    name: 'One Piece', original_name: 'ワンピース', original_language: 'ja', origin_country: ['JP'], first_air_date: '1999-10-20', episode_run_time: [24],
    genres: [{ id: 16, name: 'Animation' }], number_of_seasons: 3, seasons: seasons([61, 16, 14]), last_episode_to_air: { season_number: 3, episode_number: 14 },
  }),
  // A Tamil film with what TMDB files next to it: other names in India and the title in other languages.
  'movie/900': full(900, {
    title: 'Vikram', original_title: 'விக்ரம்', original_language: 'ta', origin_country: ['IN'], release_date: '2022-06-03', genres: [{ id: 28, name: 'Action' }],
    alternative_titles: { titles: [{ iso_3166_1: 'IN', title: 'Vikram: Hitlist', type: '' }, { iso_3166_1: 'IN', title: 'Vikram, Agent', type: 'working title' }, { iso_3166_1: 'US', title: 'Vikram (2022)', type: '' }] },
    translations: { translations: [{ iso_639_1: 'ta', iso_3166_1: 'IN', data: { title: 'விக்ரம்' } }, { iso_639_1: 'hi', iso_3166_1: 'IN', data: { title: 'विक्रम' } }, { iso_639_1: 'te', iso_3166_1: 'IN', data: { title: 'విక్రమ్' } }, { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'Vikram' } }, { iso_639_1: 'fr', iso_3166_1: 'FR', data: { title: '' } }] },
  }),
};
const BY_LANGUAGE = {
  hi: [card(801, 'Jawan', 'hi'), card(802, 'Dangal', 'hi')],
  ta: [card(900, 'Vikram', 'ta', { original_title: 'விக்ரம்' }), card(901, 'Jailer', 'ta')],
  te: [card(811, 'RRR', 'te')],
  ja: [card(1429, 'Attack on Titan', 'ja', { genre_ids: [16] }), card(37854, 'One Piece', 'ja', { genre_ids: [16] })],
};
const tmdbLog = [];
function tmdb(u) {
  const path = u.pathname.replace(/^\/3\//, '');
  const q = Object.fromEntries(u.searchParams);
  tmdbLog.push({ path, q });
  if (TITLES[path]) return TITLES[path];
  const season = /^tv\/(\d+)\/season\/(\d+)$/.exec(path);
  if (season) {
    const count = TITLES[`tv/${season[1]}`]?.seasons?.find((s) => s.season_number === Number(season[2]))?.episode_count ?? 0;
    return { season_number: Number(season[2]), name: `Season ${season[2]}`, overview: '', episodes: Array.from({ length: count }, (_, i) => ({ id: Number(season[1]) * 1000 + i, episode_number: i + 1, season_number: Number(season[2]), name: `Episode ${i + 1}`, overview: '', still_path: null, runtime: 24, air_date: '2022-01-10', vote_average: 8 })) };
  }
  if (/^discover\/(movie|tv)$/.test(path)) return page(BY_LANGUAGE[q.with_original_language] ?? []);
  // One Indian and one unrelated title of the same name: only the first belongs on the Indian page.
  if (path === 'search/movie') return page(/vikram/i.test(q.query ?? '') ? [card(900, 'Vikram', 'ta'), card(955, 'Vikram the Viking', 'en')] : []);
  if (/^(movie|tv)\/\d+$/.test(path)) return null;
  return page([]);
}

// ---------- test media ----------
const media = mkdtempSync(join(tmpdir(), 'charcoal-content-e2e-'));
const lavfi = (seconds) => ['-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=320x180:rate=15`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:v', 'libvpx-vp9', '-b:v', '100k', '-g', '30', '-keyint_min', '30', '-c:a', 'libopus', '-shortest'];
// A file any Chromium can play (VP9 + Opus in WebM): what the title "sources" point at.
execFileSync('ffmpeg', [...lavfi(CLIP_SECONDS), join(media, 'clip.webm')]);
const clip = readFileSync(join(media, 'clip.webm'));
// A real HLS stream for the channel: the same codecs in fragmented MP4, cut into 2 s segments.
mkdirSync(join(media, 'hls'));
execFileSync('ffmpeg', [...lavfi(30), '-strict', '-2', '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', join(media, 'hls', 'seg%d.m4s'), join(media, 'hls', 'index.m3u8')]);
const hlsFiles = Object.fromEntries(readdirSync(join(media, 'hls')).map((f) => [f, readFileSync(join(media, 'hls', f))]));
// Served as a channel: a playlist that never ends (no ENDLIST), which is what a live stream is.
const livePlaylist = hlsFiles['index.m3u8'].toString().replace(/#EXT-X-PLAYLIST-TYPE:VOD\n/, '').replace(/#EXT-X-ENDLIST\n?/, '');

// ---------- the resolver API and the stream origin ----------
const provider = (id) => ({ id, name: id[0].toUpperCase() + id.slice(1), version: '1.0.0' });
const stream = (by, file, audio, quality = '1080') => ({
  id: `${by}:${file}`, dedupKey: `localhost/${file}.webm`, url: `${base}/media/${file}.webm`, type: 'webm', quality, headers: {}, audio,
  provider: provider(by), runtime: 'server', relay: `${base}/v2/relay?x=${file}`,
});
const result = (by, streams) => ({ t: 'result', provider: provider(by), outcome: 'ok', ms: 120, streams, captions: [], requests: 2 });
const und = [{ lang: 'und' }];
/** Every /v2/sources request, as its query parameters. */
const asked = [];
const served = [];

const api = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  served.push(url.pathname);
  if (url.pathname.startsWith('/media/')) {
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Number(range[2]) : clip.length - 1;
    return res.writeHead(range ? 206 : 200, { ...cors, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) }).end(clip.subarray(start, end + 1));
  }
  if (url.pathname.startsWith('/hls/dd/')) {
    const file = url.pathname.slice('/hls/dd/'.length);
    if (file === 'index.m3u8') return res.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }).end(livePlaylist);
    if (hlsFiles[file]) return res.writeHead(200, { ...cors, 'Content-Type': 'video/mp4' }).end(hlsFiles[file]);
    return res.writeHead(404, cors).end();
  }
  // A stream whose playlist still answers though every piece of video behind it is gone.
  if (url.pathname === '/hls/hollow/index.m3u8') return res.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }).end(livePlaylist);
  // A stream its broadcaster only serves at home, and streams that are gone.
  if (url.pathname.startsWith('/hls/geo/')) return res.writeHead(403, cors).end('Forbidden');
  if (url.pathname.startsWith('/hls/')) return res.writeHead(404, cors).end('Not found');
  if (url.pathname === '/v2/registry') return res.writeHead(404, cors).end('{}');
  if (url.pathname === '/v2/report') return res.writeHead(202, { ...cors, 'Content-Type': 'application/json' }).end('{"accepted":0}');
  if (url.pathname === '/v2/sources') {
    const q = Object.fromEntries(url.searchParams);
    asked.push({ ...q, at: Date.now() });
    res.writeHead(200, { ...cors, 'Content-Type': 'application/x-ndjson' });
    const write = (e) => res.write(JSON.stringify(e) + '\n');
    if (q.kind === 'anime') {
      // An anime site: it knows the entry by its AniList id and has it subbed and dubbed. One of
      // its files is the very file the TMDB search also finds.
      write({ t: 'plan', runtime: 'server', providers: [{ id: 'anizen', name: 'Anizen', wave: 1 }], skipped: [] });
      await sleep(100);
      write(result('anizen', [stream('anizen', 'shared', [{ lang: 'ja', label: 'Japanese' }]), stream('anizen', 'ani-sub', [{ lang: 'ja', label: 'Japanese' }]), stream('anizen', 'ani-dub', [{ lang: 'en', label: 'English', dub: true }])]));
      write({ t: 'done', ms: 100, ok: 1, empty: 0, failed: 0 });
      return res.end();
    }
    write({ t: 'plan', runtime: 'server', providers: [{ id: 'alpha', name: 'Alpha', wave: 1 }, ...(q.tmdb === '900' ? [{ id: 'beta', name: 'Beta', wave: 1 }] : [])], skipped: [] });
    // Slower than the anime site, so a second search's first results are the anime ones.
    await sleep(q.tmdb === '900' ? 100 : 700);
    if (q.tmdb === '900') {
      // A regional film: files in several languages, each saying which.
      write(result('alpha', [stream('alpha', 'tamil', [{ lang: 'ta', label: 'Tamil' }]), stream('alpha', 'hindi', [{ lang: 'hi', label: 'Hindi', dub: true }]), stream('alpha', 'multi', [{ lang: 'ta', label: 'Tamil' }, { lang: 'te', label: 'Telugu', dub: true }])]));
      // What other providers may answer with: another site's player page (a frame) and a DASH
      // stream. Neither is this check's business; they must simply not upset the list.
      write(result('beta', [
        { ...stream('beta', 'page', und, 'auto'), type: 'frame', url: 'https://player.example.invalid/embed/900', dedupKey: 'player.example.invalid/embed/900' },
        { ...stream('beta', 'adaptive', und, '480'), type: 'dash', url: `${base}/media/none.mpd`, dedupKey: 'localhost/none.mpd' },
      ]));
      // The newer resolver also says how trying a stream went; a client that doesn't use that ignores it.
      write({ t: 'verify', provider: 'alpha', stream: 'alpha:tamil', verification: { state: 'verified', level: 'header', by: 'server', at: Date.now(), ms: 40 } });
    } else {
      write(result('alpha', [stream('alpha', 'main', und), stream('alpha', 'shared', [{ lang: 'ja', label: 'Japanese' }])]));
    }
    write({ t: 'done', ms: 700, ok: q.tmdb === '900' ? 2 : 1, empty: 0, failed: 0 });
    return res.end();
  }
  res.writeHead(404, cors).end('{}');
});
await new Promise((r) => api.listen(API, r));

// In its own process group: `npx` starts the real server as a child, and stopping only `npx` would leave that running.
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

/** Hosts the pages may call, each answered from the canned data above; anything else is refused. */
async function open(path, { down = [], context: reuse } = {}) {
  // A viewer in India with a British-English browser: local times are not UTC, and no source is "en-IN".
  const context = reuse ?? (await browser.newContext({ locale: 'en-GB', timezoneId: 'Asia/Kolkata', ...(VIEWPORT ? { viewport: VIEWPORT } : {}) }));
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.hostname === 'localhost') return route.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    outside.push(`${request.method()} ${u.hostname}${u.pathname}`);
    if (down.includes(u.hostname)) return route.fulfill({ status: 503, headers, body: 'Service Unavailable' });
    switch (u.hostname) {
      case 'api.themoviedb.org': {
        const body = tmdb(u);
        return body ? json(body) : json({ status_code: 34, status_message: 'The resource you requested could not be found.' }, 404);
      }
      case 'raw.githubusercontent.com':
        return /^\/Fribb\/anime-lists\/HEAD\/anime-list-(mini|full)\.json$/.test(u.pathname) ? route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers, body: JSON.stringify(ANIME_LIST) }) : json({}, 404);
      case 'graphql.anilist.co': {
        const body = JSON.parse(request.postData() ?? '{}');
        const catalog = anilistCatalog(body);
        if (catalog) return json(catalog.body, catalog.status);
        return ANILIST[body.variables?.id] ? json(ANILIST[body.variables.id]) : json(ANILIST_NOT_FOUND, 404);
      }
      case 'api.aniskip.com': {
        const key = u.pathname.replace('/v2/skip-times/', '');
        return ANISKIP[key] ? json(ANISKIP[key]) : json(ANISKIP_NOT_FOUND, 404);
      }
      case 'api.theintrodb.org':
        // TheIntroDB knows the title and has no segments for it: its answer is the ids alone.
        return json({ tmdb_id: Number(u.searchParams.get('tmdb_id')), type: u.searchParams.has('season') ? 'tv' : 'movie' });
      case 'www.thesportsdb.com': {
        const [, key, endpoint] = /^\/api\/v1\/json\/([^/]+)\/(.+)$/.exec(u.pathname) ?? [];
        // The retired key answers the way the real service does.
        if (key !== '123') return route.fulfill({ status: 403, headers, body: 'The old Free Sports API key is permanently disabled' });
        if (endpoint === 'eventsday.php') return json({ events: u.searchParams.get('s') === 'Soccer' && u.searchParams.get('d') === new Date(T0).toISOString().slice(0, 10) ? [SPORTS_EVENTS.live, SPORTS_EVENTS.finished] : null });
        if (endpoint === 'eventsnextleague.php') {
          // One competition is over the free key's limit: the page must show the rest.
          if (u.searchParams.get('id') === '4331') return route.fulfill({ status: 429, headers, body: 'Too Many Requests' });
          return json({ events: u.searchParams.get('id') === '4328' ? [SPORTS_EVENTS.upcoming] : null });
        }
        return json({}, 404);
      }
      case 'api.ppv.st':
        // The sports directory: a real sample (its events are long over; its channel is always on).
        return json(PPV);
      case 'iptv-org.github.io': {
        const file = u.pathname.replace('/api/', '');
        return IPTV[file] ? json(IPTV[file]) : json({}, 404);
      }
      default:
        outside.pop();
        return route.abort(); // images, the cast SDK, embeds, analytics: nothing leaves this machine
    }
  });
  await page.goto(`${site}${path}`);
  return { page, context, errors, outside };
}

const playing = (page, timeout = 20000) => page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.2 && !v.paused; }, null, { timeout }).then(() => true, () => false);
const video = (page) => page.evaluate(() => { const v = document.querySelector('video'); return v ? { src: v.currentSrc, t: v.currentTime, d: v.duration, paused: v.paused } : null; });
const until = async (test, timeout = 10000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test()) return true;
    await sleep(100);
  }
  return false;
};
// For looking at the pages at another size (e.g. CONTENT_E2E_VIEWPORT=390x844); the checks are written for the default desktop size.
const [vw, vh] = (process.env.CONTENT_E2E_VIEWPORT ?? '').split('x').map(Number);
const VIEWPORT = vw > 0 && vh > 0 ? { width: vw, height: vh } : null;
const shots = process.env.CONTENT_E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const shot = async (page, name) => {
  if (!shots) return;
  // The player fades its controls (and the menus in its top bar) when the pointer rests: wake them first.
  await page.mouse.move(640, 300);
  await page.mouse.move(660, 320);
  await sleep(350);
  await page.screenshot({ path: join(shots, `${name}.png`) }).catch(() => {});
};
const file = (src) => (src ?? '').split('/').pop();
const altOf = (q) => (q?.alt ?? '').split(',');

// ===================================================================== A. anime
section('A. Anime');
{
  // Attack on Titan, TMDB season 4 episode 17: the first episode of "The Final Season Part 2",
  // which AniList files as its own entry (131681; the list gives it an offset of 16 in season 4).
  asked.length = 0;
  const { page, context, errors, outside } = await open('/watch/tv/1429?season=4&episode=17');
  const started = await playing(page);
  check('an anime episode plays', started, JSON.stringify(await video(page)));
  await until(() => asked.some((q) => q.kind === 'anime'));
  const tv = asked.find((q) => q.kind === 'tv');
  const anime = asked.find((q) => q.kind === 'anime');
  check('the resolver was asked for the TMDB episode', !!tv && tv.tmdb === '1429' && tv.s === '4' && tv.e === '17', JSON.stringify(tv && { kind: tv.kind, tmdb: tv.tmdb, s: tv.s, e: tv.e }));
  check('…and for the anime entry: AniList 131681, MAL 48583', !!anime && anime.anilist === '131681' && anime.mal === '48583', JSON.stringify(anime && { kind: anime.kind, anilist: anime.anilist, mal: anime.mal }));
  check('…with the episode numbered inside that entry (S4 E17 → episode 1), and the TMDB numbering alongside', !!anime && anime.e === '1' && anime.s === '4' && anime.se === '17', JSON.stringify(anime && { e: anime.e, s: anime.s, se: anime.se }));
  check('…under the names AniList gives it', !!anime && altOf(anime).includes('Shingeki no Kyojin: The Final Season Part 2') && altOf(anime).includes('進撃の巨人 The Final Season Part 2'), anime?.alt);
  check('…asking for subtitled audio by default', anime?.audio === 'sub', `audio=${anime?.audio}`);
  check('the TMDB search carries the title’s other names and its language', tv?.olang === 'ja' && altOf(tv).includes('進撃の巨人') && altOf(tv).includes('Shingeki no Kyojin'), `olang=${tv?.olang} alt=${tv?.alt}`);
  check('the list and AniList were read from canned copies', outside.some((o) => o.includes('raw.githubusercontent.com/Fribb/anime-lists')) && outside.some((o) => o.startsWith('POST graphql.anilist.co')));

  // Skip times: TheIntroDB has none for it, AniSkip (MAL 48583, episode 1) has an opening at 2–12 s.
  const skip = page.getByRole('button', { name: /Skip intro/ });
  const offered = await skip.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  const before = await video(page);
  if (offered) await skip.click();
  await sleep(400);
  const after = await video(page);
  check('AniSkip’s opening is offered as “Skip intro” while it plays', offered && before.t >= 2 && before.t < 12, `shown at ${before?.t.toFixed(1)}s`);
  check('…and skipping lands at its end', offered && after.t >= 11.5 && after.t < 16, `now at ${after?.t.toFixed(1)}s`);
  check('AniSkip was asked for the MAL entry and its own episode number', outside.some((o) => o.includes('api.aniskip.com/v2/skip-times/48583/1')), outside.filter((o) => o.includes('aniskip')).join(' '));

  // A menu closes on a press anywhere outside it, and that press does nothing else.
  await page.mouse.move(640, 300);
  await page.getByRole('button', { name: 'Subtitles (C)' }).click();
  const pop = page.locator('[data-popover]');
  const opened = await pop.waitFor({ timeout: 4000 }).then(() => true, () => false);
  const box = await pop.boundingBox();
  const tall = await page.evaluate(() => innerHeight);
  await page.mouse.click(400, 250); // on the picture, away from the menu
  const closed = await until(async () => (await pop.count()) === 0, 3000);
  await sleep(400);
  check('the subtitles menu closes on a press outside it, without pausing', opened && closed && (await video(page))?.paused === false, `opened=${opened} closed=${closed} paused=${(await video(page))?.paused}`);
  check('…and takes no more than about half the screen’s height', !!box && box.height <= tall * 0.56, box ? `${Math.round(box.height)}px of ${tall}px` : 'no box');
  check('the player’s top bar has no audio button (audio is in the player’s settings and in Profile)', (await page.getByRole('button', { name: /^Audio:/ }).count()) === 0);
  check('no page errors', errors.length === 0, errors.join(' | '));

  // Sub or dub is a setting: choosing Dub there makes the next search ask for the dub.
  const settings = await open('/profile?tab=settings', { context });
  const dubButton = settings.page.getByRole('group', { name: 'Anime audio' }).getByRole('button', { name: 'Dub', exact: true });
  await dubButton.click({ timeout: 8000 }).catch(() => {});
  check('the sub / dub choice is a setting', (await dubButton.getAttribute('aria-pressed').catch(() => null)) === 'true');
  asked.length = 0;
  await settings.page.goto(`${site}/watch/tv/1429?season=4&episode=17`);
  const again = await until(() => asked.some((q) => q.kind === 'anime' && q.audio === 'dub'), 15000);
  const dub = asked.find((q) => q.kind === 'anime' && q.audio === 'dub');
  check('with Dub chosen, the anime query asks for audio=dub', again && dub?.anilist === '131681' && dub?.e === '1', JSON.stringify(dub && { anilist: dub.anilist, e: dub.e, audio: dub.audio }));
  check('…and the dubbed source is the one that plays', await until(async () => file((await video(settings.page))?.src) === 'ani-dub.webm', 15000), file((await video(settings.page))?.src));
  await shot(settings.page, 'settings');
  await context.close();
}
{
  // One Piece is numbered straight through on AniList: TMDB season 2 episode 3 is episode 61 + 3.
  asked.length = 0;
  const { page, context } = await open('/watch/tv/37854?season=2&episode=3');
  await until(() => asked.some((q) => q.kind === 'anime'), 15000);
  const anime = asked.find((q) => q.kind === 'anime');
  check('an absolutely-numbered show maps to its absolute episode (S2 E3 → 64)', anime?.anilist === '21' && anime?.e === '64' && anime?.s === '2' && anime?.se === '3', JSON.stringify(anime && { anilist: anime.anilist, e: anime.e, s: anime.s, se: anime.se }));
  // One of AniList's names for it has a comma in it ("Ντρέηκ, το Κυνήγι του Θησαυρού").
  check('…and a name with a comma in it is not sent (it would arrive as two wrong names)', !!anime && !/Κυνήγι|Ντρέηκ/.test(anime.alt ?? '') && altOf(anime).includes('ワンピース'), anime?.alt);
  check('…and still plays', await playing(page));
  await context.close();
}
{
  // The list can't be loaded: the episode plays as the TMDB episode it is, at once.
  asked.length = 0;
  const { page, context, errors } = await open('/watch/tv/1429?season=4&episode=17', { down: ['raw.githubusercontent.com', 'graphql.anilist.co', 'api.aniskip.com'] });
  const t0 = Date.now();
  const started = await playing(page);
  const ms = Date.now() - t0;
  const v = await video(page);
  await sleep(1500);
  check('with the anime list unreachable, the episode still plays from the TMDB search', started && ['main.webm', 'shared.webm'].includes(file(v?.src)), `${file(v?.src)} after ${ms} ms`);
  check('…and only the TMDB query was made', asked.length > 0 && asked.every((q) => q.kind === 'tv'), asked.map((q) => q.kind).join(','));
  check('…without a page error', errors.length === 0, errors.join(' | '));
  await context.close();
}
{
  // AniList alone is down: the entry is still known from the list, so the anime query still goes out.
  asked.length = 0;
  const { page, context, errors } = await open('/watch/tv/1429?season=4&episode=17', { down: ['graphql.anilist.co'] });
  const started = await playing(page);
  await until(() => asked.some((q) => q.kind === 'anime'));
  const anime = asked.find((q) => q.kind === 'anime');
  check('with AniList unreachable, the anime query is still made by id', started && anime?.anilist === '131681' && anime?.e === '1', JSON.stringify(anime && { anilist: anime.anilist, e: anime.e, alt: anime.alt }));
  check('…without a page error', errors.length === 0, errors.join(' | '));
  await context.close();
}
{
  // The catalogue is AniList's: a row of the home page, then the entry behind a card.
  const { page, context, errors, outside } = await open('/');
  await page.getByTestId('anime-section').scrollIntoViewIfNeeded().catch(() => {});
  const card = page.locator('a[data-anime="131681"]').first();
  const listed = await card.waitFor({ timeout: 10000 }).then(() => true, () => false);
  const homeAsks = outside.filter((o) => o === 'POST graphql.anilist.co/').length;
  check('Home’s Anime section lists AniList’s entries, all its lists asked for in one request', listed && homeAsks === 1 && (await page.locator('a[data-anime="990001"]').count()) > 0, `${homeAsks} request(s)`);
  await shot(page, 'anime');
  await card.click();
  await until(() => /\/tv\/1429/.test(page.url()), 10000);
  check('an entry TMDB also has opens as that TMDB title, at its season', /\/tv\/1429\?season=4$/.test(page.url()), page.url().replace(site, ''));
  check('the title page shows no line of other names under the title', (await page.getByTestId('other-names').count()) === 0);
  await shot(page, 'title-anime');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}
{
  // An entry TMDB does not list: its own page from AniList, and its episodes by AniList / MAL id.
  asked.length = 0;
  const { page, context, errors } = await open('/discover?q=lantern');
  const card = page.getByTestId('more-anime').locator('a[data-anime="990001"]');
  await card.waitFor({ timeout: 10000 }).catch(() => {});
  check('a search by name finds an entry TMDB doesn’t have', (await page.getByTestId('more-anime').locator('a[data-anime]').count()) === 1 && /Lantern Shop Stories/.test((await card.textContent()) ?? ''));
  await card.click();
  await page.getByTestId('anime-episodes').waitFor({ timeout: 10000 }).catch(() => {});
  const body = ((await page.textContent('main').catch(() => '')) ?? '').replace(/\s+/g, ' ');
  check('…which has a page of its own: facts, description without markup, episodes', page.url().endsWith('/anime/title/990001') && /Web series/.test(body) && /3 episodes/.test(body) && /Studio Test/.test(body) && /A quiet shop\./.test(body) && !/<br>|<i>/.test(body) && (await page.getByTestId('anime-episodes').locator('a').count()) === 3, body.slice(0, 200));
  await shot(page, 'anime-entry');
  await page.getByRole('link', { name: 'Episode 2', exact: true }).click();
  const started = await playing(page);
  const q = asked.find((x) => x.kind === 'anime');
  check('its episode plays in the player', started && /\/anime\/watch\/990001\?ep=2$/.test(page.url()), JSON.stringify(await video(page)));
  check('…found by its AniList and MAL ids and its names, with no TMDB id', !!q && q.anilist === '990001' && q.mal === '59001' && q.e === '2' && q.tmdb === undefined && q.title === 'Lantern Shop Stories' && altOf(q).includes('Chouchin-ya Monogatari') && altOf(q).includes('提灯屋物語') && q.audio === 'sub' && asked.every((x) => x.kind === 'anime'), JSON.stringify(q && { anilist: q.anilist, mal: q.mal, e: q.e, tmdb: q.tmdb, alt: q.alt, audio: q.audio }));
  await page.mouse.move(640, 300);
  await page.getByRole('group', { name: 'Anime audio' }).getByRole('button', { name: 'Dub' }).click();
  check('…and Dub asks again for the dubbed episode', await until(() => asked.some((x) => x.kind === 'anime' && x.audio === 'dub' && x.e === '2')));
  await page.goto(`${site}/anime/title/990001`);
  const resume = page.getByRole('link', { name: 'Continue episode 2' });
  check('the entry’s page then offers to continue where you were', await resume.waitFor({ timeout: 8000 }).then(() => true, () => false));
  // It is in history and, once ♥ is pressed, in the library: kept beside the TMDB-keyed ones.
  await page.getByRole('button', { name: 'Add Lantern Shop Stories to your library' }).click();
  await page.goto(`${site}/`);
  const shelf = page.getByTestId('anime-shelf-watching').locator('a[data-shelf="990001"]');
  check('Home offers to continue it', await shelf.waitFor({ timeout: 8000 }).then(() => true, () => false) && (await shelf.getAttribute('href')) === '/anime/watch/990001?ep=2');
  await page.goto(`${site}/profile`);
  check('…and the profile lists it under history and library', await until(async () => (await page.getByTestId('anime-shelf-history').locator('a[data-shelf="990001"]').count()) === 1 && (await page.getByTestId('anime-shelf-library').locator('a[data-shelf="990001"]').count()) === 1));
  check('…without entering the TMDB-keyed library (Trakt sync and the calendar read that)', (await page.evaluate(() => JSON.parse(localStorage.getItem('charcoal:v2') ?? '{}').watchlist?.length ?? 0)) === 0);
  await page.goto(`${site}/anime/watch/990001?ep=9`);
  check('an episode it doesn’t have is refused in words', /doesn’t exist/.test((await page.getByTestId('anime-message').textContent({ timeout: 8000 }).catch(() => '')) ?? ''));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}
// ===================================================================== B. Indian cinema
section('B. Regional titles');
{
  // A Tamil film: its other names and its language go to the resolver; sources say what they carry.
  asked.length = 0;
  const { page, context, errors } = await open('/watch/movie/900');
  const started = await playing(page);
  const q = asked.find((x) => x.kind === 'movie' && x.tmdb === '900');
  check('a regional film plays', started, file((await video(page))?.src));
  check('its search carries the original language', q?.olang === 'ta', `olang=${q?.olang}`);
  check('…and its other names: the Tamil-script title, the name used in India, the Hindi and Telugu titles', !!q && ['விக்ரம்', 'Vikram: Hitlist', 'विक्रम', 'విక్రమ్'].every((n) => altOf(q).includes(n)), q?.alt);
  check('…leaving out what can’t travel or adds nothing (a name with a comma, the title itself)', !!q && !q.alt.includes('Agent') && !altOf(q).includes('Vikram') && !altOf(q).includes('Vikram (2022)'), q?.alt);
  check('a film that isn’t anime is searched once', asked.every((x) => x.kind === 'movie'), asked.map((x) => x.kind).join(','));

  check('a frame, a DASH stream and a verification event among the answers upset nothing', errors.length === 0, errors.join(' | '));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ===================================================================== C. sports
section('C. Sports channels');
{
  const { page, context, errors, outside } = await open('/sports?tab=channels');
  const channels = page.getByTestId('channels');
  await channels.waitFor({ timeout: 15000 }).catch(() => {});
  const shown = await channels.locator('a[data-channel]').evaluateAll((as) => as.map((a) => a.getAttribute('data-channel')));
  check('free-to-air channels with an HLS stream are listed', ['DDSports.in', 'ACCDigitalNetwork.us', 'TRTSpor.tr', 'TRTSporYildiz.tr'].every((id) => shown.includes(id)), shown.join(', '));
  check('…and nothing else: no blocklisted, closed, non-sports, stream-less or not-known-free channel', shown.length === 4, `sample has ${IPTV['channels.json'].length} channels; shown: ${shown.join(', ')}`);
  const kinds = await page.evaluate(() => ({
    own: [...document.querySelectorAll('[data-testid="channels"] a')].every((a) => a.getAttribute('href').startsWith('/live/') && !a.target),
    framed: [...document.querySelectorAll('[data-testid="directory-channels"] a')].map((a) => a.getAttribute('href')),
    external: [...document.querySelectorAll('main a[href^="http"]')].length,
  }));
  check('public channels open in Charcoal’s player, the directory’s channel on its watch page, and nothing leaves the site', kinds.own && kinds.framed.length === 1 && kinds.framed[0] === '/sports/watch/18172' && kinds.external === 0, JSON.stringify(kinds));
  check('the schedule service that listed fixtures Charcoal could not play is no longer asked', outside.every((o) => !o.includes('thesportsdb')));
  await shot(page, 'sports-channels');

  // A public channel plays in the site's own player, from its HLS address.
  served.length = 0;
  await channels.locator('a[data-channel="DDSports.in"]').click();
  await page.waitForURL(/\/live\/DDSports\.in$/, { timeout: 5000 }).catch(() => {});
  const started = await playing(page, 25000);
  const v1 = await video(page);
  await sleep(1500);
  const v2 = await video(page);
  check('a public channel starts playing in the player', started && v2.t > v1.t, v1 ? `at ${v1.t.toFixed(1)}s → ${v2.t.toFixed(1)}s, ${v2.paused ? 'paused' : 'playing'}` : 'no video');
  check('…from its HLS stream: the playlist, the init segment and media segments were fetched', served.includes('/hls/dd/index.m3u8') && served.includes('/hls/dd/init.mp4') && served.some((p) => /^\/hls\/dd\/seg\d+\.m4s$/.test(p)), [...new Set(served)].slice(0, 6).join(' '));
  // A live playlist has no end: the player keeps asking for it to learn of new segments.
  const reloads = () => served.filter((p) => p === '/hls/dd/index.m3u8').length;
  await until(() => reloads() >= 4, 10000);
  check('…as a live stream: the playlist is fetched again and again for new segments', reloads() >= 4, `${reloads()} playlist requests (one of them the check before playing)`);
  check('…with its dead mirrors left out beforehand', served.some((p) => p.startsWith('/hls/gone/')) && /blob:/.test(v2?.src ?? ''), served.filter((p) => p.startsWith('/hls/gone/')).join(' '));
  check('…named in the player', /DD Sports/.test((await page.textContent('body')) ?? ''));
  // Live mode: what is on now, not a film with a length to seek in.
  const liveUi = await page.evaluate(() => ({
    seekBar: !!document.querySelector('[role="slider"][aria-label="Seek"]'),
    state: document.querySelector('[data-testid="live-state"]')?.textContent.trim() ?? '',
    skips: [...document.querySelectorAll('button')].filter((b) => /10 seconds/.test(b.getAttribute('aria-label') ?? '')).length,
    clock: [...document.querySelectorAll('span.tabular-nums')].some((e) => /\d:\d\d \/ \d/.test(e.textContent)),
  }));
  check('…in live mode: a Live state, no seek bar, no duration, no ±10 s', liveUi.state === 'Live' && !liveUi.seekBar && !liveUi.clock && liveUi.skips === 0, JSON.stringify(liveUi));
  await shot(page, 'live-channel');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}
{
  const { page, context, errors } = await open('/live/ACCDigitalNetwork.us');
  const text = await page.getByTestId('live-message').textContent({ timeout: 15000 }).catch(() => '');
  check('a channel limited to its own region says so in plain words', /ACC Digital Network can’t be played right now/.test(text) && /own region/.test(text), text.replace(/\s+/g, ' ').slice(0, 160));
  check('…offering its own site in a new tab and the way back', (await page.locator('[data-testid="live-message"] a[target="_blank"][rel~="noopener"]').getAttribute('href').catch(() => null)) === 'https://theacc.com/watch/' && (await page.getByRole('link', { name: 'Back to Channels' }).count()) === 1);
  await shot(page, 'live-region');
  check('…with no player and no page error', (await page.locator('video').count()) === 0 && errors.length === 0, errors.join(' | '));
  await context.close();
}
{
  const { page, context, errors } = await open('/live/TRTSpor.tr');
  const text = await page.getByTestId('live-message').textContent({ timeout: 15000 }).catch(() => '');
  check('a channel whose stream is gone says it isn’t on the air', /TRT Spor can’t be played right now/.test(text) && /isn’t on the air/.test(text) && errors.length === 0, text.replace(/\s+/g, ' ').slice(0, 160));
  await context.close();
}
{
  // The playlist answers, so the player is given it; then nothing behind it plays.
  const { page, context, errors } = await open('/live/TRTSporYildiz.tr');
  const text = await page.getByTestId('live-message').textContent({ timeout: 25000 }).catch(() => '');
  check('a channel whose stream answers but won’t play ends in the page’s own message, by itself', /TRT Spor Yildiz can’t be played right now/.test(text) && /didn’t answer/.test(text) && (await page.locator('video').count()) === 0 && errors.length === 0, text.replace(/\s+/g, ' ').slice(0, 160) || errors.join(' | '));
  await context.close();
}
{
  // Not on the free-to-air list (and blocklisted upstream): there is no way to play it.
  const { page, context } = await open('/live/AstroArena.my');
  const text = await page.getByTestId('live-message').textContent({ timeout: 15000 }).catch(() => '');
  check('a channel that isn’t a listed free channel can’t be opened', /isn’t available/.test(text) && (await page.locator('video').count()) === 0, text.replace(/\s+/g, ' ').slice(0, 120));
  await context.close();
}

await browser.close();
stopPreview();
api.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
