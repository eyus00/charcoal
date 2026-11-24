import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlayerConfig, unpackScripts } from './players.js';
import { bestTitleMatch, normalizeTitle, titleSimilarity } from '../match.js';

/** The packer, as sites use it (base 36 here). */
function pack(code: string): string {
  const words = [...new Set(code.match(/\b\w+\b/g) ?? [])];
  const payload = code.replace(/\b\w+\b/g, (w) => words.indexOf(w).toString(36));
  return `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('${payload.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',36,${words.length},'${words.join('|')}'.split('|'),0,{}))`;
}

test('packed scripts are undone by substitution, without evaluating anything', () => {
  const code = 'jwplayer("vplayer").setup({sources:[{file:"https://cdn.example.org/hls/master.m3u8",label:"720p"}],tracks:[{file:"https://cdn.example.org/subs/en.vtt",label:"English",kind:"captions"}]});';
  const [unpacked] = unpackScripts(`<script>${pack(code)}</script>`);
  assert.equal(unpacked, code);
  assert.deepEqual(unpackScripts('<script>var a = 1;</script>'), []);
  assert.deepEqual(unpackScripts("eval(function(p,a,c,k,e,d){}('x',99999,1,'a'.split('|')))"), []);
});

test('player configuration is found in lists, single values, elements and packed scripts', () => {
  const jw = findPlayerConfig(`<script>${pack('jwplayer("p").setup({sources:[{file:"https://cdn.example.org/a/master.m3u8",label:"1080p"},{file:"https://cdn.example.org/a/720.mp4",label:"720p",type:"mp4"}],tracks:[{file:"/subs/en.vtt",label:"English",kind:"captions"},{file:"/thumbs.vtt",kind:"thumbnails"}]});')}</script>`, 'https://embed.example.net/e/1');
  assert.deepEqual(jw.sources, [{ url: 'https://cdn.example.org/a/master.m3u8', type: 'hls', label: '1080p' }, { url: 'https://cdn.example.org/a/720.mp4', type: 'mp4', label: '720p' }]);
  assert.deepEqual(jw.captions, [{ url: 'https://embed.example.net/subs/en.vtt', label: 'English', lang: undefined }]);

  const playerjs = findPlayerConfig('<script>new Playerjs({id:"player", file:"[720p]https://cdn.example.org/b/720.m3u8,[1080p]https://cdn.example.org/b/1080.m3u8"});</script>');
  assert.deepEqual(playerjs.sources.map((s) => [s.label, s.url]), [['720p', 'https://cdn.example.org/b/720.m3u8'], ['1080p', 'https://cdn.example.org/b/1080.m3u8']]);

  const json = findPlayerConfig('<script>window.__DATA__ = {"video":{"file":"https:\\/\\/cdn.example.org\\/c\\/master.m3u8?t=1&amp;e=2"}}</script>');
  assert.deepEqual(json.sources, [{ url: 'https://cdn.example.org/c/master.m3u8?t=1&e=2', type: 'hls', label: undefined }]);

  const element = findPlayerConfig('<video><source src="/v/film.mp4" type="video/mp4" label="HD"><track kind="subtitles" src="/v/hi.vtt" srclang="hi" label="Hindi"></video>', 'https://site.example/watch');
  assert.deepEqual(element.sources, [{ url: 'https://site.example/v/film.mp4', type: 'mp4', label: 'HD' }]);
  assert.deepEqual(element.captions, [{ url: 'https://site.example/v/hi.vtt', label: 'Hindi', lang: 'hi' }]);

  // A page with no player has no sources; pictures and scripts are not streams.
  assert.deepEqual(findPlayerConfig('<img src="/poster.jpg"><script src="/app.js"></script><script>var file = "notes.txt";</script>').sources, []);
});

test('titles are matched across accents, punctuation, numerals and alternate names; the year rules out namesakes', () => {
  assert.equal(normalizeTitle('Amélie'), 'amelie');
  assert.equal(normalizeTitle('The Lord of the Rings: The Two Towers'), 'lord of the rings the two towers');
  assert.equal(normalizeTitle('Rocky II'), 'rocky 2');
  assert.equal(titleSimilarity("Kimi no Na wa.", 'Kimi no Na wa'), 1);
  assert.ok(titleSimilarity('Attack on Titan', 'Attack on Titan Season 2') < 0.84);

  const catalogue = [
    { title: 'Shingeki no Kyojin', altTitles: ['Attack on Titan'], year: 2013, id: 1 },
    { title: 'Shingeki no Kyojin Season 2', year: 2017, id: 2 },
    { title: 'Attack on Titan: Junior High', year: 2015, id: 3 },
  ];
  assert.equal(bestTitleMatch(catalogue, { title: 'Attack on Titan', altTitles: ['Shingeki no Kyojin'], year: 2013 })?.item.id, 1);
  assert.equal(bestTitleMatch(catalogue, { title: 'Attack on Titan', year: 2013 })?.item.id, 1);
  assert.equal(bestTitleMatch(catalogue, { title: 'Jujutsu Kaisen', year: 2020 }), undefined);
  // The same name, a different year: not the same work.
  assert.equal(bestTitleMatch([{ title: 'Drishyam', year: 2015 }, { title: 'Drishyam', year: 2013 }], { title: 'Drishyam', year: 2013 })?.item.year, 2013);
  assert.equal(bestTitleMatch([{ title: 'Vikram', year: 1986 }], { title: 'Vikram', year: 2022 }), undefined);
  // A transliteration the metadata service does not use is still found through the alternate titles.
  assert.equal(bestTitleMatch([{ title: 'Bahubali 2: The Conclusion', year: 2017 }], { title: 'Bāhubali 2: The Conclusion', altTitles: ['Baahubali 2: The Conclusion'], year: 2017 })?.item.title, 'Bahubali 2: The Conclusion');
});
