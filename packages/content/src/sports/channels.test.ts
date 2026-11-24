import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IPTV_BLOCKLIST, IPTV_CHANNELS, IPTV_STREAMS } from '../fixtures/iptv-org.js';
import { mockFetcher } from '../testing.js';
import { buildChannelCatalog, loadChannelCatalog } from './channels.js';
import { channelToMedia } from './model.js';

const catalog = buildChannelCatalog(IPTV_CHANNELS, IPTV_STREAMS, IPTV_BLOCKLIST);
const ids = (channels: { id: string }[]) => channels.map((channel) => channel.id);

test('lists sports channels that have a usable stream', () => {
  assert.deepEqual(ids(catalog.channels), [
    'ACCDigitalNetwork.us',
    'AntenaPlayEvents.ro',
    'CRTVSportsandEntertainment.cm',
    'DDSports.in',
    'FBTV.tr',
    'TraceSportStars.fr',
  ]);
  assert.deepEqual(catalog.channels.find((channel) => channel.id === 'DDSports.in'), {
    id: 'DDSports.in',
    name: 'DD Sports',
    country: 'IN',
    categories: ['sports'],
    network: 'Doordarshan',
    website: 'http://doordarshan.gov.in/ddsports',
  });
  // null network / website are left out rather than copied.
  assert.deepEqual(catalog.channels.find((channel) => channel.id === 'AntenaPlayEvents.ro'), {
    id: 'AntenaPlayEvents.ro',
    name: 'AntenaPlay Events',
    country: 'RO',
    categories: ['sports'],
  });
});

test('excludes blocklisted channels even when a stream for them exists', () => {
  assert.ok(IPTV_CHANNELS.some((row) => row.id === 'AstroArena.my'), 'the channel is in channels.json');
  assert.ok(IPTV_STREAMS.some((row) => row.channel === 'AstroArena.my'), 'and has a stream row');
  assert.ok(!ids(catalog.channels).includes('AstroArena.my'));
  assert.deepEqual(catalog.streamsFor('AstroArena.my'), []);

  // Without the blocklist it would be listed: the exclusion is the blocklist's doing.
  const unblocked = buildChannelCatalog(IPTV_CHANNELS, IPTV_STREAMS, []);
  assert.ok(ids(unblocked.channels).includes('AstroArena.my'));
});

test('excludes closed channels, adult channels, other categories and channels without streams', () => {
  const listed = ids(catalog.channels);
  assert.ok(!listed.includes('Pac12Insider.us'), 'closed in 2024, still has a stream row');
  assert.deepEqual(catalog.streamsFor('Pac12Insider.us'), []);
  assert.ok(!listed.includes('France24.fr'), 'news, not sports');
  assert.ok(!listed.includes('RaiSport.it'), 'no stream rows');
  assert.ok(!listed.includes('TVPSport.pl'), 'its only stream is rtsp://');

  const adult = buildChannelCatalog(
    [{ id: 'Late.xx', name: 'Late', categories: ['sports'], is_nsfw: true, closed: null }],
    [{ channel: 'Late.xx', url: 'https://example.invalid/late.m3u8' }],
    [],
  );
  assert.deepEqual(adult.channels, []);
});

test('flags plain-http streams and puts cleaner streams first', () => {
  assert.deepEqual(catalog.streamsFor('FBTV.tr'), [
    { channelId: 'FBTV.tr', url: 'http://1hskrdto.rocketcdn.com/fenerbahcetv.smil/playlist.m3u8', quality: '720p', headers: {}, hazards: ['http'] },
  ]);

  // Trace Sport Stars: streams.json lists the http + geo-blocked stream first; the https one sorts ahead of it.
  const trace = catalog.streamsFor('TraceSportStars.fr');
  assert.deepEqual(trace.map((stream) => stream.hazards), [['needs-headers'], ['http', 'geo-blocked']]);
  assert.ok(trace[1]?.url.startsWith('http://tracesportstars-samsunges.amagi.tv/'));
});

test('maps user_agent and referrer to request headers', () => {
  const [trace] = catalog.streamsFor('TraceSportStars.fr');
  assert.deepEqual(trace, {
    channelId: 'TraceSportStars.fr',
    url: 'https://channels.trace.plus/Traceprod/TRACE_SPORT_STARS_hd/index.m3u8',
    quality: '1080p',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
      Referer: 'https://trace.plus',
    },
    hazards: ['needs-headers'],
  });

  const [crtv] = catalog.streamsFor('CRTVSportsandEntertainment.cm');
  assert.deepEqual(crtv?.headers, { Referer: 'https://crtv.cm/live/crtv-sport' });
  assert.deepEqual(crtv?.hazards, ['needs-headers']);

  // DD Sports: two plain streams (1080p before 720p), then the one that needs a User-Agent.
  const dd = catalog.streamsFor('DDSports.in');
  assert.deepEqual(dd.map((stream) => [stream.quality, Object.keys(stream.headers), stream.hazards]), [
    ['1080p', [], []],
    ['720p', [], []],
    ['1080p', ['User-Agent'], ['needs-headers']],
  ]);
});

test('flags geo-blocked and not-24/7 streams from their labels', () => {
  const acc = catalog.streamsFor('ACCDigitalNetwork.us');
  assert.deepEqual(acc.map((stream) => stream.hazards), [[], ['geo-blocked']]);
  assert.equal(acc[0]?.url, 'https://d53csymoczzde.cloudfront.net/ACC_Digital_Network.m3u8');

  const antena = catalog.streamsFor('AntenaPlayEvents.ro');
  assert.deepEqual(antena.map((stream) => stream.hazards), [['not-24-7'], ['not-24-7']]);
  assert.deepEqual(antena.map((stream) => stream.quality), ['576p', '576p']);
});

test('reads labels, headers and odd rows defensively', () => {
  const built = buildChannelCatalog(
    [
      { id: 'One.xx', name: 'One', country: 'XX', categories: ['sports'], is_nsfw: false, closed: null },
      { id: 'One.xx', name: 'Duplicate', categories: ['sports'] },
      { id: 'Two.xx', name: 'Two', categories: ['sports'] },
      null,
      'row',
      { id: 'NoName.xx' },
    ],
    [
      { channel: 'Two.xx', url: 'https://example.invalid/two.m3u8' },
      { channel: 'One.xx', url: 'http://example.invalid/a.m3u8', quality: null, labels: ['GEO-BLOCKED', 'Not 24/7'], user_agent: 'VLC/3.0.18', referrer: 'https://example.invalid/' },
      { channel: 'One.xx', url: 'https://example.invalid/b.m3u8', label: 'Geo-blocked', http_referrer: 'https://example.invalid/player' },
      { channel: 'One.xx', url: 'https://example.invalid/b.m3u8', quality: '720p' },
      { channel: 'One.xx', url: 'rtmp://example.invalid/live' },
      { channel: 'One.xx', url: '' },
      { channel: 'One.xx' },
      { channel: null, url: 'https://example.invalid/orphan.m3u8' },
      { channel: 'Unknown.xx', url: 'https://example.invalid/unknown.m3u8' },
      null,
    ],
    // Rows that name no channel are ignored; a bare id blocks like a { channel } row does.
    [null, { reason: 'dmca' }, 'Two.xx'],
  );
  assert.deepEqual(built.channels, [{ id: 'One.xx', name: 'One', country: 'XX', categories: ['sports'] }]);
  assert.deepEqual(built.streamsFor('Two.xx'), []);
  assert.deepEqual(built.streamsFor('One.xx'), [
    { channelId: 'One.xx', url: 'https://example.invalid/b.m3u8', headers: { Referer: 'https://example.invalid/player' }, hazards: ['geo-blocked', 'needs-headers'] },
    {
      channelId: 'One.xx',
      url: 'http://example.invalid/a.m3u8',
      headers: { 'User-Agent': 'VLC/3.0.18', Referer: 'https://example.invalid/' },
      hazards: ['http', 'geo-blocked', 'not-24-7', 'needs-headers'],
    },
  ]);
  assert.deepEqual(built.streamsFor('Unknown.xx'), []);
  assert.deepEqual(built.streamsFor('constructor'), []);
});

test('httpsOnly drops plain-http streams, and channels left with none', () => {
  const secure = buildChannelCatalog(IPTV_CHANNELS, IPTV_STREAMS, IPTV_BLOCKLIST, { httpsOnly: true });
  assert.ok(!ids(secure.channels).includes('FBTV.tr'), 'its only stream is http');
  assert.deepEqual(secure.streamsFor('FBTV.tr'), []);
  assert.deepEqual(secure.streamsFor('TraceSportStars.fr').map((stream) => stream.hazards), [['needs-headers']]);
  assert.equal(secure.channels.length, catalog.channels.length - 1);
  for (const channel of secure.channels) {
    for (const stream of secure.streamsFor(channel.id)) assert.ok(stream.url.startsWith('https://'), stream.url);
  }
});

test('categories option: other categories, several, any case, and [] for all', () => {
  const news = buildChannelCatalog(IPTV_CHANNELS, IPTV_STREAMS, IPTV_BLOCKLIST, { categories: ['News'] });
  assert.deepEqual(ids(news.channels), ['France24.fr']);
  assert.equal(news.streamsFor('France24.fr').length, 2);
  assert.deepEqual(news.streamsFor('DDSports.in'), [], 'streams of channels outside the catalogue are not served');

  const both = buildChannelCatalog(IPTV_CHANNELS, IPTV_STREAMS, IPTV_BLOCKLIST, { categories: ['news', 'sports'] });
  assert.equal(both.channels.length, catalog.channels.length + 1);

  const all = buildChannelCatalog(IPTV_CHANNELS, IPTV_STREAMS, IPTV_BLOCKLIST, { categories: [] });
  assert.deepEqual(ids(all.channels), ids(both.channels));
  assert.ok(!ids(all.channels).includes('AstroArena.my'), 'the blocklist still applies');
});

test('streamsFor hands out copies', () => {
  catalog.streamsFor('FBTV.tr').pop();
  assert.equal(catalog.streamsFor('FBTV.tr').length, 1);
});

test('a channel from the catalogue converts to media', () => {
  const [channel] = catalog.channels;
  assert.ok(channel);
  assert.deepEqual(channelToMedia(channel), { kind: 'live', ids: { channel: 'ACCDigitalNetwork.us' }, title: 'ACC Digital Network', channel: 'ACC Digital Network' });
});

test('loadChannelCatalog fetches the three files and builds the catalogue', async () => {
  const fetcher = mockFetcher({
    'https://iptv-org.github.io/api/channels.json': { body: IPTV_CHANNELS },
    'https://iptv-org.github.io/api/streams.json': { body: IPTV_STREAMS },
    'https://iptv-org.github.io/api/blocklist.json': { body: IPTV_BLOCKLIST },
  });
  const controller = new AbortController();
  const loaded = await loadChannelCatalog(fetcher, { signal: controller.signal });

  assert.deepEqual(loaded.channels, catalog.channels);
  assert.deepEqual(loaded.streamsFor('DDSports.in'), catalog.streamsFor('DDSports.in'));
  assert.deepEqual(fetcher.calls.map((call) => call.url).sort(), [
    'https://iptv-org.github.io/api/blocklist.json',
    'https://iptv-org.github.io/api/channels.json',
    'https://iptv-org.github.io/api/streams.json',
  ]);
  assert.ok(fetcher.calls.every((call) => call.method === 'GET' && call.signal === controller.signal));
});

test('loadChannelCatalog passes options through and accepts another base', async () => {
  const fetcher = mockFetcher({
    'https://mirror.example/iptv/channels.json': { body: IPTV_CHANNELS },
    'https://mirror.example/iptv/streams.json': { body: IPTV_STREAMS },
    'https://mirror.example/iptv/blocklist.json': { body: IPTV_BLOCKLIST },
  });
  const loaded = await loadChannelCatalog(fetcher, { base: 'https://mirror.example/iptv/', categories: ['news'], httpsOnly: true });
  assert.deepEqual(ids(loaded.channels), ['France24.fr']);
});

test('loadChannelCatalog fails as a whole when any file fails: no catalogue without its blocklist', async () => {
  const routes = {
    'https://iptv-org.github.io/api/channels.json': { body: IPTV_CHANNELS },
    'https://iptv-org.github.io/api/streams.json': { body: IPTV_STREAMS },
    'https://iptv-org.github.io/api/blocklist.json': { body: IPTV_BLOCKLIST },
  };
  const blocklistUrl = 'https://iptv-org.github.io/api/blocklist.json';

  await assert.rejects(loadChannelCatalog(mockFetcher({ ...routes, [blocklistUrl]: { status: 503 } })), /iptv-org blocklist\.json failed with status 503/);
  await assert.rejects(loadChannelCatalog(mockFetcher({ ...routes, [blocklistUrl]: { body: '<html>' } })), /iptv-org blocklist\.json: the response is not valid JSON/);
  await assert.rejects(loadChannelCatalog(mockFetcher({ ...routes, [blocklistUrl]: { body: { message: 'moved' } } })), /iptv-org blocklist\.json: expected a JSON array/);
  await assert.rejects(
    loadChannelCatalog(
      mockFetcher({
        ...routes,
        [blocklistUrl]: () => {
          throw new Error('socket hang up');
        },
      }),
    ),
    /socket hang up/,
  );
  await assert.rejects(loadChannelCatalog(mockFetcher({ ...routes, 'https://iptv-org.github.io/api/streams.json': { status: 404 } })), /streams\.json failed with status 404/);
});
