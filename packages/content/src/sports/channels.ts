/**
 * A catalogue of TV channels and their public streams, built from the iptv-org API
 * (https://iptv-org.github.io/api/). Row shapes, checked against the files on 2026-11-24:
 *
 *   channels.json   { id: "DDSports.in", name, alt_names: [], network: string | null, owners: [],
 *                     country: "IN", categories: ["sports"], is_nsfw: boolean,
 *                     launched: "1998-03-18" | null, closed: "2024-07-01" | null,
 *                     replaced_by: string | null, website: string | null }
 *   streams.json    { channel: "DDSports.in" | null, feed: "HD" | null, title, url,
 *                     quality: "1080p" | null, labels: [] | ["Geo-blocked"] | ["Not 24/7"],
 *                     user_agent: string | null, referrer: string | null }
 *   blocklist.json  { channel: "AstroArena.my", reason: "dmca" | "nsfw", ref: url }
 *
 * For tolerance a single `label` string and an `http_referrer` field are read the same way as
 * `labels` and `referrer`.
 *
 * The blocklist names channels removed after a rights holder's request ("dmca") and adult
 * channels ("nsfw"). It is always applied; there is no option to turn it off.
 */

import type { Fetcher } from '@charcoal/provider-sdk';
import { isRecord, parseJson, text } from '../internal/json.js';
import type { Channel, ChannelStream } from './model.js';

export const IPTV_ORG_API = 'https://iptv-org.github.io/api';

export interface ChannelCatalogOptions {
  /** Keep channels in any of these iptv-org categories. Default ['sports']; [] keeps every category. */
  categories?: string[];
  /** Drop plain-http streams instead of flagging them (a page served over https can't play them). Default false. */
  httpsOnly?: boolean;
}

export interface ChannelCatalog {
  /** Channels with at least one usable stream, in the order of channels.json. */
  channels: Channel[];
  /** A channel's streams, least hazardous first, then highest resolution. [] for an unknown id. */
  streamsFor(channelId: string): ChannelStream[];
}

type Hazard = ChannelStream['hazards'][number];

function labelsOf(row: Record<string, unknown>): string[] {
  const labels = Array.isArray(row.labels) ? row.labels : [row.label];
  return labels.map(text).filter((label): label is string => label !== undefined);
}

function toStream(row: Record<string, unknown>, channelId: string): ChannelStream | undefined {
  const url = text(row.url);
  // rtmp://, rtsp:// and srt:// entries exist in the list, but nothing here can play them.
  if (!url || !/^https?:\/\//i.test(url)) return undefined;

  const headers: Record<string, string> = {};
  const userAgent = text(row.user_agent);
  const referrer = text(row.referrer) ?? text(row.http_referrer);
  if (userAgent) headers['User-Agent'] = userAgent;
  if (referrer) headers.Referer = referrer;

  const hazards: Hazard[] = [];
  if (/^http:/i.test(url)) hazards.push('http');
  const labels = labelsOf(row).map((label) => label.toLowerCase());
  if (labels.some((label) => /geo[\s-]?blocked/.test(label))) hazards.push('geo-blocked');
  if (labels.some((label) => /not\s*24\s*\/\s*7/.test(label))) hazards.push('not-24-7');
  if (Object.keys(headers).length > 0) hazards.push('needs-headers');

  const stream: ChannelStream = { channelId, url, headers, hazards };
  const quality = text(row.quality);
  if (quality) stream.quality = quality;
  return stream;
}

/** "1080p" → 1080; unknown → 0. */
function height(stream: ChannelStream): number {
  return Number(/^(\d+)/.exec(stream.quality ?? '')?.[1] ?? 0);
}

/**
 * Builds the catalogue from the three iptv-org files. Leaves out blocklisted channels, closed
 * channels and channels flagged is_nsfw, streams that aren't http(s), and channels left with no
 * stream at all.
 */
export function buildChannelCatalog(channels: unknown[], streams: unknown[], blocklist: unknown[], opts: ChannelCatalogOptions = {}): ChannelCatalog {
  const wanted = new Set((opts.categories ?? ['sports']).map((category) => category.toLowerCase()));
  const blocked = new Set<string>();
  for (const row of blocklist) {
    // A bare channel id is honoured as well as the API's { channel } rows: when in doubt, block.
    const id = isRecord(row) ? text(row.channel) : text(row);
    if (id) blocked.add(id);
  }

  const listed = new Map<string, Channel>();
  for (const row of channels) {
    if (!isRecord(row)) continue;
    const id = text(row.id);
    const name = text(row.name);
    if (!id || !name || blocked.has(id) || listed.has(id)) continue;
    if (text(row.closed) !== undefined || row.is_nsfw === true) continue;
    const categories = Array.isArray(row.categories) ? row.categories.map(text).filter((category): category is string => category !== undefined) : [];
    if (wanted.size > 0 && !categories.some((category) => wanted.has(category.toLowerCase()))) continue;

    const channel: Channel = { id, name, categories };
    const country = text(row.country);
    const network = text(row.network);
    const website = text(row.website);
    if (country) channel.country = country;
    if (network) channel.network = network;
    if (website) channel.website = website;
    listed.set(id, channel);
  }

  const byChannel = new Map<string, ChannelStream[]>();
  for (const row of streams) {
    if (!isRecord(row)) continue;
    const channelId = text(row.channel);
    if (!channelId || !listed.has(channelId)) continue;
    const stream = toStream(row, channelId);
    if (!stream || (opts.httpsOnly && stream.hazards.includes('http'))) continue;
    const siblings = byChannel.get(channelId) ?? [];
    if (siblings.some((sibling) => sibling.url === stream.url)) continue;
    siblings.push(stream);
    byChannel.set(channelId, siblings);
  }
  for (const siblings of byChannel.values()) {
    // Array.prototype.sort is stable: equals keep the order of streams.json.
    siblings.sort((a, b) => a.hazards.length - b.hazards.length || height(b) - height(a));
  }

  return {
    channels: [...listed.values()].filter((channel) => byChannel.has(channel.id)),
    streamsFor: (channelId) => [...(byChannel.get(channelId) ?? [])],
  };
}

export interface LoadChannelCatalogOptions extends ChannelCatalogOptions {
  /** Where the three JSON files live. Default https://iptv-org.github.io/api */
  base?: string;
  signal?: AbortSignal;
}

/**
 * Fetches channels.json, streams.json and blocklist.json and builds the catalogue. If any of the
 * three can't be loaded the whole call fails: a catalogue without its blocklist is never built.
 */
export async function loadChannelCatalog(fetcher: Fetcher, opts: LoadChannelCatalogOptions = {}): Promise<ChannelCatalog> {
  const base = (opts.base ?? IPTV_ORG_API).replace(/\/+$/, '');
  const load = async (file: string): Promise<unknown[]> => {
    const response = await fetcher(`${base}/${file}`, { headers: { Accept: 'application/json' }, signal: opts.signal });
    if (response.status !== 200) throw new Error(`iptv-org ${file} failed with status ${response.status}`);
    const rows = parseJson(response.body, `iptv-org ${file}`);
    if (!Array.isArray(rows)) throw new Error(`iptv-org ${file}: expected a JSON array`);
    return rows;
  };
  const [channels, streams, blocklist] = await Promise.all([load('channels.json'), load('streams.json'), load('blocklist.json')]);
  return buildChannelCatalog(channels, streams, blocklist, opts);
}
