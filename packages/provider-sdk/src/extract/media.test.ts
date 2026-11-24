import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectExpiry, detectQuality, findIframes, findMediaUrls, findVideoElements, parseDash, parseHls, resolveUrl, sniffStreamType } from './media.js';

test('resolveUrl: absolute, relative, protocol-relative, and never throws', () => {
  assert.equal(resolveUrl('https://a.example.com/x.m3u8'), 'https://a.example.com/x.m3u8');
  assert.equal(resolveUrl('seg/1.ts', 'https://a.example.com/v/master.m3u8'), 'https://a.example.com/v/seg/1.ts');
  assert.equal(resolveUrl('/abs/1.ts', 'https://a.example.com/v/master.m3u8'), 'https://a.example.com/abs/1.ts');
  assert.equal(resolveUrl('//cdn.example.net/a.mp4', 'https://a.example.com/'), 'https://cdn.example.net/a.mp4');
  assert.equal(resolveUrl('relative/only.mp4'), undefined);
  assert.equal(resolveUrl('', 'https://a.example.com/'), undefined);
});

test('sniffStreamType: by path, then content type, then the start of the body', () => {
  assert.equal(sniffStreamType('https://x.example/a/master.m3u8?token=1'), 'hls');
  assert.equal(sniffStreamType('https://x.example/a/manifest.mpd#t=3'), 'dash');
  assert.equal(sniffStreamType('https://x.example/a/film.MP4'), 'mp4');
  assert.equal(sniffStreamType('https://x.example/a/film.m4v'), 'mp4');
  assert.equal(sniffStreamType('https://x.example/a/film.mkv'), 'mkv');
  assert.equal(sniffStreamType('https://x.example/a/clip.webm'), 'webm');
  assert.equal(sniffStreamType('https://x.example/stream/123', 'application/vnd.apple.mpegurl; charset=utf-8'), 'hls');
  assert.equal(sniffStreamType('https://x.example/stream/123', 'application/x-mpegURL'), 'hls');
  assert.equal(sniffStreamType('https://x.example/stream/123', 'application/dash+xml'), 'dash');
  assert.equal(sniffStreamType('https://x.example/stream/123', 'video/mp4'), 'mp4');
  assert.equal(sniffStreamType('https://x.example/stream/123', 'video/x-matroska'), 'mkv');
  assert.equal(sniffStreamType('https://x.example/stream/123', 'text/plain', '#EXTM3U\n#EXT-X-VERSION:3'), 'hls');
  assert.equal(sniffStreamType('https://x.example/stream/123', undefined, '<?xml version="1.0"?>\n<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">'), 'dash');
  assert.equal(sniffStreamType('https://x.example/page.html', 'text/html', '<!doctype html>'), undefined);
  assert.equal(sniffStreamType('https://x.example/stream/123'), undefined);
});

test('findMediaUrls: plain, JSON-escaped and HTML-escaped URLs, in order, without duplicates', () => {
  const text = `
    <script>var a = "https:\\/\\/cdn.example.net\\/v\\/1080\\/index.m3u8?t=1&amp;e=2";</script>
    <a href="https://files.example.org/Movie.2020.720p.mp4">get</a>
    {"dash":"https://cdn.example.net/v/manifest.mpd","again":"https://files.example.org/Movie.2020.720p.mp4"}
    <img src="https://img.example.com/poster.jpg"> https://x.example/readme.txt
    'https://cdn.example.net/big.mkv' and https://cdn.example.net/clip.webm.
  `;
  assert.deepEqual(findMediaUrls(text), [
    { url: 'https://cdn.example.net/v/1080/index.m3u8?t=1&e=2', type: 'hls' },
    { url: 'https://files.example.org/Movie.2020.720p.mp4', type: 'mp4' },
    { url: 'https://cdn.example.net/v/manifest.mpd', type: 'dash' },
    { url: 'https://cdn.example.net/big.mkv', type: 'mkv' },
    { url: 'https://cdn.example.net/clip.webm', type: 'webm' },
  ]);
  assert.deepEqual(findMediaUrls('nothing here, not even ftp://x.example/a.mp4'), []);
});

test('findIframes and findVideoElements: sources resolved against the page, junk skipped', () => {
  const html = `
    <iframe src="/embed/123" allowfullscreen></iframe>
    <iframe data-src="//player.example.net/e/abc" width="100%"></iframe>
    <iframe src="about:blank"></iframe><iframe src="javascript:void(0)"></iframe>
    <embed src="https://other.example.org/player.swf">
    <iframe src="/embed/123"></iframe>
    <video src="/media/direct.mp4" poster="p.jpg">
      <source src="hls/master.m3u8" type="application/x-mpegURL" label="Auto">
      <source src="https://cdn.example.net/720.mp4" type="video/mp4" label="720p">
      <track kind="subtitles" src="/subs/en.vtt" srclang="en" label="English">
      <track kind="captions" src="/subs/es.vtt" srclang="es">
    </video>`;
  const frames = findIframes(html, 'https://site.example.com/watch/1');
  assert.deepEqual(frames.map((f) => f.url), ['https://site.example.com/embed/123', 'https://player.example.net/e/abc', 'https://other.example.org/player.swf']);
  assert.equal(frames[1].attrs.width, '100%');

  const v = findVideoElements(html, 'https://site.example.com/watch/1');
  assert.deepEqual(v.sources.map((s) => [s.url, s.type, s.label]), [
    ['https://site.example.com/media/direct.mp4', 'mp4', undefined],
    ['https://site.example.com/watch/hls/master.m3u8', 'hls', 'Auto'],
    ['https://cdn.example.net/720.mp4', 'mp4', '720p'],
  ]);
  assert.deepEqual(v.tracks, [
    { url: 'https://site.example.com/subs/en.vtt', kind: 'subtitles', lang: 'en', label: 'English' },
    { url: 'https://site.example.com/subs/es.vtt', kind: 'captions', lang: 'es' },
  ]);
});

const MASTER = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Hindi, 5.1",LANGUAGE="hi",DEFAULT=NO,URI="audio/hi/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5200000,AVERAGE-BANDWIDTH=4800000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",FRAME-RATE=23.976,AUDIO="aud"
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="aud"
https://cdn2.example.net/alt/720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360
360/index.m3u8
`;

test('parseHls: a master playlist with variants, quoted codecs containing commas, and audio renditions', () => {
  const p = parseHls(MASTER, 'https://cdn.example.net/v/abc/master.m3u8?token=1');
  assert.equal(p.kind, 'master');
  assert.equal(p.maxHeight, 1080);
  assert.deepEqual(p.variants.map((v) => [v.url, v.height, v.bandwidth, v.codecs, v.audioGroup]), [
    ['https://cdn.example.net/v/abc/1080/index.m3u8', 1080, 5_200_000, 'avc1.640028,mp4a.40.2', 'aud'],
    ['https://cdn2.example.net/alt/720/index.m3u8', 720, 2_800_000, 'avc1.64001f,mp4a.40.2', 'aud'],
    ['https://cdn.example.net/v/abc/360/index.m3u8', 360, 900_000, undefined, undefined],
  ]);
  assert.equal(p.variants[0].width, 1920);
  assert.ok(Math.abs((p.variants[0].frameRate ?? 0) - 23.976) < 0.001);
  assert.deepEqual(p.renditions.map((r) => [r.type, r.groupId, r.name, r.language, r.isDefault, r.url]), [
    ['AUDIO', 'aud', 'English', 'en', true, 'https://cdn.example.net/v/abc/audio/en/index.m3u8'],
    ['AUDIO', 'aud', 'Hindi, 5.1', 'hi', false, 'https://cdn.example.net/v/abc/audio/hi/index.m3u8'],
    ['SUBTITLES', 'subs', 'English', 'en', false, 'https://cdn.example.net/v/abc/subs/en.m3u8'],
  ]);
});

test('parseHls: media playlists tell VOD from live, count segments, and report encryption', () => {
  const vod = parseHls('﻿#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg0.ts\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:3.5,\nseg2.ts\n#EXT-X-ENDLIST\n', 'https://cdn.example.net/v/720/index.m3u8');
  assert.deepEqual([vod.kind, vod.segments, vod.live, vod.targetDuration, vod.totalDuration, vod.firstSegment, vod.encryption], ['media', 3, false, 6, 15.5, 'https://cdn.example.net/v/720/seg0.ts', undefined]);

  const live = parseHls('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:9120\n#EXT-X-PROGRAM-DATE-TIME:2026-11-24T18:00:00Z\n#EXTINF:4,\nl/9120.ts\n#EXTINF:4,\nl/9121.ts\n', 'https://live.example.net/ch1/index.m3u8');
  assert.deepEqual([live.kind, live.live, live.segments], ['media', true, 2]);

  const enc = parseHls('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.net/k?id=1,2",IV=0x1234\n#EXTINF:6,\ns.ts\n#EXT-X-ENDLIST\n', 'https://cdn.example.net/x.m3u8');
  assert.equal(enc.encryption, 'AES-128');
  const clear = parseHls('#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:6,\ns.ts\n#EXT-X-ENDLIST\n', 'https://cdn.example.net/x.m3u8');
  assert.equal(clear.encryption, undefined);

  assert.throws(() => parseHls('<html><body>Access denied</body></html>', 'https://cdn.example.net/x.m3u8'), /Not an HLS playlist/);
  assert.throws(() => parseHls('', 'https://cdn.example.net/x.m3u8'), /Not an HLS playlist/);
});

test('parseDash: representations inherit from their adaptation set; duration, type and protection are read', () => {
  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT1H2M3.5S">
  <Period>
    <AdaptationSet mimeType="video/mp4" contentType="video" codecs="avc1.640028">
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"/>
      <Representation id="v1" width="1920" height="1080" bandwidth="5000000"/>
      <Representation id="v2" width="1280" height="720" bandwidth="2500000" codecs="avc1.64001f"/>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="en">
      <Representation id="a1" codecs="mp4a.40.2" bandwidth="128000"/>
    </AdaptationSet>
  </Period>
</MPD>`;
  const d = parseDash(mpd);
  assert.deepEqual([d.type, d.durationSeconds, d.protected, d.maxHeight], ['static', 3723.5, true, 1080]);
  assert.deepEqual(d.representations.map((r) => [r.id, r.mimeType, r.codecs, r.height, r.bandwidth, r.lang]), [
    ['v1', 'video/mp4', 'avc1.640028', 1080, 5_000_000, undefined],
    ['v2', 'video/mp4', 'avc1.64001f', 720, 2_500_000, undefined],
    ['a1', 'audio/mp4', 'mp4a.40.2', undefined, 128_000, 'en'],
  ]);
  const live = parseDash('<MPD type="dynamic"><Period><AdaptationSet><Representation id="x" height="480"/></AdaptationSet></Period></MPD>');
  assert.deepEqual([live.type, live.protected, live.durationSeconds], ['dynamic', false, undefined]);
  assert.throws(() => parseDash('<html></html>'), /Not a DASH manifest/);
});

test('detectQuality: resolutions from labels, file names and URLs, without mistaking years or codecs', () => {
  const cases: [string, string | undefined][] = [
    ['1080p', '1080'],
    ['Movie.2019.2160p.UHD.BluRay.x265', '2160'],
    ['4K HDR', '2160'],
    ['1920x1080', '1080'],
    ['FHD', '1080'],
    ['Show.S01E02.720p.WEB-DL.x264', '720'],
    ['HD', '720'],
    ['SD', '480'],
    ['1440p60', '1440'],
    ['https://cdn.example.net/v/abc/480/index.m3u8', '480'],
    ['360p', '360'],
    ['Blade.Runner.2049.x264.AAC', undefined],
    ['Movie.2019.h264', undefined],
    ['1917.x265', undefined],
    ['', undefined],
  ];
  for (const [input, want] of cases) assert.equal(detectQuality(input), want, input);
});

test('detectExpiry: common expiry parameters, in seconds or milliseconds, only when plausible', () => {
  const now = 1_800_000_000_000;
  const sec = now / 1000;
  assert.equal(detectExpiry(`https://x.example/a.m3u8?token=abc&expires=${sec + 3600}`, now), now + 3_600_000);
  assert.equal(detectExpiry(`https://x.example/a.m3u8?exp=${now + 60_000}`, now), now + 60_000);
  assert.equal(detectExpiry(`https://x.example/a.m3u8?e=${sec + 120}`, now), now + 120_000);
  assert.equal(detectExpiry(`https://x.example/a.m3u8?validto=${sec + 5}`, now), now + 5000);
  // Just expired is still reported (so it can be rejected); long past or far future is not an expiry.
  assert.equal(detectExpiry(`https://x.example/a.m3u8?expires=${sec - 60}`, now), now - 60_000);
  assert.equal(detectExpiry(`https://x.example/a.m3u8?expires=${sec - 86_400}`, now), undefined);
  assert.equal(detectExpiry(`https://x.example/a.m3u8?expires=${sec + 90 * 86_400}`, now), undefined);
  assert.equal(detectExpiry('https://x.example/a.m3u8?e=5&page=2', now), undefined);
  assert.equal(detectExpiry('https://x.example/a.m3u8', now), undefined);
  assert.equal(detectExpiry('not a url', now), undefined);
  // S3-style: start date plus lifetime.
  assert.equal(detectExpiry('https://bucket.example.com/a.mp4?X-Amz-Date=20270115T080000Z&X-Amz-Expires=900', Date.UTC(2027, 0, 15, 8, 0, 0)), Date.UTC(2027, 0, 15, 8, 15, 0));
});
