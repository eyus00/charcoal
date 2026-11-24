/**
 * "Where to watch officially": links to the broadcasters that hold the rights to a competition in
 * the viewer's country. Purely data-driven: who holds which rights changes every season and
 * differs per country, so nothing is hard-coded here. The table is supplied by whoever operates
 * the app (see linkouts.test.ts for the shape).
 */

import type { BroadcasterLink, SportsEvent } from './model.js';

/** Keyed by league id or league name, lower-case. */
export type LinkoutTable = Record<string, BroadcasterLink[]>;

/** Ships empty on purpose. */
export const DEFAULT_LINKOUTS: LinkoutTable = {};

/** Upper-case, with the common non-ISO "UK" folded into "GB". */
function regionCode(region: string): string {
  const code = region.trim().toUpperCase();
  return code === 'UK' ? 'GB' : code;
}

/**
 * Links for an event: the viewer's region first, then worldwide ('WW') ones. Looks the event up
 * by leagueId and then by league name. Links to other regions are left out, and so is anything
 * whose URL isn't http(s).
 */
export function resolveLinkouts(table: LinkoutTable, event: SportsEvent, region: string): BroadcasterLink[] {
  const keys = [event.leagueId, event.league].filter((key): key is string => key !== undefined).map((key) => key.trim().toLowerCase());
  const candidates: BroadcasterLink[] = [];
  for (const key of new Set(keys)) {
    // hasOwn: a league called "constructor" must not find Object.prototype's.
    const links: unknown = Object.hasOwn(table, key) ? table[key] : undefined;
    if (Array.isArray(links)) candidates.push(...(links as BroadcasterLink[]));
  }

  const here = regionCode(region);
  const seen = new Set<string>();
  const local: BroadcasterLink[] = [];
  const worldwide: BroadcasterLink[] = [];
  for (const link of candidates) {
    // The table is data someone else maintains: skip rows that aren't links rather than throw.
    if (typeof link?.url !== 'string' || typeof link.region !== 'string' || !/^https?:\/\//i.test(link.url)) continue;
    const linkRegion = regionCode(link.region);
    const bucket = linkRegion === here ? local : linkRegion === 'WW' ? worldwide : undefined;
    if (!bucket || seen.has(`${linkRegion} ${link.url}`)) continue;
    seen.add(`${linkRegion} ${link.url}`);
    bucket.push(link);
  }
  return [...local, ...worldwide];
}
