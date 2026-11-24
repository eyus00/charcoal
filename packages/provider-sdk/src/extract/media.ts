/**
 * Media helpers for extraction: finding stream URLs, frames and <video> elements in a page, reading
 * HLS and DASH manifests, and recognising quality labels and expiring URLs.
 */

import type { StreamType } from '../types.js';
import { attr, parseHtml } from './html.js';
import type { HtmlDocument, HtmlNode } from './html.js';

// ---------- URLs ----------

/** Absolute URL or undefined (never throws). Handles protocol-relative `//host/x` using the base's scheme. */
export function resolveUrl(url: string, base?: string): string | undefined {
  if (typeof url !== 'string') return undefined;
  const value = url.trim();
  if (value === '') return undefined;
  try {
    // Already absolute: a broken base must not get in the way.
    return new URL(value).href;
  } catch {
    // Relative.
  }
  if (base) {
    try {
      return new URL(value, base).href;
    } catch {
      // No usable base.
    }
  }
  if (value.startsWith('//')) {
    try {
      return new URL(`https:${value}`).href;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

type MediaType = Exclude<StreamType, 'frame'>;

const EXTENSION_TYPES = new Map<string, MediaType>([
  ['m3u8', 'hls'],
  ['mpd', 'dash'],
  ['mp4', 'mp4'],
  ['m4v', 'mp4'],
  ['mkv', 'mkv'],
  ['webm', 'webm'],
]);

const CONTENT_TYPES = new Map<string, MediaType>([
  ['application/vnd.apple.mpegurl', 'hls'],
  ['application/x-mpegurl', 'hls'],
  ['audio/mpegurl', 'hls'],
  ['audio/x-mpegurl', 'hls'],
  ['application/dash+xml', 'dash'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/x-matroska', 'mkv'],
]);

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
}

function typeFromPath(url: string): MediaType | undefined {
  let end = url.length;
  for (let i = 0; i < end; i++) {
    const c = url.charCodeAt(i);
    if (c === 63 /* ? */ || c === 35 /* # */) end = i;
  }
  // Leave "scheme://host" out, so that a host called "cdn.mp4" is not an extension.
  const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(url.slice(0, end));
  const path = url.slice(origin === null ? 0 : origin[0].length, end);
  const dot = path.lastIndexOf('.');
  if (dot < 0 || path.indexOf('/', dot) >= 0) return undefined;
  return EXTENSION_TYPES.get(path.slice(dot + 1).toLowerCase());
}

/** True when a body opens with an `<MPD` element, after an optional XML declaration and comments. */
function startsWithMpd(head: string): boolean {
  let i = 0;
  for (;;) {
    while (isSpace(head.charCodeAt(i))) i++;
    if (head.startsWith('<?', i)) {
      const end = head.indexOf('?>', i + 2);
      if (end < 0) return false;
      i = end + 2;
    } else if (head.startsWith('<!--', i)) {
      const end = head.indexOf('-->', i + 4);
      if (end < 0) return false;
      i = end + 3;
    } else {
      break;
    }
  }
  return /^<(?:[A-Za-z_][\w.-]*:)?MPD(?:[\s>/]|$)/.test(head.slice(i, i + 80));
}

/** 'hls' for .m3u8, 'dash' for .mpd, 'mp4' (.mp4/.m4v), 'mkv', 'webm' by URL path; else by content type (`application/vnd.apple.mpegurl`, `application/x-mpegurl`, `application/dash+xml`, `video/mp4`, `video/webm`, `video/x-matroska`); else by the start of the body (`#EXTM3U` → hls, `<MPD` or `<?xml` followed by `<MPD` → dash); else undefined. */
export function sniffStreamType(url: string, contentType?: string, bodyStart?: string): StreamType | undefined {
  const byPath = typeof url === 'string' ? typeFromPath(url) : undefined;
  if (byPath !== undefined) return byPath;
  if (contentType) {
    const byHeader = CONTENT_TYPES.get(contentType.split(';')[0].trim().toLowerCase());
    if (byHeader !== undefined) return byHeader;
  }
  if (bodyStart) {
    // trimStart() also removes a byte-order mark.
    const head = bodyStart.slice(0, 4096).trimStart();
    if (head.startsWith('#EXTM3U')) return 'hls';
    if (startsWithMpd(head)) return 'dash';
  }
  return undefined;
}

// ---------- media URLs in free text ----------

const BACKSLASH = 92;
const SLASH = 47;
const MAX_URL_LENGTH = 8192;
const MAX_NESTED_URLS = 8;
const MEDIA_EXTENSION = '(?:m3u8|mpd|mp4|m4v|mkv|webm)';
const ENDS_WITH_MEDIA = new RegExp(`\\.${MEDIA_EXTENSION}$`, 'i');
/** A media path with something stuck to its end: `a.mp4)`, `a.mp4,[720p]`, `a.mp4.` */
const MEDIA_THEN_JUNK = new RegExp(`^(.+?\\.${MEDIA_EXTENSION})(?:[),;|\\]}\\[({*!]|\\.$)`, 'i');
const AMPERSAND_ENTITY = /&(?:amp|#0*38|#x0*26);/gi;
/** An HTML-escaped quote or angle bracket: where a URL inside an attribute value ends. */
const DELIMITER_ENTITY = /^&(?:quot|apos|lt|gt|#0*(?:34|39|60|62)|#x0*(?:22|27|3c|3e));/i;

interface Escape {
  code: number;
  next: number;
}

/** A backslash escape that can occur inside a URL written in a JS or JSON string: `\/`, `\\/`, `/`, `\x2F`. */
function readEscape(text: string, at: number): Escape | undefined {
  let i = at;
  while (text.charCodeAt(i) === BACKSLASH) i++;
  const c = text.charCodeAt(i);
  if (c === SLASH) return { code: SLASH, next: i + 1 };
  if (c === 117 /* u */) {
    const hex = text.slice(i + 1, i + 5);
    if (/^[0-9a-fA-F]{4}$/.test(hex)) return { code: parseInt(hex, 16), next: i + 5 };
  } else if (c === 120 /* x */) {
    const hex = text.slice(i + 1, i + 3);
    if (/^[0-9a-fA-F]{2}$/.test(hex)) return { code: parseInt(hex, 16), next: i + 3 };
  }
  return undefined;
}

/** Index after the two slashes of `scheme://`, plain or escaped, or -1. */
function pastSlashes(text: string, at: number): number {
  let i = at;
  for (let n = 0; n < 2; n++) {
    if (text.charCodeAt(i) === SLASH) {
      i++;
    } else {
      const escape = text.charCodeAt(i) === BACKSLASH ? readEscape(text, i) : undefined;
      if (escape === undefined || escape.code !== SLASH) return -1;
      i = escape.next;
    }
  }
  return i;
}

/** Does `http://` or `https://` (any case, slashes plain or escaped) start at `at`? */
function startsUrl(text: string, at: number): boolean {
  if ((text.charCodeAt(at) | 32) !== 104 || (text.charCodeAt(at + 1) | 32) !== 116 || (text.charCodeAt(at + 2) | 32) !== 116 || (text.charCodeAt(at + 3) | 32) !== 112) return false;
  let i = at + 4;
  if ((text.charCodeAt(i) | 32) === 115) i++;
  return text.charCodeAt(i) === 58 /* : */ && pastSlashes(text, i + 1) >= 0;
}

function endsUrl(c: number): boolean {
  return c <= 32 || c === 34 /* " */ || c === 39 /* ' */ || c === 96 /* ` */ || c === 60 /* < */ || c === 62 /* > */ || c === BACKSLASH || c === 127;
}

/** Characters after which a second URL is the next item of a list rather than part of the first: `a.mp4,https://…`, `[720p]https://…`. */
function separatesUrls(c: number): boolean {
  return c === 44 /* , */ || c === 59 /* ; */ || c === 124 /* | */ || c === 93 /* ] */ || c === 41 /* ) */ || c === 125 /* } */;
}

/** The media URL in an unescaped candidate, trailing punctuation removed; undefined when its path does not end in a media extension. */
function cleanMediaUrl(candidate: string): string | undefined {
  const text = candidate.includes('&') ? candidate.replace(AMPERSAND_ENTITY, '&') : candidate;
  let cut = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 63 /* ? */ || c === 35 /* # */) {
      cut = i;
      break;
    }
  }
  const path = cut < 0 ? text : text.slice(0, cut);
  let url: string;
  if (ENDS_WITH_MEDIA.test(path)) {
    // Punctuation after a query string belongs to the surrounding prose or code, not to the URL.
    let end = text.length;
    while (end > path.length && '),;.'.includes(text[end - 1])) end--;
    url = text.slice(0, end);
  } else {
    const match = MEDIA_THEN_JUNK.exec(path);
    if (match === null) return undefined;
    url = match[1];
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname === '') return undefined;
  } catch {
    return undefined;
  }
  return url;
}

/** Media URLs anywhere in a text (HTML, JS, JSON), including JSON-escaped ones (`https:\/\/…`) and HTML-escaped `&amp;`. De-duplicated, in order of appearance, each with its sniffed type. Only http(s) URLs whose path ends in .m3u8/.mpd/.mp4/.m4v/.mkv/.webm (before `?` or `#`). */
export function findMediaUrls(text: string): { url: string; type: StreamType }[] {
  const found: { url: string; type: StreamType }[] = [];
  if (typeof text !== 'string') return found;
  const seen = new Set<string>();
  const length = text.length;
  const scheme = /https?:/gi;
  let from = 0;
  for (;;) {
    scheme.lastIndex = from;
    const match = scheme.exec(text);
    if (match === null) break;
    let i = pastSlashes(text, match.index + match[0].length);
    if (i < 0) {
      from = match.index + match[0].length;
      continue;
    }

    // Read to the end of the URL, undoing escapes on the way.
    let url = `${match[0].toLowerCase()}//`;
    /** Offsets in `url` where another URL starts (`…?src=https://…`). */
    const nested: number[] = [];
    let last = SLASH;
    let tooLong = false;
    while (i < length) {
      let c = text.charCodeAt(i);
      let next = i + 1;
      if (c === BACKSLASH) {
        const escape = readEscape(text, i);
        if (escape === undefined) break;
        c = escape.code;
        next = escape.next;
      } else if (c === 38 /* & */ && DELIMITER_ENTITY.test(text.slice(i, i + 10))) {
        break;
      } else if ((c | 32) === 104 && startsUrl(text, i)) {
        if (separatesUrls(last)) break;
        if (nested.length < MAX_NESTED_URLS) nested.push(url.length);
      }
      if (endsUrl(c)) break;
      if (url.length >= MAX_URL_LENGTH) {
        tooLong = true;
        break;
      }
      url += String.fromCharCode(c);
      last = c;
      i = next;
    }
    from = i;
    if (tooLong) continue;

    // The whole thing if it is a media URL; otherwise a media URL carried inside it.
    for (let n = -1; n < nested.length; n++) {
      const media = cleanMediaUrl(n < 0 ? url : url.slice(nested[n]));
      if (media === undefined) continue;
      const type = typeFromPath(media);
      if (type !== undefined && !seen.has(media)) {
        seen.add(media);
        found.push({ url: media, type });
      }
      break;
    }
  }
  return found;
}

// ---------- elements ----------

/** Schemes that name nothing a provider could fetch or show. */
const NOT_A_LOCATION = /^(?:about|javascript|data|blob|mailto|tel):/i;

/** What relative URLs in the page resolve against: its <base href>, else the URL it was fetched from. */
function pageBase(doc: HtmlDocument, baseUrl: string | undefined): string | undefined {
  const href = attr(doc.select('base[href]'), 'href');
  return (href === undefined ? undefined : resolveUrl(href, baseUrl)) ?? baseUrl;
}

/** A URL attribute made absolute. Left as written when it is relative and there is nothing to resolve it against. */
function urlAttr(node: HtmlNode, name: string, base: string | undefined): string | undefined {
  const value = attr(node, name)?.trim();
  if (!value || NOT_A_LOCATION.test(value)) return undefined;
  return resolveUrl(value, base) ?? (base === undefined ? value : undefined);
}

/** `<iframe>` and `<embed>` sources (also `data-src`), resolved against baseUrl, de-duplicated, skipping `about:blank` and `javascript:`. */
export function findIframes(html: string, baseUrl?: string): { url: string; attrs: Record<string, string> }[] {
  const found: { url: string; attrs: Record<string, string> }[] = [];
  if (typeof html !== 'string' || !/<(?:iframe|embed)/i.test(html)) return found;
  const doc = parseHtml(html);
  const base = pageBase(doc, baseUrl);
  const seen = new Set<string>();
  for (const frame of doc.selectAll('iframe, embed')) {
    for (const name of ['src', 'data-src']) {
      const url = urlAttr(frame, name, base);
      if (url === undefined || seen.has(url)) continue;
      seen.add(url);
      found.push({ url, attrs: { ...frame.attrs } });
    }
  }
  return found;
}

/** `<video src>`, `<source src type>` and `<track kind src srclang label>` elements. */
export function findVideoElements(
  html: string,
  baseUrl?: string,
): { sources: { url: string; type?: StreamType; label?: string }[]; tracks: { url: string; kind: string; lang?: string; label?: string }[] } {
  const sources: { url: string; type?: StreamType; label?: string }[] = [];
  const tracks: { url: string; kind: string; lang?: string; label?: string }[] = [];
  if (typeof html !== 'string' || !/<(?:video|source|track)/i.test(html)) return { sources, tracks };
  const doc = parseHtml(html);
  const base = pageBase(doc, baseUrl);
  const seenSources = new Set<string>();
  const seenTracks = new Set<string>();
  for (const element of doc.selectAll('video[src], source[src], track[src]')) {
    const url = urlAttr(element, 'src', base);
    if (url === undefined) continue;
    if (element.tag === 'track') {
      if (seenTracks.has(url)) continue;
      seenTracks.add(url);
      const track: { url: string; kind: string; lang?: string; label?: string } = { url, kind: attr(element, 'kind')?.trim().toLowerCase() || 'subtitles' };
      const lang = attr(element, 'srclang')?.trim();
      if (lang) track.lang = lang;
      const label = attr(element, 'label')?.trim();
      if (label) track.label = label;
      tracks.push(track);
      continue;
    }
    // A <source> can also belong to an <audio> or a <picture>.
    if (element.tag === 'source' && (element.parent?.tag === 'audio' || element.parent?.tag === 'picture')) continue;
    if (seenSources.has(url)) continue;
    seenSources.add(url);
    const source: { url: string; type?: StreamType; label?: string } = { url };
    const type = sniffStreamType(url, attr(element, 'type'));
    if (type !== undefined) source.type = type;
    const label = (attr(element, 'label') ?? attr(element, 'title') ?? attr(element, 'res') ?? attr(element, 'size') ?? attr(element, 'data-quality'))?.trim();
    if (label) source.label = label;
    sources.push(source);
  }
  return { sources, tracks };
}

// ---------- HLS ----------

export interface HlsVariant {
  url: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  codecs?: string;
  frameRate?: number;
  audioGroup?: string;
}

export interface HlsRendition {
  type: 'AUDIO' | 'SUBTITLES' | 'CLOSED-CAPTIONS' | 'VIDEO';
  groupId: string;
  name?: string;
  language?: string;
  url?: string;
  isDefault: boolean;
}

export interface HlsPlaylist {
  kind: 'master' | 'media';
  /** Master only, in file order. */
  variants: HlsVariant[];
  /** Master only. */
  renditions: HlsRendition[];
  /** Media only. */
  segments: number;
  targetDuration?: number;
  totalDuration?: number;
  /** Media only: no #EXT-X-ENDLIST. */
  live: boolean;
  /** Media only: #EXT-X-KEY METHOD other than NONE, e.g. 'AES-128' or 'SAMPLE-AES'. */
  encryption?: string;
  /** The first media-segment URL (media playlists), resolved. */
  firstSegment?: string;
  /** Highest variant height (master), if any. */
  maxHeight?: number;
}

/** `KEY=value,KEY="quoted, with commas"` → a map with upper-case keys and unquoted values. */
function parseAttributeList(input: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const length = input.length;
  let i = 0;
  while (i < length) {
    const equals = input.indexOf('=', i);
    if (equals < 0) break;
    const before = input.slice(i, equals);
    const key = before
      .slice(before.lastIndexOf(',') + 1)
      .trim()
      .toUpperCase();
    let value: string;
    i = equals + 1;
    while (input[i] === ' ') i++;
    if (input[i] === '"') {
      const close = input.indexOf('"', i + 1);
      value = input.slice(i + 1, close < 0 ? length : close);
      i = close < 0 ? length : close + 1;
    } else {
      const comma = input.indexOf(',', i);
      value = input.slice(i, comma < 0 ? length : comma).trim();
      i = comma < 0 ? length : comma;
    }
    if (key !== '' && !attributes.has(key)) attributes.set(key, value);
  }
  return attributes;
}

const RENDITION_TYPES = new Set(['AUDIO', 'SUBTITLES', 'CLOSED-CAPTIONS', 'VIDEO']);

/** Throws Error('Not an HLS playlist') when the text doesn't start with #EXTM3U (after BOM/whitespace). Attribute lists must be parsed properly (quoted values may contain commas). Relative URLs are resolved against baseUrl. */
export function parseHls(text: string, baseUrl: string): HlsPlaylist {
  // trimStart() also removes a byte-order mark.
  const body = typeof text === 'string' ? text.trimStart() : '';
  if (!body.startsWith('#EXTM3U')) throw new Error('Not an HLS playlist');
  const absolute = (uri: string): string => resolveUrl(uri, baseUrl) ?? uri;

  const variants: HlsVariant[] = [];
  const renditions: HlsRendition[] = [];
  /** The #EXT-X-STREAM-INF whose URI line has not come yet. */
  let pending: Map<string, string> | undefined;
  let sawStreamInf = false;
  let sawOtherMasterTag = false;
  let sawMediaTag = false;
  let segments = 0;
  let firstSegment: string | undefined;
  let totalDuration = 0;
  let timed = false;
  let targetDuration: number | undefined;
  let ended = false;
  let encryption: string | undefined;

  for (const raw of body.split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.charCodeAt(0) !== 35 /* # */) {
      if (pending !== undefined) {
        const variant: HlsVariant = { url: absolute(line) };
        const bandwidth = parseInt(pending.get('BANDWIDTH') ?? '', 10);
        if (Number.isFinite(bandwidth)) variant.bandwidth = bandwidth;
        const resolution = /^(\d+)\s*x\s*(\d+)$/i.exec(pending.get('RESOLUTION') ?? '');
        if (resolution !== null) {
          variant.width = parseInt(resolution[1], 10);
          variant.height = parseInt(resolution[2], 10);
        }
        const codecs = pending.get('CODECS');
        if (codecs) variant.codecs = codecs;
        const frameRate = parseFloat(pending.get('FRAME-RATE') ?? '');
        if (Number.isFinite(frameRate)) variant.frameRate = frameRate;
        const audioGroup = pending.get('AUDIO');
        if (audioGroup) variant.audioGroup = audioGroup;
        variants.push(variant);
        pending = undefined;
      } else {
        segments++;
        if (firstSegment === undefined) firstSegment = absolute(line);
      }
      continue;
    }
    if (!line.startsWith('#EXT')) continue;
    const colon = line.indexOf(':');
    const tag = colon < 0 ? line : line.slice(0, colon);
    const rest = colon < 0 ? '' : line.slice(colon + 1);
    switch (tag) {
      case '#EXT-X-STREAM-INF':
        sawStreamInf = true;
        pending = parseAttributeList(rest);
        break;
      case '#EXT-X-I-FRAME-STREAM-INF':
        sawOtherMasterTag = true;
        break;
      case '#EXT-X-MEDIA': {
        sawOtherMasterTag = true;
        const attributes = parseAttributeList(rest);
        const type = (attributes.get('TYPE') ?? '').toUpperCase();
        if (!RENDITION_TYPES.has(type)) break;
        const rendition: HlsRendition = { type: type as HlsRendition['type'], groupId: attributes.get('GROUP-ID') ?? '', isDefault: attributes.get('DEFAULT')?.toUpperCase() === 'YES' };
        const name = attributes.get('NAME');
        if (name) rendition.name = name;
        const language = attributes.get('LANGUAGE');
        if (language) rendition.language = language;
        const uri = attributes.get('URI');
        if (uri) rendition.url = absolute(uri);
        renditions.push(rendition);
        break;
      }
      case '#EXTINF': {
        sawMediaTag = true;
        const duration = parseFloat(rest);
        if (Number.isFinite(duration)) {
          totalDuration += duration;
          timed = true;
        }
        break;
      }
      case '#EXT-X-TARGETDURATION': {
        sawMediaTag = true;
        const value = parseFloat(rest);
        if (Number.isFinite(value)) targetDuration = value;
        break;
      }
      case '#EXT-X-ENDLIST':
        ended = true;
        break;
      case '#EXT-X-KEY': {
        const method = parseAttributeList(rest).get('METHOD');
        if (encryption === undefined && method && method.toUpperCase() !== 'NONE') encryption = method;
        break;
      }
    }
  }

  if (sawStreamInf || (sawOtherMasterTag && !sawMediaTag && segments === 0)) {
    const playlist: HlsPlaylist = { kind: 'master', variants, renditions, segments: 0, live: false };
    let maxHeight: number | undefined;
    for (const variant of variants) {
      if (variant.height !== undefined && (maxHeight === undefined || variant.height > maxHeight)) maxHeight = variant.height;
    }
    if (maxHeight !== undefined) playlist.maxHeight = maxHeight;
    return playlist;
  }
  const playlist: HlsPlaylist = { kind: 'media', variants: [], renditions: [], segments, live: !ended };
  if (targetDuration !== undefined) playlist.targetDuration = targetDuration;
  if (timed) playlist.totalDuration = Math.round(totalDuration * 1000) / 1000;
  if (encryption !== undefined) playlist.encryption = encryption;
  if (firstSegment !== undefined) playlist.firstSegment = firstSegment;
  return playlist;
}

// ---------- DASH ----------

export interface DashRepresentation {
  id?: string;
  mimeType?: string;
  contentType?: 'video' | 'audio' | 'text';
  codecs?: string;
  width?: number;
  height?: number;
  bandwidth?: number;
  lang?: string;
}

export interface DashManifest {
  type: 'static' | 'dynamic';
  durationSeconds?: number;
  representations: DashRepresentation[];
  /** Any <ContentProtection> element present. */
  protected: boolean;
  maxHeight?: number;
}

const ISO_DURATION = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
/** Seconds in a year, month, week, day, hour, minute and second (a year is 365 days, a month 30). */
const ISO_UNITS = [31536000, 2592000, 604800, 86400, 3600, 60, 1];

/** "PT1H2M3.5S" → 3723.5. */
function isoDuration(value: string | undefined): number | undefined {
  const match = ISO_DURATION.exec((value ?? '').trim().toUpperCase());
  if (match === null) return undefined;
  let seconds = 0;
  let any = false;
  for (let i = 0; i < ISO_UNITS.length; i++) {
    if (match[i + 1] === undefined) continue;
    seconds += parseFloat(match[i + 1]) * ISO_UNITS[i];
    any = true;
  }
  return any ? Math.round(seconds * 1000) / 1000 : undefined;
}

/** "dash:Representation" → "representation" (tags are already lower-case). */
function localName(tag: string): string {
  const colon = tag.lastIndexOf(':');
  return colon < 0 ? tag : tag.slice(colon + 1);
}

function wholeNumber(value: string | undefined): number | undefined {
  if (value === undefined || !/^\s*\d+\s*$/.test(value)) return undefined;
  return parseInt(value, 10);
}

function dashRepresentation(element: HtmlNode): DashRepresentation {
  let set: HtmlNode | null = element.parent;
  while (set !== null && localName(set.tag) !== 'adaptationset') set = set.parent;
  /** The Representation's own attribute, else the one its AdaptationSet gives every Representation. */
  const inherited = (name: string): string | undefined => attr(element, name) ?? attr(set, name);

  const representation: DashRepresentation = {};
  const id = attr(element, 'id');
  if (id !== undefined) representation.id = id;
  const mimeType = inherited('mimeType');
  if (mimeType !== undefined) representation.mimeType = mimeType;
  const codecs = inherited('codecs');

  const declared = inherited('contentType')?.toLowerCase();
  const mime = mimeType?.toLowerCase() ?? '';
  if (declared === 'video' || declared === 'audio' || declared === 'text') representation.contentType = declared;
  else if (mime.startsWith('video/')) representation.contentType = 'video';
  else if (mime.startsWith('audio/')) representation.contentType = 'audio';
  else if (mime.startsWith('text/') || mime === 'application/ttml+xml' || (mime === 'application/mp4' && /^(?:stpp|wvtt)/i.test(codecs ?? ''))) representation.contentType = 'text';

  if (codecs !== undefined) representation.codecs = codecs;
  const width = wholeNumber(inherited('width'));
  if (width !== undefined) representation.width = width;
  const height = wholeNumber(inherited('height'));
  if (height !== undefined) representation.height = height;
  const bandwidth = wholeNumber(attr(element, 'bandwidth'));
  if (bandwidth !== undefined) representation.bandwidth = bandwidth;
  const lang = inherited('lang');
  if (lang !== undefined) representation.lang = lang;
  return representation;
}

/** Parses an MPD with a small tolerant XML scan (attributes on AdaptationSet are inherited by its Representations). ISO-8601 durations like PT1H2M3.5S → seconds. Throws Error('Not a DASH manifest') when there is no <MPD element. */
export function parseDash(xml: string): DashManifest {
  const doc = parseHtml(typeof xml === 'string' ? xml : '');
  let mpd: HtmlNode | undefined;
  const representations: DashRepresentation[] = [];
  const periods: (number | undefined)[] = [];
  let isProtected = false;
  for (const element of doc.selectAll('*')) {
    const name = localName(element.tag);
    if (mpd === undefined) {
      if (name === 'mpd') mpd = element;
    } else if (name === 'representation') {
      representations.push(dashRepresentation(element));
    } else if (name === 'contentprotection') {
      isProtected = true;
    } else if (name === 'period') {
      periods.push(isoDuration(attr(element, 'duration')));
    }
  }
  if (mpd === undefined) throw new Error('Not a DASH manifest');

  const manifest: DashManifest = { type: attr(mpd, 'type')?.trim().toLowerCase() === 'dynamic' ? 'dynamic' : 'static', representations, protected: isProtected };
  let duration = isoDuration(attr(mpd, 'mediaPresentationDuration'));
  if (duration === undefined && periods.length > 0 && periods.every((seconds) => seconds !== undefined)) {
    duration = Math.round(periods.reduce<number>((sum, seconds) => sum + (seconds as number), 0) * 1000) / 1000;
  }
  if (duration !== undefined) manifest.durationSeconds = duration;
  let maxHeight: number | undefined;
  for (const representation of representations) {
    if (representation.height !== undefined && (maxHeight === undefined || representation.height > maxHeight)) maxHeight = representation.height;
  }
  if (maxHeight !== undefined) manifest.maxHeight = maxHeight;
  return manifest;
}

// ---------- quality ----------

/** Heights that are quality names of their own when written with a "p". */
const HEIGHTS = '4320|2160|1440|1080|720|576|540|480|360|240|144';
const DIMENSIONS = /(\d{3,4}) ?[x×] ?(\d{3,4})(?!\d)/gi;
const HEIGHT_WITH_P = new RegExp(`(${HEIGHTS})[pi](?![a-z])`, 'gi');
/** Without a "p", only the common heights, and only standing on their own. */
const BARE_HEIGHT = /(2160|1440|1080|720|480|360)(?![a-z0-9]|\.\d)/gi;
const HEIGHT_SET = new Set(HEIGHTS.split('|').map(Number));

function isDigitCode(c: number): boolean {
  return c >= 48 && c <= 57;
}
function isAlphanumericCode(c: number): boolean {
  return isDigitCode(c) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
}

/** The largest value `pick` returns over every match of `pattern` (a global pattern). */
function bestMatch(text: string, pattern: RegExp, pick: (match: RegExpExecArray) => number | undefined): number | undefined {
  let best: number | undefined;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const value = pick(match);
    if (value !== undefined && (best === undefined || value > best)) best = value;
    // Step one character at a time so that a rejected match does not hide one that overlaps it.
    pattern.lastIndex = match.index + 1;
  }
  return best;
}

/** True when `word` occurs in `text` (both lower-case) with no letter or digit on either side. */
function hasWord(text: string, word: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(word, from);
    if (at < 0) return false;
    if (!isAlphanumericCode(text.charCodeAt(at - 1)) && !isAlphanumericCode(text.charCodeAt(at + word.length))) return true;
    from = at + 1;
  }
}

function heightForWidth(width: number): number | undefined {
  if (width >= 7600) return 4320;
  if (width >= 3800) return 2160;
  if (width >= 2500) return 1440;
  if (width >= 1900) return 1080;
  if (width >= 1270) return 720;
  if (width >= 840) return 480;
  if (width >= 630) return 360;
  return undefined;
}

/**
 * "1080" for 1080p/1920x1080/"FHD", "2160" for 4K/UHD/2160p, "1440", "720" (also "HD"), "480" (also "SD"), "360";
 * from a label, file name or URL. Undefined when nothing recognisable. Years ("2019") and codec names
 * ("x264", "x265", "h264") are not resolutions.
 *
 * Other heights written with a "p" come back as they are ("576", "240"); when several qualities are
 * named, the highest wins.
 */
export function detectQuality(text: string): string | undefined {
  if (typeof text !== 'string' || text === '') return undefined;
  // Percent-escapes are separators here ("Movie%20720p"), and their digits must not glue onto a number.
  const input = text.replace(/%[0-9a-fA-F]{2}/g, ' ');

  const fromDimensions = bestMatch(input, DIMENSIONS, (match) => {
    if (isDigitCode(input.charCodeAt(match.index - 1))) return undefined;
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);
    // A cropped picture (1920x800) is still named after its width.
    return HEIGHT_SET.has(height) ? height : heightForWidth(width);
  });
  if (fromDimensions !== undefined) return String(fromDimensions);

  const withP = bestMatch(input, HEIGHT_WITH_P, (match) => (isDigitCode(input.charCodeAt(match.index - 1)) ? undefined : parseInt(match[1], 10)));
  if (withP !== undefined) return String(withP);

  const lower = input.toLowerCase();
  if (hasWord(lower, '8k')) return '4320';
  if (hasWord(lower, '4k') || hasWord(lower, 'uhd') || hasWord(lower, 'ultrahd')) return '2160';
  if (hasWord(lower, '2k') || hasWord(lower, 'qhd') || hasWord(lower, 'wqhd')) return '1440';
  if (hasWord(lower, 'fhd') || hasWord(lower, 'fullhd') || /(?:^|[^a-z0-9])full[ ._-]hd(?![a-z0-9])/.test(lower)) return '1080';

  const bare = bestMatch(input, BARE_HEIGHT, (match) => (isAlphanumericCode(input.charCodeAt(match.index - 1)) ? undefined : parseInt(match[1], 10)));
  if (bare !== undefined) return String(bare);

  if (hasWord(lower, 'hd')) return '720';
  if (hasWord(lower, 'sd')) return '480';
  return undefined;
}

// ---------- expiry ----------

const EXPIRY_PARAMETERS = ['expires', 'expire', 'exp', 'e', 'validto'];
const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Query parameters by lower-cased name, first occurrence winning. `name=value` pairs inside a `~`-separated token (Akamai's `hdnts=exp=…~acl=…`) count as parameters too. */
function queryParameters(url: string): Map<string, string> {
  const parameters = new Map<string, string>();
  const question = url.indexOf('?');
  if (question < 0) return parameters;
  const hash = url.indexOf('#', question);
  const query = url.slice(question + 1, hash < 0 ? url.length : hash).replace(AMPERSAND_ENTITY, '&');
  const add = (pair: string): string => {
    const equals = pair.indexOf('=');
    const name = decodeComponent(equals < 0 ? pair : pair.slice(0, equals)).toLowerCase();
    const value = equals < 0 ? '' : decodeComponent(pair.slice(equals + 1));
    if (name !== '' && !parameters.has(name)) parameters.set(name, value);
    return value;
  };
  for (const pair of query.split('&')) {
    const value = add(pair);
    if (value.includes('~')) for (const part of value.split('~')) add(part);
  }
  return parameters;
}

function withinWindow(time: number, now: number): boolean {
  return time >= now - TEN_MINUTES && time <= now + THIRTY_DAYS;
}

/** Epoch ms from common expiry query parameters (`expires`, `expire`, `exp`, `e`, `validto`, `X-Amz-Expires` together with `X-Amz-Date`, `Expires`), accepting epoch seconds or ms within 10 minutes in the past .. 30 days in the future of `now`; otherwise undefined. */
export function detectExpiry(url: string, now: number = Date.now()): number | undefined {
  if (typeof url !== 'string') return undefined;
  const parameters = queryParameters(url);
  for (const name of EXPIRY_PARAMETERS) {
    const value = parameters.get(name);
    if (value === undefined || !/^\d{9,14}$/.test(value)) continue;
    const number = Number(value);
    if (withinWindow(number * 1000, now)) return number * 1000;
    if (withinWindow(number, now)) return number;
  }
  // Signed URLs that carry a signing time and a lifetime in seconds.
  for (const vendor of ['x-amz', 'x-goog']) {
    const date = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i.exec(parameters.get(`${vendor}-date`) ?? '');
    const lifetime = parameters.get(`${vendor}-expires`) ?? '';
    if (date === null || !/^\d{1,9}$/.test(lifetime)) continue;
    const signedAt = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(date[4]), Number(date[5]), Number(date[6]));
    const expiresAt = signedAt + Number(lifetime) * 1000;
    if (withinWindow(expiresAt, now)) return expiresAt;
  }
  return undefined;
}
