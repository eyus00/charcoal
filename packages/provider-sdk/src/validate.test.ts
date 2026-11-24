/** Stream validation and the policy's discovery rules, against a mock transport. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRuntime, PolicyGuard, sniffContainer, validateStream, validateStreams } from './index.js';
import { mockTransport, simulate, type MockRoute } from './testing/index.js';

const server = describeRuntime('server');
const home = describeRuntime('server', { egress: 'user' });
const TS = 'G' + '\0'.repeat(187) + 'G' + '\0'.repeat(187);
const MP4 = '\0\0\0\x18ftypisom' + '\0'.repeat(64);
const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Hindi",LANGUAGE="hi",URI="a/hi.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="a"\n1080/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2",AUDIO="a"\n360/index.m3u8\n';
const media = (extra = '') => `#EXTM3U\n#EXT-X-TARGETDURATION:6\n${extra}#EXTINF:6,\nseg0.ts\n#EXTINF:6,\nseg1.ts\n#EXT-X-ENDLIST\n`;

const routes = (over: Record<string, MockRoute> = {}): Record<string, MockRoute> => ({
  'https://cdn.example.org/v/master.m3u8': { body: master },
  'https://cdn.example.org/v/360/index.m3u8': { body: media() },
  'https://cdn.example.org/v/360/seg0.ts': { status: 206, headers: { 'content-type': 'video/mp2t', 'content-range': 'bytes 0-2047/900000' }, body: TS },
  ...over,
});
const hls = { url: 'https://cdn.example.org/v/master.m3u8', type: 'hls' as const, headers: { Referer: 'https://site.example/' } };

test('an HLS stream is verified by its manifest, its cheapest quality and the first bytes of one segment', async () => {
  const t = mockTransport(routes());
  const v = await validateStream(hls, t, { runtime: server });
  assert.equal(v.state, 'verified');
  assert.equal(v.level, 'segment');
  assert.equal(v.by, 'server');
  assert.deepEqual(v.detail, { variants: 2, maxHeight: 1080, codecs: ['avc1.640028', 'mp4a.40.2', 'avc1.4d401e'], audioLanguages: ['hi'], subtitleLanguages: [], live: false, encryption: undefined, container: 'mpegts', contentType: 'video/mp2t' });
  // Three requests, the stream's own headers on each, and the segment asked for with a range and a cap.
  assert.deepEqual(t.calls.map((c) => c.url.pathname), ['/v/master.m3u8', '/v/360/index.m3u8', '/v/360/seg0.ts']);
  assert.ok(t.calls.every((c) => c.headers.Referer === 'https://site.example/'));
  assert.equal(t.calls[2].headers.Range, 'bytes=0-2047');
  const manifestOnly = await validateStream(hls, mockTransport(routes()), { runtime: server, manifestOnly: true });
  assert.equal(manifestOnly.level, 'manifest');
});

test('what a URL returns decides, not that an extraction returned it', async () => {
  const check = async (over: Record<string, MockRoute>, stream = hls) => validateStream(stream, mockTransport(routes(over)), { runtime: server });
  const page = await check({ 'https://cdn.example.org/v/master.m3u8': simulate.html('<!DOCTYPE html><html><body>File removed</body></html>') });
  assert.deepEqual([page.state, page.code, page.level], ['failed', 'INVALID_RESULT', 'none']);
  const gone = await check({ 'https://cdn.example.org/v/master.m3u8': simulate.notFound() });
  assert.deepEqual([gone.state, gone.code], ['failed', 'EXPIRED']);
  const refused = await check({ 'https://cdn.example.org/v/master.m3u8': simulate.forbidden() });
  assert.equal(refused.code, 'ACCESS_DENIED');
  const challenge = await check({ 'https://cdn.example.org/v/master.m3u8': simulate.challenge() });
  assert.equal(challenge.code, 'CHALLENGE');
  const empty = await check({ 'https://cdn.example.org/v/360/index.m3u8': { body: '#EXTM3U\n#EXT-X-ENDLIST\n' } });
  assert.deepEqual([empty.code, empty.level], ['INVALID_RESULT', 'manifest']);
  const decoy = await check({ 'https://cdn.example.org/v/360/seg0.ts': simulate.html('<html><body>Access denied</body></html>') });
  assert.deepEqual([decoy.state, decoy.code, decoy.level], ['failed', 'INVALID_RESULT', 'segment']);
  const dead = await check({ 'https://cdn.example.org/v/360/seg0.ts': simulate.refused() });
  assert.equal(dead.code, 'CONNECT');
  const drm = await check({ 'https://cdn.example.org/v/360/index.m3u8': { body: media('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://k",KEYFORMAT="com.apple.streamingkeydelivery"\n') } });
  assert.deepEqual([drm.state, drm.code], ['failed', 'UNSUPPORTED_FORMAT']);
  // AES-128 is ordinary HLS encryption, not DRM: the segment cannot be sniffed, but it answers.
  const aes = await check({ 'https://cdn.example.org/v/360/index.m3u8': { body: media('#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n') }, 'https://cdn.example.org/v/360/seg0.ts': { body: '\x9a\x11\x03random' } });
  assert.deepEqual([aes.state, aes.detail?.container, aes.detail?.encryption], ['verified', 'encrypted', 'AES-128']);
});

test('files, DASH, frames, expired and address-bound links', async () => {
  const t = mockTransport({
    'https://cdn.example.org/f/film.mp4': { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-2047/1500000000' }, body: MP4 },
    'https://cdn.example.org/f/removed.mp4': simulate.html('<html><body>404</body></html>'),
    'https://cdn.example.org/d/manifest.mpd': { body: '<?xml version="1.0"?><MPD type="static" mediaPresentationDuration="PT1H"><Period><AdaptationSet mimeType="video/mp4"><Representation id="v1" codecs="avc1.640028" width="1920" height="1080" bandwidth="5000000"/></AdaptationSet><AdaptationSet mimeType="audio/mp4" lang="en"><Representation id="a1" codecs="mp4a.40.2" bandwidth="128000"/></AdaptationSet></Period></MPD>' },
    'https://cdn.example.org/d/drm.mpd': { body: '<MPD type="static"><Period><AdaptationSet mimeType="video/mp4"><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/><Representation id="v1" height="1080"/></AdaptationSet></Period></MPD>' },
  });
  const file = await validateStream({ url: 'https://cdn.example.org/f/film.mp4', type: 'mp4' }, t, { runtime: server });
  assert.deepEqual([file.state, file.level, file.detail?.container, file.detail?.size], ['verified', 'header', 'mp4', 1_500_000_000]);
  assert.equal((await validateStream({ url: 'https://cdn.example.org/f/removed.mp4', type: 'mp4' }, t, { runtime: server })).code, 'INVALID_RESULT');
  const dash = await validateStream({ url: 'https://cdn.example.org/d/manifest.mpd', type: 'dash' }, t, { runtime: server });
  assert.deepEqual([dash.state, dash.level, dash.detail?.maxHeight, dash.detail?.audioLanguages], ['verified', 'manifest', 1080, ['en']]);
  assert.equal((await validateStream({ url: 'https://cdn.example.org/d/drm.mpd', type: 'dash' }, t, { runtime: server })).code, 'UNSUPPORTED_FORMAT');

  const before = t.calls.length;
  assert.equal((await validateStream({ url: 'https://player.example/embed/1', type: 'frame' }, t, { runtime: server })).state, 'unchecked');
  assert.equal((await validateStream({ ...hls, expiresAt: 1000 }, t, { runtime: server, now: () => 2000 })).code, 'EXPIRED');
  // A link bound to the address that found it says nothing when tried from a server…
  assert.equal((await validateStream({ ...hls, ipBound: true }, t, { runtime: server })).state, 'unchecked');
  assert.equal(t.calls.length, before, 'none of those made a request');
  // …and is tried where the viewer's own connection is used.
  assert.equal((await validateStream({ ...hls, ipBound: true }, mockTransport(routes()), { runtime: home })).state, 'verified');
});

test('a stream address is untrusted: private and internal addresses are never tried', async () => {
  const t = mockTransport({ 'cdn.example.org': { url: 'http://169.254.169.254/latest/meta-data/', body: '#EXTM3U\n' } });
  for (const url of ['http://127.0.0.1:8080/x.m3u8', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/x.m3u8', 'file:///etc/passwd', 'http://10.1.2.3/v.m3u8']) {
    const v = await validateStream({ url, type: 'hls' }, t, { runtime: server });
    assert.deepEqual([v.state, v.code], ['failed', 'POLICY'], url);
  }
  assert.equal(t.calls.length, 0);
  // A public address that redirects to a private one is refused as well.
  assert.equal((await validateStream({ url: 'https://cdn.example.org/redirect.m3u8', type: 'hls' }, t, { runtime: server })).code, 'POLICY');
  // An inline playlist needs no request for its manifest.
  const inline = await validateStream({ url: `data:application/vnd.apple.mpegurl;base64,${btoa(media().replace('seg0.ts', 'https://cdn.example.org/v/360/seg0.ts'))}`, type: 'hls' }, mockTransport(routes()), { runtime: server });
  assert.deepEqual([inline.state, inline.level], ['verified', 'segment']);
});

test('several streams are tried with bounded concurrency, in order', async () => {
  let running = 0;
  let peak = 0;
  const slow: MockRoute = async () => {
    peak = Math.max(peak, ++running);
    await new Promise((r) => setTimeout(r, 15));
    running--;
    return { status: 206, headers: { 'content-type': 'video/mp4' }, body: MP4 };
  };
  const t = mockTransport({ 'cdn.example.org': slow, 'bad.example.org': simulate.dns() });
  const streams = [...Array.from({ length: 6 }, (_, i) => ({ url: `https://cdn.example.org/${i}.mp4`, type: 'mp4' as const })), { url: 'https://bad.example.org/x.mp4', type: 'mp4' as const }];
  const out = await validateStreams(streams, t, { runtime: server, concurrency: 2 });
  assert.deepEqual(out.map((v) => v.state), ['verified', 'verified', 'verified', 'verified', 'verified', 'verified', 'failed']);
  assert.equal(out[6].code, 'DNS');
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
});

test('container sniffing recognises media and disguised segments, not text', () => {
  assert.equal(sniffContainer(TS), 'mpegts');
  assert.equal(sniffContainer(MP4), 'mp4');
  assert.equal(sniffContainer('\x1a\x45\xdf\xa3rest'), 'matroska');
  assert.equal(sniffContainer('\x89PNG\r\n\x1a\n' + TS), 'disguised');
  assert.equal(sniffContainer('ID3\x04'), 'id3');
  assert.equal(sniffContainer('<html>'), undefined);
  assert.equal(sniffContainer(''), undefined);
});

test('policy discovery: scheme-less addresses, a few hops and no further, and addresses a provider decoded', async () => {
  const policy = { allow: ['site.example'], followDiscovered: true, maxRequests: 40, maxBodyChars: 1e6 };
  const g = new PolicyGuard(policy);
  // An embed page writes its frame without a scheme.
  g.noteResponse('site.example', '<iframe src="//embed.one.example/e/1"></iframe> <script>x = "https:\\/\\/api.one.example\\/v"</script>');
  await g.check('https://embed.one.example/e/1');
  await g.check('https://api.one.example/v');
  // The embed names a player, the player names a CDN: three hops from the provider's own site.
  g.noteResponse('embed.one.example', '<script src="https://player.two.example/p.js"></script>');
  await g.check('https://player.two.example/p.js');
  g.noteResponse('player.two.example', 'file: "https://cdn.three.example/master.m3u8"');
  await g.check('https://cdn.three.example/master.m3u8');
  // A fourth hop is not followed.
  g.noteResponse('cdn.three.example', 'https://far.four.example/x');
  await assert.rejects(g.check('https://far.four.example/x'), /allow-list/);
  // Only GET on anything discovered; never a private address, however it was named.
  await assert.rejects(g.check('https://embed.one.example/e/1', 'POST'), /Only GET/);
  g.noteResponse('site.example', '<img src="//127.0.0.1/x"> http://10.0.0.8/admin //localhost/y');
  await assert.rejects(g.check('http://10.0.0.8/admin'), /Private|allow-list/);
  // A host nobody the provider trusts has named stays closed.
  g.noteResponse('unknown.example', 'https://sneaky.example/');
  await assert.rejects(g.check('https://sneaky.example/'), /allow-list/);

  // An encrypted answer names a host the policy could not see: the provider says so.
  const sealed = new PolicyGuard(policy);
  await assert.rejects(sealed.check('https://cdn.sealed.example/master.m3u8'), /allow-list/);
  sealed.noteDecoded('{"stream":{"hls_streaming":"https:\\/\\/cdn.sealed.example\\/master.m3u8"}}');
  await sealed.check('https://cdn.sealed.example/master.m3u8');
  // …which does nothing for a provider that did not ask to follow discovered hosts.
  const strict = new PolicyGuard({ ...policy, followDiscovered: false });
  strict.noteDecoded('https://cdn.sealed.example/master.m3u8');
  await assert.rejects(strict.check('https://cdn.sealed.example/master.m3u8'), /allow-list/);
});
