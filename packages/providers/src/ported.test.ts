/**
 * The twelve providers ported from the server-only classes, against synthetic fixtures.
 *
 * Fixtures are responses written for these tests in the shape each provider expects, sealed with
 * the same schemes the providers open (the tests carry the inverse of every cipher). They prove the
 * extraction logic, the failure classification and the provider contract. They do NOT prove that a
 * live site still answers this way: that is what the benchmark's live runs record, per provider.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRuntime, validateDomainConfig, validateManifest, validateRulePack, type Media, type ProviderModule } from '@charcoal/provider-sdk';
import { checkContract, createHarness, simulate, TITLES, type MockRoute } from '@charcoal/provider-sdk/testing';
import { CODE_PROVIDERS, DEFAULT_DOMAINS, fsharetv, icefyManifest, icefyRules, loadCorePack, peachify, popr, RULE_PROVIDERS, streammafia, tulnex, videasy, vidnest, vidrock, vidsrc, vidzee } from './index.js';
import { base64ToBytes, bytesToBase64, bytesToHex, utf8 } from './providers/shared.js';
import { encryptItemId } from './providers/vidrock.js';

const MOVIE = TITLES.movie;
const EPISODE = TITLES.episode;
const PLAYLIST = simulate.playlist([1080, 720]);
const loaded = (id: string) => loadCorePack().filter((p) => p.module.manifest.id === id);
const run = async (id: string, media: Media, routes: Record<string, MockRoute>, runtime = describeRuntime('server')) => {
  const h = createHarness({ providers: loaded(id), routes, runtime, engine: { providerTimeoutMs: 20_000, requestTimeoutMs: 5_000 } });
  const r = await h.engine.runProvider(h.engine.providers()[0], media);
  return { ...r, calls: h.transport.calls };
};
const contract = (module: ProviderModule, media: Media, routes: Record<string, MockRoute>) => checkContract(module, { media, routes, domains: DEFAULT_DOMAINS[module.manifest.id] });
const b64 = (s: string) => bytesToBase64(utf8(s));

test('all twelve legacy providers are in the pack as native modules, each with a valid manifest and domain config', () => {
  const ids = [...CODE_PROVIDERS.map((p) => p.module.manifest.id), ...RULE_PROVIDERS.map((p) => p.manifest.id)];
  for (const id of ['cinesu', 'fsharetv', 'icefy', 'peachify', 'popr', 'streammafia', 'tulnex', 'videasy', 'vidnest', 'vidrock', 'vidsrc', 'vidzee']) assert.ok(ids.includes(id), `${id} is in the pack`);
  for (const { module } of CODE_PROVIDERS) {
    assert.deepEqual(validateManifest(module.manifest), [], module.manifest.id);
    assert.deepEqual(validateDomainConfig(DEFAULT_DOMAINS[module.manifest.id], module.manifest.domainRoles), [], module.manifest.id);
    // None of them is network-unmanaged any more: every request goes through the policy.
    assert.notEqual(module.manifest.network, 'unmanaged', module.manifest.id);
  }
  for (const { manifest, rules } of RULE_PROVIDERS) {
    assert.deepEqual(validateManifest(manifest), [], manifest.id);
    assert.deepEqual(validateRulePack(rules, manifest), [], manifest.id);
    assert.deepEqual(validateDomainConfig(DEFAULT_DOMAINS[manifest.id], manifest.domainRoles), [], manifest.id);
  }
});

// ---------- VidRock ----------

test('VidRock: reads the server table, follows the per-resolution list, attaches subtitles', async () => {
  const id = await encryptItemId('27205');
  const routes: Record<string, MockRoute> = {
    [`https://vidrock.net/api/movie/${id}`]: { body: { Nova: { url: 'https://hls2.vdrk.site/list/abc', language: 'English' }, Atlas: { url: 'https://cdn.example-67streams.net/v/master.m3u8', language: 'English' }, Luna: { url: '', language: '' } } },
    'https://hls2.vdrk.site/list/abc': { body: [{ url: `https://proxy.vidrock.store/${encodeURIComponent('https://files.example.org/v/1080.mp4')}`, resolution: 1080 }, { url: 'https://files.example.org/v/720/index.m3u8', resolution: 720 }] },
    'https://sub.vdrk.site/v2/movie/27205': { body: [{ label: 'English', file: 'https://cache.vdrk.site/v3/movie/27205/English.vtt' }] },
  };
  const r = await run('vidrock', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => [s.type, s.quality, new URL(s.url).hostname]).sort(), [['hls', '1080', 'cdn.example-67streams.net'], ['hls', '720', 'files.example.org'], ['mp4', '1080', 'files.example.org']].sort());
  assert.equal(r.streams.find((s) => s.type === 'mp4')!.headers.Referer, 'https://lok-lok.cc/');
  assert.equal(r.captions.length, 1);
  assert.deepEqual(await contract(vidrock, MOVIE, routes), []);
});

test('VidRock: a table whose servers are all empty is "not here", and an episode uses id_season_episode', async () => {
  const id = await encryptItemId('1396_2_3');
  const r = await run('vidrock', EPISODE, { [`https://vidrock.net/api/tv/${id}`]: { body: { Nova: { url: '' }, Atlas: { url: '' } } } });
  assert.equal(r.outcome, 'empty');
  assert.equal(r.code, 'NOT_FOUND');
});

// ---------- VidZee ----------

async function vidzeeFixtures(links: string[]) {
  const key = 'k'.repeat(24);
  const gcm = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8('4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c')), { name: 'AES-GCM' }, false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, gcm, utf8(key)));
  const body = sealed.slice(0, sealed.length - 16);
  const tag = sealed.slice(sealed.length - 16);
  const keyPayload = bytesToBase64(new Uint8Array([...nonce, ...tag, ...body]));
  const raw = new Uint8Array(32);
  raw.set(utf8(key));
  const cbc = await crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt']);
  const seal = async (link: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    return b64(`${bytesToBase64(iv)}:${bytesToBase64(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cbc, utf8(link)))}`);
  };
  return { keyPayload, sealed: await Promise.all(links.map(seal)) };
}

test('VidZee: unwraps the key, decrypts links from every server, removes duplicates', async () => {
  const f = await vidzeeFixtures(['https://cdn.example.org/a/master.m3u8', 'https://fast33lane.example.net/b/master.m3u8']);
  const routes: Record<string, MockRoute> = {
    'https://core.vidzee.wtf/api-key': { body: f.keyPayload },
    'https://player.vidzee.wtf/api/server*': (req) => {
      const sr = Number(req.url.searchParams.get('sr'));
      if (sr > 2) return simulate.notFound();
      return { body: { url: [{ link: f.sealed[sr % 2], lang: 'English', type: 'hls' }], tracks: [{ lang: 'English1', url: 'https://subs.example.org/en.vtt' }], serverInfo: { number: sr } } };
    },
  };
  const r = await run('vidzee', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams.length, 2);
  assert.equal(r.streams.find((s) => s.url.includes('fast33lane'))!.headers.Referer, 'https://rapidairmax.site/');
  assert.equal(r.captions[0].label, 'English');
  assert.deepEqual(await contract(vidzee, MOVIE, routes), []);
});

test('VidZee: the live state on 2026-11-24 (key endpoint 404, API route serving the app shell) is STRUCTURE_CHANGED, not "not found"', async () => {
  const gone = await run('vidzee', MOVIE, { 'https://core.vidzee.wtf/api-key': { status: 404, body: { error: 'Not found', path: '/api-key' } } });
  assert.equal(gone.code, 'STRUCTURE_CHANGED');
  const f = await vidzeeFixtures([]);
  const shell = await run('vidzee', MOVIE, { 'https://core.vidzee.wtf/api-key': { body: f.keyPayload }, 'player.vidzee.wtf': simulate.html('<!DOCTYPE html><html><head><title>Vidzee Player</title></head></html>') });
  assert.equal(shell.code, 'STRUCTURE_CHANGED');
});

// ---------- VidNest ----------

const VIDNEST_ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';
const STANDARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const vidnestEncode = (value: unknown) => [...bytesToBase64(utf8(JSON.stringify(value)))].map((c) => VIDNEST_ALPHABET[STANDARD.indexOf(c)]).join('');

test('VidNest: decodes each back-end with its own shape; unknown back-ends are skipped', async () => {
  const routes: Record<string, MockRoute> = {
    'https://new.vidnest.fun/moviebox/movie/27205': { body: { encrypted: true, data: vidnestEncode({ url: [{ link: 'https://cdn.example.org/mb/1080.mp4', type: 'mp4', lang: 'English' }] }) } },
    'https://new.vidnest.fun/vidlink/movie/27205': { body: { encrypted: true, data: vidnestEncode({ headers: { Referer: 'https://vidlink.example/' }, data: { stream: { playlist: 'https://cdn.example.org/vl/master.m3u8', type: 'hls', captions: [{ url: 'https://cdn.example.org/vl/en.vtt', language: 'English' }] } } }) } },
    'https://new.vidnest.fun/purstream/movie/27205': { body: { encrypted: true, data: vidnestEncode({ sources: [{ url: 'https://cdn.example.org/ps/720/index.m3u8', format: 'hls', name: 'HD 720' }] }) } },
    'https://new.vidnest.fun/catflix/movie/27205': { body: { encrypted: true, data: vidnestEncode({ anything: true }) } },
    'new.vidnest.fun': simulate.notFound(),
  };
  const r = await run('vidnest', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => `${s.type}:${s.quality}:${s.audio[0].lang}`).sort(), ['hls:720:fr', 'hls:auto:en', 'mp4:1080:en']);
  assert.equal(r.streams.find((s) => s.url.includes('/vl/'))!.headers.Referer, 'https://vidlink.example/');
  assert.equal(r.captions.length, 1);
  assert.deepEqual(await contract(vidnest, MOVIE, routes), []);
});

test('VidNest: the live state on 2026-11-24 (every back-end answers 403 "missing or invalid nonce") is STRUCTURE_CHANGED', async () => {
  const r = await run('vidnest', MOVIE, { 'new.vidnest.fun': { status: 403, body: { error: 'missing or invalid nonce' } } });
  assert.equal(r.outcome, 'error');
  assert.equal(r.code, 'STRUCTURE_CHANGED');
  assert.match(r.message ?? '', /nonce/);
});

// ---------- Videasy ----------

test('Videasy: seed, blob, third-party decoder; the decoder receives the blob, the id and the seed', async () => {
  let posted: unknown;
  const routes: Record<string, MockRoute> = {
    'https://api.wecollege.net/seed?mediaId=27205': { body: { seed: 'seed123' } },
    'https://api.wecollege.net/miami/sources*': { body: 'ENCRYPTEDBLOB0123456789' },
    'https://api.wecollege.net/delhi/sources*': { body: 'ENCRYPTEDBLOBHINDI000000' },
    'api.wecollege.net': simulate.notFound(),
    'POST https://enc-dec.app/api/dec-videasy': (req) => {
      posted = JSON.parse(req.body ?? '{}');
      const hindi = String((posted as { text: string }).text).includes('HINDI');
      return { body: { status: 200, result: { sources: [{ url: `https://cdn.example.org/${hindi ? 'hi' : 'en'}/master.m3u8`, quality: '1080p' }], subtitles: [{ url: 'https://cdn.example.org/en.vtt', lang: 'English' }] } } };
    },
  };
  const r = await run('videasy', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => s.audio[0].lang).sort(), ['hi', 'und']);
  assert.deepEqual(Object.keys(posted as object).sort(), ['id', 'seed', 'text']);
  // The title is URL-encoded twice, as the API expects.
  assert.ok(r.calls.some((c) => c.url.href.includes('title=Inception') && c.url.searchParams.get('enc') === '2' && c.url.searchParams.get('seed') === 'seed123'));
  assert.deepEqual(await contract(videasy, MOVIE, routes), []);
});

test('Videasy: a decoder that refuses the blob is STRUCTURE_CHANGED; a blocked API is ACCESS_DENIED', async () => {
  const refused = await run('videasy', MOVIE, { 'https://api.wecollege.net/seed?mediaId=27205': { body: { seed: 's' } }, 'api.wecollege.net': { body: 'ENCRYPTEDBLOB0123456789' }, 'enc-dec.app': { status: 200, body: { status: 400, result: '', error: 'Expected body: text, id, seed' } } });
  assert.equal(refused.code, 'STRUCTURE_CHANGED');
  const blocked = await run('videasy', MOVIE, { 'api.wecollege.net': { status: 403, headers: { 'content-type': 'text/html' }, body: '<html><head><title>Attention Required! | Cloudflare</title></head></html>' } });
  assert.ok(['ACCESS_DENIED', 'CHALLENGE'].includes(blocked.code ?? ''), blocked.code);
});

// ---------- VidSrc ----------

test('VidSrc, older layout: iframe → inline src → file with host placeholders', async () => {
  const routes: Record<string, MockRoute> = {
    'https://vsembed.ru/embed/movie?tmdb=27205': simulate.html('<html><body><iframe id="player_iframe" src="//cloudnestra.example/rcp/abc"></iframe></body></html>'),
    'https://cloudnestra.example/rcp/abc': simulate.html("<script>function loadIframe(){ $('<iframe>', { id: 'p', src: '/prorcp/def' }) }</script>"),
    'https://cloudnestra.example/prorcp/def': simulate.html('<script>var player = new Playerjs({ id: "player", file: "https://tmstr.{v1}/pl/x/master.m3u8 or https://tmstr.{v4}/pl/x/master.m3u8 or https://tmstr.{v9}/pl/x/master.m3u8" });</script>'),
  };
  const r = await run('vidsrc', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => new URL(s.url).hostname), ['tmstr.neonhorizonworkshops.com', 'tmstr.cloudnestra.com']);
  assert.equal(r.streams[0].headers.Referer, 'https://cloudnestra.com/');
  assert.deepEqual(await contract(vidsrc, MOVIE, routes), []);
});

test('VidSrc, current layout (measured 2026-11-24): the gated player is offered as a frame, and the gate token is not used', async () => {
  const routes: Record<string, MockRoute> = {
    'https://vsembed.ru/embed/tv?tmdb=1396&season=2&episode=3': simulate.html('<script src="/assets/sbx.js"></script><iframe id="player_iframe"\n data-api="/vs_src.php?type=tv&amp;id=1396&amp;season=2&amp;episode=3" allowfullscreen></iframe>'),
    'https://vsembed.ru/vs_src.php*': { body: { src: 'https://player.example.net/embed/tv/1396/2/3?vs=SHORTLIVEDTOKEN' } },
  };
  const r = await run('vidsrc', EPISODE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams.length, 1);
  assert.equal(r.streams[0].type, 'frame');
  assert.equal(r.streams[0].url, 'https://vsembed.ru/embed/tv?tmdb=1396&season=2&episode=3');
  assert.ok(!r.streams[0].url.includes('SHORTLIVEDTOKEN'));
  // The gated player itself was never requested.
  assert.ok(!r.calls.some((c) => c.url.hostname === 'player.example.net'));
  const none = await run('vidsrc', EPISODE, { ...routes, 'https://vsembed.ru/vs_src.php*': { body: {} } });
  assert.equal(none.code, 'NOT_FOUND');
  const neither = await run('vidsrc', EPISODE, { 'vsembed.ru': simulate.html('<html><body>maintenance</body></html>') });
  assert.equal(neither.code, 'SELECTOR_MISSING');
});

// ---------- MafiaEmbed ----------

async function mafiaSeal(value: unknown) {
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8('Z9#rL!v2K*5qP&7mXw')), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, utf8(JSON.stringify(value))));
  return { iv: bytesToBase64(iv), tag: bytesToBase64(sealed.slice(sealed.length - 16)), data: bytesToBase64(sealed.slice(0, sealed.length - 16)) };
}

test('MafiaEmbed: session cookie, token, sealed answer, other audio versions', async () => {
  const main = await mafiaSeal({ selected: { lang: 'English', lang_code: 'en' }, switches: [{ file_code: 'hin1', lang: 'Hindi', lang_code: 'hi' }], stream: { hls_streaming: 'https://cdn.example.org/en/master.m3u8', download: [{ quality: '720p', url: 'https://cdn.example.org/en/720.mp4' }] } });
  const hindi = await mafiaSeal({ stream: { hls_streaming: 'https://cdn.example.org/hi/master.m3u8' } });
  const seenHeaders: Record<string, string>[] = [];
  const routes: Record<string, MockRoute> = {
    'POST https://player.nhdapi.com/api/session': { body: {}, headers: { 'set-cookie': 'vid_session=abc123; Path=/; HttpOnly' } },
    'https://player.nhdapi.com/api/token': (req) => (seenHeaders.push(req.headers), { body: { token: 'tok_9' } }),
    'https://player.nhdapi.com/api/movie/?id=27205': (req) => (seenHeaders.push(req.headers), { body: main }),
    'https://player.nhdapi.com/api/source/hin1': { body: hindi },
    'https://cdn.example.org/en/master.m3u8': simulate.playlist([1080, 720]),
    'https://cdn.example.org/hi/master.m3u8': simulate.playlist([720]),
  };
  const r = await run('streammafia', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => `${s.type}:${s.quality}:${s.audio[0].lang}`).sort(), ['hls:1080:en', 'hls:720:hi', 'mp4:720:en']);
  assert.equal(seenHeaders[0].Cookie, 'vid_session=abc123');
  assert.equal(seenHeaders[1]['x-api-token'], 'tok_9');
  assert.equal(seenHeaders[1]['x-content-id'], '27205');
  assert.deepEqual(await contract(streammafia, MOVIE, routes), []);
});

test('MafiaEmbed: no cookie, or an answer that will not open, is STRUCTURE_CHANGED; it does not run where cookies cannot be sent', async () => {
  const noCookie = await run('streammafia', MOVIE, { 'player.nhdapi.com': { body: {} } });
  assert.equal(noCookie.code, 'STRUCTURE_CHANGED');
  const garbled = await run('streammafia', MOVIE, { 'POST https://player.nhdapi.com/api/session': { body: {}, headers: { 'set-cookie': 'a=b' } }, 'https://player.nhdapi.com/api/token': { body: { token: 't' } }, 'player.nhdapi.com': { body: { iv: b64('123456789012'), tag: b64('0123456789abcdef'), data: b64('not sealed with the key') } } });
  assert.equal(garbled.code, 'STRUCTURE_CHANGED');
  const h = createHarness({ providers: loaded('streammafia'), runtime: describeRuntime('extension') });
  assert.equal(h.engine.plan({ media: MOVIE }).run.length, 0);
});

// ---------- Tulnex ----------

async function tulnexSeal(value: unknown) {
  const text = (b64s: string) => new TextDecoder().decode(base64ToBytes(b64s));
  const pbkdf2 = async (pass: string, salt: string, iterations: number, hash: string) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: utf8(salt), iterations, hash }, await crypto.subtle.importKey('raw', utf8(pass), { name: 'PBKDF2' }, false, ['deriveBits']), 256));
  const pad = await pbkdf2(text('U24wMHBEMGcjTDFfWDBSX000c3QzckszeSEyMDI2c2V4'), text('eEs5IW1SMkBwTDUjblE4c2V4'), 50_000, 'SHA-256');
  const plain = utf8(JSON.stringify(value));
  const xored = plain.map((b, i) => b ^ pad[i % 32]);
  const l2 = btoa([...bytesToHex(xored)].map((c) => c.charCodeAt(0).toString(2)).join(' '));
  const salt = 'saltsalt';
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aes = await crypto.subtle.importKey('raw', await pbkdf2(text('U24wMHBEMGcjTDNfQUVTX1MzY3VyM0szeUAyMDI2JHNleA=='), salt, 100_000, 'SHA-512'), { name: 'AES-CBC' }, false, ['encrypt']);
  const body = `${bytesToBase64(iv)}.${btoa(salt)}.${bytesToBase64(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aes, utf8(l2)))}`;
  const hmacKey = await crypto.subtle.importKey('raw', utf8(text('U24wMHBEMGcjTDRfSE1BQ19GMW40bFc0bGwjMjAyNiFzZXg=')), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return `${bytesToHex(await crypto.subtle.sign('HMAC', hmacKey, utf8(body)))}|${b64(body)}`;
}

test('Tulnex: opens the four-layer payload and reads the stream from whichever shape the back-end used', async () => {
  const routes: Record<string, MockRoute> = {
    'https://api.tulnex.com/onion/movie/27205': { body: { payload: await tulnexSeal({ url: 'https://cdn.example.org/o/master.m3u8', headers: { Referer: 'https://onion.example/' } }) } },
    'https://api.tulnex.com/vidlink/movie/27205': { body: { payload: await tulnexSeal({ data: { stream: { playlist: 'https://cdn.example.org/v/master.m3u8' } } }) } },
    'https://api.tulnex.com/moviebox/movie/27205': { body: { payload: await tulnexSeal({ sources: [{ url: 'https://cdn.example.org/m/480.mp4', quality: '480p' }, { url: 'https://cdn.example.org/m/1080.mp4', quality: '1080p' }] }) } },
    'api.tulnex.com': simulate.notFound(),
  };
  const r = await run('tulnex', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => `${s.type}:${new URL(s.url).pathname}`).sort(), ['hls:/o/master.m3u8', 'hls:/v/master.m3u8', 'mp4:/m/1080.mp4']);
  assert.equal(r.streams.find((s) => s.url.includes('/o/'))!.headers.Referer, 'https://onion.example/');
  assert.deepEqual(await contract(tulnex, MOVIE, routes), []);
});

test('Tulnex: a tampered payload is STRUCTURE_CHANGED; the live state on 2026-11-24 (host gone from DNS) is DNS', async () => {
  const sealed = await tulnexSeal({ url: 'https://cdn.example.org/o/master.m3u8' });
  const tampered = await run('tulnex', MOVIE, { 'https://api.tulnex.com/onion/movie/27205': { body: { payload: `00${sealed.slice(2)}` } }, 'api.tulnex.com': simulate.notFound() });
  assert.equal(tampered.code, 'STRUCTURE_CHANGED');
  const gone = await run('tulnex', MOVIE, { 'api.tulnex.com': simulate.dns() });
  assert.equal(gone.outcome, 'error');
  assert.equal(gone.code, 'DNS');
});

// ---------- Peachify ----------

async function peachSeal(value: unknown) {
  const hex = new TextDecoder().decode(base64ToBytes('YThmMmExYjVlOWM0NzA4MTRmNmIyYzNhNWQ4ZTdmOWMxYTJiM2M0ZDVlM2Y3YThiOGNhZDFlMmQwYTRkNWM1Yg=='));
  const keyBytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(value))));
  const url = (b: Uint8Array) => bytesToBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${url(iv)}.${url(sealed.slice(0, sealed.length - 16))}.${url(sealed.slice(sealed.length - 16))}`;
}

test('Peachify: plain and sealed answers from two hosts, permissive field names', async () => {
  const routes: Record<string, MockRoute> = {
    'https://uwu.eat-peach.sbs/moviebox/movie/27205': { body: { sources: [{ file: 'https://cdn.example.org/mb/1080.mp4', resolution: '1080p', audioLang: 'Hindi', sizeBytes: 2_000_000_000 }], subtitles: [{ file: 'https://cdn.example.org/mb/en.vtt', name: 'English', langCode: 'en' }] } },
    'https://usa.eat-peach.sbs/holly/movie/27205': { body: { isEncrypted: true, data: await peachSeal({ sources: [{ url: 'https://cdn.example.org/h/master.m3u8', type: 'hls', dub: 'Dubbed', headers: { Referer: 'https://holly.example/' } }] }) } },
    'usa.eat-peach.sbs': simulate.notFound(),
    'uwu.eat-peach.sbs': simulate.notFound(),
  };
  const r = await run('peachify', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  const mp4 = r.streams.find((s) => s.type === 'mp4')!;
  assert.equal(mp4.quality, '1080');
  assert.equal(mp4.audio[0].lang, 'hi');
  assert.equal(mp4.size, 2_000_000_000);
  assert.equal(r.streams.find((s) => s.type === 'hls')!.headers.Referer, 'https://holly.example/');
  assert.equal(r.captions[0].lang, 'en');
  assert.deepEqual(await contract(peachify, MOVIE, routes), []);
});

test('Peachify: the live state on 2026-11-24 (both API hosts gone from DNS) is DNS, not "not found"', async () => {
  const r = await run('peachify', MOVIE, { 'usa.eat-peach.sbs': simulate.dns(), 'uwu.eat-peach.sbs': simulate.dns() });
  assert.equal(r.outcome, 'error');
  assert.equal(r.code, 'DNS');
});

// ---------- Popr ----------

test('Popr: offers only streams that open (a playlist with segments, a file that is not a page)', async () => {
  const answer = (url: string, quality: string, extra: object = {}) => ({ body: { success: true, results: [{ streams: [{ url, quality, ...extra }], subtitles: [{ url: 'https://subs.example.org/en.vtt', lang: 'English' }] }] } });
  const routes: Record<string, MockRoute> = {
    'https://popr.ink/api/vidnest?id=27205&type=movie': answer('https://cdn.example.org/ok/index.m3u8', '1080p', { headers: { Referer: 'https://ref.example/' } }),
    'https://popr.ink/api/vidnest?id=27205&type=movie&server=catflix': answer('https://cdn.example.org/empty/index.m3u8', '720p'),
    'https://popr.ink/api/vidnest?id=27205&type=movie&server=hexa': answer('https://cdn.example.org/page.mp4', '720p'),
    'https://popr.ink/api/vidnest?id=27205&type=movie&server=Gama': answer('https://cdn.example.org/film.mp4', 'Hindi'),
    'https://popr.ink/api/vidnest?id=27205&type=movie&server=Sigma': answer('https://cdn.example.org/gone.mp4', '480p'),
    'popr.ink': { body: { success: false, results: [] } },
    'https://cdn.example.org/ok/index.m3u8': { headers: { 'content-type': 'application/vnd.apple.mpegurl' }, body: '#EXTM3U\n#EXTINF:6,\nseg0.ts\n' },
    'https://cdn.example.org/empty/index.m3u8': { body: '#EXTM3U\n#EXT-X-ENDLIST\n' },
    'https://cdn.example.org/page.mp4': simulate.html('<!DOCTYPE html><html><body>File removed</body></html>'),
    'https://cdn.example.org/film.mp4': { headers: { 'content-type': 'video/mp4' }, body: 'xxxx' },
    'https://cdn.example.org/gone.mp4': simulate.notFound(),
  };
  const r = await run('popr', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => `${s.type}:${s.quality}:${s.audio[0].lang}`).sort(), ['hls:1080:en', 'mp4:auto:hi']);
  assert.equal(r.streams.find((s) => s.type === 'hls')!.headers.Referer, 'https://ref.example/');
  assert.equal(r.captions.length, 1);
  // Probes ask for a capped read, never the whole file.
  assert.deepEqual(await contract(popr, MOVIE, routes), []);
});

// ---------- FshareTV ----------

test('FshareTV: film page → watch page → file list, best quality first, relative addresses resolved', async () => {
  const routes: Record<string, MockRoute> = {
    'https://fsharetv.cc/movie/tt1375666': simulate.html('<a class="btn" href="/w/inception-episode-1-tt1375666">Watch</a>'),
    'https://fsharetv.cc/w/inception-episode-1-tt1375666': simulate.html('<script>Movie.setSource("src_77", "x");</script>'),
    'https://fsharetv.cc/api/file/src_77/source*': { body: { status: 'ok', data: { file: { sources: [{ src: '/v/720.mp4', type: 'video/mp4', label: '720p', quality: 720 }, { src: 'https://cdn.example.org/v/1080.mp4', type: 'video/mp4', label: '1080p', quality: 1080 }], backups: [{ src: '/v/720.mp4', type: 'video/mp4', label: '720p', quality: 720 }], alternatives: [[{ src: 'https://cdn.example.org/alt/480.mp4', type: 'video/mp4', label: '480p', quality: 480 }]] } } } },
  };
  const r = await run('fsharetv', MOVIE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual(r.streams.map((s) => `${s.quality}:${s.url}`), ['1080:https://cdn.example.org/v/1080.mp4', '720:https://fsharetv.cc/v/720.mp4', '480:https://cdn.example.org/alt/480.mp4']);
  assert.deepEqual(await contract(fsharetv, MOVIE, routes), []);
  const h = createHarness({ providers: loaded('fsharetv') });
  assert.equal(h.engine.plan({ media: EPISODE }).run.length, 0, 'films only');
});

test('FshareTV: a watch page without a source id is SELECTOR_MISSING; no film page is NOT_FOUND', async () => {
  const changed = await run('fsharetv', MOVIE, { 'https://fsharetv.cc/movie/tt1375666': simulate.html('<a href="/w/x">Watch</a>'), 'https://fsharetv.cc/w/x': simulate.html('<div id="app"></div>') });
  assert.equal(changed.code, 'SELECTOR_MISSING');
  const missing = await run('fsharetv', MOVIE, { 'fsharetv.cc': simulate.notFound() });
  assert.equal(missing.code, 'NOT_FOUND');
});

// ---------- Icefy (rules) ----------

test('Icefy as rules: one call gives the playlist; the browser check seen from a cloud address is CHALLENGE', async () => {
  assert.deepEqual(validateRulePack(icefyRules, icefyManifest), []);
  const routes: Record<string, MockRoute> = { 'https://streams.icefy.top/tv/1396/2/3': { body: { stream: 'https://cdn.example.org/i/master.m3u8' } } };
  const r = await run('icefy', EPISODE, routes);
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams[0].quality, '1080');
  assert.equal(r.streams[0].headers.Referer, 'https://streams.icefy.top');
  const none = await run('icefy', EPISODE, { 'streams.icefy.top': { body: {} } });
  assert.equal(none.code, 'NOT_FOUND');
  const challenged = await run('icefy', EPISODE, { 'streams.icefy.top': simulate.challenge() });
  assert.equal(challenged.code, 'CHALLENGE');
  assert.deepEqual(await contract(loaded('icefy')[0].module, EPISODE, routes), []);
});

// keep the playlist helper referenced for fixtures that grow
void PLAYLIST;
