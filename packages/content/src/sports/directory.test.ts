import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PPV_STREAMS_2026_11_25 } from '../fixtures/ppv.js';
import { mockFetcher } from '../testing.js';
import { createStreamDirectory, listingState, matchesListing, OPENS_BEFORE_MS, orderListings, parseStreamDirectory, STREAM_DIRECTORY_BASES } from './directory.js';

/** When the sample was taken (its own timestamp). */
const NOW = PPV_STREAMS_2026_11_25.timestamp * 1000;
const [FIRST, SECOND] = STREAM_DIRECTORY_BASES.map((b) => `${b}/api/streams`);

test('a real sample: events, a channel, and the entertainment category left out', () => {
  const d = parseStreamDirectory(PPV_STREAMS_2026_11_25, NOW);
  assert.deepEqual(d.sports, ['American Football', 'Basketball', 'Football']);
  assert.equal(d.listings.length, 6, 'seven rows in the sample, one of them in "24/7 Streams"');
  assert.ok(!d.listings.some((l) => /south park/i.test(l.title)));

  const channel = d.listings.find((l) => l.title === 'NFL Network')!;
  assert.deepEqual({ channel: channel.channel, startsAt: channel.startsAt, endsAt: channel.endsAt, league: channel.league, sport: channel.sport }, { channel: true, startsAt: 0, endsAt: 0, league: '', sport: 'American Football' });
  assert.equal(channel.id, '18172');
  assert.deepEqual(
    channel.options.map((o) => [o.quality, o.broadcaster, o.language, o.embed]),
    [
      ['HD', 'NFL Network (ESPN)', 'en', 'https://taifood-blog.asia/embed/nfl-network'],
      ['SD', 'NFL Network (ESPN)', 'en', 'https://taifood-blog.asia/embed/nfl-network_540p'],
    ],
  );

  const match = d.listings.find((l) => l.title === 'Sabah FK vs. Barcelona')!;
  assert.equal(match.league, 'Champions League');
  assert.equal(match.startsAt, Date.UTC(2026, 10, 25, 17, 45));
  assert.equal(match.endsAt, Date.UTC(2026, 10, 25, 20, 15));
  assert.match(match.poster ?? '', /^https:\/\//);

  const several = d.listings.find((l) => l.title.startsWith('TCU'))!;
  assert.deepEqual(several.options.map((o) => `${o.quality} ${o.broadcaster}`), ['HD ESPN', 'SD ESPN', 'HD SkyCast', 'SD SkyCast']);
});

test('live, upcoming and ended follow the clock', () => {
  const d = parseStreamDirectory(PPV_STREAMS_2026_11_25, NOW);
  const { live, upcoming, channels } = orderListings(d.listings, NOW);
  assert.deepEqual(live.map((l) => l.title), ['Gonzaga Bulldogs at Kansas State Wildcats']);
  assert.deepEqual(channels.map((l) => l.title), ['NFL Network']);
  assert.deepEqual(upcoming.map((l) => l.title), [
    'Virginia Cavaliers at Marquette Golden Eagles',
    'Sabah FK vs. Barcelona',
    'Slavia Prague vs. Villarreal',
    'TCU Horned Frogs at Texas Tech Red Raiders',
  ]);

  const match = d.listings.find((l) => l.title === 'Sabah FK vs. Barcelona')!;
  assert.equal(listingState(match, match.startsAt - OPENS_BEFORE_MS - 1), 'upcoming');
  assert.equal(listingState(match, match.startsAt - OPENS_BEFORE_MS), 'live', 'streams open a little before the start');
  assert.equal(listingState(match, match.endsAt - 1), 'live');
  assert.equal(listingState(match, match.endsAt), 'ended');
  assert.equal(orderListings(d.listings, match.endsAt).live.includes(match), false, 'an ended event is listed nowhere');
  assert.equal(orderListings(d.listings, match.endsAt).upcoming.includes(match), false);
});

test('rows that could not be framed safely are dropped', () => {
  const row = (over: Record<string, unknown>) => ({ id: 1, name: 'A vs. B', tag: 'Cup', uri_name: 'a-b', starts_at: 100, ends_at: 200, always_live: 0, iframe: 'https://player.example/embed/a-b', substreams: [], ...over });
  const parse = (...rows: unknown[]) => parseStreamDirectory({ streams: [{ category: 'Football', streams: rows }] }, 0).listings;

  assert.equal(parse(row({})).length, 1);
  for (const iframe of ['http://player.example/embed/a-b', 'javascript:alert(1)', 'data:text/html,<p>x', '//player.example/x', 'https://user:pw@player.example/x', '', null, 7]) {
    assert.equal(parse(row({ iframe })).length, 0, `not framed: ${String(iframe)}`);
  }
  assert.equal(parse(row({ name: '  ' })).length, 0, 'no title');
  assert.equal(parse('nonsense', null, row({})).length, 1, 'junk rows are skipped');
  assert.equal(parse(row({}), row({})).length, 1, 'the same entry twice is listed once');

  // An unsafe main address with a usable alternative: the alternative is what plays.
  const [alt] = parse(row({ iframe: 'http://insecure.example/x', substreams: [{ id: 2, uri_name: 'a-b_540p', source_tag: 'SD | Cup TV', iframe: 'https://player.example/embed/a-b_540p' }] }));
  assert.deepEqual(alt.options.map((o) => o.embed), ['https://player.example/embed/a-b_540p']);

  assert.equal(parse(row({ poster: 'http://images.example/a.jpg' }))[0].poster, undefined, 'only https images');
  assert.equal(parse(row({ viewers: '-4' }))[0].viewers, 0);
  assert.equal(parse(row({ ends_at: 0 }))[0].endsAt, 100_000 + 3 * 3_600_000, 'no end given: three hours');
  assert.equal(parse(row({ id: 'x', uri_name: 'cup/2026/a-b' })).length, 0, 'no number and a name with slashes: nothing safe to address it by');
  assert.throws(() => parseStreamDirectory({ success: true }), /no list of streams/);
});

test('search matches every word, in titles, competitions, sports and broadcasters', () => {
  const d = parseStreamDirectory(PPV_STREAMS_2026_11_25, NOW);
  const find = (q: string) => d.listings.filter((l) => matchesListing(l, q)).map((l) => l.title);
  assert.deepEqual(find('barcelona'), ['Sabah FK vs. Barcelona']);
  assert.deepEqual(find('champions  LEAGUE'), ['Sabah FK vs. Barcelona', 'Slavia Prague vs. Villarreal']);
  assert.deepEqual(find('skycast'), ['TCU Horned Frogs at Texas Tech Red Raiders']);
  assert.equal(find('basketball').length, 2);
  assert.equal(find('').length, 6);
  assert.deepEqual(find('barcelona basketball'), []);
});

test('the second address answers when the first does not', async () => {
  const fetcher = mockFetcher({ [FIRST]: { status: 502, body: 'bad gateway' }, [SECOND]: { body: PPV_STREAMS_2026_11_25 } });
  const d = await createStreamDirectory(fetcher, { now: () => NOW }).load();
  assert.equal(d.listings.length, 6);
  assert.equal(d.fetchedAt, NOW);
  assert.deepEqual(fetcher.calls.map((c) => c.url), [FIRST, SECOND]);
});

test('no address answering is an error, and a page that is not JSON does not pass for one', async () => {
  const down = mockFetcher({ [FIRST]: { status: 503 }, [SECOND]: { body: '<!doctype html><title>Just a moment</title>' } });
  await assert.rejects(createStreamDirectory(down).load(), /not valid JSON/);
  const refused = mockFetcher({ [FIRST]: { body: { success: false } }, [SECOND]: { status: 404 } });
  await assert.rejects(createStreamDirectory(refused).load(), /answered 404/);
});

test('a cancelled request is not retried on the next address', async () => {
  const ctrl = new AbortController();
  const fetcher = mockFetcher({
    [FIRST]: () => {
      ctrl.abort();
      throw new Error('aborted');
    },
    [SECOND]: { body: PPV_STREAMS_2026_11_25 },
  });
  await assert.rejects(createStreamDirectory(fetcher).load(ctrl.signal));
  assert.equal(fetcher.calls.length, 1);
});
