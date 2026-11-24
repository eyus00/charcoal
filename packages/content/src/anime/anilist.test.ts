import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANILIST_MEDIA_16498, ANILIST_NOT_FOUND } from '../fixtures/anilist.js';
import { mockFetcher } from '../testing.js';
import { ANILIST_ENDPOINT, allTitles, fetchAnimeTitles } from './anilist.js';

test('fetches titles with one GraphQL POST', async () => {
  const fetcher = mockFetcher({ [`POST ${ANILIST_ENDPOINT}`]: { body: ANILIST_MEDIA_16498 } });
  const titles = await fetchAnimeTitles(fetcher, 16498);

  assert.equal(titles.romaji, 'Shingeki no Kyojin');
  assert.equal(titles.english, 'Attack on Titan');
  assert.equal(titles.native, '進撃の巨人');
  assert.equal(titles.format, 'TV');
  assert.equal(titles.episodes, 25);
  assert.equal(titles.idMal, 16498);
  assert.equal(titles.synonyms.length, 15);
  assert.ok(titles.synonyms.includes('SnK') && titles.synonyms.includes('Атака титанов'));

  assert.equal(fetcher.calls.length, 1);
  const [call] = fetcher.calls;
  assert.equal(call?.url, 'https://graphql.anilist.co');
  assert.equal(call?.method, 'POST');
  assert.equal(call?.headers['Content-Type'], 'application/json');
  const sent = JSON.parse(call?.body ?? '') as { query: string; variables: unknown };
  assert.deepEqual(sent.variables, { id: 16498 });
  assert.match(sent.query, /Media\(id: \$id, type: ANIME\)/);
  for (const field of ['romaji', 'english', 'native', 'synonyms', 'format', 'episodes', 'idMal']) assert.ok(sent.query.includes(field), field);
});

test('passes the abort signal to the fetcher', async () => {
  const fetcher = mockFetcher({ [ANILIST_ENDPOINT]: { body: ANILIST_MEDIA_16498 } });
  const controller = new AbortController();
  await fetchAnimeTitles(fetcher, 16498, controller.signal);
  assert.equal(fetcher.calls[0]?.signal, controller.signal);

  controller.abort();
  await assert.rejects(fetchAnimeTitles(fetcher, 16498, controller.signal), /aborted/);
});

test('throws with the status on a non-200 answer', async () => {
  // AniList answers an unknown id with HTTP 404 and a GraphQL errors array.
  const notFound = mockFetcher({ [ANILIST_ENDPOINT]: { status: 404, body: ANILIST_NOT_FOUND } });
  await assert.rejects(fetchAnimeTitles(notFound, 999999999), (error: Error) => {
    assert.match(error.message, /status 404/);
    assert.match(error.message, /Not Found\./);
    return true;
  });

  const rateLimited = mockFetcher({ [ANILIST_ENDPOINT]: { status: 429, body: '<html>Too Many Requests</html>' } });
  await assert.rejects(fetchAnimeTitles(rateLimited, 16498), /status 429$/);

  const down = mockFetcher({ [ANILIST_ENDPOINT]: { status: 500, body: '' } });
  await assert.rejects(fetchAnimeTitles(down, 16498), /status 500/);
});

test('throws on a 200 that carries GraphQL errors, has no media or is not JSON', async () => {
  const errors = mockFetcher({ [ANILIST_ENDPOINT]: { body: { errors: [{ message: 'Syntax Error' }, { status: 400 }], data: null } } });
  await assert.rejects(fetchAnimeTitles(errors, 16498), /Syntax Error; unknown error/);

  const empty = mockFetcher({ [ANILIST_ENDPOINT]: { body: { data: { Media: null } } } });
  await assert.rejects(fetchAnimeTitles(empty, 16498), /no anime with id 16498/);

  const html = mockFetcher({ [ANILIST_ENDPOINT]: { body: '<!doctype html>' } });
  await assert.rejects(fetchAnimeTitles(html, 16498), /AniList: the response is not valid JSON/);
});

test('rejects an id that cannot be an AniList id without calling the network', async () => {
  const fetcher = mockFetcher({});
  for (const id of [0, -1, 1.5, Number.NaN]) await assert.rejects(fetchAnimeTitles(fetcher, id), RangeError);
  assert.equal(fetcher.calls.length, 0);
});

test('tolerates missing and null fields', async () => {
  const body = { data: { Media: { id: 1, idMal: null, format: null, episodes: null, title: { romaji: 'Kimi no Na wa.', english: null, native: '' }, synonyms: null } } };
  const titles = await fetchAnimeTitles(mockFetcher({ [ANILIST_ENDPOINT]: { body } }), 1);
  assert.deepEqual(titles, { synonyms: [], romaji: 'Kimi no Na wa.' });
});

test('allTitles lists every name once, English first', async () => {
  const titles = await fetchAnimeTitles(mockFetcher({ [ANILIST_ENDPOINT]: { body: ANILIST_MEDIA_16498 } }), 16498);
  const names = allTitles(titles);
  assert.deepEqual(names.slice(0, 5), ['Attack on Titan', 'Shingeki no Kyojin', '進撃の巨人', 'SnK', 'AoT']);
  assert.equal(names.length, 18);
  assert.equal(new Set(names).size, names.length);
});

test('allTitles drops blanks and repeats that differ only in case or spacing', () => {
  const names = allTitles({
    english: 'Your Name.',
    romaji: 'Kimi no Na wa.',
    native: '君の名は。',
    synonyms: ['your name.', ' Kimi no Na wa. ', '', '   ', 'Your Name', 'Kimi no Na wa.'],
  });
  assert.deepEqual(names, ['Your Name.', 'Kimi no Na wa.', '君の名は。', 'Your Name']);
  assert.deepEqual(allTitles({ synonyms: [] }), []);
  assert.deepEqual(allTitles({ romaji: 'Bleach', synonyms: ['BLEACH'] }), ['Bleach']);
});
