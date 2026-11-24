import { test } from 'node:test';
import assert from 'node:assert/strict';

import { channelToMedia, effectiveStatus, eventToMedia, eventTtl, typicalDuration, type EventStatus, type SportsEvent } from './model.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Kick-off of the fixture used throughout: 2026-11-27 20:00 UTC. */
const KICK_OFF = Date.UTC(2026, 10, 27, 20, 0, 0);

function match(overrides: Partial<SportsEvent> = {}): SportsEvent {
  return {
    id: 'thesportsdb:2494118',
    sport: 'Soccer',
    league: 'English Premier League',
    leagueId: '4328',
    title: 'Nottingham Forest vs Chelsea',
    home: 'Nottingham Forest',
    away: 'Chelsea',
    startsAt: KICK_OFF,
    status: 'scheduled',
    source: 'thesportsdb',
    fetchedAt: KICK_OFF - 24 * HOUR,
    ttl: 3600,
    ...overrides,
  };
}

test('typicalDuration knows the common sports and falls back to three hours', () => {
  assert.equal(typicalDuration('Soccer'), 2.25 * HOUR);
  assert.equal(typicalDuration('  soccer '), 2.25 * HOUR);
  assert.equal(typicalDuration('Cricket'), 8.5 * HOUR);
  assert.equal(typicalDuration('American Football'), 3.75 * HOUR);
  assert.equal(typicalDuration('Underwater Hockey'), 3 * HOUR);
  assert.equal(typicalDuration('constructor'), 3 * HOUR);
});

test('effectiveStatus: a scheduled event goes live at kick-off and finishes after its typical duration', () => {
  const event = match();
  const end = KICK_OFF + typicalDuration('Soccer');
  const timeline: [at: number, expected: EventStatus][] = [
    [KICK_OFF - 3 * HOUR, 'scheduled'],
    [KICK_OFF - 1, 'scheduled'],
    [KICK_OFF, 'live'],
    [KICK_OFF + 45 * MINUTE, 'live'],
    [end, 'live'],
    [end + 1, 'finished'],
    [KICK_OFF + 3 * 24 * HOUR, 'finished'],
  ];
  for (const [at, expected] of timeline) assert.equal(effectiveStatus(event, at), expected, new Date(at).toISOString());
});

test('effectiveStatus: a stale "live" ends by the clock; the duration depends on the sport', () => {
  const live = match({ status: 'live' });
  assert.equal(effectiveStatus(live, KICK_OFF + 2 * HOUR), 'live');
  assert.equal(effectiveStatus(live, KICK_OFF + 2.5 * HOUR), 'finished');
  // A source may call an event live a little before the listed start; that is the source's call.
  assert.equal(effectiveStatus(live, KICK_OFF - 5 * MINUTE), 'live');

  const cricket = match({ sport: 'Cricket', status: 'live' });
  assert.equal(effectiveStatus(cricket, KICK_OFF + 2.5 * HOUR), 'live');
  assert.equal(effectiveStatus(cricket, KICK_OFF + 9 * HOUR), 'finished');
});

test('effectiveStatus never overrides finished, postponed or cancelled', () => {
  for (const status of ['finished', 'postponed', 'cancelled'] as const) {
    for (const at of [KICK_OFF - HOUR, KICK_OFF + HOUR, KICK_OFF + 100 * HOUR]) {
      assert.equal(effectiveStatus(match({ status }), at), status);
    }
  }
});

test('eventTtl: 3600 far out, 300 within two hours of the start, 30 while live', () => {
  const event = match();
  const timeline: [at: number, expected: number][] = [
    [KICK_OFF - 7 * 24 * HOUR, 3600],
    [KICK_OFF - 2 * HOUR - 1, 3600],
    [KICK_OFF - 2 * HOUR, 300],
    [KICK_OFF - 1, 300],
    [KICK_OFF, 30],
    [KICK_OFF + 90 * MINUTE, 30],
  ];
  for (const [at, expected] of timeline) assert.equal(eventTtl(event, at), expected, new Date(at).toISOString());
  assert.equal(eventTtl(match({ status: 'live' }), KICK_OFF + 10 * MINUTE), 30);
});

test('eventTtl: 86400 once the source says finished', () => {
  const finished = match({ status: 'finished', score: { home: 2, away: 1 } });
  assert.equal(eventTtl(finished, KICK_OFF + 2 * HOUR), 86_400);
  assert.equal(eventTtl(finished, KICK_OFF + 30 * 24 * HOUR), 86_400);
  // Even when the clock would still call it live (a short match, an abandoned one recorded as final).
  assert.equal(eventTtl(finished, KICK_OFF + 10 * MINUTE), 86_400);
});

test('eventTtl: finished only by the clock keeps polling for the result, then gives up after a day', () => {
  for (const status of ['scheduled', 'live'] as const) {
    const stale = match({ status });
    assert.equal(effectiveStatus(stale, KICK_OFF + 3 * HOUR), 'finished');
    assert.equal(eventTtl(stale, KICK_OFF + 3 * HOUR), 300);
    assert.equal(eventTtl(stale, KICK_OFF + 24 * HOUR - 1), 300);
    assert.equal(eventTtl(stale, KICK_OFF + 24 * HOUR), 86_400);
  }
});

test('eventTtl: postponed and cancelled events follow the distance to the listed start', () => {
  for (const status of ['postponed', 'cancelled'] as const) {
    const event = match({ status });
    assert.equal(eventTtl(event, KICK_OFF - 5 * HOUR), 3600);
    assert.equal(eventTtl(event, KICK_OFF - HOUR), 300);
    assert.equal(eventTtl(event, KICK_OFF + HOUR), 300);
    assert.equal(eventTtl(event, KICK_OFF + 5 * HOUR), 3600);
  }
});

test('eventToMedia builds a LiveMedia the provider engine can look up', () => {
  assert.deepEqual(eventToMedia(match()), {
    kind: 'live',
    ids: { event: 'thesportsdb:2494118' },
    title: 'Nottingham Forest vs Chelsea',
    altTitles: ['Chelsea @ Nottingham Forest'],
    startsAt: KICK_OFF,
    year: 2026,
  });

  const named = eventToMedia(match({ title: 'Premier League: Forest - Chelsea' }));
  assert.deepEqual(named.altTitles, ['Nottingham Forest vs Chelsea', 'Chelsea @ Nottingham Forest']);

  // No teams (a race, a tournament day): just the title.
  const race = eventToMedia(match({ id: 'thesportsdb:1', sport: 'Motorsport', title: 'Abu Dhabi Grand Prix', home: undefined, away: undefined }));
  assert.deepEqual(race, { kind: 'live', ids: { event: 'thesportsdb:1' }, title: 'Abu Dhabi Grand Prix', startsAt: KICK_OFF, year: 2026 });

  // The year is the UTC year of the start.
  assert.equal(eventToMedia(match({ startsAt: Date.UTC(2027, 0, 1, 0, 30) })).year, 2027);
  assert.equal(eventToMedia(match({ startsAt: Date.UTC(2026, 11, 31, 23, 30) })).year, 2026);
});

test('channelToMedia builds a LiveMedia for a channel', () => {
  const media = channelToMedia({ id: 'DDSports.in', name: 'DD Sports', country: 'IN', categories: ['sports'], network: 'Doordarshan' });
  assert.deepEqual(media, { kind: 'live', ids: { channel: 'DDSports.in' }, title: 'DD Sports', channel: 'DD Sports' });
});
