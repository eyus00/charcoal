import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANISKIP_16498_EP1, ANISKIP_NOT_FOUND } from '../fixtures/aniskip.js';
import { mockFetcher } from '../testing.js';
import { fetchSkipTimes } from './aniskip.js';

const url = (malId: number, episode: number) =>
  `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types=op&types=ed&types=mixed-op&types=mixed-ed&types=recap&episodeLength=0`;

test('maps AniSkip types and sorts by start time', async () => {
  const fetcher = mockFetcher({ [url(16498, 1)]: { body: ANISKIP_16498_EP1 } });
  const times = await fetchSkipTimes(fetcher, 16498, 1);

  // The API lists op, ed, mixed-op, mixed-ed; sorted by start the mixed ending comes first.
  assert.deepEqual(times, [
    { type: 'mixed-credits', start: 24.41, end: 114.41, episodeLength: 1464.4 },
    { type: 'intro', start: 47.365, end: 137.365, episodeLength: 1540.061 },
    { type: 'mixed-intro', start: 75, end: 135, episodeLength: 1420 },
    { type: 'credits', start: 1342.795, end: 1430.616, episodeLength: 1446.9973 },
  ]);
  assert.equal(fetcher.calls.length, 1);
  assert.equal(fetcher.calls[0]?.method, 'GET');
});

test('maps recap, and skips entries it cannot use', async () => {
  // Hand-written in AniSkip's shape (the real sample has no recap).
  const body = {
    found: true,
    results: [
      { interval: { startTime: 0, endTime: 88.5 }, skipType: 'recap', skipId: 'a', episodeLength: 1420 },
      { interval: { startTime: 90, endTime: 180 }, skipType: 'preview', skipId: 'b', episodeLength: 1420 },
      { interval: { startTime: 200, endTime: 200 }, skipType: 'op', skipId: 'c', episodeLength: 1420 },
      { interval: { startTime: 'x', endTime: 300 }, skipType: 'op', skipId: 'd', episodeLength: 1420 },
      { interval: { startTime: 1300, endTime: 1390 }, skipType: 'ed', skipId: 'e' },
      { skipType: 'constructor', interval: { startTime: 1, endTime: 2 } },
      null,
    ],
    statusCode: 200,
  };
  const times = await fetchSkipTimes(mockFetcher({ [url(40028, 3)]: { body } }), 40028, 3);
  assert.deepEqual(times, [
    { type: 'recap', start: 0, end: 88.5, episodeLength: 1420 },
    { type: 'credits', start: 1300, end: 1390, episodeLength: 0 },
  ]);
});

test('returns [] when nothing has been submitted (404 or found: false)', async () => {
  const notFound = mockFetcher({ [url(999999999, 1)]: { status: 404, body: ANISKIP_NOT_FOUND } });
  assert.deepEqual(await fetchSkipTimes(notFound, 999999999, 1), []);

  const emptyOk = mockFetcher({ [url(16498, 2)]: { body: { found: false, results: [], message: 'No skip times found', statusCode: 200 } } });
  assert.deepEqual(await fetchSkipTimes(emptyOk, 16498, 2), []);

  const odd = mockFetcher({ [url(16498, 2)]: { body: { found: true } } });
  assert.deepEqual(await fetchSkipTimes(odd, 16498, 2), []);
});

test('throws with the status on other failures', async () => {
  await assert.rejects(fetchSkipTimes(mockFetcher({ [url(16498, 1)]: { status: 500 } }), 16498, 1), /AniSkip request failed with status 500/);
  await assert.rejects(fetchSkipTimes(mockFetcher({ [url(16498, 1)]: { status: 429 } }), 16498, 1), /status 429/);
  await assert.rejects(fetchSkipTimes(mockFetcher({ [url(16498, 1)]: { body: 'oops' } }), 16498, 1), /AniSkip: the response is not valid JSON/);
});

test('rejects bad ids and episodes without calling the network, and passes the signal on', async () => {
  const fetcher = mockFetcher({ [url(16498, 1)]: { body: ANISKIP_16498_EP1 } });
  await assert.rejects(fetchSkipTimes(fetcher, 0, 1), RangeError);
  await assert.rejects(fetchSkipTimes(fetcher, 1.5, 1), RangeError);
  await assert.rejects(fetchSkipTimes(fetcher, 16498, 0), RangeError);
  await assert.rejects(fetchSkipTimes(fetcher, 16498, Number.NaN), RangeError);
  assert.equal(fetcher.calls.length, 0);

  const controller = new AbortController();
  await fetchSkipTimes(fetcher, 16498, 1, controller.signal);
  assert.equal(fetcher.calls[0]?.signal, controller.signal);
});
