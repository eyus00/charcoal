/**
 * Schedules and results from TheSportsDB's v1 JSON API.
 *
 * What an event row looks like (checked against eventsday.php and eventsnextleague.php with the
 * free key on 2026-11-24): every value is a string or null, numbers included.
 *
 *   idEvent "2398541", strEvent "Athletico Paranaense vs Remo", strSport "Soccer",
 *   idLeague "4351", strLeague "Brazilian Serie A", strSeason "2026", intRound "36",
 *   strHomeTeam / strAwayTeam, intHomeScore "4" / intAwayScore "2" (null before kick-off),
 *   strTimestamp "2026-11-22T19:00:00"  (UTC, written without a zone),
 *   dateEvent "2026-11-22", strTime "19:00:00" (UTC; null on old results),
 *   strStatus "FT" | "NS" | … | null, strPostponed "yes" | "no", strVenue, strCountry
 *
 * strTVStation is read when present, but the free endpoints no longer send it. The free key also
 * caps a day at a few events and eventsnextleague at one, so this is a sample, not a full schedule.
 */

import type { Fetcher } from '@charcoal/provider-sdk';
import { integer, isRecord, parseJson, text } from '../internal/json.js';
import { eventTtl, type EventStatus, type SportsEvent } from './model.js';

export const THESPORTSDB_SOURCE = 'thesportsdb';

/**
 * The public test key. Its predecessor "3" was switched off for good: requests with it answer 403
 * with the text "use the new test key 123" (seen 2026-11-24).
 */
export const THESPORTSDB_TEST_KEY = '123';

export interface TheSportsDbOptions {
  /** Default: the public test key. A paid key is a secret: it is never put in an error message. */
  apiKey?: string;
  base?: string;
  /** The clock used for fetchedAt and ttl. Default Date.now. */
  now?: () => number;
}

export interface TheSportsDb {
  /** Events on one UTC day, earliest first, optionally for one sport ("Soccer", "Cricket", …). */
  eventsOnDay(date: string, sport?: string, signal?: AbortSignal): Promise<SportsEvent[]>;
  /** A league's upcoming events, earliest first. */
  nextLeagueEvents(leagueId: string, signal?: AbortSignal): Promise<SportsEvent[]>;
}

// Status codes come from several feeds, so the same state has many spellings. All are compared
// lower-case. Soccer: 1H HT 2H ET BT P INT FT AET PEN; basketball / American football: Q1–Q4 OT
// AOT; ice hockey: P1–P3 PT AP; baseball: IN1–IN9; volleyball: S1–S5.
const FINISHED = new Set(['ft', 'aet', 'pen', 'aot', 'ap', 'awd', 'wo', 'final', 'finished', 'ended', 'completed', 'full time', 'match finished', 'after extra time', 'after penalties', 'after over time', 'after overtime']);
const SCHEDULED = new Set(['ns', 'not started', 'tbd', 'tba', 'time to be defined', 'scheduled']);
const POSTPONED = new Set(['pst', 'post', 'postponed', 'match postponed', 'susp', 'suspended', 'match suspended', 'delayed']);
const CANCELLED = new Set(['canc', 'cancelled', 'canceled', 'match cancelled', 'match canceled', 'abd', 'abandoned', 'match abandoned']);
const LIVE = new Set(['1h', '2h', 'ht', 'et', 'bt', 'pt', 'p', 'ot', 'int', 'live', 'in progress', 'half time', 'halftime', 'break time', 'extra time', 'first half', 'second half', 'penalty in progress']);
const LIVE_PERIOD = /^(?:q[1-4]|p[1-3]|s[1-5]|in\d{1,2})$/;

/**
 * TheSportsDB's strStatus / strPostponed → our status. An unknown or missing status counts as
 * scheduled (effectiveStatus then goes by the clock), except that a missing status with a full
 * score is an old result.
 */
export function mapEventStatus(strStatus: unknown, strPostponed?: unknown, hasScore = false): EventStatus {
  const status = (text(strStatus) ?? '').toLowerCase().replace(/\s+/g, ' ');
  if (FINISHED.has(status)) return 'finished';
  if (CANCELLED.has(status)) return 'cancelled';
  if (POSTPONED.has(status)) return 'postponed';
  if (LIVE.has(status) || LIVE_PERIOD.test(status)) return 'live';
  if (text(strPostponed)?.toLowerCase() === 'yes') return 'postponed';
  if (SCHEDULED.has(status)) return 'scheduled';
  return status === '' && hasScore ? 'finished' : 'scheduled';
}

/**
 * "2026-11-22T19:00:00" → epoch ms, reading a time without a zone as UTC. (Date.parse would read
 * it as local time.) A trailing "Z" or "+01:00" is honoured.
 */
function parseUtc(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour = '0', minute = '0', second = '0', zone] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return undefined;
  let ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  // Date.UTC rolls "2026-02-30" over into March; a date that doesn't read back the same is not a date.
  const check = new Date(ms);
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return undefined;
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  return Number.isFinite(ms) ? ms : undefined;
}

function startOf(row: Record<string, unknown>): number | undefined {
  const stamp = text(row.strTimestamp);
  const fromStamp = stamp ? parseUtc(stamp) : undefined;
  if (fromStamp !== undefined) return fromStamp;
  const date = text(row.dateEvent);
  if (!date) return undefined;
  const time = text(row.strTime);
  // No usable time of day (old results, some all-day events): midnight UTC of the date.
  return (time ? parseUtc(`${date}T${time}`) : undefined) ?? parseUtc(date);
}

function toEvent(row: unknown, fetchedAt: number): SportsEvent | undefined {
  if (!isRecord(row)) return undefined;
  const id = text(row.idEvent);
  const startsAt = startOf(row);
  if (!id || startsAt === undefined) return undefined;

  const home = text(row.strHomeTeam);
  const away = text(row.strAwayTeam);
  const title = text(row.strEvent) ?? (home && away ? `${home} vs ${away}` : undefined);
  if (!title) return undefined;

  const homeScore = integer(row.intHomeScore);
  const awayScore = integer(row.intAwayScore);
  const score = homeScore !== undefined && awayScore !== undefined ? { home: homeScore, away: awayScore } : undefined;

  const event: SportsEvent = {
    id: `${THESPORTSDB_SOURCE}:${id}`,
    sport: text(row.strSport) ?? 'Unknown',
    title,
    startsAt,
    status: mapEventStatus(row.strStatus, row.strPostponed, score !== undefined),
    source: THESPORTSDB_SOURCE,
    fetchedAt,
    ttl: 0,
  };
  const optional = {
    league: text(row.strLeague),
    leagueId: text(row.idLeague),
    season: text(row.strSeason),
    round: text(row.intRound),
    home,
    away,
    venue: text(row.strVenue),
    country: text(row.strCountry),
  };
  for (const [key, value] of Object.entries(optional) as [keyof typeof optional, string | undefined][]) {
    if (value !== undefined) event[key] = value;
  }
  if (score) event.score = score;
  const stations = (text(row.strTVStation) ?? '')
    .split(/[,;|\n]+/)
    .map((station) => station.trim())
    .filter((station) => station !== '');
  if (stations.length > 0) event.broadcasters = stations;

  event.ttl = eventTtl(event, fetchedAt);
  return event;
}

export function createTheSportsDb(fetcher: Fetcher, options: TheSportsDbOptions = {}): TheSportsDb {
  const { base = 'https://www.thesportsdb.com/api/v1/json', now = Date.now } = options;
  // An empty key (an unset environment variable passed straight through) means the default too.
  const apiKey = options.apiKey?.trim() || THESPORTSDB_TEST_KEY;
  const root = `${base.replace(/\/+$/, '')}/${encodeURIComponent(apiKey)}`;

  async function events(endpoint: string, query: Record<string, string>, signal?: AbortSignal): Promise<SportsEvent[]> {
    const response = await fetcher(`${root}/${endpoint}?${new URLSearchParams(query)}`, { headers: { Accept: 'application/json' }, signal });
    if (response.status === 429) throw new Error(`TheSportsDB rate limit reached (HTTP 429) on ${endpoint}`);
    // A retired or mistyped key. The key itself stays out of the message.
    if (response.status === 401 || response.status === 403) throw new Error(`TheSportsDB refused the API key (HTTP ${response.status}) on ${endpoint}`);
    if (response.status !== 200) throw new Error(`TheSportsDB ${endpoint} failed with status ${response.status}`);

    const payload = parseJson(response.body, `TheSportsDB ${endpoint}`);
    // A day or league with nothing on is `{ "events": null }`.
    const rows = isRecord(payload) && Array.isArray(payload.events) ? payload.events : [];
    const fetchedAt = now();
    return rows
      .map((row) => toEvent(row, fetchedAt))
      .filter((event): event is SportsEvent => event !== undefined)
      .sort((a, b) => a.startsAt - b.startsAt);
  }

  return {
    async eventsOnDay(date, sport, signal) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parseUtc(date) === undefined) throw new RangeError(`Date must be YYYY-MM-DD, got "${date}"`);
      const query: Record<string, string> = { d: date };
      if (sport?.trim()) query.s = sport.trim();
      return events('eventsday.php', query, signal);
    },
    async nextLeagueEvents(leagueId, signal) {
      if (!/^\d+$/.test(leagueId)) throw new RangeError(`League id must be numeric, got "${leagueId}"`);
      return events('eventsnextleague.php', { id: leagueId }, signal);
    },
  };
}
