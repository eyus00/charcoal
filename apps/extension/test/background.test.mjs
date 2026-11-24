/**
 * The extension's background worker, run in a sandbox with a fake `chrome` and `fetch`, so its
 * rules can be tested without a browser: who may talk to it, what it will fetch, which headers it
 * will set, and how protocol 2 negotiation answers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8');
const PAGE = { id: 'ext-id', url: 'https://charcoal.eys0.fyi/watch/movie/27205', tab: { id: 7 } };
/** Objects made inside the sandbox belong to another realm; copy them into this one before comparing. */
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function boot({ fetch: fetchImpl, hasPermission = true } = {}) {
  const rules = new Map();
  const fetched = [];
  let listener;
  const chrome = {
    declarativeNetRequest: {
      async updateSessionRules({ addRules = [], removeRuleIds = [] }) {
        for (const id of removeRuleIds) rules.delete(id);
        for (const r of addRules) {
          if (rules.has(r.id)) throw new Error('Duplicate rule ID');
          rules.set(r.id, r);
        }
      },
      async getSessionRules() {
        return [...rules.values()];
      },
    },
    permissions: { contains: async () => hasPermission },
    runtime: { id: 'ext-id', getManifest: () => ({ version: '0.2.0' }), onMessage: { addListener: (f) => (listener = f) }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } },
    action: {},
  };
  const fetch = async (url, init) => {
    fetched.push(plain({ url, init: { ...init, signal: undefined }, rules: [...rules.values()] }));
    if (fetchImpl) return fetchImpl(url, init);
    const body = new TextEncoder().encode('hello');
    let sent = false;
    return { status: 200, ok: true, url, headers: new Map([['content-type', 'text/plain'], ['set-cookie', 'session=secret']]), body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: body })), cancel() {} }) } };
  };
  vm.runInNewContext(SOURCE, { chrome, fetch, URL, TextDecoder, TextEncoder, AbortController, setTimeout, clearTimeout, Blob, Uint8Array, Map, Set, Math, Date, Number, Object, String, Promise, Error, console });
  const send = (type, payload, sender = PAGE) => new Promise((resolve) => void listener({ type, payload }, sender, (reply) => resolve(plain(reply))));
  return { send, rules: { get size() { return rules.size; }, list: () => plain([...rules.values()]) }, fetched };
}

test('hello: protocol and capabilities are negotiated; an old page gets protocol 1 answers it can read', async () => {
  const { send } = boot();
  const v1 = await send('hello');
  assert.deepEqual([v1.ok, v1.result.version, v1.result.protocol, v1.result.hasPermission], [true, '0.2.0', 1, true]);
  const v2 = await send('hello', { protocol: 2 });
  assert.equal(v2.result.protocol, 2);
  assert.deepEqual(v2.result.capabilities, ['request', 'allowStream', 'releaseStreams', 'cookies', 'status']);
  assert.equal(v2.result.kind, 'extension');
  assert.equal((await send('hello', { protocol: 9 })).result.protocol, 2, 'never claims a protocol it does not speak');
  assert.equal((await boot({ hasPermission: false }).send('hello', { protocol: 2 })).result.hasPermission, false);
});

test('only Charcoal’s own pages are answered', async () => {
  const { send, fetched } = boot();
  for (const sender of [{ ...PAGE, url: 'https://evil.example/page' }, { ...PAGE, id: 'another-extension' }, { ...PAGE, url: 'not a url' }]) {
    assert.deepEqual(await send('request', { url: 'https://example.com/' }, sender), { ok: false, error: 'Not allowed', code: 'NOT_ALLOWED' });
  }
  assert.equal((await send('request', { url: 'https://example.com/' }, { ...PAGE, url: 'http://localhost:5173/' })).ok, true, 'local development is allowed');
  assert.deepEqual(await send('nonsense', {}), { ok: false, error: 'Not allowed', code: 'NOT_ALLOWED' });
  assert.equal(fetched.length, 1);
});

test('request: private addresses and odd methods are refused with a code; nothing is fetched', async () => {
  const { send, fetched } = boot();
  for (const url of ['http://127.0.0.1/', 'http://192.168.1.1/admin', 'https://router.lan/', 'http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'http://[::1]/']) {
    const r = await send('request', { url });
    assert.deepEqual([r.ok, r.code], [false, 'NOT_ALLOWED'], url);
  }
  assert.equal((await send('request', { url: 'https://example.com/', method: 'DELETE' })).code, 'NOT_ALLOWED');
  assert.equal((await send('request', {})).code, 'BAD_REQUEST');
  assert.equal(fetched.length, 0);
});

test('request: only allow-listed headers are sent; a cookie only ever goes to febbox.com; set-cookie never comes back', async () => {
  const { send, fetched, rules } = boot();
  const headers = { Referer: 'https://site.example/', Origin: 'https://site.example', 'User-Agent': 'UA', Accept: 'application/json', Cookie: 'ui=token', Authorization: 'Bearer x', 'X-Forwarded-For': '1.2.3.4' };
  const r = await send('request', { url: 'https://api.site.example/find', headers });
  assert.equal(r.ok, true);
  assert.deepEqual(r.result.headers, { 'content-type': 'text/plain' });
  assert.equal(r.result.body, 'hello');
  const call = fetched[0];
  assert.deepEqual(call.init.headers, { accept: 'application/json' }, 'plain headers go on the request');
  assert.equal(call.init.credentials, 'omit', 'the browser’s own cookies are never sent');
  const rule = call.rules[0];
  assert.deepEqual(rule.action.requestHeaders.map((h) => h.header).sort(), ['origin', 'referer', 'user-agent'], 'no cookie, no authorization, no forwarded-for');
  assert.deepEqual(rule.condition, { requestDomains: ['api.site.example'], tabIds: [-1], resourceTypes: ['xmlhttprequest', 'other'] });
  assert.equal(rules.size, 0, 'the rule is removed as soon as the request ends');

  await send('request', { url: 'https://www.febbox.com/console/video_quality_list', headers: { Cookie: 'ui=token' } });
  assert.deepEqual(fetched[1].rules[0].action.requestHeaders, [{ header: 'cookie', operation: 'set', value: 'ui=token' }]);
  await send('request', { url: 'https://notfebbox.com/x', headers: { Cookie: 'ui=token' } });
  assert.equal(fetched[2].rules.length, 0);
});

test('request failures carry a code: unreachable sites and oversized answers', async () => {
  const down = boot({ fetch: async () => Promise.reject(new TypeError('Failed to fetch')) });
  assert.deepEqual(await down.send('request', { url: 'https://gone.example/' }), { ok: false, error: 'Couldn’t reach the site (Failed to fetch)', code: 'NETWORK' });
  const huge = boot({
    fetch: async (url) => ({ status: 200, ok: true, url, headers: new Map(), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(8 * 1024 * 1024) }), cancel() {} }) } }),
  });
  assert.equal((await huge.send('request', { url: 'https://big.example/' })).code, 'TOO_LARGE');
  const s = await down.send('status');
  assert.deepEqual([s.result.requests.ok, s.result.requests.failed, s.result.protocol], [0, 1, 2]);
});

test('allowStream: one rule per site and tab, CORS for Charcoal only, the browser keeps its own User-Agent; releaseStreams removes them', async () => {
  const { send, rules } = boot();
  const a = await send('allowStream', { host: 'img1.cdn-host.example', headers: { Referer: 'https://site.example/', 'User-Agent': 'Fake', Cookie: 'x=1' } });
  assert.deepEqual(a, { ok: true, result: { domain: 'cdn-host.example' } });
  const rule = rules.list()[0];
  assert.deepEqual(rule.action.requestHeaders, [{ header: 'referer', operation: 'set', value: 'https://site.example/' }]);
  assert.deepEqual(rule.action.responseHeaders[0], { header: 'access-control-allow-origin', operation: 'set', value: 'https://charcoal.eys0.fyi' });
  assert.deepEqual(rule.condition, { requestDomains: ['cdn-host.example'], tabIds: [7], resourceTypes: ['xmlhttprequest', 'media'] });

  await send('allowStream', { host: 'img2.cdn-host.example', headers: {} });
  assert.equal(rules.size, 1, 'the same site again replaces its rule');
  await send('allowStream', { host: 'other.example', headers: {} });
  assert.equal((await send('status')).result.activeRules, 2);
  assert.equal((await send('allowStream', { host: '10.0.0.5' })).code, 'NOT_ALLOWED');
  assert.equal((await send('allowStream', { host: 'x.example' }, { ...PAGE, tab: undefined })).code, 'BAD_REQUEST');

  await send('releaseStreams', {});
  assert.equal(rules.size, 0);
});
