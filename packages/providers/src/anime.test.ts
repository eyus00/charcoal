/**
 * The anime pack (packs/anime.ts) against synthetic fixtures.
 *
 * Fixtures are responses written for these tests in the shape each site answers in (trimmed to the
 * elements the extraction reads). They prove the extraction, the failure classification and the
 * provider contract. They do NOT prove a live site still answers this way: the stage each provider
 * ships in comes from live runs, recorded next to it in the pack file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDomainConfig, validateManifest, type AnimeMedia, type ProviderModule } from '@charcoal/provider-sdk';
import { checkContract, createHarness, simulate, type MockRequest, type MockRoute } from '@charcoal/provider-sdk/testing';
import { domains, providers } from './packs/anime.js';
import { animeAnimeheaven } from './providers/anime-animeheaven.js';
import { animeAnimotvslash } from './providers/anime-animotvslash.js';
import { animeMegavid } from './providers/anime-megavid.js';
import { animeShonen } from './providers/anime-shonen.js';
import { animeZokoanime, decodePayload } from './providers/anime-zokoanime.js';
import { bytesToBase64, utf8 } from './providers/shared.js';

const AOT: AnimeMedia = { kind: 'anime', ids: { anilist: '16498', mal: '16498' }, title: 'Attack on Titan', altTitles: ['Shingeki no Kyojin'], year: 2013, episode: 1, audio: 'sub' };
/** The same title as a client without ids would ask for it. */
const AOT_BY_TITLE: AnimeMedia = { ...AOT, ids: {} };
const html = (body: string) => simulate.html(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`);
/** A master playlist with a Japanese and an English audio track, as multi-audio hosts serve it. */
const TWO_AUDIO: MockRoute = {
  headers: { 'content-type': 'application/vnd.apple.mpegurl' },
  body: ['#EXTM3U', '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="jpn",NAME="Native",DEFAULT=YES,URI="a-ja.m3u8"', '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="eng",NAME="English",DEFAULT=NO,URI="a-en.m3u8"', '#EXT-X-STREAM-INF:BANDWIDTH=5184000,RESOLUTION=1920x1080,AUDIO="audio"', 'v1080.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=1024000,RESOLUTION=854x480,AUDIO="audio"', 'v480.m3u8', ''].join('\n'),
};

const run = async (module: ProviderModule, media: AnimeMedia, routes: Record<string, MockRoute>) => {
  const h = createHarness({ providers: [{ module, stage: 'stable', domains: domains[module.manifest.id] }], routes, engine: { providerTimeoutMs: 20_000, requestTimeoutMs: 5_000 } });
  const r = await h.engine.runProvider(h.engine.providers()[0], media);
  return { ...r, calls: h.transport.calls };
};
const contract = (module: ProviderModule, media: AnimeMedia, routes: Record<string, MockRoute>) => checkContract(module, { media, routes, domains: domains[module.manifest.id] });

test('the anime pack: every provider has a valid manifest, a matching domain config and a stage; nothing unproven is registered', () => {
  assert.deepEqual(providers.map((p) => p.module.manifest.id).sort(), ['anime-animeheaven', 'anime-animotvslash', 'anime-megavid', 'anime-shonen', 'anime-zokoanime']);
  for (const { module, stage } of providers) {
    const m = module.manifest;
    assert.deepEqual(validateManifest(m), [], m.id);
    assert.deepEqual(validateDomainConfig(domains[m.id], m.domainRoles), [], m.id);
    assert.equal(domains[m.id].provider, m.id);
    assert.deepEqual(m.kinds, ['anime'], m.id);
    assert.ok(['stable', 'canary'].includes(stage), m.id);
    assert.ok((m.network ?? 'declared') === 'declared', `${m.id} stays inside its declared hosts`);
    assert.match(m.origin ?? '', /Seanime-Providers src\/anime\//, m.id);
  }
  assert.deepEqual(Object.keys(domains).sort(), providers.map((p) => p.module.manifest.id).sort());
});

test('anime providers answer "not here" to anything that is not an anime episode', async () => {
  for (const { module } of providers) {
    const r = await run(module, { kind: 'movie', ids: { tmdb: '27205' }, title: 'Inception' } as never, {});
    assert.equal(r.code, 'NOT_FOUND', module.manifest.id);
    assert.equal(r.calls.length, 0, module.manifest.id);
  }
});

// ---------- ZokoAnime ----------

/** The inverse of the player's obfuscation: JSON, XOR with the key, base64. */
const zokoSeal = (value: unknown) => {
  const key = utf8('otaku-embed-v1');
  return bytesToBase64(utf8(JSON.stringify(value)).map((b, i) => b ^ key[i % key.length]));
};
const zokoPage = (blob: string) => html(`<div id="wrap"><div id="player"></div></div><script>window.__P="${blob}"</script><script type="module" src="/player.js"></script>`);
const ZOKO_MISSING = html('<div class="state"><div class="card"><div class="card-top"><span>// Error</span><span class="code">404</span></div><h1 class="title">Not found.</h1></div></div>');
const zokoRoutes = (): Record<string, MockRoute> => ({
  'https://zokoanime.video/stream/mal/16498/1/sub': zokoPage(zokoSeal({ src: 'https://hls.cdn-example.net/p/a/master.m3u8?v=1', subtitles: [{ lang: 'en', label: 'English', default: true, src: 'https://hls.cdn-example.net/v/a/en.vtt' }, { lang: 'en', label: 'Portuguese', src: 'https://hls.cdn-example.net/v/a/pt.vtt' }] })),
  'https://zokoanime.video/stream/mal/16498/1/dub': ZOKO_MISSING,
  'hls.cdn-example.net': simulate.playlist([1080, 720]),
});

test('ZokoAnime: decodes the player configuration, follows the decoded host for the playlist, labels the stream', async () => {
  assert.deepEqual(decodePayload(zokoSeal({ src: 'x' })), { src: 'x' });
  // No audio preference: both versions are asked for; the dub answers with the 404 card.
  const r = await run(animeZokoanime, { ...AOT, audio: undefined }, zokoRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams.length, 1);
  const s = r.streams[0];
  assert.deepEqual([s.type, s.quality, s.audio[0].lang, s.headers.Referer], ['hls', '1080', 'ja', 'https://zokoanime.video/']);
  assert.deepEqual(s.levels, [{ quality: '1080' }, { quality: '720' }]);
  // Every track says lang "en" upstream; the label decides.
  assert.deepEqual(r.captions.map((c) => [c.label, c.lang]), [['English', 'en'], ['Portuguese', 'pt']]);
  assert.deepEqual(await contract(animeZokoanime, AOT, zokoRoutes()), []);
});

test('ZokoAnime: its 404 card is NOT_FOUND; a page without the configuration is SELECTOR_MISSING; an undecodable one STRUCTURE_CHANGED; no MAL id asks nothing', async () => {
  const missing = await run(animeZokoanime, AOT, { 'zokoanime.video': ZOKO_MISSING });
  assert.deepEqual([missing.outcome, missing.code], ['empty', 'NOT_FOUND']);
  const redesigned = await run(animeZokoanime, AOT, { 'zokoanime.video': html('<div id="player"></div><script type="module" src="/player.js"></script>') });
  assert.deepEqual([redesigned.outcome, redesigned.code], ['error', 'SELECTOR_MISSING']);
  const rekeyed = await run(animeZokoanime, AOT, { 'zokoanime.video': zokoPage(bytesToBase64(utf8('{"src":"https://hls.cdn-example.net/master.m3u8"}'))) });
  assert.deepEqual([rekeyed.outcome, rekeyed.code], ['error', 'STRUCTURE_CHANGED']);
  const noId = await run(animeZokoanime, AOT_BY_TITLE, zokoRoutes());
  assert.deepEqual([noId.code, noId.calls.length], ['NOT_FOUND', 0]);
});

// ---------- Megavid ----------

const megavidRoutes = (): Record<string, MockRoute> => ({
  'https://megavid.buzz/ani/16498/1/sub/source': { body: { status: 'ok', source: 'https://cp.megavid.buzz/hls/abc/playlist.m3u8', type: 'hls', tracks: [{ file: 'https://cp.megavid.buzz/hls/abc/captions/en.vtt', label: 'English', kind: 'captions', srclang: 'en' }, { file: 'https://cp.megavid.buzz/hls/abc/captions/en.vtt', label: 'English 2', kind: 'captions', srclang: 'en' }, { file: 'https://cp.megavid.buzz/hls/abc/thumbs.vtt', kind: 'thumbnails' }] } },
  'megavid.buzz': { body: { status: 'missing', code: 404, message: 'We couldn’t find this episode.', retryable: false } },
  'cp.megavid.buzz': simulate.playlist([720, 480]),
});

test('Megavid: reads the source endpoint by AniList id, falls back to the MAL route, keeps caption tracks only', async () => {
  const r = await run(animeMegavid, { ...AOT, audio: undefined }, megavidRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => [s.type, s.quality, s.audio[0].lang, s.headers.Referer]), [['hls', '720', 'ja', 'https://megavid.buzz/']]);
  assert.deepEqual(r.captions.map((c) => c.label), ['English']);
  // The dub was asked for on both routes before being given up.
  assert.deepEqual(r.calls.filter((c) => c.url.pathname.includes('/dub/')).map((c) => c.url.pathname), ['/ani/16498/1/dub/source', '/mal/16498/1/dub/source']);

  const byMal = await run(animeMegavid, { ...AOT, audio: 'dub' }, { ...megavidRoutes(), 'https://megavid.buzz/mal/16498/1/dub/source': { body: { status: 'ok', source: 'https://cp.megavid.buzz/hls/dub/playlist.m3u8', type: 'hls', tracks: [] } } });
  assert.equal(byMal.outcome, 'ok', byMal.message);
  assert.deepEqual([byMal.streams[0].audio[0].lang, byMal.streams[0].audio[0].dub], ['en', true]);
  assert.deepEqual(await contract(animeMegavid, AOT, megavidRoutes()), []);
});

test('Megavid: "missing" on every route is NOT_FOUND; an answer without a stream or a page instead of JSON is STRUCTURE_CHANGED', async () => {
  const missing = await run(animeMegavid, AOT, { 'megavid.buzz': megavidRoutes()['megavid.buzz'] });
  assert.deepEqual([missing.outcome, missing.code, missing.requests], ['empty', 'NOT_FOUND', 2]);
  const odd = await run(animeMegavid, AOT, { 'megavid.buzz': { body: { status: 'queued' } } });
  assert.deepEqual([odd.outcome, odd.code], ['error', 'STRUCTURE_CHANGED']);
  const shell = await run(animeMegavid, AOT, { 'megavid.buzz': html('<h1>Anime Player - Embed API</h1>') });
  assert.deepEqual([shell.outcome, shell.code], ['error', 'STRUCTURE_CHANGED']);
});

// ---------- Shonen ----------

const SHONEN_RELAY = '/api/v1/zoko-media?u=bWFzdGVy&e=1900000000&k=media&s=aa11';
const shonenAnswer = { data: { provider: 'shonen', source: SHONEN_RELAY, sources: [{ file: 'https://mirror.example.org/api/stream/proxy?url=s1.xyz', type: 'hls', label: 'Primary', tracks: [{ file: 'https://mirror.example.org/api/sub.vtt?url=s1.en', label: 'English', kind: 'subtitles' }] }, { file: SHONEN_RELAY, type: 'hls', label: 'Primary', tracks: [{ file: '/api/v1/zoko-media?u=ZW4&e=1900000000&k=vtt&s=bb22', label: 'English', kind: 'subtitles', default: true }] }], tracks: [{ file: '/api/v1/zoko-media?u=ZXM&e=1900000000&k=vtt&s=cc33', label: 'Spanish', kind: 'subtitles' }, { file: '/thumbs.vtt', label: 'thumbnails', kind: 'thumbnails' }] } };
const SHONEN_TITLE_PAGE = html('<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"TVSeries","name":"Attack on Titan","url":"https://shonen.to/anime/16498","numberOfEpisodes":25},{"@type":"BreadcrumbList","itemListElement":[]}]}</script><a href="/watch/16498/1">Episode 1</a>');
const SHONEN_BROWSE = html('<form class="browse-panel" method="get" action="/browse"><input type="search" name="q" value="attack on titan"></form><a class="card" href="/anime/20958" title="Attack on Titan Season 2"><div class="ct">Attack on Titan Season 2</div><div class="cm">TV / 2017</div></a><a class="card" href="/anime/16498" title="Attack on Titan"><div class="ct">Attack on Titan</div><div class="cm">TV / 2013</div></a>');
const shonenRoutes = (): Record<string, MockRoute> => ({
  'https://shonen.to/sources/shonen': (req: MockRequest) => (req.url.searchParams.get('language') === 'sub' && req.url.searchParams.get('episode') === '1' ? { body: shonenAnswer } : { status: 502, body: 'error code: 502' }),
  'https://shonen.to/anime/16498': SHONEN_TITLE_PAGE,
  'https://shonen.to/browse': SHONEN_BROWSE,
  'https://shonen.to/api/v1/zoko-media': simulate.playlist([1080]),
});

test('Shonen: asks the sources endpoint by AniList id, puts the preferred playlist first, resolves the site’s relative addresses', async () => {
  const r = await run(animeShonen, AOT, shonenRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => [new URL(s.url).hostname, s.type, s.quality, s.audio[0].lang]), [['shonen.to', 'hls', '1080', 'ja'], ['mirror.example.org', 'hls', 'auto', 'ja']]);
  assert.equal(r.streams[0].expiresAt, 1_900_000_000_000);
  assert.equal(r.streams[0].headers.Referer, 'https://shonen.to/');
  assert.equal(r.calls[0].headers.Referer, 'https://shonen.to/watch/16498/1');
  // One "English" (the preferred source's), one "Spanish"; the thumbnail track is not a caption.
  assert.deepEqual(r.captions.map((c) => [c.label, new URL(c.url).hostname]), [['English', 'shonen.to'], ['Spanish', 'shonen.to']]);
  assert.deepEqual(await contract(animeShonen, AOT, shonenRoutes()), []);
});

test('Shonen: without an AniList id the browse page is searched and the entry of the right year is used', async () => {
  const r = await run(animeShonen, AOT_BY_TITLE, shonenRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.calls.slice(0, 2).map((c) => c.url.pathname + c.url.search), ['/browse?q=Attack%20on%20Titan', '/sources/shonen?id=16498&episode=1&language=sub']);
  assert.deepEqual(await contract(animeShonen, AOT_BY_TITLE, shonenRoutes()), []);
});

test('Shonen: a 502 for an episode past the listed count (or an unknown id) is NOT_FOUND, for a listed episode it stays an outage; search pages are told apart', async () => {
  const past = await run(animeShonen, { ...AOT, episode: 26 }, shonenRoutes());
  assert.deepEqual([past.outcome, past.code], ['empty', 'NOT_FOUND']);
  const unknown = await run(animeShonen, AOT, { ...shonenRoutes(), 'https://shonen.to/sources/shonen': { status: 502, body: 'error code: 502' }, 'https://shonen.to/anime/16498': simulate.notFound() });
  assert.deepEqual([unknown.outcome, unknown.code], ['empty', 'NOT_FOUND']);
  const outage = await run(animeShonen, { ...AOT, episode: 3 }, shonenRoutes());
  assert.deepEqual([outage.outcome, outage.code], ['error', 'HTTP']);

  const nothing = await run(animeShonen, AOT_BY_TITLE, { 'shonen.to': html('<form class="browse-panel" action="/browse"><input type="search" name="q"></form>') });
  assert.deepEqual([nothing.outcome, nothing.code], ['empty', 'NOT_FOUND']);
  const otherYear = await run(animeShonen, { ...AOT_BY_TITLE, year: 1999 }, shonenRoutes());
  assert.deepEqual([otherYear.outcome, otherYear.code], ['empty', 'NOT_FOUND']);
  const redesigned = await run(animeShonen, AOT_BY_TITLE, { 'shonen.to': html('<main><div class="grid"><div class="tile">Attack on Titan</div></div></main>') });
  assert.deepEqual([redesigned.outcome, redesigned.code], ['error', 'SELECTOR_MISSING']);
  const reshaped = await run(animeShonen, AOT, { 'shonen.to': { body: { result: [] } } });
  assert.deepEqual([reshaped.outcome, reshaped.code], ['error', 'STRUCTURE_CHANGED']);
});

// ---------- AnimoTVSlash ----------

const ANIMO_ANSWER = { server: 'Koto', provider: 'reanime', sources: [{ name: 'HD-2', url: 'https://edge2.animotvslash.ru/v/aaa.m3u8', referer: null }, { name: 'HD-1', url: 'https://edge2.animotvslash.ru/v/bbb.m3u8', referer: null }], url: 'https://edge2.animotvslash.ru/v/aaa.m3u8', type: 'hls', subtitleType: 'softsub', subtitles: [{ url: 'https://edge2.animotvslash.ru/v/s1.ass', label: 'English (Full Subs)', language: 'English (Full Subs)', format: 'ass', default: true }, { url: 'https://edge2.animotvslash.ru/v/s2.sup', label: 'English (PGS)', language: 'English (PGS)', format: 'sup', default: false }] };
const ANIMO_SEARCH = html('<section class="abr abr-search"><div class="listupd"><article class="bs"><div class="bsx"><a href="https://animotvslash.org/anime/attack-on-titan-season-2/" title="Attack on Titan Season 2" class="tip" rel="12325"><div class="tt">Attack on Titan Season 2</div></a></div></article><article class="bs"><div class="bsx"><a href="https://animotvslash.org/anime/attack-on-titan/" title="Attack on Titan" class="tip" rel="12297"><div class="tt">Attack on Titan</div></a></div></article></div></section>');
const ANIMO_EMPTY = html('<section class="abr abr-search"><div class="abr-count"><b>0</b><span>results</span></div><div class="abr-empty"><h2>No anime found</h2></div></section>');
const ANIMO_TITLE = html('<div class="spe"><span class="split"><b>Released:</b> 2013-04</span><span><b>Episodes:</b> 25</span></div><ul id="ts-ep-list"><li data-index="0"><a href="https://animotvslash.org/attack-on-titan-episode-2/"><div class="epl-num">2</div><div class="epl-title">Attack on Titan Episode 2</div></a></li><li data-index="1"><a href="https://animotvslash.org/attack-on-titan-episode-1/"><div class="epl-num">1</div><div class="epl-title">Attack on Titan Episode 1</div></a></li></ul>');
const animoRoutes = (): Record<string, MockRoute> => ({
  'https://animotvslash.ru/api/stream/sources/koto': { body: ANIMO_ANSWER },
  'edge2.animotvslash.ru': TWO_AUDIO,
  'https://animotvslash.org/': ANIMO_SEARCH,
  'https://animotvslash.org/anime/attack-on-titan/': ANIMO_TITLE,
  'https://animotvslash.org/attack-on-titan-episode-1/': html('<div class="player-embed"><iframe src="https://animotvslash.ru/watch/16498/1?lang=dub&#038;embed=1" allowfullscreen></iframe></div>'),
});

test('AnimoTVSlash: asks the stream API by AniList id, reads each playlist for its audio tracks, drops picture subtitles', async () => {
  const r = await run(animeAnimotvslash, AOT, animoRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams.length, 2);
  for (const s of r.streams) {
    assert.deepEqual([s.type, s.quality, s.headers.Referer, s.headers.Origin], ['hls', '1080', 'https://animotvslash.ru/', 'https://animotvslash.ru']);
    assert.deepEqual(s.audio.map((a) => [a.lang, !!a.dub]), [['ja', false], ['en', true]]);
  }
  assert.deepEqual(r.captions.map((c) => [c.label, c.format, c.lang]), [['English (Full Subs)', 'ass', 'en']]);
  assert.equal(r.calls[0].url.search, '?anilistId=16498&episode=1&lang=sub');
  assert.deepEqual(await contract(animeAnimotvslash, AOT, animoRoutes()), []);
});

test('AnimoTVSlash: without an AniList id it goes search → title page → episode page → player frame, then the same API call', async () => {
  const r = await run(animeAnimotvslash, AOT_BY_TITLE, animoRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.calls.slice(0, 4).map((c) => c.url.hostname + c.url.pathname + c.url.search), ['animotvslash.org/?s=Attack%20on%20Titan', 'animotvslash.org/anime/attack-on-titan/', 'animotvslash.org/attack-on-titan-episode-1/', 'animotvslash.ru/api/stream/sources/koto?anilistId=16498&episode=1&lang=sub']);
  assert.deepEqual(await contract(animeAnimotvslash, AOT_BY_TITLE, animoRoutes()), []);
});

test('AnimoTVSlash: 404 is NOT_FOUND; a 500 is NOT_FOUND only when the catalogue lacks the title; a dub needs an English track; a title page without its list is SELECTOR_MISSING', async () => {
  const gone = await run(animeAnimotvslash, AOT, { ...animoRoutes(), 'https://animotvslash.ru/api/stream/sources/koto': { status: 404, body: { error: 'Request failed with status code 404', server: 'koto' } } });
  assert.deepEqual([gone.outcome, gone.code], ['empty', 'NOT_FOUND']);
  const failing = { status: 500, body: { error: 'Request failed with status code 500', server: 'koto' } };
  const outage = await run(animeAnimotvslash, AOT, { ...animoRoutes(), 'https://animotvslash.ru/api/stream/sources/koto': failing });
  assert.deepEqual([outage.outcome, outage.code], ['error', 'HTTP']);
  const unlisted = await run(animeAnimotvslash, AOT, { ...animoRoutes(), 'https://animotvslash.ru/api/stream/sources/koto': failing, 'https://animotvslash.org/': ANIMO_EMPTY });
  assert.deepEqual([unlisted.outcome, unlisted.code], ['empty', 'NOT_FOUND']);

  const subOnly = { ...animoRoutes(), 'edge2.animotvslash.ru': simulate.playlist([1080]) };
  const noDub = await run(animeAnimotvslash, { ...AOT, audio: 'dub' }, subOnly);
  assert.deepEqual([noDub.outcome, noDub.code], ['empty', 'NOT_FOUND']);
  const sub = await run(animeAnimotvslash, AOT, subOnly);
  assert.deepEqual(sub.streams.map((s) => s.audio.map((a) => a.lang)), [['ja'], ['ja']]);

  const redesigned = await run(animeAnimotvslash, AOT_BY_TITLE, { ...animoRoutes(), 'https://animotvslash.org/anime/attack-on-titan/': html('<div class="spe"><span><b>Released:</b> 2013-04</span></div><div class="episodes-grid"></div>') });
  assert.deepEqual([redesigned.outcome, redesigned.code], ['error', 'SELECTOR_MISSING']);
  const shell = await run(animeAnimotvslash, AOT, { ...animoRoutes(), 'https://animotvslash.ru/api/stream/sources/koto': html('<div id="app"></div>') });
  assert.deepEqual([shell.outcome, shell.code], ['error', 'STRUCTURE_CHANGED']);
});

// ---------- AnimeHeaven ----------

const KEY_1 = '0e65e755acf01b7138fd0bdaedd0919d';
const KEY_2 = '056630f5d1ad6288c9d929009af740a9';
/** The site writes its markup with single-quoted attributes and loose spacing; the fixtures keep that. */
const ahCard = (id: string, title: string) => `<div class='similarimg'><div class='p1'><a href='anime.php?${id}'><img class='coverimg' src='image.php?x' alt='${title}' loading='lazy'></a><div class='similarname c'><a href='anime.php?${id}' class='c'>${title}</a></div></div></div>`;
const ahSearch = (...cards: string[]) => html(`<form class='searchf bc2' action='search.php' method='get'><input class='searchin bc c' name='s' maxlength='100'></form>${cards.join('')}`);
const ahEpisode = (key: string, number: number) => `<a class='c' id ="${key}" onclick='gatea( "${key}")'    href= 'gate.php'   \n><div class='trackep0 watch bc2'><div class='watch1 bc c'>Episode</div><div  class= ' watch2 bc '  >${number}</div><div class='watch1 bc c'>1250 d ago</div></div></a>`;
const ahTitle = (title: string, japanese: string, year: number, episodes: string) => html(`<div class='infotitle c'>${title}</div><div class='infotitlejp c'>${japanese}</div><div class='infoyear c'>Episodes: <div class='inline c2'>25</div> Year: <div class='inline c2'>${year}</div> Score: <div class='inline c2'>8.8/10</div></div><div class='linetitle2 c2'>${episodes}</div>`);
const ahGate = (key: string) => html(`<!-- <source src='https://ax.animeheaven.me/video.mp4?${KEY_2}&eed8' type='video/mp4'>  --><video id='vid' class='videodiv' controls>\n<source src='https://rx.animeheaven.me/video.mp4?${key}&035d' type='video/mp4'>\n<source src='https://ct.animeheaven.me/video.mp4?${key}&035d&error' type='video/mp4'>\nYour browser does not support HTML video.</video>`);
const ahRoutes = (): Record<string, MockRoute> => ({
  'https://animeheaven.me/search.php': ahSearch(ahCard('1zcj9', 'Attack on Titan 2nd Season'), ahCard('odsey', 'Attack on Titan')),
  'https://animeheaven.me/anime.php?odsey': ahTitle('Attack on Titan', 'Shingeki no Kyojin', 2013, ahEpisode(KEY_2, 2) + ahEpisode(KEY_1, 1)),
  'https://animeheaven.me/anime.php?1zcj9': ahTitle('Attack on Titan 2nd Season', 'Shingeki no Kyojin Season 2', 2017, ahEpisode('ffff', 1)),
  // The player page is one address; the cookie says which episode it shows.
  'https://animeheaven.me/gate.php': (req: MockRequest) => ahGate(/^key=(\w+)$/.exec(req.headers.Cookie ?? '')?.[1] ?? KEY_2),
});

test('AnimeHeaven: search, title page, then the player page with the episode key in a cookie; only the <video> element is read', async () => {
  const r = await run(animeAnimeheaven, AOT, ahRoutes());
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.calls.map((c) => c.url.pathname + c.url.search), ['/search.php?s=Attack%20on%20Titan', '/anime.php?odsey', '/gate.php']);
  assert.equal(r.calls[2].headers.Cookie, `key=${KEY_1}`);
  assert.equal(r.streams.length, 1);
  const s = r.streams[0];
  assert.equal(s.url, `https://rx.animeheaven.me/video.mp4?${KEY_1}&035d`);
  assert.deepEqual([s.type, s.audio[0].lang, s.hardsub, s.headers.Referer], ['mp4', 'ja', 'en', 'https://animeheaven.me/']);
  assert.deepEqual(await contract(animeAnimeheaven, AOT, ahRoutes()), []);
});

test('AnimeHeaven: a title the site lists under another English name is found through its page’s Japanese name and year', async () => {
  const JJK: AnimeMedia = { kind: 'anime', ids: { anilist: '113415' }, title: 'Jujutsu Kaisen', altTitles: ['JUJUTSU KAISEN'], year: 2020, episode: 1, audio: 'sub' };
  const routes = { ...ahRoutes(), 'https://animeheaven.me/search.php': ahSearch(ahCard('62reo', 'Sorcery Fight'), ahCard('dcsxf', 'Sorcery Fight 0')), 'https://animeheaven.me/anime.php?62reo': ahTitle('Sorcery Fight', 'Jujutsu Kaisen', 2020, ahEpisode(KEY_1, 1)), 'https://animeheaven.me/anime.php?dcsxf': ahTitle('Sorcery Fight 0', 'Jujutsu Kaisen 0', 2021, ahEpisode(KEY_2, 1)) };
  const r = await run(animeAnimeheaven, JJK, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.ok(r.streams[0].url.includes(KEY_1));
  assert.deepEqual(r.calls.map((c) => c.url.pathname + c.url.search), ['/search.php?s=Jujutsu%20Kaisen', '/anime.php?62reo', '/gate.php']);
  // The same names from another year are a different work: both suggested pages are read, neither is taken.
  const remake = await run(animeAnimeheaven, { ...JJK, year: 2031 }, routes);
  assert.deepEqual([remake.outcome, remake.code], ['empty', 'NOT_FOUND']);
  assert.ok(!remake.calls.some((c) => c.url.pathname === '/gate.php'));
});

test('AnimeHeaven: no result, no such episode and a dub request are NOT_FOUND; changed markup is SELECTOR_MISSING; a player page for another episode is INVALID_RESULT', async () => {
  const nothing = await run(animeAnimeheaven, AOT, { 'animeheaven.me': ahSearch() });
  assert.deepEqual([nothing.outcome, nothing.code, nothing.requests], ['empty', 'NOT_FOUND', 2]);
  const noEpisode = await run(animeAnimeheaven, { ...AOT, episode: 9 }, ahRoutes());
  assert.deepEqual([noEpisode.outcome, noEpisode.code], ['empty', 'NOT_FOUND']);
  const dub = await run(animeAnimeheaven, { ...AOT, audio: 'dub' }, ahRoutes());
  assert.deepEqual([dub.code, dub.calls.length], ['NOT_FOUND', 0]);

  const newSearch = await run(animeAnimeheaven, AOT, { 'animeheaven.me': html('<main><ul class="results"><li>Attack on Titan</li></ul></main>') });
  assert.deepEqual([newSearch.outcome, newSearch.code], ['error', 'SELECTOR_MISSING']);
  const newList = await run(animeAnimeheaven, AOT, { ...ahRoutes(), 'https://animeheaven.me/anime.php?odsey': ahTitle('Attack on Titan', 'Shingeki no Kyojin', 2013, '<ul class="eps"><li data-ep="1">1</li></ul>') });
  assert.deepEqual([newList.outcome, newList.code], ['error', 'SELECTOR_MISSING']);
  const newPlayer = await run(animeAnimeheaven, AOT, { ...ahRoutes(), 'https://animeheaven.me/gate.php': html('<div id="player" data-src="blob:"></div>') });
  assert.deepEqual([newPlayer.outcome, newPlayer.code], ['error', 'SELECTOR_MISSING']);
  // A runtime that drops the cookie gets the page of whatever episode the site defaults to.
  const wrongEpisode = await run(animeAnimeheaven, AOT, { ...ahRoutes(), 'https://animeheaven.me/gate.php': ahGate(KEY_2) });
  assert.deepEqual([wrongEpisode.outcome, wrongEpisode.code], ['error', 'INVALID_RESULT']);
});
