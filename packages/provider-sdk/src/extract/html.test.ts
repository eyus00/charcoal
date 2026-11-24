import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelectorSyntaxError, attr, parseHtml, rawText, textOf } from './html.js';
import type { HtmlNode } from './html.js';

/** A compact picture of a tree: `tag{attrs}[children]`, text in quotes, comments as <!--…-->. */
function outline(node: HtmlNode): string {
  if (node.type === 'text') return JSON.stringify(node.value);
  if (node.type === 'comment') return `<!--${node.value}-->`;
  const attrs = Object.keys(node.attrs).length > 0 ? JSON.stringify(node.attrs) : '';
  return `${node.type === 'document' ? '#document' : node.tag}${attrs}[${node.children.map(outline).join(',')}]`;
}
const shape = (html: string): string => outline(parseHtml(html).root);
const tags = (nodes: (HtmlNode | string)[]): string[] => nodes.map((node) => (typeof node === 'string' ? node : node.tag));
const ids = (nodes: (HtmlNode | string)[]): (string | undefined)[] => nodes.map((node) => (typeof node === 'string' ? node : attr(node, 'id')));

// ---------- parser ----------

test('parses a well-formed document into a tree with parents', () => {
  const doc = parseHtml('<!DOCTYPE html><html lang="en"><head><title>Hi</title></head><body><p>One</p></body></html>');
  assert.equal(outline(doc.root), '#document[html{"lang":"en"}[head[title["Hi"]],body[p["One"]]]]');
  assert.equal(doc.root.type, 'document');
  assert.equal(doc.root.parent, null);
  assert.equal(doc.root.tag, '');
  const p = doc.select('p') as HtmlNode;
  assert.equal(p.type, 'element');
  assert.equal(p.value, '');
  assert.equal(p.parent?.tag, 'body');
  assert.equal(p.parent?.parent?.tag, 'html');
  assert.equal(p.parent?.parent?.parent, doc.root);
  assert.deepEqual(p.children[0].attrs, {});
  assert.equal(p.children[0].tag, '');
  assert.equal(p.children[0].parent, p);
});

test('reads attributes quoted with ", with \', unquoted and valueless', () => {
  const doc = parseHtml(`<input TYPE="text" name='q' value=hello/world disabled data-x = "1" required>`);
  assert.deepEqual(doc.select('input')?.attrs, { type: 'text', name: 'q', value: 'hello/world', disabled: '', 'data-x': '1', required: '' });
});

test('lower-cases tag and attribute names, keeps the first of a repeated attribute', () => {
  const doc = parseHtml('<DIV ID="a" id="b" Class="X">t</DIV>');
  assert.equal(outline(doc.root), '#document[div{"id":"a","class":"X"}["t"]]');
});

test('decodes named and numeric entities in text and attribute values', () => {
  const doc = parseHtml('<a href="/w?a=1&amp;b=2&#38;c=3" title="&quot;q&quot; &apos;s&apos;">&lt;b&gt; &amp; &#65;&#x42;&#x1F600;&nbsp;end &unknown; &amp</a>');
  const a = doc.select('a') as HtmlNode;
  assert.equal(attr(a, 'href'), '/w?a=1&b=2&c=3');
  assert.equal(attr(a, 'title'), `"q" 's'`);
  assert.equal(a.children[0].value, '<b> & AB\u{1F600}\u00a0end &unknown; &amp');
});

test('replaces impossible numeric entities instead of throwing', () => {
  const doc = parseHtml('<p>&#0;&#x110000;&#xD800;&#9999999;</p>');
  assert.equal(doc.select('p')?.children[0].value, '\ufffd\ufffd\ufffd\ufffd');
});

test('keeps comments as comment nodes and CDATA as text', () => {
  assert.equal(shape('<div><!-- note <b>not a tag</b> -->x<![CDATA[a < b && c]]>y</div>'), '#document[div[<!-- note <b>not a tag</b> -->,"xa < b && cy"]]');
  const comment = parseHtml('<!--c-->').root.children[0];
  assert.equal(comment.type, 'comment');
  assert.equal(comment.value, 'c');
  assert.equal(comment.tag, '');
  assert.deepEqual(comment.attrs, {});
});

test('copes with degenerate and unterminated comments, CDATA and declarations', () => {
  assert.equal(shape('a<!-->b<!--->c'), '#document["a",<!---->,"b",<!---->,"c"]');
  assert.equal(shape('a<!-- never closed <p>x</p>'), '#document["a",<!-- never closed <p>x</p>-->]');
  assert.equal(shape('a<![CDATA[never closed'), '#document["anever closed"]');
  assert.equal(shape('<?xml version="1.0"?><!DOCTYPE html><!ELEMENT x><p>x</p>'), '#document[p["x"]]');
  assert.equal(shape('a<!DOCTYPE never closed'), '#document["a"]');
});

test('treats void elements and self-closing tags as childless', () => {
  assert.equal(
    shape('<p>a<br>b<img src=x.png>c<hr/>d</p><div/><span>after</span><meta charset=utf-8><link rel=x><input><source><track><area><base><col><embed><param><wbr>z'),
    '#document[p["a",br[],"b",img{"src":"x.png"}[],"c"],hr[],"d",div[],span["after"],meta{"charset":"utf-8"}[],link{"rel":"x"}[],input[],source[],track[],area[],base[],col[],embed[],param[],wbr[],"z"]',
  );
});

test('does not parse the contents of script, style, textarea and title', () => {
  const doc = parseHtml(
    '<title>A &amp; <b>B</b></title><div id="app"><script>if (a < b && c > d) { document.write("</div><p>&amp;</p>"); }</script><style>a > b { content: "</p>"; }</style><textarea><p>&lt;raw&gt;</p></textarea></div>',
  );
  assert.equal(
    outline(doc.root),
    '#document[title["A & <b>B</b>"],div{"id":"app"}[script["if (a < b && c > d) { document.write(\\"</div><p>&amp;</p>\\"); }"],style["a > b { content: \\"</p>\\"; }"],textarea["<p><raw></p>"]]]',
  );
  assert.equal(doc.selectAll('p').length, 0);
  assert.equal(doc.selectAll('b').length, 0);
});

test('ends raw text at the matching closing tag only, whatever its case', () => {
  assert.equal(shape('<script>a</scripty>b</SCRIPT >c'), '#document[script["a</scripty>b"],"c"]');
  assert.equal(shape('<script></script>x'), '#document[script[],"x"]');
  assert.equal(shape('<script src="a.js"/>x'), '#document[script{"src":"a.js"}[],"x"]');
  assert.equal(shape('<p>x</p><script>var a = "never closed'), '#document[p["x"],script["var a = \\"never closed"]]');
  assert.equal(shape('<style>a{}</style'), '#document[style["a{}"]]');
});

test('leaves unclosed tags open to the end', () => {
  assert.equal(shape('<div><span>a<b>b'), '#document[div[span["a",b["b"]]]]');
});

test('ignores stray closing tags', () => {
  assert.equal(shape('a</div>b</span></p>c<div>d</em>e</div></div>f'), '#document["abc",div["de"],"f"]');
  assert.equal(shape('a</>b</ x>c</3>d'), '#document["abcd"]');
});

test('a closing tag closes the nearest open ancestor of that name and everything inside it', () => {
  assert.equal(shape('<div><span><b>x</div>y'), '#document[div[span[b["x"]]],"y"]');
  assert.equal(shape('<div id=1><div id=2><i>x</div>y</div>z'), '#document[div{"id":"1"}[div{"id":"2"}[i["x"]],"y"],"z"]');
});

test('paragraphs end where the next paragraph or block starts', () => {
  assert.equal(shape('<p>one<p>two<p>three'), '#document[p["one"],p["two"],p["three"]]');
  assert.equal(shape('<p>a<span>b<p>c'), '#document[p["a",span["b"]],p["c"]]');
  assert.equal(shape('<p>a<div>b</div>c'), '#document[p["a"],div["b"],"c"]');
  assert.equal(shape('<div><p>a</div><p>b'), '#document[div[p["a"]],p["b"]]');
  // A paragraph inside a table cell does not end the paragraph the table sits next to.
  assert.equal(shape('<table><tr><td><p>a<table><tr><td><p>b'), '#document[table[tr[td[p["a"],table[tr[td[p["b"]]]]]]]]');
});

test('list items, options, rows and cells close their open sibling', () => {
  assert.equal(shape('<ul><li>a<li>b<li>c</ul>'), '#document[ul[li["a"],li["b"],li["c"]]]');
  assert.equal(shape('<ul><li>a<ul><li>a1<li>a2</ul><li>b</ul>'), '#document[ul[li["a",ul[li["a1"],li["a2"]]],li["b"]]]');
  assert.equal(shape('<select><option>a<option>b<option selected>c</select>'), '#document[select[option["a"],option["b"],option{"selected":""}["c"]]]');
  assert.equal(shape('<table><tr><th>h1<th>h2<tr><td>a<td>b<tr><td>c</table>'), '#document[table[tr[th["h1"],th["h2"]],tr[td["a"],td["b"]],tr[td["c"]]]]');
  assert.equal(shape('<table><tr><td><table><tr><td>in</table><td>out</table>'), '#document[table[tr[td[table[tr[td["in"]]]],td["out"]]]]');
  assert.equal(shape('<dl><dt>t<dd>d<dt>t2<dd>d2</dl>'), '#document[dl[dt["t"],dd["d"],dt["t2"],dd["d2"]]]');
});

test('a body that starts before the head was closed is not put inside the head', () => {
  assert.equal(shape('<html><head><title>t</title><body><p>x'), '#document[html[head[title["t"]],body[p["x"]]]]');
});

test('keeps a "<" that starts nothing as text', () => {
  assert.equal(shape('<p>1 < 2 and 3 <4 <<b>x</b> <'), '#document[p["1 < 2 and 3 <4 <",b["x"]," <"]]');
});

test('drops a tag the input ends inside of', () => {
  assert.equal(shape('<p>a</p><div class="x'), '#document[p["a"]]');
  assert.equal(shape('<p>a</p><iframe src=https://example.com/emb'), '#document[p["a"]]');
  assert.equal(shape('<p>a</p></di'), '#document[p["a"]]');
});

test('stores awkward attribute names like any other', () => {
  const doc = parseHtml('<a __proto__="x" constructor="y" =odd @click="go" :href="u">t</a>');
  const a = doc.select('a') as HtmlNode;
  assert.deepEqual(Object.keys(a.attrs), ['__proto__', 'constructor', '=odd', '@click', ':href']);
  assert.equal(attr(a, '__proto__'), 'x');
  assert.equal(attr(a, 'constructor'), 'y');
  assert.equal(attr(parseHtml('<b>x</b>').select('b'), 'constructor'), undefined);
  assert.equal(attr(parseHtml('<b>x</b>').select('b'), 'toString'), undefined);
  assert.equal(doc.selectAll('[constructor]').length, 1);
  assert.equal(parseHtml('<b>x</b>').selectAll('[constructor], [toString], [__proto__]').length, 0);
});

test('never throws, whatever it is given', () => {
  const inputs = [
    '',
    '<',
    '>',
    '</',
    '<!',
    '<!-',
    '<!--',
    '<?',
    '<a',
    '<a ',
    '<a b',
    '<a b=',
    '<a b="',
    "<a b='c",
    '<a/',
    '<a / / >',
    '<a =>',
    '<a b=c d=>',
    '</a b="c">',
    '<script',
    '<script>',
    '<script><',
    '<title></',
    '<![CDATA[',
    '<p <p <p>>>',
    '<<<>>>',
    '&#;&#x;&;&&&amp',
    '\u0000<\u0000>\ufffe',
    '<a\u0000b c\u0000d="e">',
    '<table><td><tr><th></td></table></tr>',
    '</p></li></td></html></body>',
    '<svg><path d="M0 0"/><foreignObject><div>x</div></foreignObject></svg>',
  ];
  for (const input of inputs) {
    const doc = parseHtml(input);
    assert.equal(doc.root.type, 'document', input);
    textOf(doc.root);
    doc.selectAll('*');
  }
  // Every prefix of a tricky document.
  const tricky = '<!DOCTYPE html><html><head><title>T&amp;</title><script>a<b</script></head><body class="x y" id=\'b\'><!--c--><![CDATA[d]]><p>e<br/>f</p></body></html>';
  for (let end = 0; end <= tricky.length; end++) parseHtml(tricky.slice(0, end));
  assert.equal(parseHtml(undefined as unknown as string).root.children.length, 0);
  assert.equal(parseHtml(null as unknown as string).root.children.length, 0);
  assert.equal(textOf(parseHtml(42 as unknown as string).root), '42');
});

test('parses a 2 MB document in well under two seconds', () => {
  let html = '<!DOCTYPE html><html><head><title>Big</title></head><body><ul id="list">';
  let rows = 0;
  while (html.length < 2 * 1024 * 1024) {
    html += `<li class="row r${rows % 5}" data-n="${rows}"><a href="/watch/${rows}?a=1&amp;b=2" title='Item ${rows}'>Item ${rows}</a> <span>&lt;${rows}&gt;</span><img src=/t/${rows}.jpg><!-- ${rows} -->\n`;
    rows++;
  }
  html += '</ul><script>var x = "</li><li>"; if (1 < 2) {}</script></body></html>';
  const started = performance.now();
  const doc = parseHtml(html);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2000, `took ${elapsed.toFixed(0)} ms`);
  assert.equal(doc.selectAll('#list > li').length, rows);
  assert.equal(doc.selectAll('li.r3 > a[href^="/watch/"]').length, Math.floor((rows + 1) / 5));
  assert.equal(attr(doc.select(`li[data-n="${rows - 1}"] a`), 'href'), `/watch/${rows - 1}?a=1&b=2`);
  assert.deepEqual(doc.xpath('//ul/li[2]/a/@href'), ['/watch/1?a=1&b=2']);
  assert.equal(doc.selectAll('li + li').length, rows - 1);
  assert.equal(doc.selectAll('script ~ li').length, 0);
});

test('stays linear on pathological input', () => {
  const started = performance.now();
  const cases = [
    '<'.repeat(500_000),
    '<div>'.repeat(200_000),
    '<div>'.repeat(100_000) + '</span>'.repeat(100_000),
    '<li><ul>' + '<span>'.repeat(100_000) + '<li></li>'.repeat(100_000),
    '<!--'.repeat(300_000),
    '<a ' + 'x="1" '.repeat(200_000),
    '<a href="'.repeat(200_000),
    '<script>'.repeat(200_000),
    '<p>'.repeat(200_000),
    '&amp'.repeat(300_000),
    '<a b=c '.repeat(200_000),
  ];
  for (const html of cases) parseHtml(html);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 5000, `took ${elapsed.toFixed(0)} ms`);
});

test('walks very deep trees without overflowing the stack', () => {
  const doc = parseHtml('<div>'.repeat(100_000) + '<a href="/x">deep</a>');
  assert.equal(textOf(doc.root), 'deep');
  assert.equal(doc.selectAll('div').length, 100_000);
  assert.equal(attr(doc.select('div > a'), 'href'), '/x');
  assert.deepEqual(doc.xpath('//a/@href'), ['/x']);
  assert.equal(rawText(doc.root), 'deep');
});

// ---------- text helpers ----------

test('textOf collapses whitespace and leaves script and style out', () => {
  const doc = parseHtml('<div id="d">  Hello\n\t<b>big</b>&nbsp;&nbsp; world <script>var hidden = 1;</script><style>.x{}</style><!-- c --> ! </div>');
  assert.equal(textOf(doc.select('#d') as HtmlNode), 'Hello big world !');
  assert.equal(textOf(doc.root), 'Hello big world !');
  assert.equal(textOf(doc.select('script') as HtmlNode), 'var hidden = 1;');
  assert.equal(textOf(doc.select('style') as HtmlNode), '.x{}');
  assert.equal(textOf((doc.select('b') as HtmlNode).children[0]), 'big');
  assert.equal(textOf(parseHtml('<!-- only -->').root.children[0]), '');
  assert.equal(textOf(parseHtml('<p></p>').select('p') as HtmlNode), '');
});

test('rawText gives script and style contents untouched', () => {
  const doc = parseHtml('<script>\n  var a = "x  y";\n</script><style> a { } </style><p> a <b> b </b></p><script></script>');
  const [first, empty] = doc.selectAll('script');
  assert.equal(rawText(first), '\n  var a = "x  y";\n');
  assert.equal(rawText(empty), '');
  assert.equal(rawText(doc.select('style') as HtmlNode), ' a { } ');
  assert.equal(rawText(doc.select('p') as HtmlNode), ' a  b ');
});

test('attr reads attributes case-insensitively and tolerates a missing node', () => {
  const doc = parseHtml('<a HREF="/x" data-id="7" hidden>t</a>');
  const a = doc.select('a');
  assert.equal(attr(a, 'href'), '/x');
  assert.equal(attr(a, 'HREF'), '/x');
  assert.equal(attr(a, 'Data-Id'), '7');
  assert.equal(attr(a, 'hidden'), '');
  assert.equal(attr(a, 'missing'), undefined);
  assert.equal(attr(null, 'href'), undefined);
  assert.equal(attr(undefined, 'href'), undefined);
  assert.equal(attr(doc.select('nope'), 'href'), undefined);
});

// ---------- CSS selectors ----------

const PAGE = `
<html><head><title>Sel</title></head><body>
<div id="main" class="wrap dark">
  <h1 class="title big">Heading</h1>
  <ul id="nav" class="menu">
    <li id="l1" class="item first"><a id="a1" href="/home" title="Home page">Home</a></li>
    <li id="l2" class="item active"><a id="a2" href="/movies/list.html" data-kind="Movie List" lang="en-US">Movies</a></li>
    <li id="l3" class="item"><a id="a3" href="https://example.com/tv" target="_blank">TV</a></li>
    <li id="l4" class="item last"><span id="s1">No link</span></li>
  </ul>
  <p id="p1">First <em id="e1">para</em></p>
  <p id="p2" class="note">Second para</p>
  <div id="inner" class="wrap"><p id="p3">Inner <a id="a4" href="/deep">deep link</a></p></div>
  <span id="s2">tail</span>
</div>
<div id="foot"><p id="p4">Footer</p></div>
</body></html>`;
const page = parseHtml(PAGE);
const sel = (selector: string, scope?: HtmlNode): (string | undefined)[] => ids(page.selectAll(selector, scope));

test('type, universal, id and class selectors', () => {
  assert.deepEqual(sel('p'), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(sel('P'), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(sel('#p2'), ['p2']);
  assert.deepEqual(sel('.item'), ['l1', 'l2', 'l3', 'l4']);
  assert.deepEqual(sel('.item.active'), ['l2']);
  assert.deepEqual(sel('.active.item'), ['l2']);
  assert.deepEqual(sel('.Item'), []);
  assert.deepEqual(sel('li.item.first#l1'), ['l1']);
  assert.deepEqual(sel('div.wrap'), ['main', 'inner']);
  assert.deepEqual(sel('.wra'), []);
  assert.deepEqual(tags(page.selectAll('*')).slice(0, 5), ['html', 'head', 'title', 'body', 'div']);
  assert.deepEqual(sel('*#s2'), ['s2']);
  assert.deepEqual(sel('#nope'), []);
});

test('attribute selectors', () => {
  assert.deepEqual(sel('[href]'), ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(sel('a[target]'), ['a3']);
  assert.deepEqual(sel('[href=/home]'), ['a1']);
  assert.deepEqual(sel('[href="/home"]'), ['a1']);
  assert.deepEqual(sel("[href='/home']"), ['a1']);
  assert.deepEqual(sel('a[href^=/]'), ['a1', 'a2', 'a4']);
  assert.deepEqual(sel('a[href^="https://"]'), ['a3']);
  assert.deepEqual(sel('a[href$=".html"]'), ['a2']);
  assert.deepEqual(sel('a[href*="example.com"]'), ['a3']);
  assert.deepEqual(sel('[data-kind~="List"]'), ['a2']);
  assert.deepEqual(sel('[data-kind~="Lis"]'), []);
  assert.deepEqual(sel('[data-kind~="Movie List"]'), []);
  assert.deepEqual(sel('[class~=dark]'), ['main']);
  assert.deepEqual(sel('[ title = "Home page" ]'), ['a1']);
  assert.deepEqual(sel('a[href][title]'), ['a1']);
  assert.deepEqual(sel('a[HREF="/home"]'), ['a1']);
  // Empty values match nothing for the substring operators.
  assert.deepEqual(sel('a[href^=""]'), []);
  assert.deepEqual(sel('a[href$=""]'), []);
  assert.deepEqual(sel('a[href*=""]'), []);
  assert.deepEqual(sel('a[target=""]'), []);
});

test('the i flag compares attribute values without regard to case', () => {
  assert.deepEqual(sel('[data-kind="movie list"]'), []);
  assert.deepEqual(sel('[data-kind="movie list" i]'), ['a2']);
  assert.deepEqual(sel('[data-kind="MOVIE LIST"i]'), ['a2']);
  assert.deepEqual(sel('[data-kind^="MOVIE" i]'), ['a2']);
  assert.deepEqual(sel('[data-kind$=LIST I]'), ['a2']);
  assert.deepEqual(sel('[data-kind*="e l" i]'), ['a2']);
  assert.deepEqual(sel('[data-kind~="list" i]'), ['a2']);
  assert.deepEqual(sel('[lang=en-us i]'), ['a2']);
  assert.deepEqual(sel('[lang=i]'), []);
});

test('descendant, child, adjacent and general sibling combinators', () => {
  assert.deepEqual(sel('#main p'), ['p1', 'p2', 'p3']);
  assert.deepEqual(sel('#main > p'), ['p1', 'p2']);
  assert.deepEqual(sel('#main>p'), ['p1', 'p2']);
  assert.deepEqual(sel('ul a'), ['a1', 'a2', 'a3']);
  assert.deepEqual(sel('ul > a'), []);
  assert.deepEqual(sel('body div div a'), ['a4']);
  assert.deepEqual(sel('p + p'), ['p2']);
  assert.deepEqual(sel('ul + p'), ['p1']);
  assert.deepEqual(sel('h1 + p'), []);
  assert.deepEqual(sel('h1 ~ p'), ['p1', 'p2']);
  assert.deepEqual(sel('ul ~ *'), ['p1', 'p2', 'inner', 's2']);
  assert.deepEqual(sel('p ~ span'), ['s2']);
  assert.deepEqual(sel('span ~ p'), []);
  assert.deepEqual(sel('li.active + li > a'), ['a3']);
  assert.deepEqual(sel('li.first ~ li a'), ['a2', 'a3']);
  assert.deepEqual(sel('#main > div > p > a'), ['a4']);
  assert.deepEqual(sel('html body #nav li:first-child a'), ['a1']);
  // Backtracking: the nearest matching ancestor is not always the right one.
  assert.deepEqual(sel('.dark > .wrap a'), ['a4']);
  assert.deepEqual(sel('body > div p > a'), ['a4']);
});

test('selector lists give document order without duplicates', () => {
  assert.deepEqual(sel('p, a'), ['a1', 'a2', 'a3', 'p1', 'p2', 'p3', 'a4', 'p4']);
  assert.deepEqual(sel('#p2 , .note,p.note'), ['p2']);
  assert.deepEqual(sel('span, #s1, li > span'), ['s1', 's2']);
  assert.deepEqual(sel('#a4,#a1'), ['a1', 'a4']);
});

test(':first-child, :last-child and :nth-child', () => {
  assert.deepEqual(sel('li:first-child'), ['l1']);
  assert.deepEqual(sel('li:last-child'), ['l4']);
  assert.deepEqual(sel('li:nth-child(2)'), ['l2']);
  assert.deepEqual(sel('li:nth-child( 3 )'), ['l3']);
  assert.deepEqual(sel('li:nth-child(+4)'), ['l4']);
  assert.deepEqual(sel('li:nth-child(5)'), []);
  assert.deepEqual(sel('li:nth-child(0)'), []);
  assert.deepEqual(sel('li:nth-child(-1)'), []);
  assert.deepEqual(sel('p:first-child'), ['p3', 'p4']);
  assert.deepEqual(sel('#main > :last-child'), ['s2']);
  assert.deepEqual(sel('#main > :nth-child(3)'), ['p1']);
  assert.deepEqual(sel('a:first-child:last-child'), ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(sel('li > :first-child:last-child'), ['a1', 'a2', 'a3', 's1']);
  assert.deepEqual(tags(page.selectAll(':first-child')).slice(0, 3), ['html', 'head', 'title']);
});

test(':not() with a compound selector', () => {
  assert.deepEqual(sel('li:not(.active)'), ['l1', 'l3', 'l4']);
  assert.deepEqual(sel('li:not(.first):not(.last)'), ['l2', 'l3']);
  assert.deepEqual(sel('a:not([href^="/"])'), ['a3']);
  assert.deepEqual(sel('p:not(#p1.x)'), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(sel('p:not( p )'), []);
  // The <h1> has no id.
  assert.deepEqual(sel('#main > :not(p):not(div):not(ul)'), [undefined, 's2']);
  assert.deepEqual(sel('li:not(:first-child) > a'), ['a2', 'a3']);
});

test(':contains() is a case-sensitive substring test on the text', () => {
  assert.deepEqual(sel('a:contains("Movies")'), ['a2']);
  assert.deepEqual(sel("a:contains('Movies')"), ['a2']);
  assert.deepEqual(sel('a:contains(Movies)'), ['a2']);
  assert.deepEqual(sel('a:contains("movies")'), []);
  assert.deepEqual(sel('p:contains("First para")'), ['p1']);
  assert.deepEqual(sel('p:contains("para"):contains("Second")'), ['p2']);
  assert.deepEqual(sel('li:contains("o")'), ['l1', 'l2', 'l4']);
  assert.deepEqual(sel('a:contains("deep link")'), ['a4']);
  assert.deepEqual(sel('a:contains(")")'), []);
  assert.deepEqual(sel('div:contains("Footer")'), ['foot']);
});

test('select returns the first match or null', () => {
  assert.equal(attr(page.select('a'), 'id'), 'a1');
  assert.equal(attr(page.select('p.note, li'), 'id'), 'l1');
  assert.equal(page.select('video'), null);
});

test('a scope limits the candidates to its descendants', () => {
  const inner = page.select('#inner') as HtmlNode;
  const nav = page.select('#nav') as HtmlNode;
  assert.deepEqual(sel('p', inner), ['p3']);
  assert.deepEqual(sel('a', nav), ['a1', 'a2', 'a3']);
  assert.deepEqual(sel('div', inner), []);
  assert.equal(attr(page.select('a', inner), 'id'), 'a4');
  assert.equal(page.select('li', inner), null);
  // As with querySelectorAll, ancestors outside the scope still count.
  assert.deepEqual(sel('#main a', inner), ['a4']);
  assert.deepEqual(sel('li', (page.select('#a1') as HtmlNode).children[0]), []);
});

test('escapes in selectors', () => {
  const doc = parseHtml('<div id="1a" class="md:flex w-1/2">x</div><div id="a.b" class="c#d">y</div><i id="é">z</i>');
  assert.equal(textOf(doc.select('.md\\:flex') as HtmlNode), 'x');
  assert.equal(textOf(doc.select('.w-1\\/2') as HtmlNode), 'x');
  assert.equal(textOf(doc.select('#\\31 a') as HtmlNode), 'x');
  assert.equal(textOf(doc.select('#\\000031a') as HtmlNode), 'x');
  assert.equal(textOf(doc.select('#1a') as HtmlNode), 'x');
  assert.equal(textOf(doc.select('#a\\.b') as HtmlNode), 'y');
  assert.equal(textOf(doc.select('.c\\#d') as HtmlNode), 'y');
  assert.equal(textOf(doc.select('#é') as HtmlNode), 'z');
  assert.equal(textOf(doc.select('[id="a.b"]') as HtmlNode), 'y');
  assert.equal(textOf(doc.select('[class="md:flex w-1/2"]') as HtmlNode), 'x');
  assert.equal(textOf(doc.select('[id="\\61 .b"]') as HtmlNode), 'y');
  assert.equal(textOf(doc.select('div:contains("\\79")') as HtmlNode), 'y');
});

test('unsupported or malformed selectors throw SelectorSyntaxError', () => {
  const bad = [
    '',
    '   ',
    ',',
    'div,',
    ',div',
    'div,,p',
    'div >',
    '> div',
    'div > > p',
    'div + ',
    '~ p',
    'div!',
    'div $',
    'a:hover',
    'a:nth-of-type(1)',
    'a:first-of-type',
    'a:',
    'a::before',
    'li:nth-child(2n+1)',
    'li:nth-child(odd)',
    'li:nth-child(n)',
    'li:nth-child()',
    'li:nth-child(1',
    'li:nth-child',
    'li:first-child(1)',
    'a:not(b c)',
    'a:not(b, c)',
    'a:not(b > c)',
    'a:not()',
    'a:not(b',
    'a:contains()',
    'a:contains("x"',
    'a:contains("x',
    'a:contains(x',
    'a:has(b)',
    'a:is(b)',
    '[',
    '[]',
    '[a',
    '[a=',
    '[a=]',
    '[a="b"',
    '[a="b]',
    '[a|=b]',
    '[a!=b]',
    '[a==b]',
    '[a=b s]',
    '[a=b i j]',
    '[a=b c]',
    '[a=b,c]',
    '[a=b=c]',
    '[a=(b)]',
    '[a=b"c"]',
    '[a b]',
    '[=b]',
    '#',
    '.',
    'div.',
    'div#',
    '1a',
    'a|b',
    'a || b',
    '&',
    'a\\',
    '(a)',
    'a)',
  ];
  for (const selector of bad) {
    assert.throws(() => page.selectAll(selector), SelectorSyntaxError, `selectAll(${JSON.stringify(selector)})`);
    assert.throws(() => page.select(selector), SelectorSyntaxError, `select(${JSON.stringify(selector)})`);
  }
  assert.throws(() => page.select(7 as unknown as string), SelectorSyntaxError);
  const error = (() => {
    try {
      page.select('a:hover');
    } catch (thrown) {
      return thrown as Error;
    }
    return undefined;
  })();
  assert.ok(error instanceof SelectorSyntaxError);
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'SelectorSyntaxError');
  assert.match(error.message, /a:hover/);
});

test('complex selectors stay fast on wide and deep trees', () => {
  const wide = parseHtml('<div>' + '<p class=a>x</p><b>y</b>'.repeat(50_000) + '</div>');
  const deep = parseHtml('<div>'.repeat(2000) + '<a>x</a>');
  const started = performance.now();
  assert.equal(wide.selectAll('span ~ p').length, 0);
  assert.equal(wide.selectAll('p ~ b').length, 50_000);
  assert.equal(wide.selectAll('b + p').length, 49_999);
  assert.equal(wide.selectAll('p:nth-child(3)').length, 1);
  assert.equal(wide.selectAll('b:last-child').length, 1);
  assert.equal(wide.xpath('//p[3]').length, 1);
  assert.equal(deep.selectAll('span div div div a').length, 0);
  assert.equal(deep.selectAll('section > div div > div a').length, 0);
  assert.equal(deep.selectAll('div div div div a').length, 1);
  assert.equal(deep.xpath('//div//div//a').length, 1);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 5000, `took ${elapsed.toFixed(0)} ms`);
});

// ---------- XPath ----------

const XPAGE = `<!DOCTYPE html>
<html>
<head>
  <title>Watch</title>
  <meta property="og:video" content="https://example.com/v/og.mp4">
  <meta property="og:title" content="A title">
  <meta name="description" content="About">
  <script type="application/ld+json">{"@type":"Movie","name":"X"}</script>
  <script type="text/javascript">var a = 1;</script>
</head>
<body>
  <div id="player" class="player main">
    <div class="frame"><iframe id="f1" src="https://example.com/embed/1" allowfullscreen></iframe></div>
    <iframe id="f2" src="https://example.com/embed/2"></iframe>
  </div>
  <div id="other"><iframe id="f3" src="https://example.com/embed/3"></iframe></div>
  <ul id="eps">
    <li><a id="e1" href="/ep/1">Episode 1</a></li>
    <li class="cur"><a id="e2" href="/ep/2">Episode 2</a></li>
    <li><a id="e3" href="/ep/3" class="hls" data-src="https://example.com/hls/3/master.m3u8?t=1">Episode 3</a><a id="e3b" href="https://example.com/dl/3.m3u8">Mirror</a></li>
  </ul>
  <ul id="more"><li><a id="m1" href="/more/1">More</a></li><li><b>x</b><a id="m2" href="/more/2.m3u8">Next</a></li></ul>
  <p id="t">lead <b>bold</b> tail</p>
</body>
</html>`;
const xdoc = parseHtml(XPAGE);
const xp = (expression: string, scope?: HtmlNode): (string | undefined)[] => ids(xdoc.xpath(expression, scope));

test('the XPath expressions extraction relies on', () => {
  assert.deepEqual(xdoc.xpath('//script[@type="application/ld+json"]/text()'), ['{"@type":"Movie","name":"X"}']);
  assert.deepEqual(xdoc.xpath('//div[@id="player"]//iframe/@src'), ['https://example.com/embed/1', 'https://example.com/embed/2']);
  assert.deepEqual(xdoc.xpath('//ul/li[2]/a/@href'), ['/ep/2', '/more/2.m3u8']);
  assert.deepEqual(xdoc.xpath('//a[contains(@href,".m3u8")]/@href'), ['https://example.com/dl/3.m3u8', '/more/2.m3u8']);
  assert.deepEqual(xdoc.xpath('/html/head/meta[@property="og:video"]/@content'), ['https://example.com/v/og.mp4']);
});

test('absolute and relative paths with / and //', () => {
  assert.deepEqual(tags(xdoc.xpath('/html')), ['html']);
  assert.deepEqual(tags(xdoc.xpath('html')), ['html']);
  assert.deepEqual(tags(xdoc.xpath('/html/body/ul')), ['ul', 'ul']);
  assert.deepEqual(tags(xdoc.xpath('html/head/title')), ['title']);
  assert.deepEqual(xdoc.xpath('/body'), []);
  assert.deepEqual(xdoc.xpath('/html/title'), []);
  assert.deepEqual(xp('//iframe'), ['f1', 'f2', 'f3']);
  assert.deepEqual(xp('/html//iframe'), ['f1', 'f2', 'f3']);
  assert.deepEqual(xp('/html/body/div/iframe'), ['f2', 'f3']);
  assert.deepEqual(xp('//div/div/iframe'), ['f1']);
  assert.deepEqual(xp(' //ul / li / a '), ['e1', 'e2', 'e3', 'e3b', 'm1', 'm2']);
  assert.deepEqual(xp('//UL/LI/A'), ['e1', 'e2', 'e3', 'e3b', 'm1', 'm2']);
});

test('* and text() node tests', () => {
  assert.deepEqual(xp('//ul/*/a'), ['e1', 'e2', 'e3', 'e3b', 'm1', 'm2']);
  assert.deepEqual(tags(xdoc.xpath('/html/*')), ['head', 'body']);
  assert.deepEqual(tags(xdoc.xpath('/*')), ['html']);
  assert.deepEqual(tags(xdoc.xpath('//p/*')), ['b']);
  assert.deepEqual(xdoc.xpath('//p/text()'), ['lead ', ' tail']);
  assert.deepEqual(xdoc.xpath('//p//text()'), ['lead ', 'bold', ' tail']);
  assert.deepEqual(xdoc.xpath('//title/text()'), ['Watch']);
  assert.deepEqual(xdoc.xpath('//p/text()[2]'), [' tail']);
  assert.deepEqual(xdoc.xpath('//ul[@id="eps"]/li/a/text()'), ['Episode 1', 'Episode 2', 'Episode 3', 'Mirror']);
  assert.deepEqual(xdoc.xpath('//iframe/text()'), []);
});

test('@attr endings return strings, skipping elements without the attribute', () => {
  assert.deepEqual(xdoc.xpath('//iframe/@src'), ['https://example.com/embed/1', 'https://example.com/embed/2', 'https://example.com/embed/3']);
  assert.deepEqual(xdoc.xpath('//a/@data-src'), ['https://example.com/hls/3/master.m3u8?t=1']);
  assert.deepEqual(xdoc.xpath('//iframe/@allowfullscreen'), ['']);
  assert.deepEqual(xdoc.xpath('//li/@CLASS'), ['cur']);
  assert.deepEqual(xdoc.xpath('//ul//@class'), ['cur', 'hls']);
  assert.deepEqual(xdoc.xpath('//ul/@id'), ['eps', 'more']);
  assert.deepEqual(xdoc.xpath('//meta/@nope'), []);
  assert.deepEqual(xdoc.xpath('@id', xdoc.select('#player') as HtmlNode), ['player']);
  assert.deepEqual(xdoc.xpath('//@id', xdoc.select('#more') as HtmlNode), ['more', 'm1', 'm2']);
});

test('position predicates count under each parent', () => {
  assert.deepEqual(xp('//ul/li[1]/a'), ['e1', 'm1']);
  assert.deepEqual(xp('//li/a[2]'), ['e3b']);
  assert.deepEqual(xp('//li/a[1]'), ['e1', 'e2', 'e3', 'm1', 'm2']);
  assert.deepEqual(xp('//a[1]'), ['e1', 'e2', 'e3', 'm1', 'm2']);
  assert.deepEqual(xp('//iframe[1]'), ['f1', 'f2', 'f3']);
  assert.deepEqual(xp('//div[@id="player"]/iframe[1]'), ['f2']);
  assert.deepEqual(xp('//ul[2]/li/a'), ['m1', 'm2']);
  assert.deepEqual(xp('//ul/li[ 3 ]/a'), ['e3', 'e3b']);
  assert.deepEqual(xp('//ul/li[4]'), []);
  assert.deepEqual(xp('//ul/li[0]'), []);
  assert.deepEqual(tags(xdoc.xpath('/html/body/*[1]')), ['div']);
});

test('attribute predicates', () => {
  assert.deepEqual(xp('//a[@class]'), ['e3']);
  assert.deepEqual(xp('//a[@data-src]'), ['e3']);
  assert.deepEqual(xp('//a[@href="/ep/2"]'), ['e2']);
  assert.deepEqual(xp("//a[@href='/ep/2']"), ['e2']);
  assert.deepEqual(xp('//a[ @href = "/ep/2" ]'), ['e2']);
  assert.deepEqual(xp('//a[@href="/EP/2"]'), []);
  assert.deepEqual(xp('//a[contains(@href,"/ep/")]'), ['e1', 'e2', 'e3']);
  assert.deepEqual(xp('//a[contains( @href , "more" )]'), ['m1', 'm2']);
  assert.deepEqual(xp('//a[starts-with(@href,"https://")]'), ['e3b']);
  assert.deepEqual(xp("//a[starts-with(@href,'/more')]"), ['m1', 'm2']);
  assert.deepEqual(xp('//a[contains(@class,"hls")]'), ['e3']);
  assert.deepEqual(xp('//div[@class="player main"]'), ['player']);
  assert.deepEqual(xp('//*[@id="t"]'), ['t']);
  assert.deepEqual(xdoc.xpath(`//meta[@content='About']/@name`), ['description']);
  assert.deepEqual(xdoc.xpath('//a[@title="it\'s"]'), []);
});

test('text predicates', () => {
  assert.deepEqual(xp('//a[text()="Next"]'), ['m2']);
  assert.deepEqual(xp('//a[text()="next"]'), []);
  assert.deepEqual(xp('//a[contains(text(),"Episode")]'), ['e1', 'e2', 'e3']);
  assert.deepEqual(xp('//a[contains(text(), "sode 2")]'), ['e2']);
  assert.deepEqual(xp('//a[starts-with(text(),"Mir")]'), ['e3b']);
  assert.deepEqual(xp('//p[text()=" tail"]'), ['t']);
  // contains(text(), …) looks at the first text node, as XPath 1.0 does.
  assert.deepEqual(xp('//p[contains(text(),"lead")]'), ['t']);
  assert.deepEqual(xp('//p[contains(text(),"tail")]'), []);
  assert.deepEqual(xp('//p[contains(text(),"bold")]'), []);
});

test('several predicates in a row apply left to right', () => {
  assert.deepEqual(xp('//a[contains(@href,"/ep/")][2]'), []);
  assert.deepEqual(xp('//li/a[contains(@href,".m3u8")][1]'), ['e3b', 'm2']);
  assert.deepEqual(xp('//li/a[2][contains(@href,".m3u8")]'), ['e3b']);
  assert.deepEqual(xp('//li/a[1][contains(@href,".m3u8")]'), ['m2']);
  assert.deepEqual(xp('//ul/li[@class="cur"][1]/a'), ['e2']);
  assert.deepEqual(xp('//ul/li[1][@class="cur"]/a'), []);
  assert.deepEqual(xp('//a[@class][@data-src][starts-with(@href,"/ep")][text()="Episode 3"]'), ['e3']);
  assert.deepEqual(xdoc.xpath('//ul[@id="eps"]/li[3]/a[2]/@href'), ['https://example.com/dl/3.m3u8']);
});

test('a scope stands in for the document', () => {
  const eps = xdoc.select('#eps') as HtmlNode;
  const player = xdoc.select('#player') as HtmlNode;
  assert.deepEqual(xp('//a', eps), ['e1', 'e2', 'e3', 'e3b']);
  assert.deepEqual(xp('li/a', eps), ['e1', 'e2', 'e3', 'e3b']);
  assert.deepEqual(xp('/li/a', eps), ['e1', 'e2', 'e3', 'e3b']);
  assert.deepEqual(xp('li[2]/a', eps), ['e2']);
  assert.deepEqual(xp('a', eps), []);
  assert.deepEqual(xp('iframe', player), ['f2']);
  assert.deepEqual(xp('//iframe', player), ['f1', 'f2']);
  assert.deepEqual(xdoc.xpath('//iframe/@src', xdoc.select('#other') as HtmlNode), ['https://example.com/embed/3']);
  assert.deepEqual(xp('//ul', eps), []);
});

test('node-sets stay in document order without duplicates when contexts nest', () => {
  const doc = parseHtml('<div id="A"><div id="B"><a id="a1"></a><div id="C"><a id="a2"></a></div></div><a id="a3"></a></div><a id="a4"></a>');
  const got = (expression: string): (string | undefined)[] => ids(doc.xpath(expression));
  assert.deepEqual(got('//div/a'), ['a1', 'a2', 'a3']);
  assert.deepEqual(got('//div//a'), ['a1', 'a2', 'a3']);
  assert.deepEqual(got('//div//div'), ['B', 'C']);
  assert.deepEqual(got('//div/div/a'), ['a1', 'a2']);
  assert.deepEqual(got('//div//div//a'), ['a1', 'a2']);
  assert.deepEqual(got('//div/*'), ['B', 'a1', 'C', 'a2', 'a3']);
  assert.deepEqual(got('//div/a[1]'), ['a1', 'a2', 'a3']);
  assert.deepEqual(got('//*/a'), ['a1', 'a2', 'a3']);
  assert.deepEqual(got('//a'), ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(doc.xpath('//div//@id'), ['A', 'B', 'a1', 'C', 'a2', 'a3']);
  assert.deepEqual(doc.xpath('//div/@id'), ['A', 'B', 'C']);
});

test('names may carry one namespace-style prefix', () => {
  const doc = parseHtml('<svg><use xlink:href="#icon"/><svg:rect id="r"/></svg>');
  assert.deepEqual(doc.xpath('//use/@xlink:href'), ['#icon']);
  assert.deepEqual(ids(doc.xpath('//svg:rect')), ['r']);
  assert.deepEqual(tags(doc.xpath('//*[@xlink:href="#icon"]')), ['use']);
});

test('unsupported or malformed XPath throws SelectorSyntaxError', () => {
  const bad = [
    '',
    '  ',
    '/',
    '//',
    '///a',
    '//a/',
    '//a//',
    '.',
    '..',
    './a',
    '//a/..',
    '//a/.',
    'child::a',
    '//a/parent::li',
    '//a | //b',
    '//a[last()]',
    '//a[position()=1]',
    '//a[position()<3]',
    '//a[-1]',
    '//a[1',
    '//a[]',
    '//a[1.5]',
    '//a[@href and @id]',
    '//a[@href or @id]',
    '//a[@href!="x"]',
    '//a[@href=x]',
    '//a[@href="x]',
    '//a[@*]',
    '//a[not(@href)]',
    '//a[contains(@href)]',
    '//a[contains(@href,"x"]',
    '//a[contains(.,"x")]',
    '//a[contains("x",@href)]',
    '//a[normalize-space(text())="x"]',
    '//a[text()]',
    '//a[text()!="x"]',
    '//a[string-length(@href)>1]',
    '//a[b]',
    '//a[b/@c="d"]',
    '//a/text()/b',
    '//a/@href/b',
    '//a/@href[1]',
    '//@*',
    '//comment()',
    '//node()',
    '//a/text(',
    '//a/text(1)',
    '//a()',
    '//a b',
    '//a]',
    '//1a',
    '//a/@',
    '//a/$x',
    '(//a)[1]',
    'count(//a)',
    '//a="x"',
  ];
  for (const expression of bad) {
    assert.throws(() => xdoc.xpath(expression), SelectorSyntaxError, `xpath(${JSON.stringify(expression)})`);
  }
  assert.throws(() => xdoc.xpath(undefined as unknown as string), SelectorSyntaxError);
  assert.throws(() => xdoc.xpath('//a[last()]'), /Invalid XPath "\/\/a\[last\(\)\]"/);
});
