/**
 * The benchmark's own arithmetic, on synthetic providers over a mock network. A run like this is
 * labelled "fixtures" in every report it produces: it checks the counting, not availability.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineProvider, getJson, NotFoundError, type LoadedProvider } from '@charcoal/provider-sdk';
import { mockTransport, simulate, type MockRoute } from '@charcoal/provider-sdk/testing';
import { engineTarget, renderComparison, renderReport, runBenchmark, TITLES, type BenchTitle, type PlaybackChecker } from './index.js';

const provider = (id: string): LoadedProvider => ({
  stage: 'stable',
  module: defineProvider({
    manifest: { id, name: id, version: '1.0.0', kinds: ['movie', 'tv'], lookup: ['tmdb'], runtimes: ['server'], domainRoles: [], extraHosts: [`${id}.example.com`], followDiscovered: true, output: { types: ['hls', 'mp4'] } },
    async getSources(media, ctx) {
      const d = await getJson<{ urls?: string[] }>(ctx.fetch, `https://${id}.example.com/api/${media.ids.tmdb}`, { signal: ctx.signal }, id);
      if (!d.urls?.length) throw new NotFoundError();
      return { streams: d.urls.map((url) => ({ url, type: url.endsWith('.mp4') ? ('mp4' as const) : ('hls' as const) })) };
    },
  }),
});

const PLAYLIST = '#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n';
const routes: Record<string, MockRoute> = {
  // Two providers find the same file for Inception; one of them also finds a link that is dead.
  'https://alpha.example.com/api/27205': { body: { urls: ['https://cdn.example.org/inception/master.m3u8', 'https://cdn.example.org/dead/master.m3u8'] } },
  'https://beta.example.com/api/27205': { body: { urls: ['https://cdn.example.org/inception/master.m3u8'] } },
  'https://alpha.example.com/api/1396': { body: { urls: ['https://cdn.example.org/bb/s01e01.mp4'] } },
  'https://beta.example.com/api/1396': { body: {} },
  'gamma.example.com': simulate.challenge(),
  'https://cdn.example.org/inception/master.m3u8': { body: PLAYLIST },
  'https://cdn.example.org/inception/seg0.ts': { body: 'G' + '\0'.repeat(187) + 'G' },
  'https://cdn.example.org/dead/master.m3u8': simulate.notFound(),
  'https://cdn.example.org/bb/s01e01.mp4': { status: 206, headers: { 'content-type': 'video/mp4' }, body: '\0\0\0\x18ftypisom' },
  // A stream in a codec the test browser lacks: verified, but not something this browser can be asked to start.
  'https://alpha.example.com/api/496243': { body: { urls: ['https://cdn.example.org/parasite/master.m3u8'] } },
  'https://cdn.example.org/parasite/master.m3u8': { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,CODECS="hvc1.1.6.L120.90,mp4a.40.2"\nv/index.m3u8\n' },
  'https://cdn.example.org/parasite/v/index.m3u8': { body: PLAYLIST },
  'https://cdn.example.org/parasite/v/seg0.ts': { body: 'G' + '\0'.repeat(187) + 'G' },
  'alpha.example.com': simulate.notFound(),
  'beta.example.com': simulate.notFound(),
};
const titles: BenchTitle[] = TITLES.filter((t) => ['inception', 'breaking-bad', 'parasite'].includes(t.key));

test('discovered, unique, verified and started are counted apart, per title, provider and category', async () => {
  const transport = mockTransport(routes);
  const target = engineTarget({ providers: [provider('alpha'), provider('beta'), provider('gamma')], transport, label: 'synthetic providers' });
  // A stand-in player: files start, playlists do not.
  const playback: PlaybackChecker = { videoCodecs: ['avc', 'vp9'], check: async (s) => (s.type === 'mp4' ? { started: true, ms: 40, width: 1280, height: 720 } : { started: false, ms: 900, error: 'no picture' }), close: async () => undefined };
  const report = await runBenchmark(target, { label: 'fixture-run', mode: 'fixtures', titles, transport, playback, playbackPerTitle: 2 });

  const by = Object.fromEntries(report.titles.map((t) => [t.key, t]));
  // Inception: three streams came back, two are the same file, one of the two unique ones is dead.
  assert.deepEqual([by.inception.discovered, by.inception.unique, by.inception.verified, by.inception.playbackTried, by.inception.started], [3, 2, 1, 1, 0]);
  assert.deepEqual([by.inception.providersQueried, by.inception.providersResponding, by.inception.providersWithResults], [3, 2, 2]);
  assert.deepEqual(by.inception.failures, { CHALLENGE: 1 });
  assert.deepEqual(by.inception.streams.find((s) => s.verification.state === 'verified')?.alsoFrom, ['beta']);
  assert.deepEqual([by['breaking-bad'].unique, by['breaking-bad'].verified, by['breaking-bad'].started], [1, 1, 1]);
  assert.equal(by['breaking-bad'].streams[0].verification.level, 'playback');
  // Parasite: one verified stream, all HEVC. It is set aside, not counted as a playback failure.
  assert.deepEqual([by.parasite.unique, by.parasite.verified, by.parasite.playbackTried, by.parasite.undecodable, by.parasite.started], [1, 1, 0, 1, 0]);
  assert.equal(by.parasite.streams[0].playback?.undecodable, 'hevc');
  assert.ok(by.inception.firstVerifiedMs !== undefined);

  const s = report.summary;
  assert.deepEqual([s.titles, s.discovered, s.unique, s.verified, s.started, s.playbackTried, s.undecodable, s.titlesWithVerified, s.titlesWithPlayback], [3, 5, 4, 3, 1, 2, 1, 3, 1]);
  assert.deepEqual([s.providersRegistered, s.providersEverReturning, s.providersNeverResponding], [3, 2, 1]);
  assert.deepEqual(s.failures, { CHALLENGE: 3 });
  assert.deepEqual(s.byProvider.gamma.codes, { CHALLENGE: 3 });
  assert.deepEqual([s.byProvider.alpha.streams, s.byProvider.alpha.verified, s.byProvider.beta.verified], [4, 3, 0], 'a shared file is credited to the provider that delivered it first');
  assert.deepEqual(s.byCategory['western-movie'], { titles: 1, withVerified: 1, withPlayback: 0, unique: 2, verified: 1, started: 0 });

  // A report never contains a stream address, and says plainly that this was not a live run.
  const json = JSON.stringify(report);
  assert.ok(!json.includes('cdn.example.org/inception'), 'no stream URLs in the report');
  const md = renderReport(report);
  assert.match(md, /\*\*FIXTURES\*\* \(canned responses: this says nothing about real availability\)/);
  assert.match(md, /`CHALLENGE` \| 3 \|/);
  assert.match(md, /Unique streams verified \(manifest and first media bytes\) \| 3 \|/);
  assert.match(md, /Verified streams the test browser cannot decode \(not tried\) \| 1 \|/);

  // Side by side with a "live" run, the comparison warns that the two are not comparable.
  const cmp = renderComparison({ ...report, mode: 'live', label: 'live-run' }, report);
  assert.match(cmp, /different kinds \(live and fixtures\)/);
  assert.match(cmp, /\| inception \| 2 → 1 → 0 \| 2 → 1 → 0 \|/);
});
