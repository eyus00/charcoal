/**
 * A tolerant HTML parser with a CSS-selector subset and an XPath subset. Plain TypeScript: no
 * dependencies, no DOM and no Node built-ins, so it behaves the same on a server and in a page.
 *
 * The parser is a single hand-rolled pass over the input (linear time, never throws). The tree it
 * builds is meant to be queried, not edited: build it, read it, throw it away.
 */

export interface HtmlNode {
  type: 'document' | 'element' | 'text' | 'comment';
  /** Lower-case tag name for elements, '' otherwise. */
  tag: string;
  /** Attribute names lower-cased, values entity-decoded. Empty object for non-elements. */
  attrs: Record<string, string>;
  children: HtmlNode[];
  parent: HtmlNode | null;
  /** Raw text for text and comment nodes (entity-decoded for text), '' for elements. */
  value: string;
}

export interface HtmlDocument {
  root: HtmlNode;
  /** First match or null. `scope` defaults to the root. */
  select(selector: string, scope?: HtmlNode): HtmlNode | null;
  selectAll(selector: string, scope?: HtmlNode): HtmlNode[];
  /** Evaluates the XPath subset below; returns element nodes, or strings for `/@attr` and `/text()` endings. */
  xpath(expression: string, scope?: HtmlNode): (HtmlNode | string)[];
}

/** A CSS selector or XPath expression that is malformed or outside the supported subset. */
export class SelectorSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectorSyntaxError';
  }
}

// ---------- characters ----------

const TAB = 9;
const LF = 10;
const FF = 12;
const CR = 13;
const SPACE = 32;
const BANG = 33;
const DQUOTE = 34;
const SQUOTE = 39;
const SLASH = 47;
const EQUALS = 61;
const GT = 62;
const QUESTION = 63;
const BACKSLASH = 92;

function isSpace(c: number): boolean {
  return c === SPACE || c === LF || c === TAB || c === CR || c === FF;
}
function isLetter(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
}
function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}
function isHexDigit(c: number): boolean {
  return isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
}
/** A character of a CSS identifier: letters, digits, '-', '_' and anything outside ASCII. */
function isNameChar(c: number): boolean {
  return isLetter(c) || isDigit(c) || c === 45 || c === 95 || c >= 0x80;
}

// ---------- entities ----------

const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);
const ENTITY = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|(amp|lt|gt|quot|apos|nbsp));/g;

function fromCodePoint(code: number): string {
  if (!(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return '�';
  return String.fromCodePoint(code);
}

function decodeEntities(text: string): string {
  if (text.indexOf('&') < 0) return text;
  return text.replace(ENTITY, (_match, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex !== undefined) return fromCodePoint(parseInt(hex, 16));
    if (dec !== undefined) return fromCodePoint(parseInt(dec, 10));
    return NAMED_ENTITIES.get(name as string) as string;
  });
}

// ---------- parser ----------

const VOID_TAGS = new Set(['br', 'img', 'meta', 'link', 'input', 'hr', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr']);
/** Elements whose content is one text child, taken as-is up to the matching closing tag. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);
/** The raw-text elements whose content still has its entities decoded. */
const DECODED_RAW_TEXT_TAGS = new Set(['textarea', 'title']);

/**
 * Opening one of these tags ends an element that is still open: `closes` names what gets ended,
 * and an open `within` element nearer than it shields it (a `<li>` in a nested list leaves the
 * outer `<li>` alone).
 */
interface ImpliedEnd {
  closes: readonly string[];
  within: readonly string[];
}

const SECTIONING = ['table', 'td', 'th', 'caption', 'template', 'object', 'button', 'article', 'aside', 'blockquote', 'section', 'nav', 'header', 'footer', 'main', 'form', 'fieldset', 'details', 'figure'];
const TABLE_PARTS = ['table', 'thead', 'tbody', 'tfoot', 'template'];
const CLOSES_P: ImpliedEnd = { closes: ['p'], within: ['button', 'table', 'td', 'th', 'caption', 'template', 'object'] };
const CLOSES_LI: ImpliedEnd = { closes: ['li'], within: ['ul', 'ol', 'menu', 'dir', ...SECTIONING] };
const CLOSES_DD: ImpliedEnd = { closes: ['dd', 'dt'], within: ['dl', ...SECTIONING] };
const CLOSES_CELL: ImpliedEnd = { closes: ['td', 'th'], within: ['tr', ...TABLE_PARTS] };
const CLOSES_ROW_GROUP: ImpliedEnd = { closes: ['thead', 'tbody', 'tfoot'], within: ['table', 'template'] };

const IMPLIED_ENDS = new Map<string, ImpliedEnd>([
  ['li', CLOSES_LI],
  ['dd', CLOSES_DD],
  ['dt', CLOSES_DD],
  ['option', { closes: ['option'], within: ['select', 'datalist', 'optgroup'] }],
  ['optgroup', { closes: ['option', 'optgroup'], within: ['select', 'datalist'] }],
  ['tr', { closes: ['tr'], within: TABLE_PARTS }],
  ['td', CLOSES_CELL],
  ['th', CLOSES_CELL],
  ['thead', CLOSES_ROW_GROUP],
  ['tbody', CLOSES_ROW_GROUP],
  ['tfoot', CLOSES_ROW_GROUP],
  ['body', { closes: ['head'], within: [] }],
]);
// A paragraph ends where the next paragraph or any block-level element starts, as in a browser.
for (const tag of ['p', 'address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'pre', 'section', 'summary', 'table', 'ul']) {
  IMPLIED_ENDS.set(tag, CLOSES_P);
}

function makeNode(type: HtmlNode['type'], tag: string, attrs: Record<string, string>, parent: HtmlNode | null, value: string): HtmlNode {
  return { type, tag, attrs, children: [], parent, value };
}

/** Index of the `</tag` that ends a raw-text element, or -1. */
function findRawTextEnd(html: string, from: number, tag: string): number {
  let at = from;
  for (;;) {
    at = html.indexOf('</', at);
    if (at < 0) return -1;
    const nameEnd = at + 2 + tag.length;
    if (html.slice(at + 2, nameEnd).toLowerCase() === tag) {
      const next = html.charCodeAt(nameEnd);
      if (nameEnd >= html.length || isSpace(next) || next === SLASH || next === GT) return at;
    }
    at += 2;
  }
}

function parseTree(html: string): HtmlNode {
  const root = makeNode('document', '', {}, null, '');
  const length = html.length;
  /** Open elements, the root at index 0. */
  const stack: HtmlNode[] = [root];
  /** For each tag, the stack indexes at which it is currently open (innermost last). */
  const openAt = new Map<string, number[]>();
  let current = root;
  let pos = 0;
  let textStart = 0;

  const innermost = (tag: string): number => {
    const depths = openAt.get(tag);
    return depths !== undefined && depths.length > 0 ? depths[depths.length - 1] : -1;
  };
  /** Closes every element at stack index `depth` or deeper. */
  const closeFrom = (depth: number): void => {
    while (stack.length > depth) {
      const top = stack.pop() as HtmlNode;
      (openAt.get(top.tag) as number[]).pop();
    }
    current = stack[stack.length - 1];
  };
  const appendText = (value: string): void => {
    if (value === '') return;
    const last = current.children[current.children.length - 1];
    if (last !== undefined && last.type === 'text') last.value += value;
    else current.children.push(makeNode('text', '', {}, current, value));
  };
  const flushText = (end: number): void => {
    if (end > textStart) appendText(decodeEntities(html.slice(textStart, end)));
  };
  /** Moves past the next '>' at or after `from` (to the end of input when there is none). */
  const skipPastGt = (from: number): void => {
    const gt = html.indexOf('>', from);
    pos = gt < 0 ? length : gt + 1;
    textStart = pos;
  };

  while (pos < length) {
    const lt = html.indexOf('<', pos);
    if (lt < 0) break;
    const next = html.charCodeAt(lt + 1);

    if (isLetter(next)) {
      // ----- opening tag -----
      let i = lt + 2;
      while (i < length) {
        const c = html.charCodeAt(i);
        if (isSpace(c) || c === SLASH || c === GT) break;
        i++;
      }
      const tag = html.slice(lt + 1, i).toLowerCase();
      const attrs: Record<string, string> = {};
      let selfClosing = false;
      let complete = false;
      while (i < length) {
        let c = html.charCodeAt(i);
        if (isSpace(c)) {
          i++;
          continue;
        }
        if (c === GT) {
          i++;
          complete = true;
          break;
        }
        if (c === SLASH) {
          if (html.charCodeAt(i + 1) === GT) {
            i += 2;
            selfClosing = true;
            complete = true;
            break;
          }
          i++;
          continue;
        }
        const nameStart = i;
        i++;
        while (i < length) {
          c = html.charCodeAt(i);
          if (isSpace(c) || c === SLASH || c === GT || c === EQUALS) break;
          i++;
        }
        const name = html.slice(nameStart, i).toLowerCase();
        while (i < length && isSpace(html.charCodeAt(i))) i++;
        let value = '';
        if (html.charCodeAt(i) === EQUALS) {
          i++;
          while (i < length && isSpace(html.charCodeAt(i))) i++;
          c = html.charCodeAt(i);
          if (c === DQUOTE || c === SQUOTE) {
            const close = html.indexOf(c === DQUOTE ? '"' : "'", i + 1);
            if (close < 0) {
              i = length;
              break;
            }
            value = html.slice(i + 1, close);
            i = close + 1;
          } else {
            const valueStart = i;
            while (i < length) {
              c = html.charCodeAt(i);
              if (isSpace(c) || c === GT) break;
              i++;
            }
            value = html.slice(valueStart, i);
          }
          value = decodeEntities(value);
        }
        if (!Object.hasOwn(attrs, name)) {
          // defineProperty so that an attribute called "__proto__" is stored like any other.
          Object.defineProperty(attrs, name, { value, enumerable: true, writable: true, configurable: true });
        }
      }

      flushText(lt);
      if (!complete) {
        // The input ended inside the tag: drop the fragment rather than invent an element from it.
        pos = length;
        textStart = length;
        break;
      }

      const implied = IMPLIED_ENDS.get(tag);
      if (implied !== undefined) {
        let target = -1;
        for (const name of implied.closes) target = Math.max(target, innermost(name));
        if (target > 0) {
          let shield = -1;
          for (const name of implied.within) shield = Math.max(shield, innermost(name));
          if (target > shield) closeFrom(target);
        }
      }

      const element = makeNode('element', tag, attrs, current, '');
      current.children.push(element);

      if (selfClosing || VOID_TAGS.has(tag)) {
        // No content.
      } else if (RAW_TEXT_TAGS.has(tag)) {
        const end = findRawTextEnd(html, i, tag);
        const content = html.slice(i, end < 0 ? length : end);
        if (content !== '') {
          element.children.push(makeNode('text', '', {}, element, DECODED_RAW_TEXT_TAGS.has(tag) ? decodeEntities(content) : content));
        }
        if (end < 0) i = length;
        else {
          const gt = html.indexOf('>', end + 2 + tag.length);
          i = gt < 0 ? length : gt + 1;
        }
      } else {
        stack.push(element);
        const depths = openAt.get(tag);
        if (depths === undefined) openAt.set(tag, [stack.length - 1]);
        else depths.push(stack.length - 1);
        current = element;
      }
      pos = i;
      textStart = i;
    } else if (next === SLASH) {
      // ----- closing tag -----
      flushText(lt);
      const first = html.charCodeAt(lt + 2);
      if (isLetter(first)) {
        let i = lt + 3;
        while (i < length) {
          const c = html.charCodeAt(i);
          if (isSpace(c) || c === SLASH || c === GT) break;
          i++;
        }
        const depth = innermost(html.slice(lt + 2, i).toLowerCase());
        // An unmatched closing tag is ignored; a matched one also ends everything opened inside it.
        if (depth > 0) closeFrom(depth);
        skipPastGt(i);
      } else {
        // "</>" and "</ junk>" produce nothing.
        skipPastGt(lt + 2);
      }
    } else if (next === BANG) {
      flushText(lt);
      if (html.startsWith('<!--', lt)) {
        // Searching from lt + 2 also ends the degenerate "<!-->" and "<!--->".
        const end = html.indexOf('-->', lt + 2);
        current.children.push(makeNode('comment', '', {}, current, html.slice(lt + 4, end < 0 ? length : end)));
        pos = end < 0 ? length : end + 3;
        textStart = pos;
      } else if (html.startsWith('<![CDATA[', lt)) {
        const end = html.indexOf(']]>', lt + 9);
        appendText(html.slice(lt + 9, end < 0 ? length : end));
        pos = end < 0 ? length : end + 3;
        textStart = pos;
      } else {
        // Doctype or some other declaration.
        skipPastGt(lt + 2);
      }
    } else if (next === QUESTION) {
      // Processing instruction, e.g. <?xml … ?>.
      flushText(lt);
      skipPastGt(lt + 2);
    } else {
      // A '<' that starts nothing is text.
      pos = lt + 1;
    }
  }
  flushText(length);
  return root;
}

/** Parses HTML (or XML-ish markup) into a tree. Never throws, whatever the input looks like. */
export function parseHtml(html: string): HtmlDocument {
  const root = parseTree(typeof html === 'string' ? html : String(html ?? ''));
  return {
    root,
    select: (selector, scope = root) => query(compileSelector(selector), scope, true)[0] ?? null,
    selectAll: (selector, scope = root) => query(compileSelector(selector), scope, false),
    xpath: (expression, scope = root) => evaluateXPath(compileXPath(expression), scope),
  };
}

// ---------- tree helpers ----------

const SKIP = 1;
const STOP = 2;

/**
 * Visits the descendants of `start` (not `start` itself) in document order, without recursion so
 * that a pathologically deep tree cannot overflow the stack. The visitor may return SKIP to leave
 * a node's subtree out, or STOP to end the walk.
 */
function walk(start: HtmlNode, visit: (node: HtmlNode) => number | void): void {
  const pending: HtmlNode[] = [];
  for (let i = start.children.length - 1; i >= 0; i--) pending.push(start.children[i]);
  while (pending.length > 0) {
    const node = pending.pop() as HtmlNode;
    const verdict = visit(node);
    if (verdict === STOP) return;
    if (verdict === SKIP) continue;
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
  }
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Concatenated text of a node and its descendants, whitespace collapsed and trimmed. Script/style contents are excluded unless the node itself is a script/style element. */
export function textOf(node: HtmlNode): string {
  if (node.type === 'text') return collapse(node.value);
  if (node.type === 'comment') return '';
  let text = '';
  walk(node, (child) => {
    if (child.type === 'text') text += child.value;
    else if (child.type === 'element' && (child.tag === 'script' || child.tag === 'style')) return SKIP;
    return undefined;
  });
  return collapse(text);
}

/** Raw inner text of a <script> or <style> element (not collapsed). */
export function rawText(node: HtmlNode): string {
  if (node.type === 'text') return node.value;
  if (node.children.length === 1 && node.children[0].type === 'text') return node.children[0].value;
  let text = '';
  walk(node, (child) => {
    if (child.type === 'text') text += child.value;
  });
  return text;
}

export function attr(node: HtmlNode | null | undefined, name: string): string | undefined {
  if (node === null || node === undefined) return undefined;
  const key = name.toLowerCase();
  return Object.hasOwn(node.attrs, key) ? node.attrs[key] : undefined;
}

/** True when `word` is one of the whitespace-separated words of `list`. */
function hasWord(list: string, word: string): boolean {
  if (word === '') return false;
  let from = 0;
  for (;;) {
    const at = list.indexOf(word, from);
    if (at < 0) return false;
    const end = at + word.length;
    if ((at === 0 || isSpace(list.charCodeAt(at - 1))) && (end === list.length || isSpace(list.charCodeAt(end)))) return true;
    from = at + 1;
  }
}

const positions = new WeakMap<HtmlNode, number>();

/** Index of a node among its parent's children, remembered so that sibling lookups stay cheap under very wide parents. */
function indexInParent(node: HtmlNode): number {
  const siblings = (node.parent as HtmlNode).children;
  if (siblings.length <= 16) return siblings.indexOf(node);
  let index = positions.get(node);
  if (index === undefined || siblings[index] !== node) {
    for (let i = 0; i < siblings.length; i++) positions.set(siblings[i], i);
    index = positions.get(node);
    if (index === undefined || siblings[index] !== node) return -1;
  }
  return index;
}

// ---------- CSS selectors ----------

type AttrOperator = 'exists' | '=' | '^=' | '$=' | '*=' | '~=' | 'never';

interface AttrTest {
  name: string;
  operator: AttrOperator;
  value: string;
  ignoreCase: boolean;
}

type Structural = { kind: 'first-child' } | { kind: 'last-child' } | { kind: 'nth-child'; index: number } | { kind: 'not'; inner: Compound };

interface Compound {
  /** '' when any element will do. */
  tag: string;
  ids: string[];
  classes: string[];
  attrs: AttrTest[];
  structural: Structural[];
  /** :contains() texts, checked last because they are the expensive part. */
  contains: string[];
}

type Combinator = ' ' | '>' | '+' | '~';

interface Complex {
  compounds: Compound[];
  /** combinators[i] joins compounds[i] and compounds[i + 1]. */
  combinators: Combinator[];
}

/** Characters an unquoted attribute value cannot contain (quote the value to use them). */
const UNQUOTED_VALUE_END = '[]()"\'=,<>~|^$*!';

const selectorCache = new Map<string, Complex[]>();
const xpathCache = new Map<string, XStep[]>();
const CACHE_LIMIT = 256;

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
  return value;
}

function compileSelector(input: string): Complex[] {
  if (typeof input !== 'string') throw new SelectorSyntaxError('A selector must be a string');
  const cached = selectorCache.get(input);
  if (cached !== undefined) return cached;

  const length = input.length;
  let pos = 0;
  const fail = (message: string): SelectorSyntaxError => new SelectorSyntaxError(`Invalid selector "${input}": ${message} at position ${pos}`);
  const skipSpaces = (): boolean => {
    const start = pos;
    while (pos < length && isSpace(input.charCodeAt(pos))) pos++;
    return pos > start;
  };
  const expect = (char: string): void => {
    if (input[pos] !== char) throw fail(`expected "${char}"`);
    pos++;
  };
  /** Reads what follows a backslash: a hex code point or a literal character. */
  const readEscape = (): string => {
    pos++;
    if (pos >= length) throw fail('unfinished escape');
    let hex = '';
    while (hex.length < 6 && pos < length && isHexDigit(input.charCodeAt(pos))) hex += input[pos++];
    if (hex !== '') {
      if (pos < length && isSpace(input.charCodeAt(pos))) pos++;
      return fromCodePoint(parseInt(hex, 16));
    }
    const char = String.fromCodePoint(input.codePointAt(pos) as number);
    pos += char.length;
    return char;
  };
  const readName = (what: string): string => {
    let name = '';
    while (pos < length) {
      const c = input.charCodeAt(pos);
      if (c === BACKSLASH) name += readEscape();
      else if (isNameChar(c)) name += input[pos++];
      else break;
    }
    if (name === '') throw fail(`expected ${what}`);
    return name;
  };
  const readString = (): string => {
    const quote = input.charCodeAt(pos);
    pos++;
    let value = '';
    for (;;) {
      if (pos >= length) throw fail('unterminated string');
      const c = input.charCodeAt(pos);
      if (c === quote) {
        pos++;
        return value;
      }
      if (c === BACKSLASH) value += readEscape();
      else value += input[pos++];
    }
  };
  const atQuote = (): boolean => {
    const c = input.charCodeAt(pos);
    return c === DQUOTE || c === SQUOTE;
  };

  const readAttribute = (): AttrTest => {
    pos++; // [
    skipSpaces();
    const name = readName('an attribute name').toLowerCase();
    skipSpaces();
    if (input[pos] === ']') {
      pos++;
      return { name, operator: 'exists', value: '', ignoreCase: false };
    }
    let operator: AttrOperator;
    if (input[pos] === '=') {
      operator = '=';
      pos++;
    } else if ('^$*~'.includes(input[pos] ?? ' ') && input[pos + 1] === '=') {
      operator = `${input[pos]}=` as AttrOperator;
      pos += 2;
    } else {
      throw fail('unsupported attribute operator');
    }
    skipSpaces();
    let value: string;
    if (atQuote()) {
      value = readString();
    } else {
      // Looser than CSS, which wants an identifier here: `[href^=/watch/]` and `[type=text/html]` are fine.
      const start = pos;
      while (pos < length && !isSpace(input.charCodeAt(pos)) && !UNQUOTED_VALUE_END.includes(input[pos])) pos++;
      if (pos === start) throw fail('expected an attribute value');
      value = input.slice(start, pos);
    }
    // An unquoted value has already swallowed any letter that touches it, so this is only ever the flag.
    let ignoreCase = false;
    skipSpaces();
    if (input[pos] === 'i' || input[pos] === 'I') {
      ignoreCase = true;
      pos++;
      skipSpaces();
    }
    expect(']');
    if (ignoreCase) value = value.toLowerCase();
    // A word test can never be met by an empty value or by one that contains whitespace.
    if (operator === '~=' && (value === '' || /\s/.test(value))) operator = 'never';
    // Prefix, suffix and substring tests match nothing when given an empty value.
    if (value === '' && (operator === '^=' || operator === '$=' || operator === '*=')) operator = 'never';
    return { name, operator, value, ignoreCase };
  };

  const readPseudo = (compound: Compound): void => {
    pos++; // :
    if (input[pos] === ':') throw fail('pseudo-elements are not supported');
    const start = pos;
    while (pos < length && (isLetter(input.charCodeAt(pos)) || input[pos] === '-')) pos++;
    const name = input.slice(start, pos).toLowerCase();
    switch (name) {
      case 'first-child':
      case 'last-child':
        compound.structural.push({ kind: name });
        return;
      case 'nth-child': {
        expect('(');
        skipSpaces();
        const from = pos;
        if (input[pos] === '+' || input[pos] === '-') pos++;
        const digitsFrom = pos;
        while (pos < length && isDigit(input.charCodeAt(pos))) pos++;
        if (pos === digitsFrom) throw fail(':nth-child() takes an integer');
        const index = parseInt(input.slice(from, pos), 10);
        skipSpaces();
        if (input[pos] !== ')') throw fail(':nth-child() takes an integer only');
        pos++;
        compound.structural.push({ kind: 'nth-child', index });
        return;
      }
      case 'not': {
        expect('(');
        skipSpaces();
        const inner = readCompound();
        skipSpaces();
        if (input[pos] !== ')') throw fail(':not() takes one compound selector');
        pos++;
        compound.structural.push({ kind: 'not', inner });
        return;
      }
      case 'contains': {
        expect('(');
        skipSpaces();
        let text: string;
        if (atQuote()) {
          text = readString();
          skipSpaces();
        } else {
          const close = input.indexOf(')', pos);
          if (close < 0) throw fail('unterminated :contains()');
          text = input.slice(pos, close).trim();
          pos = close;
          if (text === '') throw fail(':contains() needs a text');
        }
        expect(')');
        compound.contains.push(text);
        return;
      }
      default:
        throw fail(`unsupported pseudo-class ":${name}"`);
    }
  };

  function readCompound(): Compound {
    const compound: Compound = { tag: '', ids: [], classes: [], attrs: [], structural: [], contains: [] };
    const start = pos;
    const first = input.charCodeAt(pos);
    if (input[pos] === '*') {
      pos++;
    } else if (first === BACKSLASH || (isNameChar(first) && !isDigit(first))) {
      compound.tag = readName('a tag name').toLowerCase();
    }
    for (;;) {
      const char = input[pos];
      if (char === '#') {
        pos++;
        compound.ids.push(readName('an id'));
      } else if (char === '.') {
        pos++;
        compound.classes.push(readName('a class name'));
      } else if (char === '[') {
        compound.attrs.push(readAttribute());
      } else if (char === ':') {
        readPseudo(compound);
      } else {
        break;
      }
    }
    if (pos === start) throw fail(pos >= length ? 'unexpected end' : `unexpected "${input[pos]}"`);
    return compound;
  }

  const readComplex = (): Complex => {
    const complex: Complex = { compounds: [readCompound()], combinators: [] };
    for (;;) {
      const spaced = skipSpaces();
      if (pos >= length || input[pos] === ',') return complex;
      const char = input[pos];
      let combinator: Combinator;
      if (char === '>' || char === '+' || char === '~') {
        combinator = char;
        pos++;
        skipSpaces();
      } else if (spaced) {
        combinator = ' ';
      } else {
        throw fail(`unexpected "${char}"`);
      }
      complex.combinators.push(combinator);
      complex.compounds.push(readCompound());
    }
  };

  const list: Complex[] = [];
  skipSpaces();
  for (;;) {
    list.push(readComplex());
    if (pos >= length) break;
    pos++; // ,
    skipSpaces();
  }
  return remember(selectorCache, input, list);
}

function matchesAttr(node: HtmlNode, test: AttrTest): boolean {
  if (!Object.hasOwn(node.attrs, test.name)) return false;
  if (test.operator === 'exists') return true;
  const actual = test.ignoreCase ? node.attrs[test.name].toLowerCase() : node.attrs[test.name];
  switch (test.operator) {
    case '=':
      return actual === test.value;
    case '^=':
      return actual.startsWith(test.value);
    case '$=':
      return actual.endsWith(test.value);
    case '*=':
      return actual.includes(test.value);
    case '~=':
      return hasWord(actual, test.value);
    default:
      return false;
  }
}

function matchesStructural(node: HtmlNode, test: Structural): boolean {
  if (test.kind === 'not') return !matchesCompound(node, test.inner);
  const siblings = node.parent === null ? [node] : node.parent.children;
  if (test.kind === 'last-child') {
    for (let i = siblings.length - 1; i >= 0; i--) {
      if (siblings[i].type === 'element') return siblings[i] === node;
    }
    return false;
  }
  const wanted = test.kind === 'first-child' ? 1 : test.index;
  if (wanted < 1) return false;
  let seen = 0;
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].type === 'element' && ++seen === wanted) return siblings[i] === node;
  }
  return false;
}

function matchesCompound(node: HtmlNode, compound: Compound): boolean {
  if (node.type !== 'element') return false;
  if (compound.tag !== '' && node.tag !== compound.tag) return false;
  for (const id of compound.ids) {
    if (!Object.hasOwn(node.attrs, 'id') || node.attrs.id !== id) return false;
  }
  if (compound.classes.length > 0) {
    if (!Object.hasOwn(node.attrs, 'class')) return false;
    const classes = node.attrs.class;
    for (const name of compound.classes) {
      if (!hasWord(classes, name)) return false;
    }
  }
  for (const test of compound.attrs) {
    if (!matchesAttr(node, test)) return false;
  }
  for (const test of compound.structural) {
    if (!matchesStructural(node, test)) return false;
  }
  if (compound.contains.length > 0) {
    const text = textOf(node);
    for (const wanted of compound.contains) {
      if (!text.includes(wanted)) return false;
    }
  }
  return true;
}

/**
 * What is already known about the left part of a selector, per compound index i (compounds 0..i):
 * `matched` says, per node, whether it satisfies them, which keeps backtracking polynomial;
 * `earliest` says, per parent, how many of its children have been tested so far and where the
 * first one that satisfies them sits, which keeps `a ~ b` linear under a very wide parent.
 */
interface Memo {
  matched: Map<HtmlNode, boolean>;
  earliest: Map<HtmlNode, { tested: number; first: number }>;
}

function matchesUpTo(node: HtmlNode, selector: Complex, index: number, memo: Memo[]): boolean {
  const known = memo[index].matched.get(node);
  if (known !== undefined) return known;
  const result = matchesCompound(node, selector.compounds[index]) && (index === 0 || matchesContext(node, selector, index, memo));
  memo[index].matched.set(node, result);
  return result;
}

/** Is there a node, related to `node` by the combinator before compound `index`, that satisfies compounds 0..index-1? */
function matchesContext(node: HtmlNode, selector: Complex, index: number, memo: Memo[]): boolean {
  const combinator = selector.combinators[index - 1];
  const parent = node.parent;
  if (combinator === '>') {
    return parent !== null && parent.type === 'element' && matchesUpTo(parent, selector, index - 1, memo);
  }
  if (combinator === ' ') {
    for (let up = parent; up !== null && up.type === 'element'; up = up.parent) {
      if (matchesUpTo(up, selector, index - 1, memo)) return true;
    }
    return false;
  }
  if (parent === null) return false;
  const siblings = parent.children;
  const position = indexInParent(node);
  if (combinator === '+') {
    for (let i = position - 1; i >= 0; i--) {
      if (siblings[i].type === 'element') return matchesUpTo(siblings[i], selector, index - 1, memo);
    }
    return false;
  }
  let state = memo[index - 1].earliest.get(parent);
  if (state === undefined) {
    state = { tested: 0, first: -1 };
    memo[index - 1].earliest.set(parent, state);
  }
  while (state.first < 0 && state.tested < position) {
    const sibling = siblings[state.tested];
    if (sibling.type === 'element' && matchesUpTo(sibling, selector, index - 1, memo)) state.first = state.tested;
    state.tested++;
  }
  return state.first >= 0 && state.first < position;
}

/**
 * Matches among the descendants of `scope`, in document order. As with querySelectorAll, the
 * whole selector is tested against the full tree: an ancestor outside the scope may satisfy it.
 */
function query(selectors: Complex[], scope: HtmlNode, firstOnly: boolean): HtmlNode[] {
  const found: HtmlNode[] = [];
  const memos: Memo[][] = selectors.map((selector) => selector.combinators.map(() => ({ matched: new Map(), earliest: new Map() })));
  walk(scope, (node) => {
    if (node.type !== 'element') return undefined;
    for (let s = 0; s < selectors.length; s++) {
      const selector = selectors[s];
      const last = selector.compounds.length - 1;
      if (matchesCompound(node, selector.compounds[last]) && (last === 0 || matchesContext(node, selector, last, memos[s]))) {
        found.push(node);
        return firstOnly ? STOP : undefined;
      }
    }
    return undefined;
  });
  return found;
}

// ---------- XPath ----------

type XTest = { kind: 'name'; name: string } | { kind: 'any' } | { kind: 'text' } | { kind: 'attr'; name: string };

type XPredicate =
  | { kind: 'position'; index: number }
  | { kind: 'has-attr'; name: string }
  | { kind: 'equals' | 'contains' | 'starts-with'; /** Attribute name, or null for text(). */ attr: string | null; value: string };

interface XStep {
  axis: 'child' | 'descendant';
  test: XTest;
  predicates: XPredicate[];
}

function isXNameStart(c: number): boolean {
  return isLetter(c) || c === 95 || c >= 0x80;
}

function compileXPath(input: string): XStep[] {
  if (typeof input !== 'string') throw new SelectorSyntaxError('An XPath expression must be a string');
  const cached = xpathCache.get(input);
  if (cached !== undefined) return cached;

  const length = input.length;
  let pos = 0;
  const fail = (message: string): SelectorSyntaxError => new SelectorSyntaxError(`Invalid XPath "${input}": ${message} at position ${pos}`);
  const skipSpaces = (): void => {
    while (pos < length && isSpace(input.charCodeAt(pos))) pos++;
  };
  const expect = (char: string): void => {
    skipSpaces();
    if (input[pos] !== char) throw fail(`expected "${char}"`);
    pos++;
  };
  /** A name, optionally with one namespace-style prefix ("xlink:href"). */
  const readName = (what: string): string => {
    const start = pos;
    if (isXNameStart(input.charCodeAt(pos))) {
      pos++;
      for (;;) {
        const c = input.charCodeAt(pos);
        if (isNameChar(c) || c === 46 /* . */) pos++;
        else if (c === 58 /* : */ && isXNameStart(input.charCodeAt(pos + 1))) pos++;
        else break;
      }
    }
    if (pos === start) throw fail(`expected ${what}`);
    return input.slice(start, pos);
  };
  const readString = (): string => {
    skipSpaces();
    const quote = input[pos];
    if (quote !== '"' && quote !== "'") throw fail('expected a quoted string');
    const close = input.indexOf(quote, pos + 1);
    if (close < 0) throw fail('unterminated string');
    const value = input.slice(pos + 1, close);
    pos = close + 1;
    return value;
  };
  /** `@name` gives the attribute name, `text()` gives null. */
  const readOperand = (): string | null => {
    skipSpaces();
    if (input[pos] === '@') {
      pos++;
      return readName('an attribute name').toLowerCase();
    }
    const name = readName('@attribute or text()');
    if (name !== 'text') throw fail(`unsupported "${name}"`);
    expect('(');
    expect(')');
    return null;
  };

  const readPredicate = (): XPredicate => {
    pos++; // [
    skipSpaces();
    let predicate: XPredicate;
    if (isDigit(input.charCodeAt(pos))) {
      const start = pos;
      while (isDigit(input.charCodeAt(pos))) pos++;
      predicate = { kind: 'position', index: parseInt(input.slice(start, pos), 10) };
    } else if (input[pos] === '@') {
      const name = readOperand() as string;
      skipSpaces();
      if (input[pos] === '=') {
        pos++;
        predicate = { kind: 'equals', attr: name, value: readString() };
      } else {
        predicate = { kind: 'has-attr', name };
      }
    } else {
      const name = readName('a predicate');
      if (name === 'text') {
        expect('(');
        expect(')');
        expect('=');
        predicate = { kind: 'equals', attr: null, value: readString() };
      } else if (name === 'contains' || name === 'starts-with') {
        expect('(');
        const operand = readOperand();
        expect(',');
        predicate = { kind: name, attr: operand, value: readString() };
        expect(')');
      } else {
        throw fail(`unsupported "${name}"`);
      }
    }
    skipSpaces();
    if (input[pos] !== ']') throw fail('unsupported predicate');
    pos++;
    return predicate;
  };

  const readStep = (axis: XStep['axis']): XStep => {
    skipSpaces();
    let test: XTest;
    if (input[pos] === '@') {
      pos++;
      test = { kind: 'attr', name: readName('an attribute name').toLowerCase() };
    } else if (input[pos] === '*') {
      pos++;
      test = { kind: 'any' };
    } else {
      const name = readName('a node test');
      skipSpaces();
      if (input[pos] === '(') {
        if (name !== 'text') throw fail(`unsupported "${name}()"`);
        pos++;
        expect(')');
        test = { kind: 'text' };
      } else if (input[pos] === ':') {
        throw fail('axes are not supported');
      } else {
        test = { kind: 'name', name: name.toLowerCase() };
      }
    }
    const predicates: XPredicate[] = [];
    for (;;) {
      skipSpaces();
      if (input[pos] !== '[') break;
      if (test.kind === 'attr') throw fail('predicates on an attribute are not supported');
      predicates.push(readPredicate());
    }
    return { axis, test, predicates };
  };

  const steps: XStep[] = [];
  skipSpaces();
  let axis: XStep['axis'] = 'child';
  if (input.startsWith('//', pos)) {
    axis = 'descendant';
    pos += 2;
  } else if (input[pos] === '/') {
    pos++;
  }
  for (;;) {
    const step = readStep(axis);
    steps.push(step);
    if (pos >= length) break;
    if (step.test.kind === 'attr' || step.test.kind === 'text') throw fail('@attribute and text() must come last');
    if (input.startsWith('//', pos)) {
      axis = 'descendant';
      pos += 2;
    } else if (input[pos] === '/') {
      axis = 'child';
      pos++;
    } else {
      throw fail(`unexpected "${input[pos]}"`);
    }
  }
  return remember(xpathCache, input, steps);
}

/** The string XPath would compare for `text()`: the first text child, or '' without one. */
function firstText(node: HtmlNode): string {
  for (const child of node.children) {
    if (child.type === 'text') return child.value;
  }
  return '';
}

function matchesXPredicate(node: HtmlNode, predicate: Exclude<XPredicate, { kind: 'position' }>): boolean {
  if (predicate.kind === 'has-attr') return Object.hasOwn(node.attrs, predicate.name);
  if (predicate.kind === 'equals') {
    if (predicate.attr !== null) return Object.hasOwn(node.attrs, predicate.attr) && node.attrs[predicate.attr] === predicate.value;
    // A node-set compared with a string is true when any of its nodes equals it.
    return node.children.some((child) => child.type === 'text' && child.value === predicate.value);
  }
  const actual = predicate.attr === null ? firstText(node) : Object.hasOwn(node.attrs, predicate.attr) ? node.attrs[predicate.attr] : '';
  return predicate.kind === 'contains' ? actual.includes(predicate.value) : actual.startsWith(predicate.value);
}

function applyXPredicates(nodes: HtmlNode[], predicates: XPredicate[]): HtmlNode[] {
  let current = nodes;
  for (const predicate of predicates) {
    if (predicate.kind === 'position') {
      // The n-th of what is left under each parent.
      const counts = new Map<HtmlNode | null, number>();
      const kept: HtmlNode[] = [];
      for (const node of current) {
        const count = (counts.get(node.parent) ?? 0) + 1;
        counts.set(node.parent, count);
        if (count === predicate.index) kept.push(node);
      }
      current = kept;
    } else {
      current = current.filter((node) => matchesXPredicate(node, predicate));
    }
  }
  return current;
}

/** The context nodes that are not inside another context node. */
function outermost(contexts: HtmlNode[], set: Set<HtmlNode>): HtmlNode[] {
  return contexts.filter((node) => {
    for (let up = node.parent; up !== null; up = up.parent) {
      if (set.has(up)) return false;
    }
    return true;
  });
}

/**
 * Runs compiled steps from `scope`. The scope stands in for the document: a leading `/` means its
 * children and a leading `//` its descendants. Node-sets stay in document order without duplicates.
 */
function evaluateXPath(steps: XStep[], scope: HtmlNode): (HtmlNode | string)[] {
  let contexts: HtmlNode[] = [scope];
  /** Whether one context node may sit inside another (then a plain per-context loop would repeat or reorder nodes). */
  let nested = false;

  for (const step of steps) {
    const test = step.test;
    if (test.kind === 'attr') {
      let owners = contexts;
      if (step.axis === 'descendant') {
        // descendant-or-self: the contexts themselves and everything below them.
        owners = [];
        const tops = nested ? outermost(contexts, new Set(contexts)) : contexts;
        for (const top of tops) {
          owners.push(top);
          walk(top, (node) => {
            owners.push(node);
          });
        }
      }
      const values: string[] = [];
      for (const owner of owners) {
        if (owner.type === 'element' && Object.hasOwn(owner.attrs, test.name)) values.push(owner.attrs[test.name]);
      }
      return values;
    }

    const accepts = (node: HtmlNode): boolean => {
      if (test.kind === 'text') return node.type === 'text';
      return node.type === 'element' && (test.kind === 'any' || node.tag === test.name);
    };
    const matched: HtmlNode[] = [];
    if (step.axis === 'child' && !nested) {
      for (const context of contexts) {
        for (const child of context.children) {
          if (accepts(child)) matched.push(child);
        }
      }
    } else {
      const set = new Set(contexts);
      const tops = nested ? outermost(contexts, set) : contexts;
      const anyDepth = step.axis === 'descendant';
      for (const top of tops) {
        walk(top, (node) => {
          if (accepts(node) && (anyDepth || set.has(node.parent as HtmlNode))) matched.push(node);
        });
      }
    }
    contexts = applyXPredicates(matched, step.predicates);
    nested = (nested || step.axis === 'descendant') && contexts.length > 1;
    if (test.kind === 'text') return contexts.map((node) => node.value);
    if (contexts.length === 0) return [];
  }
  return contexts;
}
