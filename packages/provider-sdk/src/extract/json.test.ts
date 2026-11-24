import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMeta, findEmbeddedJson, findJsonLd, jsonPath, safeJsonParse } from './json.js';

// ---------- jsonPath ----------

const DATA = {
  title: 'Example',
  'og-title': 'Dashed',
  '@type': 'Movie',
  'odd key.with[stuff]': 1,
  empty: null,
  nothing: [],
  player: {
    id: 7,
    sources: [
      { file: 'https://example.com/v/360.mp4', label: '360p', type: 'mp4', height: 360, default: false },
      { file: 'https://example.com/v/master.m3u8', label: 'Auto', type: 'hls', default: true, drm: null },
      { file: 'https://example.com/v/1080.mp4', label: '1080p', type: 'mp4', height: 1080, meta: { codec: 'h264' } },
    ],
    tracks: [{ file: 'https://example.com/s/en.vtt', label: 'English', kind: 'captions' }],
  },
  related: { a: { id: 1, label: 'A' }, b: { id: 2 }, c: 'plain' },
  matrix: [
    [1, 2],
    [3, 4],
  ],
};

test('jsonPath: root, keys, bracket keys and indexes', () => {
  assert.deepEqual(jsonPath(DATA, '$'), [DATA]);
  assert.deepEqual(jsonPath(DATA, ' $ '), [DATA]);
  assert.deepEqual(jsonPath(DATA, '$.title'), ['Example']);
  assert.deepEqual(jsonPath(DATA, '$.player.id'), [7]);
  assert.deepEqual(jsonPath(DATA, "$['title']"), ['Example']);
  assert.deepEqual(jsonPath(DATA, '$["player"]["id"]'), [7]);
  assert.deepEqual(jsonPath(DATA, "$['odd key.with[stuff]']"), [1]);
  assert.deepEqual(jsonPath(DATA, '$.og-title'), ['Dashed']);
  assert.deepEqual(jsonPath(DATA, '$.@type'), ['Movie']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[0].label'), ['360p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[2].label'), ['1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[-1].label'), ['1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[-3].label'), ['360p']);
  assert.deepEqual(jsonPath(DATA, "$.player['sources'][ 1 ]['label']"), ['Auto']);
  assert.deepEqual(jsonPath(DATA, '$.matrix[1][0]'), [3]);
  assert.deepEqual(jsonPath(DATA, '$.empty'), [null]);
  assert.deepEqual(jsonPath([10, 20, 30], '$[1]'), [20]);
  assert.deepEqual(jsonPath('text', '$'), ['text']);
  assert.deepEqual(jsonPath({ "it's": 1 }, "$['it\\'s']"), [1]);
});

test('jsonPath: no match gives an empty array', () => {
  assert.deepEqual(jsonPath(DATA, '$.missing'), []);
  assert.deepEqual(jsonPath(DATA, '$.title.length'), []);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[3]'), []);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[-4]'), []);
  assert.deepEqual(jsonPath(DATA, '$.player[0]'), []);
  assert.deepEqual(jsonPath(DATA, '$.player.sources.file'), []);
  assert.deepEqual(jsonPath(DATA, '$.empty.x'), []);
  assert.deepEqual(jsonPath(DATA, '$.nothing[*]'), []);
  assert.deepEqual(jsonPath(DATA, '$.toString'), []);
  assert.deepEqual(jsonPath(DATA, '$.constructor.name'), []);
  assert.deepEqual(jsonPath(undefined, '$'), []);
  assert.deepEqual(jsonPath(undefined, '$.a'), []);
  assert.deepEqual(jsonPath(null, '$'), [null]);
  assert.deepEqual(jsonPath(null, '$.a'), []);
});

test('jsonPath: wildcards', () => {
  assert.deepEqual(jsonPath(DATA, '$.player.sources[*].label'), ['360p', 'Auto', '1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources.*.type'), ['mp4', 'hls', 'mp4']);
  assert.deepEqual(jsonPath(DATA, '$.related.*.id'), [1, 2]);
  assert.deepEqual(jsonPath(DATA, '$.related[*]'), [{ id: 1, label: 'A' }, { id: 2 }, 'plain']);
  assert.deepEqual(jsonPath(DATA, '$.matrix[*][*]'), [1, 2, 3, 4]);
  assert.deepEqual(jsonPath(DATA, '$.matrix.*[0]'), [1, 3]);
  assert.deepEqual(jsonPath(DATA, '$.title.*'), []);
});

test('jsonPath: recursive descent', () => {
  assert.deepEqual(jsonPath(DATA, '$..file'), ['https://example.com/v/360.mp4', 'https://example.com/v/master.m3u8', 'https://example.com/v/1080.mp4', 'https://example.com/s/en.vtt']);
  assert.deepEqual(jsonPath(DATA, '$..label'), ['360p', 'Auto', '1080p', 'English', 'A']);
  assert.deepEqual(jsonPath(DATA, '$..id'), [7, 1, 2]);
  assert.deepEqual(jsonPath(DATA, '$..codec'), ['h264']);
  assert.deepEqual(jsonPath(DATA, '$.player..label'), ['360p', 'Auto', '1080p', 'English']);
  assert.deepEqual(jsonPath(DATA, '$..sources[0].file'), ['https://example.com/v/360.mp4']);
  assert.deepEqual(jsonPath(DATA, '$..sources[*].height'), [360, 1080]);
  assert.deepEqual(jsonPath(DATA, "$..['@type']"), ['Movie']);
  assert.deepEqual(jsonPath(DATA, '$..@type'), ['Movie']);
  assert.deepEqual(jsonPath(DATA, '$..nope'), []);
  // A match is reported before the matches inside it.
  assert.deepEqual(jsonPath({ a: { a: { a: 1 } } }, '$..a'), [{ a: { a: 1 } }, { a: 1 }, 1]);
  assert.deepEqual(jsonPath({ x: [{ a: 1 }, { b: { a: 2 } }], a: 3 }, '$..a'), [3, 1, 2]);
  assert.deepEqual(jsonPath({ a: [1, { b: 2 }] }, '$..*'), [[1, { b: 2 }], 1, { b: 2 }, 2]);
});

test('jsonPath: filters', () => {
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.type=="hls")].file'), ['https://example.com/v/master.m3u8']);
  assert.deepEqual(jsonPath(DATA, "$.player.sources[?(@.type=='mp4')].label"), ['360p', '1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.type=="hls")]'), [DATA.player.sources[1]]);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.height==1080)].label'), ['1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.height=="1080")].label'), []);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.default==true)].label'), ['Auto']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.default==false)].label'), ['360p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.drm==null)].label'), ['Auto']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.height)].label'), ['360p', '1080p']);
  // Present is enough, even when the value is null or false.
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.drm)].label'), ['Auto']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.default)].label'), ['360p', 'Auto']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.nope)]'), []);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.meta.codec=="h264")].label'), ['1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?(@.meta.codec)].label'), ['1080p']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[ ?( @.type == "hls" ) ].label'), ['Auto']);
  assert.deepEqual(jsonPath(DATA, '$.player.sources[?@.type=="hls"].label'), ['Auto']);
  assert.deepEqual(jsonPath(DATA, '$.related[?(@.label)].id'), [1]);
  assert.deepEqual(jsonPath(DATA, '$.related[?(@.id==2)]'), [{ id: 2 }]);
  assert.deepEqual(jsonPath(DATA, '$..sources[?(@.type=="mp4")].height'), [360, 1080]);
  assert.deepEqual(jsonPath(DATA, '$..tracks[?(@.kind=="captions")]'), [DATA.player.tracks[0]]);
  assert.deepEqual(jsonPath([{ n: -1.5 }, { n: 2 }, { n: 1e3 }], '$[?(@.n==-1.5)]'), [{ n: -1.5 }]);
  assert.deepEqual(jsonPath([{ n: -1.5 }, { n: 2 }, { n: 1e3 }], '$[?(@.n==1e3)]'), [{ n: 1000 }]);
  assert.deepEqual(jsonPath([{ s: 'a"b' }, { s: "it's" }], `$[?(@.s=='it\\'s')]`), [{ s: "it's" }]);
  assert.deepEqual(jsonPath([{ '@type': 'VideoObject', u: 1 }, { '@type': 'Person' }], "$[?(@['@type']=='VideoObject')].u"), [1]);
  assert.deepEqual(jsonPath([{ '@type': 'VideoObject', u: 1 }, { '@type': 'Person' }], '$[?(@.@type=="VideoObject")].u'), [1]);
  assert.deepEqual(jsonPath('text', '$[?(@.a)]'), []);
});

test('jsonPath: unsupported expressions throw SyntaxError', () => {
  const bad = [
    '',
    ' ',
    'a',
    'a.b',
    '.a',
    '@.a',
    '$a',
    '$.',
    '$..',
    '$...a',
    '$.a.',
    '$.a b',
    '$ .a',
    '$[',
    '$[]',
    '$[a]',
    '$[0',
    '$[0:2]',
    '$[1:]',
    '$[0,1]',
    "$['a','b']",
    "$['a'",
    "$['a]",
    '$[1.5]',
    '$[--1]',
    '$..[0]',
    '$..[*]',
    '$..[?(@.a)]',
    '$.a[?]',
    '$.a[?()]',
    '$.a[?(@)]',
    '$.a[?(@.b]',
    '$.a[?(@.b))]',
    '$.a[?(@.b==)]',
    '$.a[?(@.b=1)]',
    '$.a[?(@.b===1)]',
    '$.a[?(@.b!=1)]',
    '$.a[?(@.b>1)]',
    '$.a[?(@.b<1)]',
    '$.a[?(@.b==1 && @.c==2)]',
    '$.a[?(@.b==1 || @.c)]',
    '$.a[?(@.b==undefined)]',
    '$.a[?(@.b==x)]',
    '$.a[?(@.b=="x)]',
    '$.a[?(@.b==1x)]',
    '$.a[?(!@.b)]',
    '$.a[?(@.b=~/x/)]',
    '$.a[?(@.length>1)]',
    '$.a[(@.length-1)]',
    '$.a.length()',
    '$.a^',
    '$.a~',
    '$(a)',
    '$.a,$.b',
  ];
  for (const path of bad) {
    assert.throws(() => jsonPath(DATA, path), SyntaxError, `jsonPath(${JSON.stringify(path)})`);
  }
  assert.throws(() => jsonPath(DATA, undefined as unknown as string), SyntaxError);
  // The path is checked even when there is nothing to search.
  assert.throws(() => jsonPath(undefined, '$['), SyntaxError);
  assert.throws(() => jsonPath(DATA, '$.a[0:2]'), /\$\.a\[0:2\]/);
});

// ---------- safeJsonParse ----------

test('safeJsonParse parses JSON and returns undefined for anything else', () => {
  assert.deepEqual(safeJsonParse('{"a":[1,2,{"b":null}]}'), { a: [1, 2, { b: null }] });
  assert.deepEqual(safeJsonParse('[1, 2]'), [1, 2]);
  assert.equal(safeJsonParse('"text"'), 'text');
  assert.equal(safeJsonParse('12.5'), 12.5);
  assert.equal(safeJsonParse('true'), true);
  assert.equal(safeJsonParse('null'), null);
  assert.deepEqual(safeJsonParse('  \n{"a":1}\n  '), { a: 1 });
  for (const bad of ['', '   ', '{', '{"a":}', "{'a':1}", '{a:1}', '[1,]', 'undefined', 'NaN', '<html></html>', '{"a":1} trailing', 'callback({"a":1})']) {
    assert.equal(safeJsonParse(bad), undefined, bad);
  }
  assert.equal(safeJsonParse(undefined as unknown as string), undefined);
  assert.equal(safeJsonParse(null as unknown as string), undefined);
  assert.equal(safeJsonParse({ a: 1 } as unknown as string), undefined);
});

test('safeJsonParse accepts escaped slashes, a BOM and XSSI prefixes', () => {
  assert.deepEqual(safeJsonParse('{"url":"https:\\/\\/example.com\\/a\\/b.m3u8","u":"\\u0026"}'), { url: 'https://example.com/a/b.m3u8', u: '&' });
  assert.deepEqual(safeJsonParse('﻿{"a":1}'), { a: 1 });
  assert.deepEqual(safeJsonParse('﻿  [1]'), [1]);
  assert.deepEqual(safeJsonParse(`)]}'\n{"a":1}`), { a: 1 });
  assert.deepEqual(safeJsonParse(`)]}',\n[1,2]`), [1, 2]);
  assert.deepEqual(safeJsonParse(`)]}'{"a":1}`), { a: 1 });
  assert.deepEqual(safeJsonParse(`﻿)]}'\r\n\r\n{"a":1}`), { a: 1 });
  assert.deepEqual(safeJsonParse('while(1);{"a":1}'), { a: 1 });
  assert.deepEqual(safeJsonParse('while (true) ; [1]'), [1]);
  assert.deepEqual(safeJsonParse('for(;;);{"a":1}'), { a: 1 });
  assert.equal(safeJsonParse(`)]}'`), undefined);
  assert.equal(safeJsonParse(`)]}'\nnot json`), undefined);
});

// ---------- findJsonLd ----------

test('findJsonLd collects every block and flattens @graph', () => {
  const html = `<!DOCTYPE html><html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Movie","name":"One","url":"https:\\/\\/example.com\\/one"}</script>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"Site"},
        {"@type":"VideoObject","name":"Clip","contentUrl":"https://example.com/clip.mp4","text":"a </b> < b"},
        {"@graph":[{"@type":"Person","name":"Nested"}]},
        "not an object", 5, null
      ]}
    </script>
    <script type="application/ld+json">[{"@type":"BreadcrumbList"},[{"@type":"Thing","name":"In an array"}],7]</script>
    <script type="application/ld+json">{"@type":"Broken", </script>
    <script type="application/ld+json"></script>
    <script type="application/ld+json">"just a string"</script>
    <script type="application/json">{"@type":"NotLd"}</script>
    <script>var ld = {"@type":"AlsoNotLd"};</script>
  </head><body>
    <script type="Application/LD+JSON; charset=utf-8">{"@type":"Episode","episodeNumber":3}</script>
    <script type='application/ld+json'>
      <!--
      {"@type":"Commented"}
      //-->
    </script>
    <script type="application/ld+json">//<![CDATA[
      {"@type":"InCdata"}
    //]]></script>
  </body></html>`;
  assert.deepEqual(findJsonLd(html), [
    { '@context': 'https://schema.org', '@type': 'Movie', name: 'One', url: 'https://example.com/one' },
    { '@type': 'WebSite', name: 'Site' },
    { '@type': 'VideoObject', name: 'Clip', contentUrl: 'https://example.com/clip.mp4', text: 'a </b> < b' },
    { '@type': 'Person', name: 'Nested' },
    { '@type': 'BreadcrumbList' },
    { '@type': 'Thing', name: 'In an array' },
    { '@type': 'Episode', episodeNumber: 3 },
    { '@type': 'Commented' },
    { '@type': 'InCdata' },
  ]);
});

test('findJsonLd gives nothing for pages without usable JSON-LD', () => {
  assert.deepEqual(findJsonLd(''), []);
  assert.deepEqual(findJsonLd('<p>application/ld+json</p>'), []);
  assert.deepEqual(findJsonLd('<script type="application/ld+json">{oops}</script>'), []);
  assert.deepEqual(findJsonLd('<!-- <script type="application/ld+json">{"@type":"Hidden"}</script> -->'), []);
  assert.deepEqual(findJsonLd('<script type="application/ld+json">{"@type":"Unclosed"}'), [{ '@type': 'Unclosed' }]);
  assert.deepEqual(findJsonLd(undefined as unknown as string), []);
});

// ---------- findEmbeddedJson ----------

test('findEmbeddedJson finds JSON scripts and says where each came from', () => {
  const html = `
    <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"id":1,"html":"<b>x</b> </script"}}}</script>
    <script type="application/json" data-for="player">[1,2,3]</script>
    <script id="state">{"plain":"script that is JSON as a whole"}</script>
    <script type="application/vnd.api+json" id="api">{"data":[]}</script>
    <script type="application/json">{"broken": </script>
    <script type="application/ld+json">{"@type":"Movie"}</script>
    <script type="text/template" id="tpl"><div>{{ name }}</div></script>
    <script src="/app.js"></script>`;
  assert.deepEqual(findEmbeddedJson(html), [
    { source: 'script#__NEXT_DATA__', value: { props: { pageProps: { id: 1, html: '<b>x</b> </script' } } } },
    { source: 'script[type="application/json"]', value: [1, 2, 3] },
    { source: 'script#state', value: { plain: 'script that is JSON as a whole' } },
    { source: 'script#api', value: { data: [] } },
  ]);
  assert.deepEqual(findEmbeddedJson('<script>\n  {"a": 1}\n</script>'), [{ source: 'script', value: { a: 1 } }]);
  assert.deepEqual(findEmbeddedJson('<script id=__NEXT_DATA__>{"page":"/"}</script>'), [{ source: 'script#__NEXT_DATA__', value: { page: '/' } }]);
});

test('findEmbeddedJson finds assignments in scripts', () => {
  const html = `<html><body>
    <script>
      window.__DATA__ = {"user":null,"items":[{"id":1,"url":"https:\\/\\/example.com\\/a.m3u8"}]};
      var config = {"autoplay": true, "sources": [{"file": "/v/1.mp4"}], "n": -1.5e3};
      let   spaced   =   [ 1 , 2 , [ 3 ] ]  ;
      const x = ["a","b"]
      window["__STATE__"] = {"bracket": "member"};
      self.__next = window.other = {"chained": 1};
      a.b.c = {"deep": {"er": []}};
    </script>
    <script type="text/javascript">var late={"min":"ified"},other=[];</script>
  </body></html>`;
  assert.deepEqual(findEmbeddedJson(html), [
    { source: 'window.__DATA__', value: { user: null, items: [{ id: 1, url: 'https://example.com/a.m3u8' }] } },
    { source: 'config', value: { autoplay: true, sources: [{ file: '/v/1.mp4' }], n: -1500 } },
    { source: 'spaced', value: [1, 2, [3]] },
    { source: 'x', value: ['a', 'b'] },
    { source: 'window.__STATE__', value: { bracket: 'member' } },
    { source: 'window.other', value: { chained: 1 } },
    { source: 'a.b.c', value: { deep: { er: [] } } },
    { source: 'late', value: { min: 'ified' } },
    { source: 'other', value: [] },
  ]);
});

test('findEmbeddedJson balances literals past braces, brackets and quotes inside strings', () => {
  const value = {
    a: 'closing } and ] and { and [ inside',
    b: 'escaped \\" quote and a backslash \\\\',
    c: '}]}]"',
    d: ['{', '}', '[', ']', '"', '\\'],
    e: 'var inner = {"not":"separate"};',
    f: 'unicode é \\u007d',
    g: '</div> <script>',
  };
  const json = JSON.stringify(value).replace(/<\//g, '<\\/');
  const html = `<script>var tricky = ${json}; var after = {"ok":true};</script>`;
  assert.deepEqual(findEmbeddedJson(html), [
    { source: 'tricky', value },
    { source: 'after', value: { ok: true } },
  ]);
});

test('findEmbeddedJson keeps only strict JSON and only assignments', () => {
  const html = `<script>
    var js = {unquoted: 1};
    var single = {'a': 1};
    var trailing = {"a": 1,};
    var fn = {"a": function () {}};
    var concat = {"a": "b" + c};
    var comment = {"a": 1 /* c */};
    var undef = {"a": undefined};
    var template = {"a": \`t\`};
    var unbalanced = {"a": [1, 2};
    var open = {"a": 1
    if (a == {"cmp": 1}) {}
    if (a === ["cmp"]) {}
    if (a != {"cmp": 1}) {}
    if (a <= ["cmp"]) {}
    b += ["plus"];
    c ||= {"or": 1};
    var arrow = () => {"x": 1};
    call({"arg": 1});
    return {"ret": 1};
    var obj = { nested: function () { var found = {"inside": "a function"}; } };
    foo().bar = {"member": "of a call"};
    var str = "s = {\\"in\\": \\"a string\\"}";
  </script>`;
  assert.deepEqual(findEmbeddedJson(html), [
    { source: 'found', value: { inside: 'a function' } },
    { source: 'bar', value: { member: 'of a call' } },
  ]);
});

test('findEmbeddedJson: edge cases', () => {
  assert.deepEqual(findEmbeddedJson(''), []);
  assert.deepEqual(findEmbeddedJson('<p>var a = {"not":"in a script"};</p>'), []);
  assert.deepEqual(findEmbeddedJson('<script>var a = {"x":1}</script><script>var a = {"x":2}</script>'), [
    { source: 'a', value: { x: 1 } },
    { source: 'a', value: { x: 2 } },
  ]);
  assert.deepEqual(findEmbeddedJson('<script>={"no":"target"}; 5 = {"no":"name"};</script>'), []);
  assert.deepEqual(findEmbeddedJson('<script>var a =\n\n\t{"multi":\n"line"}\n</script>'), [{ source: 'a', value: { multi: 'line' } }]);
  assert.deepEqual(findEmbeddedJson('<script>var a = {"raw":"new\nline"};</script>'), []);
  assert.deepEqual(findEmbeddedJson('<script>window.__X__={"a":1};window.__Y__=[{"b":2}]</script>'), [
    { source: 'window.__X__', value: { a: 1 } },
    { source: 'window.__Y__', value: [{ b: 2 }] },
  ]);
  assert.deepEqual(findEmbeddedJson(undefined as unknown as string), []);
});

test('findEmbeddedJson stays linear on hostile scripts', () => {
  const started = performance.now();
  assert.equal(findEmbeddedJson(`<script>${'a={'.repeat(300_000)}</script>`).length, 0);
  assert.equal(findEmbeddedJson(`<script>var a = {${'"x = {" , '.repeat(100_000)}}</script>`).length, 0);
  assert.equal(findEmbeddedJson(`<script>${']= {}'.repeat(100_000)}</script>`).length, 0);
  assert.equal(findEmbeddedJson(`<script>${'a={};'.repeat(100_000)}</script>`).length, 100_000);
  const big = Array.from({ length: 20_000 }, (_, id) => ({ id, url: `https://example.com/${id}`, note: 'a = {"b": 1}' }));
  assert.deepEqual(findEmbeddedJson(`<script>window.__BIG__ = ${JSON.stringify(big)};</script>`), [{ source: 'window.__BIG__', value: big }]);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 5000, `took ${elapsed.toFixed(0)} ms`);
});

// ---------- extractMeta ----------

test('extractMeta reads Open Graph, Twitter, itemprop and standard meta tags', () => {
  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>  Page &amp; Title
      here </title>
    <meta name="Description" content="  A description &amp; more ">
    <meta property="og:title" content="OG Title">
    <meta property="og:video" content="https://example.com/v.mp4?a=1&amp;b=2">
    <meta property="OG:Video:Type" content="video/mp4">
    <meta name="twitter:player:stream" content="https://example.com/stream.m3u8">
    <meta itemprop="duration" content="PT1H30M">
    <meta itemprop="embedURL" content="https://example.com/embed/1">
    <meta name="keywords" property="article:tag" content="both keys">
    <meta property="og:title" content="Second OG title loses">
    <meta name="description" content="Second description loses">
    <meta name="empty" content="">
    <meta name="no-content">
    <meta content="no key">
    <meta http-equiv="refresh" content="0; url=/next">
    <link rel="stylesheet" href="/s.css">
    <link rel="alternate canonical" href="https://example.com/watch/1">
    <link rel="canonical" href="https://example.com/second">
  </head><body><svg><title>Icon title</title></svg><meta name="late" content="in body"></body></html>`;
  assert.deepEqual(extractMeta(html), {
    description: 'A description & more',
    'og:title': 'OG Title',
    'og:video': 'https://example.com/v.mp4?a=1&b=2',
    'og:video:type': 'video/mp4',
    'twitter:player:stream': 'https://example.com/stream.m3u8',
    duration: 'PT1H30M',
    embedurl: 'https://example.com/embed/1',
    'article:tag': 'both keys',
    keywords: 'both keys',
    late: 'in body',
    title: 'Page & Title here',
    canonical: 'https://example.com/watch/1',
  });
});

test('extractMeta: title and canonical details', () => {
  assert.deepEqual(extractMeta(''), {});
  assert.deepEqual(extractMeta('<p>no head</p>'), {});
  assert.deepEqual(extractMeta('<title></title><link rel="canonical">'), {});
  // The <title> element is the title, even when a meta tag claims the name first.
  assert.deepEqual(extractMeta('<meta name="title" content="Meta title"><title>Real title</title>'), { title: 'Real title' });
  assert.deepEqual(extractMeta('<meta name="title" content="Meta title">'), { title: 'Meta title' });
  assert.deepEqual(extractMeta('<svg><title>Icon</title></svg>'), {});
  assert.deepEqual(extractMeta('<svg><title>Icon</title></svg><title>Later</title>'), { title: 'Later' });
  assert.deepEqual(extractMeta('<LINK REL="Canonical" HREF="/relative/path">'), { canonical: '/relative/path' });
  assert.deepEqual(extractMeta('<meta name="canonical" content="from meta"><link rel=canonical href=/from-link>'), { canonical: '/from-link' });
  assert.deepEqual(extractMeta('<meta name="__proto__" content="x"><meta name="constructor" content="y"><meta name="toString" content="z">'), { constructor: 'y', tostring: 'z' });
  assert.deepEqual(extractMeta(undefined as unknown as string), {});
});
