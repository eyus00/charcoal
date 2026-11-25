/**
 * Sports, from @charcoal/content.
 *
 *   live, schedule  a stream directory (PPV): what is on now and next, each with the directory's
 *                   own player page, which plays here in a frame.
 *   channels        the directory's always-on sports channels (framed the same way), and
 *                   iptv-org's public free-to-air channels, which play in Charcoal's own player.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createStreamDirectory,
  loadChannelCatalog,
  type Channel,
  type ChannelStream,
  type StreamDirectory,
  type StreamOption,
} from '@charcoal/content';
import { cacheGet, cacheSet, webFetcher, within } from './content';
import type { JellyResult } from './servers';
import { FREE_TO_AIR_CHANNELS } from './sportsConfig';

const HOUR = 3_600_000;

/** A start time in the viewer's own time zone: "Today", "Fri 27 Nov"; "20:00"; "GMT+5:30". */
export function localStart(ms: number, now = Date.now()): { day: string; time: string; zone: string } {
  const at = new Date(ms);
  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayOf(at) - dayOf(new Date(now))) / (24 * HOUR));
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return { day, time, zone };
}

// ---------- channels ----------

export interface PlayableChannel {
  channel: Channel;
  /** HLS streams a browser can load, best first. */
  streams: ChannelStream[];
}

const CHANNELS_KEY = 'sports-channels:v1';
const CHANNELS_FRESH_MS = 6 * HOUR;

/** HLS, and nothing a page can't send (a Referer). On an https page plain-http streams are already left out. */
const playsInBrowser = (s: ChannelStream) => /\.m3u8(?:[?#]|$)/i.test(s.url) && !Object.keys(s.headers).some((h) => h.toLowerCase() === 'referer');

async function loadChannels(signal?: AbortSignal): Promise<PlayableChannel[]> {
  const secure = location.protocol === 'https:';
  const kept = await cacheGet<{ secure: boolean; list: PlayableChannel[] }>(CHANNELS_KEY);
  if (kept && kept.value.secure === secure && Date.now() - kept.at < CHANNELS_FRESH_MS) return kept.value.list;
  // channels.json and streams.json are large (about 1.7 MB on the wire together); what is kept is a few dozen rows.
  const catalog = await loadChannelCatalog(webFetcher, { categories: ['sports'], httpsOnly: secure, signal });
  const list = catalog.channels
    .filter((c) => FREE_TO_AIR_CHANNELS.has(c.id))
    .map((channel) => ({ channel, streams: catalog.streamsFor(channel.id).filter(playsInBrowser) }))
    .filter((c) => c.streams.length > 0)
    .sort((a, b) => a.channel.name.localeCompare(b.channel.name));
  void cacheSet(CHANNELS_KEY, { secure, list });
  return list;
}

/** The public sports channels that can play here. */
export function useChannels() {
  return useQuery({ queryKey: ['sports-channels'], queryFn: ({ signal }) => loadChannels(signal), staleTime: HOUR, gcTime: 2 * HOUR, retry: 1 });
}

/** "IN" → "India". iptv-org writes the United Kingdom as "UK". */
export function countryName(code: string | undefined): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code === 'UK' ? 'GB' : code) ?? code;
  } catch {
    return code;
  }
}

export type StreamProblem = 'region' | 'offline' | 'unreachable';

const PROBE_MS = 8_000;
/** At most this many of a channel's streams are tried (some channels list twenty mirrors). */
const MAX_STREAMS = 4;

/**
 * Whether a stream's playlist answers from this browser, before the player is handed it. A stream
 * limited to its home country answers 403 or 451; a dead one 404 or nothing; and one whose host
 * doesn't allow web pages to read it fails the same way a dead one does.
 */
export async function probeStream(url: string, signal?: AbortSignal): Promise<StreamProblem | null> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, PROBE_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 403 || res.status === 451) return 'region';
    if (!res.ok) return 'offline';
    return (await res.text()).trimStart().startsWith('#EXTM3U') ? null : 'offline';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

export interface Tuned {
  /** Streams that answered, as sources for the player (best first). Empty when none did. */
  result: Omit<JellyResult, 'via'>;
  /** Why nothing can play, when nothing can. */
  problem: StreamProblem | null;
}

/** Tries a channel's streams and keeps the ones that answer. */
export async function tune(c: PlayableChannel, signal?: AbortSignal): Promise<Tuned> {
  const streams = c.streams.slice(0, MAX_STREAMS);
  const problems = await Promise.all(streams.map((s) => probeStream(s.url, signal)));
  const working = streams.filter((_, i) => problems[i] === null);
  const sources = working.map((s, i) => ({
    id: `iptv-org:${c.channel.id}:${i}`,
    url: s.url,
    type: 'hls',
    quality: /^\d+/.exec(s.quality ?? '')?.[0] ?? 'auto',
    provider: { id: 'iptv-org', name: 'Public channel' },
    delivery: 'direct' as const,
    note: 'Live',
  }));
  // The most telling reason: a regional refusal says more than a mirror that is down.
  const problem = working.length ? null : (['region', 'offline', 'unreachable'] as const).find((p) => problems.includes(p)) ?? 'offline';
  return { result: { responseId: `live:${c.channel.id}`, expiresAt: '', sources, subtitles: [] }, problem };
}

/** In plain words, for the viewer. */
export const PROBLEM_TEXT: Record<StreamProblem, string> = {
  region: 'The broadcaster only shows this channel in its own region, so it can’t be played from where you are.',
  offline: 'The channel’s stream isn’t on the air right now. Some channels only broadcast during events.',
  unreachable: 'The channel’s stream didn’t answer. It may be offline, or it may not allow playing on other websites.',
};

// ---------- the stream directory ----------

const directory = createStreamDirectory(webFetcher);

/**
 * What the directory lists now. It is asked again every minute while a page that shows it is open
 * (its own answer is cached for ten seconds), and a copy kept from the last visit paints first.
 */
const DIRECTORY_QUERY = {
  queryKey: ['sports-directory'],
  queryFn: ({ signal }: { signal?: AbortSignal }): Promise<StreamDirectory> => within(directory.load(signal), 15_000, 'The sports directory'),
  staleTime: 30_000,
};

export function useDirectory() {
  return useQuery({ ...DIRECTORY_QUERY, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 1 });
}


/** The clock, ticking every half minute: an event moves from "coming up" to "live" between refreshes. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** "in 2 h 10 min", "in 25 min", "in 3 days"; '' once it has started. */
export function startsIn(startsAt: number, now: number): string {
  const mins = Math.ceil((startsAt - now) / 60_000);
  if (mins <= 0) return '';
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 ? `in ${hours} h ${mins % 60} min` : `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** What to call one way of watching: "HD · ESPN"; numbered when two would read the same. */
export function optionLabels(options: StreamOption[]): string[] {
  const names = options.map((o) => [o.quality, o.broadcaster].filter(Boolean).join(' · ') || 'Stream');
  return names.map((name, i) => (names.filter((n) => n === name).length > 1 ? `${name} (${names.slice(0, i + 1).filter((n) => n === name).length})` : name));
}

/** "1.2K", "51": how many are watching, as the directory counts them. */
export const viewerCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
