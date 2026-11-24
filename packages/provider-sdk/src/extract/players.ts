/**
 * Embedded players. Most video pages, whatever the site, hand their stream to one of a handful of
 * player libraries, and the library's configuration is in the page: `sources: [{ file }]`,
 * `file: "…"`, `<source src>`, often inside a script compressed with the common "packer". Reading
 * that configuration here means a provider for such a page is a few lines (or a rule pack), and a
 * site changing its markup around the player breaks nothing.
 */
import type { StreamType } from '../types.js';
import { findMediaUrls, findVideoElements, resolveUrl, sniffStreamType } from './media.js';

const PACKED = /eval\(function\(p,a,c,k,e,(?:r|d)\)\{[\s\S]*?\}\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/g;
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A number in the packer's positional notation (up to base 62). */
function toBase(n: number, radix: number): string {
  let out = '';
  do {
    out = DIGITS[n % radix] + out;
    n = Math.floor(n / radix);
  } while (n > 0);
  return out;
}

/**
 * Undoes the "packer" (`eval(function(p,a,c,k,e,d){…}('…',62,123,'a|b|c'.split('|'),…))`) by
 * substituting the word list back, as the packed code would. Nothing is evaluated. Returns every
 * unpacked script in the text, in order; an empty list when there is none.
 */
export function unpackScripts(text: string): string[] {
  const out: string[] = [];
  if (typeof text !== 'string' || !text.includes('p,a,c,k,e,')) return out;
  for (const m of text.matchAll(PACKED)) {
    const payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const radix = Number(m[2]);
    const count = Number(m[3]);
    const words = m[4].split('|');
    if (!(radix >= 2 && radix <= 62) || count > 20_000 || words.length > 20_000) continue;
    const table = new Map<string, string>();
    for (let i = 0; i < count; i++) if (words[i]) table.set(toBase(i, radix), words[i]);
    out.push(payload.replace(/\b\w+\b/g, (token) => table.get(token) ?? token));
  }
  return out;
}

export interface PlayerSource {
  url: string;
  type?: StreamType;
  /** The quality or name the page gave it ("1080p", "HD"). */
  label?: string;
}
export interface PlayerCaption {
  url: string;
  label?: string;
  lang?: string;
}
export interface PlayerConfig {
  sources: PlayerSource[];
  captions: PlayerCaption[];
}

const unescape = (s: string) => s.replace(/\\\//g, '/').replace(/\\u0026/gi, '&').replace(/&amp;/g, '&');
const QUOTED = `(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`;
/** `file: "…"`, `src: '…'`, `"file":"…"`, `source: "…"`. */
const SINGLE = new RegExp(`["']?(?:file|src|source|hls|video_url|videoUrl|stream_url|streamUrl|playlist)["']?\\s*[:=]\\s*${QUOTED}`, 'g');
/** One `{ … }` object of a sources or tracks list. */
const OBJECT = /\{[^{}]*\}/g;
const field = (object: string, names: string[]): string | undefined => {
  for (const name of names) {
    const m = object.match(new RegExp(`["']?${name}["']?\\s*:\\s*${QUOTED}`));
    if (m) return unescape(m[1] ?? m[2] ?? '');
  }
  return undefined;
};
/** The text of the list that follows `name:` (balanced brackets, capped). */
function listAfter(text: string, name: string): string[] {
  const found: string[] = [];
  const re = new RegExp(`["']?${name}["']?\\s*[:=]\\s*\\[`, 'g');
  for (const m of text.matchAll(re)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0 && i - start < 20_000; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') depth--;
    }
    if (depth === 0) found.push(text.slice(start, i - 1));
  }
  return found;
}

const CAPTION_URL = /\.(vtt|srt|ass)(\?|#|$)/i;
const isCaptionKind = (kind?: string) => !kind || /caption|subtitle/i.test(kind);

/**
 * The streams and captions a page's player was configured with. Looks in the markup, in inline
 * scripts and inside packed scripts, in that order of trust:
 *   1. `sources: [ { file | src, label, type } ]` lists (JW Player, Video.js, Plyr, Clappr)
 *   2. `<video>` / `<source>` elements
 *   3. single `file: "…"` / `src: "…"` values that are media addresses, including Playerjs's
 *      "[720p]url,[1080p]url" form
 *   4. any other media address in the text
 * Captions come from `tracks: [ { file, label, kind } ]` lists and `<track>` elements.
 */
export function findPlayerConfig(html: string, baseUrl?: string): PlayerConfig {
  const sources: PlayerSource[] = [];
  const captions: PlayerCaption[] = [];
  if (typeof html !== 'string' || !html) return { sources, captions };
  const text = [html, ...unpackScripts(html)].join('\n');
  const seen = new Set<string>();
  const add = (raw: string | undefined, label?: string, hint?: string) => {
    const url = raw ? resolveUrl(unescape(raw.trim()), baseUrl) : undefined;
    if (!url || seen.has(url)) return;
    if (CAPTION_URL.test(url.split('?')[0])) return;
    const type = sniffStreamType(url, hint);
    if (!type && !hint) return;
    seen.add(url);
    sources.push({ url, type: type ?? undefined, label: label?.trim() || undefined });
  };
  const seenCaptions = new Set<string>();
  const addCaption = (raw: string | undefined, label?: string, lang?: string) => {
    const url = raw ? resolveUrl(unescape(raw.trim()), baseUrl) : undefined;
    if (!url || seenCaptions.has(url)) return;
    seenCaptions.add(url);
    captions.push({ url, label: label?.trim() || undefined, lang: lang?.trim() || undefined });
  };

  for (const list of listAfter(text, 'sources')) {
    for (const object of list.match(OBJECT) ?? []) add(field(object, ['file', 'src', 'url']), field(object, ['label', 'quality', 'res', 'size']), field(object, ['type']));
    // `sources: ["https://…"]`
    for (const m of list.matchAll(new RegExp(QUOTED, 'g'))) if (/^https?:|^\/\//.test(m[1] ?? m[2] ?? '')) add(m[1] ?? m[2]);
  }
  // Elements carry their own labels, so they are read before loose `src: "…"` values.
  const elements = findVideoElements(html, baseUrl);
  for (const s of elements.sources) add(s.url, s.label, s.type);
  for (const m of text.matchAll(SINGLE)) {
    const value = unescape(m[1] ?? m[2] ?? '');
    // Playerjs: "[720p]https://…/720.m3u8,[1080p]https://…/1080.m3u8"
    if (/^\[[^\]]+\]/.test(value)) for (const part of value.split(',')) add(part.replace(/^\[[^\]]+\]/, '').split(' or ')[0], part.match(/^\[([^\]]+)\]/)?.[1]);
    else if (/\.(m3u8|mpd|mp4|mkv|webm)(\?|#|$)/i.test(value.split('?')[0]) || /\.(m3u8|mpd)/i.test(value)) add(value);
  }
  for (const m of findMediaUrls(text)) add(m.url);

  for (const name of ['tracks', 'captions', 'subtitles', 'textTracks']) {
    for (const list of listAfter(text, name)) {
      for (const object of list.match(OBJECT) ?? []) {
        if (!isCaptionKind(field(object, ['kind']))) continue;
        addCaption(field(object, ['file', 'src', 'url']), field(object, ['label', 'name', 'language']), field(object, ['srclang', 'lang', 'language_code']));
      }
    }
  }
  for (const t of elements.tracks) if (isCaptionKind(t.kind)) addCaption(t.url, t.label, t.lang);
  return { sources, captions };
}
