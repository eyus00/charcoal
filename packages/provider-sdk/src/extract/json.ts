/**
 * JSON helpers for extraction: a JSONPath subset, a forgiving parse, and finders for the JSON that
 * pages carry around (JSON-LD, framework state, script assignments, meta tags).
 */

import { attr, parseHtml, rawText, textOf } from './html.js';
import type { HtmlNode } from './html.js';

// ---------- JSONPath ----------

type Segment =
  | { kind: 'key'; key: string }
  | { kind: 'index'; index: number }
  | { kind: 'wildcard' }
  /** Recursive descent: `key` under any depth, or every value at any depth when key is null. */
  | { kind: 'descend'; key: string | null }
  | { kind: 'filter'; path: string[]; compare: boolean; value: unknown };

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

/** Letters, digits, `_`, `$`, `@`, `-` and anything outside ASCII: enough for `.@graph` and `.og-title`. */
function isKeyChar(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 36 || c === 64 || c === 45 || c >= 0x80;
}

const pathCache = new Map<string, Segment[]>();

function compilePath(path: string): Segment[] {
  if (typeof path !== 'string') throw new SyntaxError('A JSONPath must be a string');
  const cached = pathCache.get(path);
  if (cached !== undefined) return cached;

  const input = path.trim();
  const length = input.length;
  let pos = 0;
  const fail = (message: string): SyntaxError => new SyntaxError(`Unsupported JSONPath "${path}": ${message} at position ${pos}`);
  const skipSpaces = (): void => {
    while (pos < length && (input[pos] === ' ' || input[pos] === '\t')) pos++;
  };
  const expect = (text: string): void => {
    skipSpaces();
    if (!input.startsWith(text, pos)) throw fail(`expected "${text}"`);
    pos += text.length;
  };
  const readKey = (): string => {
    const start = pos;
    while (pos < length && isKeyChar(input.charCodeAt(pos))) pos++;
    if (pos === start) throw fail('expected a key');
    return input.slice(start, pos);
  };
  const atQuote = (): boolean => input[pos] === "'" || input[pos] === '"';
  const readString = (): string => {
    const quote = input[pos];
    pos++;
    let value = '';
    for (;;) {
      if (pos >= length) throw fail('unterminated string');
      const char = input[pos];
      if (char === quote) {
        pos++;
        return value;
      }
      if (char === '\\') {
        pos++;
        if (pos >= length) throw fail('unterminated string');
      }
      value += input[pos++];
    }
  };
  const readInteger = (): number => {
    const start = pos;
    if (input[pos] === '-') pos++;
    const digits = pos;
    while (pos < length && input.charCodeAt(pos) >= 48 && input.charCodeAt(pos) <= 57) pos++;
    if (pos === digits) throw fail('expected an index');
    return parseInt(input.slice(start, pos), 10);
  };
  /** After `[?`: `(@.key)`, `(@.key=="v")`, `(@.key==1)`; the parentheses are optional. */
  const readFilter = (): Segment => {
    skipSpaces();
    const parenthesised = input[pos] === '(';
    if (parenthesised) pos++;
    expect('@');
    const keys: string[] = [];
    for (;;) {
      if (input[pos] === '.') {
        pos++;
        keys.push(readKey());
      } else if (input[pos] === '[' && (input[pos + 1] === "'" || input[pos + 1] === '"')) {
        pos++;
        keys.push(readString());
        expect(']');
      } else {
        break;
      }
    }
    if (keys.length === 0) throw fail('expected "@.key"');
    skipSpaces();
    let compare = false;
    let value: unknown;
    if (input.startsWith('==', pos)) {
      pos += 2;
      skipSpaces();
      compare = true;
      if (atQuote()) {
        value = readString();
      } else {
        const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)(?![\w.])/.exec(input.slice(pos, pos + 40));
        if (literal === null) throw fail('expected a string, number, true, false or null');
        pos += literal[0].length;
        value = JSON.parse(literal[0]) as unknown;
      }
    }
    if (parenthesised) expect(')');
    return { kind: 'filter', path: keys, compare, value };
  };

  if (input[pos] !== '$') throw fail('a path starts with "$"');
  pos++;
  const segments: Segment[] = [];
  while (pos < length) {
    if (input[pos] === '.') {
      if (input[pos + 1] === '.') {
        pos += 2;
        if (input[pos] === '*') {
          pos++;
          segments.push({ kind: 'descend', key: null });
        } else if (input[pos] === '[') {
          pos++;
          skipSpaces();
          if (!atQuote()) throw fail('only "..key" and "..[\'key\']" are supported after ".."');
          segments.push({ kind: 'descend', key: readString() });
          expect(']');
        } else {
          segments.push({ kind: 'descend', key: readKey() });
        }
      } else {
        pos++;
        if (input[pos] === '*') {
          pos++;
          segments.push({ kind: 'wildcard' });
        } else {
          segments.push({ kind: 'key', key: readKey() });
        }
      }
    } else if (input[pos] === '[') {
      pos++;
      skipSpaces();
      if (atQuote()) segments.push({ kind: 'key', key: readString() });
      else if (input[pos] === '*') {
        pos++;
        segments.push({ kind: 'wildcard' });
      } else if (input[pos] === '?') {
        pos++;
        segments.push(readFilter());
      } else {
        segments.push({ kind: 'index', index: readInteger() });
      }
      expect(']');
    } else {
      throw fail(`unexpected "${input[pos]}"`);
    }
  }
  if (pathCache.size >= 256) pathCache.clear();
  pathCache.set(path, segments);
  return segments;
}

function childrenOf(value: Record<string, unknown> | unknown[]): unknown[] {
  return Array.isArray(value) ? value : Object.values(value);
}

function passesFilter(candidate: unknown, filter: Extract<Segment, { kind: 'filter' }>): boolean {
  let at: unknown = candidate;
  for (const key of filter.path) {
    if (!isContainer(at) || Array.isArray(at) || !Object.hasOwn(at, key)) return false;
    at = at[key];
  }
  return !filter.compare || at === filter.value;
}

function applySegment(current: unknown[], segment: Segment): unknown[] {
  const next: unknown[] = [];
  for (const value of current) {
    if (!isContainer(value)) continue;
    switch (segment.kind) {
      case 'key':
        if (!Array.isArray(value) && Object.hasOwn(value, segment.key)) next.push(value[segment.key]);
        break;
      case 'index':
        if (Array.isArray(value)) {
          const index = segment.index < 0 ? value.length + segment.index : segment.index;
          if (index >= 0 && index < value.length) next.push(value[index]);
        }
        break;
      case 'wildcard':
        for (const child of childrenOf(value)) next.push(child);
        break;
      case 'filter':
        for (const child of childrenOf(value)) {
          if (passesFilter(child, segment)) next.push(child);
        }
        break;
      case 'descend': {
        // Pre-order without recursion: a container's own match first, then what is inside it.
        const pending: unknown[] = [value];
        while (pending.length > 0) {
          const node = pending.pop();
          if (!isContainer(node)) continue;
          const children = childrenOf(node);
          if (segment.key === null) for (const child of children) next.push(child);
          else if (!Array.isArray(node) && Object.hasOwn(node, segment.key)) next.push(node[segment.key]);
          for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
        }
        break;
      }
    }
  }
  return next;
}

/**
 * JSONPath subset: `$`, `.key`, `['key']`, `[0]`, `[-1]`, `[*]`, `.*`, `..key` (recursive descent), and a
 * filter `[?(@.key=="value")]` / `[?(@.key==123)]` / `[?(@.key)]`. Returns every match (empty array when
 * none). Throws SyntaxError on an unsupported expression.
 *
 * A filter keeps the elements of an array (or the values of an object) that pass: `[?(@.key)]` means the
 * key is present, whatever its value; `==` compares strictly, so `"720"` is not `720`.
 */
export function jsonPath(value: unknown, path: string): unknown[] {
  const segments = compilePath(path);
  if (value === undefined) return [];
  let current: unknown[] = [value];
  for (const segment of segments) {
    current = applySegment(current, segment);
    if (current.length === 0) break;
  }
  return current;
}

// ---------- parsing ----------

/** Prefixes servers put in front of JSON so that it cannot be run as a script. */
const XSSI_PREFIX = /^(?:\)\]\}',?|while\s*\(\s*(?:1|true)\s*\)\s*;|for\s*\(\s*;\s*;\s*\)\s*;)\s*/;

/** Parses JSON, returning undefined instead of throwing. Also accepts JSON with `\/` escapes and a leading BOM or XSSI prefix like `)]}'`. */
export function safeJsonParse(text: string): unknown {
  if (typeof text !== 'string') return undefined;
  // trim() also removes a byte-order mark.
  let json = text.trim();
  const prefix = XSSI_PREFIX.exec(json);
  if (prefix !== null) json = json.slice(prefix[0].length);
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

// ---------- JSON inside pages ----------

/** "Application/LD+JSON; charset=utf-8" → "application/ld+json". */
function mediaType(value: string | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}

/** Script data with an HTML-comment or CDATA wrapper taken off. */
function unwrap(text: string): string {
  let data = text.trim();
  const cdata = /^(?:\/\/\s*)?<!\[CDATA\[/.exec(data);
  if (cdata !== null) {
    data = data.slice(cdata[0].length);
    if (data.endsWith(']]>')) data = data.slice(0, -3).trimEnd();
    if (data.endsWith('//')) data = data.slice(0, -2);
  } else if (data.startsWith('<!--')) {
    data = data.slice(4);
    if (data.endsWith('-->')) data = data.slice(0, -3).trimEnd();
    if (data.endsWith('//')) data = data.slice(0, -2);
  }
  return data.trim();
}

/** Every JSON-LD block in a page (`<script type="application/ld+json">`), parsed; `@graph` arrays are flattened into the result; blocks that don't parse are skipped. */
export function findJsonLd(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  if (typeof html !== 'string' || !/ld\+json/i.test(html)) return found;
  for (const script of parseHtml(html).selectAll('script[type]')) {
    if (mediaType(attr(script, 'type')) !== 'application/ld+json') continue;
    // Arrays and @graph members are unpacked in order; anything that is not an object is dropped.
    const pending: unknown[] = [safeJsonParse(unwrap(rawText(script)))];
    while (pending.length > 0) {
      const value = pending.pop();
      if (!isContainer(value)) continue;
      const members = Array.isArray(value) ? value : Array.isArray(value['@graph']) ? value['@graph'] : undefined;
      if (members === undefined) found.push(value as Record<string, unknown>);
      else for (let i = members.length - 1; i >= 0; i--) pending.push(members[i]);
    }
  }
  return found;
}

function isJsSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/**
 * The end (exclusive) of the object or array literal that opens at `start`, or -1. Only characters
 * that strict JSON allows are accepted, so a JavaScript literal is given up on at its first
 * non-JSON character instead of being read to its end: that keeps a whole script linear to scan.
 */
function jsonLiteralEnd(text: string, start: number): number {
  const length = text.length;
  let depth = 0;
  let i = start;
  while (i < length) {
    const c = text.charCodeAt(i);
    if (c === 34 /* " */) {
      i++;
      for (;;) {
        if (i >= length) return -1;
        const s = text.charCodeAt(i);
        if (s === 34) break;
        if (s === 92 /* \ */) i++;
        else if (s < 32) return -1;
        i++;
      }
    } else if (c === 123 /* { */ || c === 91 /* [ */) {
      depth++;
    } else if (c === 125 /* } */ || c === 93 /* ] */) {
      depth--;
      if (depth === 0) return i + 1;
    } else if (
      !(
        isJsSpace(c) ||
        c === 44 /* , */ ||
        c === 58 /* : */ ||
        (c >= 48 && c <= 57) ||
        c === 45 /* - */ ||
        c === 43 /* + */ ||
        c === 46 /* . */ ||
        c === 69 /* E */ ||
        // The letters of true, false and null (and the exponent's e).
        c === 97 ||
        c === 101 ||
        c === 102 ||
        c === 108 ||
        c === 110 ||
        c === 114 ||
        c === 115 ||
        c === 116 ||
        c === 117
      )
    ) {
      return -1;
    }
    i++;
  }
  return -1;
}

function isIdentifierChar(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 36;
}

const BRACKET_MEMBER = /^\s*(?:"[^"\\]*"|'[^'\\]*'|\d+)\s*$/;
const TARGET_LIMIT = 200;

/** What is assigned to by the `=` at `equals`: "window.__DATA__", "config", …; undefined when it is not a plain name or member path. */
function assignmentTarget(js: string, equals: number): string | undefined {
  let end = equals;
  while (end > 0 && isJsSpace(js.charCodeAt(end - 1))) end--;
  const floor = Math.max(0, end - TARGET_LIMIT);
  let start = end;
  while (start > floor) {
    const c = js.charCodeAt(start - 1);
    if (isIdentifierChar(c) || c === 46 /* . */) {
      start--;
    } else if (c === 93 /* ] */) {
      let open = start - 2;
      while (open >= floor && js.charCodeAt(open) !== 91 /* [ */) open--;
      if (open < floor || !BRACKET_MEMBER.test(js.slice(open + 1, start - 1))) break;
      start = open;
    } else {
      break;
    }
  }
  // `foo().bar = …` leaves ".bar"; `x["a"]` reads better as "x.a".
  const target = js
    .slice(start, end)
    .replace(/^\.+/, '')
    .replace(/\[\s*(?:"([A-Za-z_$][\w$]*)"|'([A-Za-z_$][\w$]*)')\s*\]/g, '.$1$2');
  return /^[A-Za-z_$]/.test(target) ? target : undefined;
}

/** The characters that make an `=` part of another operator (`==`, `!=`, `<=`, `+=`, …). */
const OPERATOR_BEFORE_EQUALS = '=!<>+-*/%&|^~?';

function findAssignments(js: string, found: { source: string; value: unknown }[]): void {
  let from = 0;
  for (;;) {
    const equals = js.indexOf('=', from);
    if (equals < 0) return;
    from = equals + 1;
    let start = equals + 1;
    while (isJsSpace(js.charCodeAt(start))) start++;
    const opener = js.charCodeAt(start);
    if (opener !== 123 && opener !== 91) continue;
    if (equals > 0 && OPERATOR_BEFORE_EQUALS.includes(js[equals - 1])) continue;
    const end = jsonLiteralEnd(js, start);
    if (end < 0) continue;
    const source = assignmentTarget(js, equals);
    if (source === undefined) continue;
    let value: unknown;
    try {
      value = JSON.parse(js.slice(start, end)) as unknown;
    } catch {
      continue;
    }
    found.push({ source, value });
    from = end;
  }
}

function scriptSource(script: HtmlNode, type: string): string {
  const id = attr(script, 'id');
  if (id) return `script#${id}`;
  return type ? `script[type="${type}"]` : 'script';
}

/**
 * JSON values embedded in scripts: `<script type="application/json">`, `<script id="__NEXT_DATA__">`, and
 * assignments like `window.__DATA__ = {...};`, `var config = {...};`, `const x = [...]` (the balanced
 * object/array literal after `=`, respecting strings and escapes; only those that parse as strict JSON).
 *
 * `source` says where a value came from: `script#<id>` (or `script[type="<type>"]`, or `script`) for a
 * script that is JSON as a whole, and the assigned name (`window.__DATA__`, `config`, `x`) for an
 * assignment. JSON-LD blocks are left to findJsonLd.
 */
export function findEmbeddedJson(html: string): { source: string; value: unknown }[] {
  const found: { source: string; value: unknown }[] = [];
  if (typeof html !== 'string' || !/<script/i.test(html)) return found;
  for (const script of parseHtml(html).selectAll('script')) {
    const type = mediaType(attr(script, 'type'));
    if (type === 'application/ld+json') continue;
    const text = rawText(script);
    const data = unwrap(text);
    if (data.startsWith('{') || data.startsWith('[')) {
      const value = safeJsonParse(data);
      if (value !== undefined) {
        found.push({ source: scriptSource(script, type), value });
        continue;
      }
    }
    if (!type.includes('json')) findAssignments(text, found);
  }
  return found;
}

/**
 * Open Graph / Twitter / itemprop / standard meta tags: keys are the lower-cased `property`, `name` or
 * `itemprop`, values the `content`. First occurrence wins. Also includes `title` (the <title> text) and
 * `canonical` (link rel=canonical href) when present.
 */
export function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  if (typeof html !== 'string') return meta;
  const doc = parseHtml(html);
  const put = (key: string | undefined, value: string | undefined, replace: boolean): void => {
    const name = key?.trim().toLowerCase();
    const content = value?.trim();
    if (!name || !content || name === '__proto__') return;
    if (replace || !Object.hasOwn(meta, name)) meta[name] = content;
  };
  for (const tag of doc.selectAll('meta[content]')) {
    const content = attr(tag, 'content');
    put(attr(tag, 'property'), content, false);
    put(attr(tag, 'name'), content, false);
    put(attr(tag, 'itemprop'), content, false);
  }
  // The page's own <title>, not the <title> of an inline SVG.
  const title = doc.selectAll('title').find((node) => {
    for (let up = node.parent; up !== null; up = up.parent) {
      if (up.tag === 'svg') return false;
    }
    return true;
  });
  if (title !== undefined) put('title', textOf(title), true);
  put('canonical', attr(doc.select('link[rel~="canonical" i][href]'), 'href'), true);
  return meta;
}
