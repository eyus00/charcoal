/**
 * Providers that use a browser, against a stand-in for the browser worker (the real worker is
 * tested in packages/browser-runtime with a real Chromium). Fixtures only: what these providers do
 * with a live site is recorded by the benchmark's live runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRuntime, ProviderError, validateManifest, validateRulePack, type BrowserWorkerLike, type CapturedMedia } from '@charcoal/provider-sdk';
import { createHarness, TITLES } from '@charcoal/provider-sdk/testing';
import { loadCorePack, vidlinkManifest, vidlinkRules } from './index.js';

interface FakePage {
  status?: number;
  media?: CapturedMedia[];
}

/** A worker whose pages "ask for" whatever the table says. */
function fakeWorker(pages: Record<string, FakePage>) {
  const opened: string[] = [];
  const worker: BrowserWorkerLike = {
    health: () => ({ state: 'ready', launches: 1, crashes: 0, sessionsOpen: 0, sessionsServed: 0, queued: 0, challenges: 0, policyBlocks: 0 }),
    session: (run) => ({
      dispose: async () => undefined,
      open: async (url) => {
        opened.push(url);
        await run.guard.check(url, 'GET'); // the real worker checks navigations against the same policy
        const p = pages[url];
        if (!p) throw new ProviderError('DNS', 'no such site');
        const hasMedia = () => (p.media ?? []).some((m) => m.type !== 'captions');
        return {
          url,
          status: p.status ?? 200,
          html: async () => '<html></html>',
          select: async () => [],
          evaluate: async () => null as never,
          media: () => p.media ?? [],
          frames: () => [],
          click: async () => undefined,
          waitFor: async (what) => {
            if ('media' in what && !hasMedia()) throw new ProviderError('SELECTOR_MISSING', 'The page did not ask for any media', { step: 'media' });
          },
          goto: async () => undefined,
          close: async () => undefined,
        };
      },
    }),
  };
  return { worker, opened };
}

const withBrowser = { ...describeRuntime('server'), features: [...describeRuntime('server').features, 'js-render' as const] };
const one = (id: string) => loadCorePack().filter((p) => p.module.manifest.id === id);

test('VidLink (rules + browser): emits what the player page asks for, with the headers the page sent', async () => {
  assert.deepEqual(validateManifest(vidlinkManifest), []);
  assert.deepEqual(validateRulePack(vidlinkRules, vidlinkManifest), []);
  const { worker, opened } = fakeWorker({
    'https://vidlink.pro/movie/27205': { media: [{ url: 'https://cdn.example.org/v/manifest.mpd', type: 'dash', headers: { Referer: 'https://vidlink.pro/' } }, { url: 'https://cdn.example.org/v/en.vtt', type: 'captions', headers: {} }] },
    'https://vidlink.pro/tv/1396/2/3': { media: [{ url: 'https://cdn.example.org/tv/master.m3u8', type: 'hls', headers: { Referer: 'https://vidlink.pro/', Origin: 'https://vidlink.pro' } }] },
    'https://vidlink.pro/movie/999': {},
  });
  const h = createHarness({ providers: one('vidlink'), runtime: withBrowser, engine: { browser: worker } });
  const p = h.engine.providers()[0];
  const film = await h.engine.runProvider(p, TITLES.movie);
  assert.equal(film.outcome, 'ok', film.message);
  assert.deepEqual([film.streams[0].type, film.streams[0].url, film.streams[0].headers.Referer], ['dash', 'https://cdn.example.org/v/manifest.mpd', 'https://vidlink.pro/']);
  assert.equal(film.captions.length, 1);
  const episode = await h.engine.runProvider(p, TITLES.episode);
  assert.deepEqual([episode.streams[0].type, episode.streams[0].headers.Origin], ['hls', 'https://vidlink.pro']);
  assert.deepEqual(opened, ['https://vidlink.pro/movie/27205', 'https://vidlink.pro/tv/1396/2/3']);
  // A player that loads nothing has no source for the title: "not here", not a broken provider.
  const missing = await h.engine.runProvider(p, { ...TITLES.movie, ids: { tmdb: '999' } });
  assert.deepEqual([missing.outcome, missing.code], ['empty', 'NOT_FOUND']);
  // A site that is gone is still a network failure.
  const gone = createHarness({ providers: one('vidlink'), runtime: withBrowser, engine: { browser: fakeWorker({}).worker } });
  assert.equal((await gone.engine.runProvider(gone.engine.providers()[0], TITLES.movie)).code, 'DNS');
  // Without a browser it is not planned at all.
  const plain = createHarness({ providers: one('vidlink') });
  assert.match(plain.engine.plan({ media: TITLES.movie }).skipped[0].reason, /js-render/);
});

test('VidNest: with a browser the site’s own player page is used; without one the API is asked', async () => {
  const { worker, opened } = fakeWorker({ 'https://vidnest.fun/movie/27205': { media: [{ url: 'https://cdn.example.org/n/master.m3u8', type: 'hls', headers: { Referer: 'https://vidnest.fun/' } }] }, 'https://vidnest.fun/tv/1396/2/3': {} });
  const h = createHarness({ providers: one('vidnest'), runtime: withBrowser, engine: { browser: worker }, routes: {} });
  const p = h.engine.providers()[0];
  const r = await h.engine.runProvider(p, TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  assert.deepEqual([r.streams[0].url, r.streams[0].headers.Referer], ['https://cdn.example.org/n/master.m3u8', 'https://vidnest.fun/']);
  assert.equal(h.transport.calls.length, 0, 'the API was not called: the page did its own requests');
  assert.deepEqual(opened, ['https://vidnest.fun/movie/27205']);
  assert.equal((await h.engine.runProvider(p, TITLES.episode)).code, 'NOT_FOUND');

  // No browser: the API path, which today answers "missing or invalid nonce".
  const api = createHarness({ providers: one('vidnest'), routes: { 'new.vidnest.fun': { status: 403, body: { error: 'missing or invalid nonce' } } } });
  const viaApi = await api.engine.runProvider(api.engine.providers()[0], TITLES.movie);
  assert.equal(viaApi.code, 'STRUCTURE_CHANGED');
  assert.equal(api.transport.calls.length, 10);
});
