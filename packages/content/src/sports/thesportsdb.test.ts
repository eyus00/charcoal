// Run in a zone far from UTC: TheSportsDB's zone-less timestamps must still be read as UTC.
process.env.TZ = 'Asia/Kolkata';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EVENTS_DAY_1901_01_01_SOCCER, EVENTS_DAY_2026_11_22_SOCCER, EVENTS_NEXT_LEAGUE_4328 } from '../fixtures/thesportsdb.js';
import { mockFetcher } from '../testing.js';
import { effectiveStatus } from './model.js';
import { createTheSportsDb, mapEventStatus, THESPORTSDB_TEST_KEY } from './thesportsdb.js';

const BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const DAY_URL = `${BASE}/eventsday.php?d=2026-11-22&s=Soccer`;
const NEXT_URL = `${BASE}/eventsnextleague.php?id=4328`;
const HOUR = 3_600_000;
/** A fixed "now": two days after the sampled match day. */
const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const now = () => NOW;

/** One real row with some fields replaced, wrapped as a response body. */
function dayWith(...overrides: Record<string, unknown>[]): { events: Record<string, unknown>[] } {
  const [row] = EVENTS_NEXT_LEAGUE_4328.events;
  return { events: overrides.map((override, i) => ({ ...row, idEvent: String(9000 + i), ...override })) };
}

test('the test really runs outside UTC', () => {
  assert.equal(new Date(Date.UTC(2026, 10, 22, 19)).getHours(), 0, 'local time is UTC+5:30');
});

test('eventsOnDay maps a real day of results', async () => {
  const fetcher = mockFetcher({ [DAY_URL]: { body: EVENTS_DAY_2026_11_22_SOCCER } });
  const events = await createTheSportsDb(fetcher, { now }).eventsOnDay('2026-11-22', 'Soccer');

  // Sorted by start; the API lists them 19:00, 22:30, 00:00.
  assert.deepEqual(
    events.map((event) => [event.title, new Date(event.startsAt).toISOString()]),
    [
      ['Chapecoense vs Cruzeiro', '2026-11-22T00:00:00.000Z'],
      ['Athletico Paranaense vs Remo', '2026-11-22T19:00:00.000Z'],
      ['Bragantino vs Vasco da Gama', '2026-11-22T22:30:00.000Z'],
    ],
  );
  assert.deepEqual(events[1], {
    id: 'thesportsdb:2398541',
    sport: 'Soccer',
    league: 'Brazilian Serie A',
    leagueId: '4351',
    season: '2026',
    round: '36',
    title: 'Athletico Paranaense vs Remo',
    home: 'Athletico Paranaense',
    away: 'Remo',
    startsAt: Date.UTC(2026, 10, 22, 19, 0, 0),
    status: 'finished',
    score: { home: 4, away: 2 },
    venue: 'Arena da Baixada',
    country: 'Brazil',
    source: 'thesportsdb',
    fetchedAt: NOW,
    ttl: 86_400,
  });
  assert.equal(events[0]?.venue, 'Arena Condá');
  assert.deepEqual(fetcher.calls.map((call) => [call.method, call.url]), [['GET', DAY_URL]]);
});

test('nextLeagueEvents maps a match that has not started; the ttl follows the clock', async () => {
  const kickOff = Date.UTC(2026, 10, 27, 20, 0, 0);
  const at = async (clock: number) => {
    const fetcher = mockFetcher({ [NEXT_URL]: { body: EVENTS_NEXT_LEAGUE_4328 } });
    const [event] = await createTheSportsDb(fetcher, { now: () => clock }).nextLeagueEvents('4328');
    assert.ok(event);
    return event;
  };

  const event = await at(NOW);
  assert.deepEqual(event, {
    id: 'thesportsdb:2494118',
    sport: 'Soccer',
    league: 'English Premier League',
    leagueId: '4328',
    season: '2026-2027',
    round: '12',
    title: 'Nottingham Forest vs Chelsea',
    home: 'Nottingham Forest',
    away: 'Chelsea',
    startsAt: kickOff,
    status: 'scheduled',
    venue: 'City Ground',
    country: 'England',
    source: 'thesportsdb',
    fetchedAt: NOW,
    ttl: 3600,
  });
  assert.equal('score' in event, false);
  assert.equal('broadcasters' in event, false);

  assert.equal((await at(kickOff - HOUR)).ttl, 300);
  // The source still says "NS" ten minutes in: the record says scheduled, the clock says live.
  const stale = await at(kickOff + HOUR / 6);
  assert.deepEqual([stale.status, effectiveStatus(stale, stale.fetchedAt), stale.ttl], ['scheduled', 'live', 30]);
  assert.equal((await at(kickOff + 4 * HOUR)).ttl, 300, 'over by the clock, result not in yet');
});

test('an old result with no status and no time of day is finished, at midnight UTC', async () => {
  const url = `${BASE}/eventsday.php?d=1901-01-01&s=Soccer`;
  const fetcher = mockFetcher({ [url]: { body: EVENTS_DAY_1901_01_01_SOCCER } });
  const [event] = await createTheSportsDb(fetcher, { now }).eventsOnDay('1901-01-01', 'Soccer');
  assert.equal(event?.title, 'Blackburn vs Preston');
  assert.equal(event?.status, 'finished');
  assert.deepEqual(event?.score, { home: 3, away: 1 });
  assert.equal(event?.startsAt, Date.UTC(1901, 0, 1));
  assert.equal(event?.round, undefined);
  assert.equal(event?.venue, undefined);
  assert.equal(event?.ttl, 86_400);
});

test('a day with nothing on gives []', async () => {
  for (const body of [{ events: null }, {}, { events: 'none' }, null, []]) {
    const fetcher = mockFetcher({ [DAY_URL]: { body: JSON.stringify(body) } });
    assert.deepEqual(await createTheSportsDb(fetcher, { now }).eventsOnDay('2026-11-22', 'Soccer'), []);
  }
});

test('a 429 throws an error that says rate limit; other failures name the status', async () => {
  const limited = createTheSportsDb(mockFetcher({ [DAY_URL]: { status: 429, body: 'Too Many Requests' } }), { now });
  await assert.rejects(limited.eventsOnDay('2026-11-22', 'Soccer'), /rate limit/);
  await assert.rejects(limited.eventsOnDay('2026-11-22', 'Soccer'), /429/);

  const down = createTheSportsDb(mockFetcher({ [NEXT_URL]: { status: 503 } }), { now });
  await assert.rejects(down.nextLeagueEvents('4328'), /eventsnextleague\.php failed with status 503/);

  const html = createTheSportsDb(mockFetcher({ [DAY_URL]: { body: '<html>maintenance</html>' } }), { now });
  await assert.rejects(html.eventsOnDay('2026-11-22', 'Soccer'), /TheSportsDB eventsday\.php: the response is not valid JSON/);
});

test('status mapping covers the spellings the feeds use', () => {
  const expected: Record<string, string[]> = {
    finished: ['Match Finished', 'FT', 'AET', 'PEN', 'AOT', 'AP', 'Finished', 'Final', 'ft', ' FT ', 'After Extra Time', 'AWD', 'WO'],
    scheduled: ['NS', 'Not Started', 'TBD', 'Time To Be Defined', 'not started', '', '   ', 'Something New'],
    live: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'Q1', 'Q4', 'OT', 'P2', 'IN7', 'S3', 'In Progress', 'Half Time'],
    postponed: ['Postponed', 'PST', 'POST', 'Match Postponed', 'SUSP'],
    cancelled: ['Cancelled', 'Canceled', 'CANC', 'ABD', 'Abandoned', 'Match Cancelled'],
  };
  for (const [status, spellings] of Object.entries(expected)) {
    for (const spelling of spellings) assert.equal(mapEventStatus(spelling, 'no'), status, JSON.stringify(spelling));
  }
  for (const missing of [null, undefined, 42]) assert.equal(mapEventStatus(missing), 'scheduled');
});

test('status mapping: strPostponed and scores fill in when the status says little', () => {
  assert.equal(mapEventStatus('NS', 'yes'), 'postponed');
  assert.equal(mapEventStatus(null, 'yes'), 'postponed');
  assert.equal(mapEventStatus('', 'YES', true), 'postponed');
  // An explicit status beats the flag: a postponed match that was played later is finished.
  assert.equal(mapEventStatus('FT', 'yes', true), 'finished');
  assert.equal(mapEventStatus('Cancelled', 'yes'), 'cancelled');
  assert.equal(mapEventStatus('2H', 'yes', true), 'live');
  // No status at all: a full score means an old result, otherwise not started.
  assert.equal(mapEventStatus(null, 'no', true), 'finished');
  assert.equal(mapEventStatus(null, 'no', false), 'scheduled');
  // A status we do not know is not guessed at from the score (it may be mid-match).
  assert.equal(mapEventStatus('Q3 5:21', 'no', true), 'scheduled');
});

test('events carry live, postponed and cancelled states, with scores only when both are numbers', async () => {
  // Real row, hand-edited statuses and scores.
  const body = dayWith(
    { strStatus: '2H', intHomeScore: '1', intAwayScore: '0' },
    { strStatus: 'NS', strPostponed: 'yes' },
    { strStatus: 'Cancelled' },
    { strStatus: 'HT', intHomeScore: '1', intAwayScore: null },
    { strStatus: 'FT', intHomeScore: 2, intAwayScore: '2' },
    { strStatus: 'NS', intHomeScore: '', intAwayScore: '' },
  );
  const kickOff = Date.UTC(2026, 10, 27, 20, 0, 0);
  const fetcher = mockFetcher({ [DAY_URL]: { body } });
  const events = await createTheSportsDb(fetcher, { now: () => kickOff + HOUR }).eventsOnDay('2026-11-22', 'Soccer');

  assert.deepEqual(
    events.map((event) => [event.id, event.status, event.score, event.ttl]),
    [
      ['thesportsdb:9000', 'live', { home: 1, away: 0 }, 30],
      ['thesportsdb:9001', 'postponed', undefined, 300],
      ['thesportsdb:9002', 'cancelled', undefined, 300],
      ['thesportsdb:9003', 'live', undefined, 30],
      ['thesportsdb:9004', 'finished', { home: 2, away: 2 }, 86_400],
      ['thesportsdb:9005', 'scheduled', undefined, 30],
    ],
  );
});

test('start time: strTimestamp first, then dateEvent + strTime, always UTC', async () => {
  const body = dayWith(
    { strTimestamp: '2026-11-27T20:00:00' },
    { strTimestamp: '2026-11-27T20:00:00+00:00' },
    { strTimestamp: '2026-11-27 20:00:00' },
    { strTimestamp: null, dateEvent: '2026-11-27', strTime: '20:00:00' },
    { strTimestamp: '', dateEvent: '2026-11-27', strTime: '20:00:00+00:00' },
    { strTimestamp: 'soon', dateEvent: '2026-11-27', strTime: '20:00' },
    { strTimestamp: null, dateEvent: '2026-11-27', strTime: '21:00:00+01:00' },
    { strTimestamp: null, dateEvent: '2026-11-27', strTime: '14:30:00-05:30' },
    { strTimestamp: '2026-11-27T20:00:00Z' },
  );
  const events = await createTheSportsDb(mockFetcher({ [DAY_URL]: { body } }), { now }).eventsOnDay('2026-11-22', 'Soccer');
  assert.equal(events.length, 9);
  for (const event of events) assert.equal(new Date(event.startsAt).toISOString(), '2026-11-27T20:00:00.000Z', event.id);

  const dateOnly = dayWith({ strTimestamp: null, dateEvent: '2026-11-27', strTime: null }, { strTimestamp: null, dateEvent: '2026-11-27', strTime: 'TBA' });
  const midnight = await createTheSportsDb(mockFetcher({ [DAY_URL]: { body: dateOnly } }), { now }).eventsOnDay('2026-11-22', 'Soccer');
  assert.deepEqual(midnight.map((event) => new Date(event.startsAt).toISOString()), ['2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z']);
});

test('rows without an id, a title or a usable date are dropped', async () => {
  const body = dayWith(
    { idEvent: null },
    { strTimestamp: null, dateEvent: null },
    { strTimestamp: '2026-02-30T10:00:00', dateEvent: 'someday' },
    { strTimestamp: '2026-11-27T25:00:00', dateEvent: null },
    { strEvent: null, strHomeTeam: null },
    { strEvent: '', strHomeTeam: 'Mumbai Indians', strAwayTeam: 'Chennai Super Kings', strSport: 'Cricket' },
  );
  body.events.push(null as unknown as Record<string, unknown>, 'row' as unknown as Record<string, unknown>);
  const events = await createTheSportsDb(mockFetcher({ [DAY_URL]: { body } }), { now }).eventsOnDay('2026-11-22', 'Soccer');
  assert.deepEqual(events.map((event) => [event.id, event.title, event.sport]), [['thesportsdb:9005', 'Mumbai Indians vs Chennai Super Kings', 'Cricket']]);
});

test('reads TV stations when the source sends them', async () => {
  // strTVStation is not in today's free responses; hand-written to its documented form.
  const body = dayWith({ strTVStation: 'Sky Sports Main Event, TNT Sports 1; Star Sports 1 Hindi' }, { strTVStation: '' }, { strTVStation: null });
  const events = await createTheSportsDb(mockFetcher({ [DAY_URL]: { body } }), { now }).eventsOnDay('2026-11-22', 'Soccer');
  assert.deepEqual(events[0]?.broadcasters, ['Sky Sports Main Event', 'TNT Sports 1', 'Star Sports 1 Hindi']);
  assert.equal(events[1]?.broadcasters, undefined);
  assert.equal(events[2]?.broadcasters, undefined);
});

test('builds URLs from the key, the base and the arguments', async () => {
  const urls = [
    'https://sportsdb.example/v1/json/my%20key%2F1/eventsday.php?d=2026-11-22',
    'https://sportsdb.example/v1/json/my%20key%2F1/eventsday.php?d=2026-11-22&s=American+Football',
    'https://sportsdb.example/v1/json/my%20key%2F1/eventsnextleague.php?id=4391',
  ];
  const fetcher = mockFetcher(Object.fromEntries(urls.map((url) => [url, { body: { events: null } }])));
  const api = createTheSportsDb(fetcher, { apiKey: 'my key/1', base: 'https://sportsdb.example/v1/json/', now });
  await api.eventsOnDay('2026-11-22');
  await api.eventsOnDay('2026-11-22', ' American Football ');
  await api.nextLeagueEvents('4391');
  assert.deepEqual(fetcher.calls.map((call) => call.url), urls);
});

test('uses the public test key "123" unless given another; an empty key means the default', async () => {
  assert.equal(THESPORTSDB_TEST_KEY, '123');
  const fetcher = mockFetcher({ [NEXT_URL]: { body: { events: null } } });
  await createTheSportsDb(fetcher, { now }).nextLeagueEvents('4328');
  await createTheSportsDb(fetcher, { apiKey: '', now }).nextLeagueEvents('4328');
  await createTheSportsDb(fetcher, { apiKey: '  ', now }).nextLeagueEvents('4328');
  assert.deepEqual(fetcher.calls.map((call) => call.url), [NEXT_URL, NEXT_URL, NEXT_URL]);
  assert.ok(NEXT_URL.includes('/api/v1/json/123/'));
});

test('a refused key (the retired key "3" answers 403) says so, without the key', async () => {
  // The real answer to https://www.thesportsdb.com/api/v1/json/3/… on 2026-11-24.
  const refusal = { status: 403, body: `The old '3' Free Sports API key is permanently disabled, Please use the new test key "123" or sign up to premium here https://www.thesportsdb.com/pricing` };
  const url = 'https://www.thesportsdb.com/api/v1/json/s3cr3t-key/eventsnextleague.php?id=4328';
  const api = createTheSportsDb(mockFetcher({ [url]: refusal }), { apiKey: 's3cr3t-key', now });
  await assert.rejects(api.nextLeagueEvents('4328'), (error: Error) => /refused the API key \(HTTP 403\)/.test(error.message) && !error.message.includes('s3cr3t'));
});

test('never puts the API key in an error message', async () => {
  const url = 'https://www.thesportsdb.com/api/v1/json/s3cr3t-key/eventsday.php?d=2026-11-22';
  for (const answer of [{ status: 429 }, { status: 401 }, { status: 403 }, { status: 500 }, { status: 200, body: 'not json' }]) {
    const api = createTheSportsDb(mockFetcher({ [url]: answer }), { apiKey: 's3cr3t-key', now });
    await assert.rejects(api.eventsOnDay('2026-11-22'), (error: Error) => !error.message.includes('s3cr3t'));
  }
});

test('rejects malformed arguments without calling the network, and passes the signal on', async () => {
  const fetcher = mockFetcher({ [DAY_URL]: { body: { events: null } }, [NEXT_URL]: { body: { events: null } } });
  const api = createTheSportsDb(fetcher, { now });
  for (const date of ['22-11-2026', '2026-11-22T00:00:00', '2026-13-01', '2026-02-30', '']) await assert.rejects(api.eventsOnDay(date), RangeError, date);
  for (const league of ['', 'epl', '4328&x=1', '../4328']) await assert.rejects(api.nextLeagueEvents(league), RangeError, league);
  assert.equal(fetcher.calls.length, 0);

  const controller = new AbortController();
  await api.eventsOnDay('2026-11-22', 'Soccer', controller.signal);
  await api.nextLeagueEvents('4328', controller.signal);
  assert.deepEqual(fetcher.calls.map((call) => call.signal), [controller.signal, controller.signal]);
});

test('uses the real clock when none is given', async () => {
  const before = Date.now();
  const [event] = await createTheSportsDb(mockFetcher({ [NEXT_URL]: { body: EVENTS_NEXT_LEAGUE_4328 } })).nextLeagueEvents('4328');
  assert.ok(event && event.fetchedAt >= before && event.fetchedAt <= Date.now());
});
