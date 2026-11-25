import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANILIST_ROWS_2026_11_25 } from '../fixtures/anilist-catalog.js';
import { mockFetcher } from '../testing.js';
import { ANILIST_ENDPOINT } from './anilist.js';
import { fetchAnimeDetails, fetchAnimeList, fetchAnimeRows, plainDescription, watchableEpisodes } from './catalog.js';

const POST = `POST ${ANILIST_ENDPOINT}`;
const sent = (f: ReturnType<typeof mockFetcher>, i = 0) => JSON.parse(f.calls[i].body ?? '{}') as { query: string; variables: Record<string, unknown> };

test('several rows are asked for in one request and read from a real answer', async () => {
  const fetcher = mockFetcher({ [POST]: { body: ANILIST_ROWS_2026_11_25 } });
  const rows = await fetchAnimeRows(fetcher, { trending: { sort: 'trending' }, found: { kind: 'series', sort: 'popular' } }, 2);
  assert.equal(fetcher.calls.length, 1);
  assert.match(sent(fetcher).query, /trending: Page\(perPage: \$perPage\) \{ media\(type: ANIME, isAdult: false, sort: TRENDING_DESC\)/);
  assert.match(sent(fetcher).query, /found: Page.*format_in: \[TV, TV_SHORT, ONA, OVA, SPECIAL\], sort: POPULARITY_DESC/);

  const onePiece = rows.trending.find((c) => c.id === 21)!;
  assert.deepEqual(
    { title: onePiece.title, mal: onePiece.mal, kind: onePiece.kind, format: onePiece.format, year: onePiece.year, score: onePiece.score, episodes: onePiece.episodes, aired: onePiece.aired },
    { title: 'ONE PIECE', mal: 21, kind: 'series', format: 'TV', year: 1999, score: 8.7, episodes: undefined, aired: 1180 },
  );
  assert.match(onePiece.cover ?? '', /^https:\/\/s4\.anilist\.co\//);
  assert.equal(watchableEpisodes(onePiece), 1180, 'a running series: what has aired');

  const frieren = rows.found[0];
  assert.equal(frieren.title, 'Frieren: Beyond Journey’s End');
  assert.equal(frieren.romaji, 'Sousou no Frieren');
  assert.equal(watchableEpisodes(frieren), 28);
});

test('a search sends the text as a variable, never inside the query', async () => {
  const fetcher = mockFetcher({ [POST]: { body: { data: { Page: { pageInfo: { hasNextPage: true }, media: ANILIST_ROWS_2026_11_25.data.found.media } } } } });
  const hostile = 'frieren") { id } } query X { Viewer { id';
  const page = await fetchAnimeList(fetcher, { search: hostile, kind: 'series', page: 2 });
  const { query, variables } = sent(fetcher);
  assert.ok(!query.includes('frieren'));
  assert.match(query, /search: \$s, sort: SEARCH_MATCH/);
  assert.deepEqual(variables, { s: hostile, page: 2, perPage: 30 });
  assert.equal(page.hasNext, true);
  assert.equal(page.page, 2);
  assert.equal(page.items.length, 2);
});

test('films, sorts and what each sort leaves out', async () => {
  const fetcher = mockFetcher({ [POST]: { body: { data: { Page: { pageInfo: { hasNextPage: false }, media: [] } } } } });
  await fetchAnimeList(fetcher, { kind: 'film', sort: 'rating' });
  await fetchAnimeList(fetcher, { sort: 'newest', airing: true });
  assert.match(sent(fetcher, 0).query, /format_in: \[MOVIE\], sort: SCORE_DESC, popularity_greater: 5000/);
  assert.match(sent(fetcher, 1).query, /sort: START_DATE_DESC, status_in: \[RELEASING, FINISHED\], status: RELEASING/);
  assert.ok(fetcher.calls.every((c) => /isAdult: false/.test(c.body ?? '')), 'adult entries are never asked for');
});

test('rows that cannot be shown are dropped, and the same entry is listed once', async () => {
  const row = (over: Record<string, unknown>) => ({ id: 5, format: 'MOVIE', title: { romaji: 'Eiga' }, coverImage: { large: 'https://img.example/a.jpg' }, ...over });
  const fetcher = mockFetcher({ [POST]: { body: { data: { Page: { media: [row({}), row({}), row({ id: 6, title: {} }), row({ id: 7, coverImage: { large: 'http://img.example/a.jpg' } }), 'junk', null] } } } } });
  const { items, hasNext } = await fetchAnimeList(fetcher);
  assert.deepEqual(items.map((c) => [c.id, c.title, c.kind, c.cover]), [[5, 'Eiga', 'film', 'https://img.example/a.jpg'], [7, 'Eiga', 'film', undefined]]);
  assert.equal(hasNext, false);
  assert.equal(watchableEpisodes(items[0]), 1);
});

test('details: text without markup, the studio, and no entry for an unknown id', async () => {
  const media = { ...ANILIST_ROWS_2026_11_25.data.found.media[0], description: 'An elf mage.<br><br>\n<i>Later</i> &amp; after.<br>(Source: X)', synonyms: ['Frieren at the Funeral', ''], duration: 24, studios: { nodes: [{ name: 'MADHOUSE' }] } };
  const found = mockFetcher({ [POST]: { body: { data: { Media: media } } } });
  const d = (await fetchAnimeDetails(found, 154587))!;
  assert.equal(d.description, 'An elf mage.\n\nLater & after.\n(Source: X)');
  assert.deepEqual([d.synonyms, d.duration, d.studio], [['Frieren at the Funeral'], 24, 'MADHOUSE']);
  assert.deepEqual(sent(found).variables, { id: 154587 });

  const missing = mockFetcher({ [POST]: { status: 404, body: { errors: [{ message: 'Not Found.', status: 404 }], data: { Media: null } } } });
  assert.equal(await fetchAnimeDetails(missing, 999999999), undefined);
  assert.equal(plainDescription('<b></b>'), undefined);
});

test('a rate limit and a broken answer are errors that say what happened', async () => {
  await assert.rejects(fetchAnimeList(mockFetcher({ [POST]: { status: 429, body: '' } })), /pause/);
  await assert.rejects(fetchAnimeList(mockFetcher({ [POST]: { status: 500, body: 'oops' } })), /answered 500/);
  await assert.rejects(fetchAnimeList(mockFetcher({ [POST]: { body: '<html>' } })), /not valid JSON/);
  await assert.rejects(fetchAnimeRows(mockFetcher({}), { 'bad name': {} } as never), /not a usable row name/);
  assert.equal(watchableEpisodes({ kind: 'series', status: 'NOT_YET_RELEASED' }), 0);
});
