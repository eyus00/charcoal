/**
 * The sports data model: events from a schedule source, channels and their streams from a channel
 * list, and official broadcaster links. Schedule sources are slow to update a match's status, so
 * "is it live?" is decided from the clock as well (effectiveStatus), and how long a record may be
 * cached follows from that (eventTtl).
 */

import type { LiveMedia } from '@charcoal/provider-sdk';
import { unique } from '../internal/json.js';

export type EventStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface SportsEvent {
  /** "<source>:<id>", e.g. "thesportsdb:2398541". */
  id: string;
  sport: string;
  league?: string;
  leagueId?: string;
  season?: string;
  round?: string;
  title: string;
  home?: string;
  away?: string;
  /** epoch ms UTC */
  startsAt: number;
  /** As the source reported it; see effectiveStatus for the status to show. */
  status: EventStatus;
  score?: { home: number; away: number };
  venue?: string;
  country?: string;
  source: string;
  fetchedAt: number;
  /** seconds this record may be cached, shorter while live */
  ttl: number;
  /** official/broadcaster info from the schedule source, e.g. TV station names */
  broadcasters?: string[];
}

export interface Channel {
  id: string;
  name: string;
  country?: string;
  categories: string[];
  network?: string;
  website?: string;
}

export interface ChannelStream {
  channelId: string;
  url: string;
  quality?: string;
  /** request headers the stream needs */
  headers: Record<string, string>;
  hazards: ('http' | 'geo-blocked' | 'not-24-7' | 'needs-headers')[];
}

export interface BroadcasterLink {
  /** ISO 3166-1 alpha-2 or 'WW' */
  region: string;
  rightsHolder: string;
  url: string;
  free?: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Hours from start to the end of a typical broadcast, breaks and overtime included. Keyed by the
 * sport's lower-case name as TheSportsDB spells it. Deliberately generous: calling a match
 * finished while it is in extra time is worse than polling a finished one a little longer.
 */
const TYPICAL_HOURS = new Map<string, number>([
  ['soccer', 2.25],
  ['futsal', 1.75],
  ['rugby', 2.25],
  ['american football', 3.75],
  ['australian football', 3],
  ['basketball', 2.75],
  ['netball', 1.75],
  ['baseball', 3.75],
  ['ice hockey', 3],
  ['field hockey', 2],
  ['handball', 2],
  ['volleyball', 2.75],
  ['kabaddi', 1.5],
  ['tennis', 4],
  ['table tennis', 1.5],
  ['badminton', 1.5],
  // Sized for a one-day match; a T20 is over in about four hours.
  ['cricket', 8.5],
  ['golf', 6],
  ['cycling', 6],
  ['motorsport', 3],
  ['fighting', 5],
  ['darts', 4],
  ['snooker', 4],
  ['esports', 4],
]);
const DEFAULT_HOURS = 3;

/** How long an event of this sport usually lasts, in ms. Unknown sports get three hours. */
export function typicalDuration(sport: string): number {
  return (TYPICAL_HOURS.get(sport.trim().toLowerCase()) ?? DEFAULT_HOURS) * HOUR;
}

/**
 * Derives live/finished from the clock when the source's status is stale:
 * scheduled && now >= startsAt → 'live'; live && now > startsAt + typicalDuration(sport) → 'finished'.
 * The two steps chain, so an event the source still calls scheduled a day later reads as finished.
 * Finished, postponed and cancelled are the source's call and are never overridden.
 */
export function effectiveStatus(event: SportsEvent, now: number): EventStatus {
  let status = event.status;
  if (status === 'scheduled' && now >= event.startsAt) status = 'live';
  if (status === 'live' && now > event.startsAt + typicalDuration(event.sport)) status = 'finished';
  return status;
}

/**
 * Cache TTL in seconds: 30 while live, 300 within 2 h of start, 3600 otherwise, 86400 once finished.
 *
 * "Finished" here means the source said so. An event that is only finished by the clock still has
 * its result to come, so it stays at 300 until a day after the start; after that the source is
 * assumed to have nothing more to say (86400).
 */
export function eventTtl(event: SportsEvent, now: number): number {
  if (event.status === 'finished') return 86_400;
  const status = effectiveStatus(event, now);
  if (status === 'live') return 30;
  if (status === 'finished') return now - event.startsAt < 24 * HOUR ? 300 : 86_400;
  return Math.abs(event.startsAt - now) <= 2 * HOUR ? 300 : 3600;
}

/** A LiveMedia (SDK type) for an event, so the shared provider engine can be asked for streams. */
export function eventToMedia(event: SportsEvent): LiveMedia {
  const media: LiveMedia = { kind: 'live', ids: { event: event.id }, title: event.title, startsAt: event.startsAt };
  if (event.home && event.away) {
    // The two spellings sources use for a fixture: "Home vs Away" and (North America) "Away @ Home".
    const names = unique([`${event.home} vs ${event.away}`, `${event.away} @ ${event.home}`]).filter((name) => name !== event.title);
    if (names.length > 0) media.altTitles = names;
  }
  const year = new Date(event.startsAt).getUTCFullYear();
  if (Number.isFinite(year)) media.year = year;
  return media;
}

/** A LiveMedia (SDK type) for a channel. */
export function channelToMedia(channel: Channel): LiveMedia {
  return { kind: 'live', ids: { channel: channel.id }, title: channel.name, channel: channel.name };
}
