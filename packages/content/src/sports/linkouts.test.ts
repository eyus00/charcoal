import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINKOUTS, resolveLinkouts, type LinkoutTable } from './linkouts.js';
import type { SportsEvent } from './model.js';

/**
 * EXAMPLE DATA. The broadcasters and addresses below are invented to show the shape of a table;
 * they are not real rights holders. A real table is keyed the same way: by the schedule source's
 * league id, or by the league's name in lower case, and lists who shows that competition where.
 */
const EXAMPLE_TABLE: LinkoutTable = {
  '4328': [
    { region: 'GB', rightsHolder: 'Example Sports UK', url: 'https://watch.example.co.uk/football' },
    { region: 'IN', rightsHolder: 'Example Play India', url: 'https://play.example.in/football', free: false },
    { region: 'IN', rightsHolder: 'Example Free TV', url: 'https://freetv.example.in/live', free: true },
    { region: 'WW', rightsHolder: 'Example League Pass', url: 'https://pass.example.com/' },
  ],
  'indian premier league': [
    { region: 'IN', rightsHolder: 'Example Cricket Stream', url: 'https://cricket.example.in/ipl', free: true },
    { region: 'WW', rightsHolder: 'Example Cricket World', url: 'https://cricket.example.com/ipl' },
  ],
};

function event(overrides: Partial<SportsEvent> = {}): SportsEvent {
  return {
    id: 'thesportsdb:2494118',
    sport: 'Soccer',
    league: 'English Premier League',
    leagueId: '4328',
    title: 'Nottingham Forest vs Chelsea',
    startsAt: Date.UTC(2026, 10, 27, 20),
    status: 'scheduled',
    source: 'thesportsdb',
    fetchedAt: Date.UTC(2026, 10, 24, 12),
    ttl: 3600,
    ...overrides,
  };
}

const holders = (links: { rightsHolder: string }[]) => links.map((link) => link.rightsHolder);

test('the default table is empty: no broadcaster data ships with the package', () => {
  assert.deepEqual(DEFAULT_LINKOUTS, {});
  assert.deepEqual(resolveLinkouts(DEFAULT_LINKOUTS, event(), 'IN'), []);
});

test("returns the viewer's region first, then worldwide links", () => {
  assert.deepEqual(resolveLinkouts(EXAMPLE_TABLE, event(), 'IN'), [
    { region: 'IN', rightsHolder: 'Example Play India', url: 'https://play.example.in/football', free: false },
    { region: 'IN', rightsHolder: 'Example Free TV', url: 'https://freetv.example.in/live', free: true },
    { region: 'WW', rightsHolder: 'Example League Pass', url: 'https://pass.example.com/' },
  ]);
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, event(), 'GB')), ['Example Sports UK', 'Example League Pass']);
});

test('a region with no local broadcaster gets the worldwide links only', () => {
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, event(), 'BR')), ['Example League Pass']);
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, event(), 'WW')), ['Example League Pass']);
});

test('region codes are matched in any case, and "UK" means "GB"', () => {
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, event(), ' in ')), ['Example Play India', 'Example Free TV', 'Example League Pass']);
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, event(), 'uk')), ['Example Sports UK', 'Example League Pass']);
  const table: LinkoutTable = { '4328': [{ region: 'uk', rightsHolder: 'Lower Case', url: 'https://lower.example/' }] };
  assert.deepEqual(holders(resolveLinkouts(table, event(), 'GB')), ['Lower Case']);
});

test('finds a league by name when the id is not in the table', () => {
  const ipl = event({ sport: 'Cricket', league: 'Indian Premier League', leagueId: '4460', title: 'Mumbai Indians vs Chennai Super Kings' });
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, ipl, 'IN')), ['Example Cricket Stream', 'Example Cricket World']);
  assert.deepEqual(holders(resolveLinkouts(EXAMPLE_TABLE, event({ league: '  INDIAN PREMIER LEAGUE ', leagueId: undefined }), 'US')), ['Example Cricket World']);
});

test('merges id and name entries without repeating a link', () => {
  const table: LinkoutTable = {
    '4328': [{ region: 'IN', rightsHolder: 'By Id', url: 'https://a.example/' }],
    'english premier league': [
      { region: 'IN', rightsHolder: 'By Id (again)', url: 'https://a.example/' },
      { region: 'IN', rightsHolder: 'By Name', url: 'https://b.example/' },
    ],
  };
  assert.deepEqual(holders(resolveLinkouts(table, event(), 'IN')), ['By Id', 'By Name']);
});

test('unknown leagues and events without league information give []', () => {
  assert.deepEqual(resolveLinkouts(EXAMPLE_TABLE, event({ league: 'Serie Z', leagueId: '99999' }), 'IN'), []);
  assert.deepEqual(resolveLinkouts(EXAMPLE_TABLE, event({ league: undefined, leagueId: undefined }), 'IN'), []);
  // Names that exist on every object must not match anything.
  assert.deepEqual(resolveLinkouts(EXAMPLE_TABLE, event({ league: 'constructor', leagueId: 'toString' }), 'IN'), []);
});

test('drops links that are not http(s) and rows that are not links', () => {
  const table = {
    '4328': [
      { region: 'IN', rightsHolder: 'Script', url: 'javascript:alert(1)' },
      { region: 'IN', rightsHolder: 'Relative', url: '/watch' },
      { region: 'IN', rightsHolder: 'No address' },
      null,
      { region: 'IN', rightsHolder: 'Fine', url: 'HTTPS://ok.example/' },
    ],
    '4329': 'not a list',
  } as unknown as LinkoutTable;
  assert.deepEqual(holders(resolveLinkouts(table, event(), 'IN')), ['Fine']);
  assert.deepEqual(resolveLinkouts(table, event({ leagueId: '4329', league: undefined }), 'IN'), []);
});
