/** Discovered versus verified streams, and where the measurements place a provider. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRuntime, diagnose, HealthStore, ProviderError, rankStreams, summarize, summarizePlacement, withVerification, type FailureCode, type Stream, type Verification, type VerifyEvent } from './index.js';
import { mockTransport, simulate } from './testing/index.js';

const server = describeRuntime('server');
const fail = (h: HealthStore, provider: string, runtime: 'server' | 'extension' | 'app', code: FailureCode, times = 1) => {
  for (let i = 0; i < times; i++) h.record(provider, runtime, { kind: 'failure', diagnosis: diagnose(new ProviderError(code)) }, 500);
};

test('placement: refused here, unreachable, broken and working are different verdicts', () => {
  const h = new HealthStore();
  assert.equal(h.placement('x', 'server'), 'unknown');
  fail(h, 'walled', 'server', 'CHALLENGE', 3);
  fail(h, 'gone', 'server', 'DNS', 2);
  fail(h, 'changed', 'server', 'STRUCTURE_CHANGED');
  h.record('fine', 'server', { kind: 'ok' }, 400);
  h.record('fine', 'server', { kind: 'empty' }, 400); // "not here" is an answer
  h.record('flaky', 'server', { kind: 'ok' }, 400);
  fail(h, 'flaky', 'server', 'TIMEOUT');
  assert.deepEqual(['walled', 'gone', 'changed', 'fine', 'flaky'].map((p) => h.placement(p, 'server')), ['blocked', 'unreachable', 'broken', 'works', 'works']);
  // An answer ends a verdict.
  h.record('walled', 'server', { kind: 'ok' }, 400);
  assert.equal(h.placement('walled', 'server'), 'works');
  assert.equal(summarize(h).find((s) => s.provider === 'gone')?.placement, 'unreachable');
});

test('a provider refused on the server but answering on viewers’ connections is "works-elsewhere", not broken', () => {
  const own = new HealthStore();
  const fleet = new HealthStore(); // what clients report
  fail(own, 'homebound', 'server', 'ACCESS_DENIED', 3);
  fleet.record('homebound', 'extension', { kind: 'ok' }, 900);
  fleet.record('homebound', 'app', { kind: 'ok' }, 700);
  fail(own, 'walled', 'server', 'CHALLENGE', 3);
  fail(own, 'changed', 'server', 'SELECTOR_MISSING', 2);
  fail(fleet, 'changed', 'extension', 'SELECTOR_MISSING', 2);
  own.record('fine', 'server', { kind: 'ok' }, 300);
  const by = Object.fromEntries(summarizePlacement(own, fleet).map((p) => [p.provider, p]));
  assert.deepEqual([by.homebound.verdict, by.homebound.worksOn.sort(), by.homebound.blockedOn], ['works-elsewhere', ['app', 'extension'], ['server']]);
  assert.equal(by.walled.verdict, 'blocked');
  assert.deepEqual([by.changed.verdict, by.changed.brokenOn.sort()], ['broken', ['extension', 'server']]);
  assert.equal(by.fine.verdict, 'works');
});

const stream = (id: string, over: Partial<Stream> = {}): Stream => ({ id, dedupKey: id, url: `https://cdn.example.org/${id}/master.m3u8`, type: 'hls', quality: '1080', headers: {}, audio: [{ lang: 'en' }], provider: { id: 'p', name: 'P', version: '1.0.0' }, runtime: 'server', ...over });
const PLAYLIST = '#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n';
const TS = 'G' + '\0'.repeat(187) + 'G';

test('verification runs behind the results: streams are sent as discovered, then each gets its verdict before the end', async () => {
  const t = mockTransport({
    'https://cdn.example.org/good/master.m3u8': { body: PLAYLIST, delayMs: 30 },
    'https://cdn.example.org/good/seg0.ts': { body: TS },
    'https://cdn.example.org/dead/master.m3u8': simulate.notFound(),
    'https://cdn.example.org/extra/master.m3u8': { body: PLAYLIST },
    'https://cdn.example.org/extra/seg0.ts': { body: TS },
  });
  async function* engine() {
    yield { t: 'plan' as const };
    yield { t: 'result' as const, provider: { id: 'p' }, streams: [stream('good'), stream('dead'), stream('bound', { ipBound: true }), stream('extra'), stream('fifth'), stream('sixth')] };
    yield { t: 'done' as const };
  }
  const recorded: [string, string][] = [];
  const cache = new Map<string, { at: number; v: Verification }>();
  const out: { t: string; stream?: string; verification?: Verification }[] = [];
  for await (const e of withVerification(engine(), t, { runtime: server, cache, maxPerProvider: 4, onVerified: (p, v) => recorded.push([p, v.state]) })) out.push(e as VerifyEvent);

  const order = out.map((e) => e.t);
  assert.equal(order.indexOf('result'), 1, 'the result is not held back for its checks');
  assert.equal(order.at(-1), 'done', 'the response ends after the checks');
  const verdicts = Object.fromEntries(out.filter((e) => e.t === 'verify').map((e) => [e.stream, e.verification!.state]));
  // The first four streams are tried; an address-bound one is left unchecked from a server.
  assert.deepEqual(verdicts, { good: 'verified', dead: 'failed', bound: 'unchecked', extra: 'verified' });
  // Health hears about real verdicts only.
  assert.deepEqual(recorded.sort(), [['p', 'failed'], ['p', 'verified'], ['p', 'verified']]);

  // The same links asked for again within the cache time are not tried again.
  const before = t.calls.length;
  const again: string[] = [];
  for await (const e of withVerification(engine(), t, { runtime: server, cache, maxPerProvider: 4 })) if (e.t === 'verify') again.push(`${(e as VerifyEvent).stream}:${(e as VerifyEvent).verification.state}`);
  assert.deepEqual(again.filter((x) => !x.startsWith('bound')).sort(), ['dead:failed', 'extra:verified', 'good:verified']);
  assert.equal(t.calls.length, before);
});

test('a slow check does not hold the response past its grace period', async () => {
  const t = mockTransport({ 'cdn.example.org': simulate.hang() });
  async function* engine() {
    yield { t: 'result' as const, provider: { id: 'p' }, streams: [stream('slow')] };
    yield { t: 'done' as const };
  }
  const started = Date.now();
  const kinds: string[] = [];
  for await (const e of withVerification(engine(), t, { runtime: server, graceMs: 150, timeoutMs: 5000 })) kinds.push(e.t);
  assert.deepEqual(kinds, ['result', 'done']);
  assert.ok(Date.now() - started < 1500);
});

test('ranking: verified beats merely discovered, and a stream that did not answer sinks without disappearing', () => {
  const v = (state: Verification['state']): Verification => ({ state, level: state === 'verified' ? 'segment' : 'none', by: 'server', at: 0, ms: 10 });
  const ctx = { compatibility: () => ({ playable: true }), delivery: () => 'direct' as const, reliability: () => 0.8 };
  const ranked = rankStreams([stream('unknown'), stream('bad', { quality: '2160', verification: v('failed') }), stream('good', { verification: v('verified') })], ctx);
  assert.deepEqual(ranked.map((s) => s.id), ['good', 'unknown', 'bad']);
  assert.ok(ranked[2].reasons?.includes('did not answer when tried'));

  const h = new HealthStore();
  assert.equal(h.verifyRate('p', 'server'), 0.5);
  h.recordVerification('p', 'server', true);
  h.recordVerification('p', 'server', true);
  h.recordVerification('p', 'server', false);
  assert.equal(h.verifyRate('p', 'server'), 0.6);
  assert.deepEqual([summarize(h)[0].verified, summarize(h)[0].unverified], [2, 1]);
});
