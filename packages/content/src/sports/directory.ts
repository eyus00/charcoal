/**
 * Live events and channels from a stream directory: a site that lists what is on and gives, for
 * each entry, the address of its own player page.
 *
 * The directory read here is PPV's `GET /api/streams` (checked 2026-11-25): it answers any web
 * page (`Access-Control-Allow-Origin: *`, cached for ten seconds) with every stream it carries,
 * grouped by sport:
 *
 *   { success, timestamp, streams: [ { category "Football", id, always_live, streams: [ {
 *       id 18172, name "Sabah FK vs. Barcelona", tag "Champions League",
 *       source_tag "HD | Champions League", poster "https://…jpg", uri_name "sabah-fk-vs-barcelona",
 *       starts_at 1795628700, ends_at 1795637700 (seconds, UTC; 0 for a channel), always_live 0 | 1,
 *       locale "en", iframe "https://<player host>/embed/<uri_name>", viewers "51",
 *       substreams: [ { id, name, tag, source_tag "SD | …", uri_name, locale, iframe } ] } ] } ] }
 *
 * It gives player pages only, never a stream address, so an entry plays in a frame. The player
 * host changes over time; it is always taken from the response, never written here.
 *
 * A category that is itself marked always_live ("24/7 Streams") holds entertainment marathons,
 * not sport, and is left out. A channel inside a sport's category (NFL Network) is kept.
 */

import type { Fetcher } from '@charcoal/provider-sdk';
import { finite, integer, isRecord, parseJson, text } from '../internal/json.js';

export const STREAM_DIRECTORY_SOURCE = 'ppv';

/**
 * Where the directory answers. The first is the one checked; the second is the alternative the
 * site's own pages name, tried when the first does not answer.
 */
export const STREAM_DIRECTORY_BASES = ['https://api.ppv.st', 'https://api.ppv.cx'] as const;

/** One way to watch an entry: a player page to put in a frame. */
export interface StreamOption {
  id: string;
  /** "HD", "SD"; undefined when the directory does not say. */
  quality?: string;
  /** Whose broadcast it is, as the directory names it: "ESPN", "Sky Sports". */
  broadcaster?: string;
  /** ISO 639-1 language of the commentary, when given. */
  language?: string;
  /** An https address of the directory's own player page. */
  embed: string;
}

/** Something to watch: an event with a start and an end, or a channel that is always on. */
export interface LiveListing {
  /** Stable and URL-safe within the directory (its own number for the entry). */
  id: string;
  title: string;
  /** The sport, as the directory groups it: "Football", "Ice Hockey". */
  sport: string;
  /** The competition: "Premier League", "NFL". Empty for a channel. */
  league: string;
  /** A channel has no start or end. */
  channel: boolean;
  /** Unix milliseconds; 0 for a channel. */
  startsAt: number;
  endsAt: number;
  /** An https image, when the directory has one. */
  poster?: string;
  /** People watching according to the directory; 0 when it does not say. */
  viewers: number;
  /** At least one, best first. */
  options: StreamOption[];
}

export interface StreamDirectory {
  listings: LiveListing[];
  /** The sports that have at least one listing, in the directory's order. */
  sports: string[];
  fetchedAt: number;
}

export type ListingState = 'live' | 'upcoming' | 'ended';

/** Streams usually open a little before the start; from then until the end an event counts as live. */
export const OPENS_BEFORE_MS = 10 * 60_000;

export function listingState(l: Pick<LiveListing, 'channel' | 'startsAt' | 'endsAt'>, now: number): ListingState {
  if (l.channel) return 'live';
  if (now >= l.endsAt) return 'ended';
  return now >= l.startsAt - OPENS_BEFORE_MS ? 'live' : 'upcoming';
}

const MAX_TEXT = 160;
const SAFE_ID = /^[\w.-]{1,120}$/;

/** An https address without credentials, or undefined. Nothing else is ever put in a frame or an image. */
function httpsUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const short = (value: unknown) => text(value)?.slice(0, MAX_TEXT);

/** "HD | NFL Network (ESPN)" → quality "HD", broadcaster "NFL Network (ESPN)". */
function readSourceTag(tag: string | undefined): Pick<StreamOption, 'quality' | 'broadcaster'> {
  if (!tag) return {};
  const [first, ...rest] = tag.split('|').map((p) => p.trim());
  if (!rest.length) return /^(?:u?hd|sd|fhd|4k|\d{3,4}p)$/i.test(first) ? { quality: first.toUpperCase() } : { broadcaster: first };
  return { quality: first.toUpperCase() || undefined, broadcaster: rest.join(' | ') || undefined };
}

function readOption(row: unknown): StreamOption | undefined {
  if (!isRecord(row)) return undefined;
  const embed = httpsUrl(row.iframe);
  const id = text(row.uri_name) ?? String(integer(row.id) ?? '');
  if (!embed || !id) return undefined;
  const language = text(row.locale)?.toLowerCase();
  return { id, ...readSourceTag(short(row.source_tag)), ...(language && /^[a-z]{2}$/.test(language) ? { language } : {}), embed };
}

function readListing(row: unknown, sport: string): LiveListing | undefined {
  if (!isRecord(row)) return undefined;
  const title = short(row.name);
  // The directory's number: its uri_name has slashes in it ("ucl/2026-11-25/sab-bar").
  const slug = text(row.uri_name);
  const id = integer(row.id) !== undefined ? String(integer(row.id)) : slug && SAFE_ID.test(slug) ? slug : undefined;
  if (!title || !id) return undefined;
  const seen = new Set<string>();
  const options = [row, ...(Array.isArray(row.substreams) ? row.substreams : [])]
    .map(readOption)
    .filter((o): o is StreamOption => !!o && !seen.has(o.embed) && !!seen.add(o.embed));
  if (!options.length) return undefined;
  const startsAt = (integer(row.starts_at) ?? 0) * 1000;
  const endsAt = (integer(row.ends_at) ?? 0) * 1000;
  const channel = !!integer(row.always_live) || startsAt <= 0;
  // An event with a start but no usable end is given three hours.
  const end = channel ? 0 : endsAt > startsAt ? endsAt : startsAt + 3 * 3_600_000;
  const league = short(row.tag) ?? '';
  return {
    id,
    title,
    sport,
    league: channel ? '' : league,
    channel,
    startsAt: channel ? 0 : startsAt,
    endsAt: end,
    ...(httpsUrl(row.poster) ? { poster: httpsUrl(row.poster) } : {}),
    viewers: Math.max(0, Math.floor(finite(row.viewers) ?? 0)),
    options,
  };
}

/** Reads a response body. Rows that cannot be shown or framed safely are dropped, not guessed at. */
export function parseStreamDirectory(json: unknown, fetchedAt = Date.now()): StreamDirectory {
  if (!isRecord(json) || !Array.isArray(json.streams)) throw new Error(`${STREAM_DIRECTORY_SOURCE}: the response has no list of streams`);
  const listings: LiveListing[] = [];
  const ids = new Set<string>();
  for (const category of json.streams) {
    if (!isRecord(category) || !Array.isArray(category.streams)) continue;
    // true or 1: a whole category of always-on entertainment, not a sport.
    if (category.always_live === true || category.always_live === 1) continue;
    const sport = short(category.category);
    if (!sport) continue;
    for (const row of category.streams) {
      const listing = readListing(row, sport);
      if (!listing || ids.has(listing.id)) continue;
      ids.add(listing.id);
      listings.push(listing);
    }
  }
  return { listings, sports: [...new Set(listings.map((l) => l.sport))], fetchedAt };
}

export interface StreamDirectoryOptions {
  /** Addresses to ask, in order. Default STREAM_DIRECTORY_BASES. */
  bases?: readonly string[];
  now?: () => number;
}

/** Asks each address in turn and returns the first usable answer. */
export function createStreamDirectory(fetcher: Fetcher, options: StreamDirectoryOptions = {}) {
  const bases = options.bases ?? STREAM_DIRECTORY_BASES;
  const now = options.now ?? Date.now;
  return {
    async load(signal?: AbortSignal): Promise<StreamDirectory> {
      let last: unknown = new Error(`${STREAM_DIRECTORY_SOURCE}: no address to ask`);
      for (const base of bases) {
        try {
          const res = await fetcher(`${base}/api/streams`, { headers: { Accept: 'application/json' }, signal });
          if (!res.ok) throw new Error(`${STREAM_DIRECTORY_SOURCE}: answered ${res.status}`);
          const json = parseJson(res.body, STREAM_DIRECTORY_SOURCE);
          if (isRecord(json) && json.success === false) throw new Error(`${STREAM_DIRECTORY_SOURCE}: the directory reported a failure`);
          return parseStreamDirectory(json, now());
        } catch (e) {
          if (signal?.aborted) throw e;
          last = e;
        }
      }
      throw last;
    },
  };
}

/** Live first (most watched first), then what starts soonest; ended events are dropped. */
export function orderListings(listings: LiveListing[], now: number): { live: LiveListing[]; upcoming: LiveListing[]; channels: LiveListing[] } {
  const events = listings.filter((l) => !l.channel);
  return {
    live: events.filter((l) => listingState(l, now) === 'live').sort((a, b) => b.viewers - a.viewers || a.startsAt - b.startsAt || a.title.localeCompare(b.title)),
    upcoming: events.filter((l) => listingState(l, now) === 'upcoming').sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title)),
    channels: listings.filter((l) => l.channel).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

/** Whether a listing matches what was typed: every word, in its title, competition or sport. */
export function matchesListing(l: LiveListing, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${l.title} ${l.league} ${l.sport} ${l.options.map((o) => o.broadcaster ?? '').join(' ')}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
