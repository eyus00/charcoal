/** Staged domain promotion, automatic rollback, per-address settings and domain diagnosis. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineProvider, defineRuleProvider, diagnoseDomain, diagnoseDomains, DomainResolver, getJson, hostsOf, recordDomainOutcome, stageDomain, switchActive, TRIAL, validateDomainConfig, WATCH_MS, type DomainConfig, type ProviderOutcome } from './index.js';
import { createHarness, mockTransport, simulate, TITLES, type MockResponse, type MockRoute } from './testing/index.js';

const base = (): DomainConfig => ({ provider: 'demo', version: 1, updatedAt: '2026-01-01T00:00:00.000Z', roles: { site: { active: 'https://old.example', health: { path: '/ping', expectText: 'pong' }, settings: { api: 'v1' }, perOrigin: { 'https://new.example': { api: 'v2' } } } } });
const NOW = new Date('2026-11-24T12:00:00.000Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);

test('an address goes on trial only after it passes validation', async () => {
  const up = mockTransport({ 'https://new.example/ping': { body: 'pong' } });
  const staged = await stageDomain(base(), { role: 'site', origin: 'https://NEW.example/', by: 'ops', reason: 'site moved' }, up, undefined, NOW);
  assert.equal(staged.accepted, true);
  assert.deepEqual(staged.config.roles.site.candidate, { origin: 'https://new.example', since: NOW.toISOString(), share: TRIAL.share, ok: 0, failed: 0 });
  assert.equal(staged.config.roles.site.active, 'https://old.example', 'the address in use has not changed');
  assert.equal(staged.config.version, 2);
  assert.deepEqual([staged.audit.action, staged.audit.to, staged.audit.validation?.ok], ['stage-candidate', 'https://new.example', true]);
  assert.deepEqual(validateDomainConfig(staged.config, ['site']), []);
  assert.ok(hostsOf(staged.config).includes('new.example'), 'requests to the candidate are allowed by the policy');

  // The wrong answer at the health path, or a failing extraction probe: nothing is recorded.
  const wrong = await stageDomain(base(), { role: 'site', origin: 'https://new.example', by: 'ops' }, mockTransport({ 'new.example': simulate.html('<html>parked domain</html>') }), undefined, NOW);
  assert.deepEqual([wrong.accepted, wrong.config.roles.site.candidate, wrong.config.version, wrong.audit.validation?.ok], [false, undefined, 1, false]);
  const probeFails = await stageDomain(base(), { role: 'site', origin: 'https://new.example', by: 'ops' }, up, async () => ({ ok: false }), NOW);
  assert.equal(probeFails.accepted, false);
  await assert.rejects(stageDomain(base(), { role: 'site', origin: 'https://old.example', by: 'ops' }, up), /already configured/);
  await assert.rejects(stageDomain(base(), { role: 'site', origin: 'http://10.0.0.4', by: 'ops' }, up), /private/);
});

test('a trial takes its share of runs; clean runs promote it, failures drop it', async () => {
  const staged = (await stageDomain(base(), { role: 'site', origin: 'https://new.example', by: 'ops', share: 0.25 }, mockTransport({ 'https://new.example/ping': { body: 'pong' } }), undefined, NOW)).config;
  assert.equal(new DomainResolver(staged, {}, 0.1).origin('site'), 'https://new.example');
  assert.equal(new DomainResolver(staged, {}, 0.3).origin('site'), 'https://old.example');
  assert.deepEqual(new DomainResolver(staged, {}, 0.1).used(), [{ role: 'site', origin: 'https://new.example', candidate: true }]);

  // Promotion: five clean runs on the candidate.
  let config = staged;
  for (let i = 0; i < TRIAL.promoteAfter - 1; i++) {
    const r = recordDomainOutcome(config, { role: 'site', candidate: true }, 'ok', NOW);
    assert.equal(r.action, undefined);
    config = r.config;
  }
  // Runs that did not use the candidate do not count towards it.
  assert.equal(recordDomainOutcome(config, { role: 'site', candidate: false }, 'failed', NOW).config.roles.site.candidate?.ok, TRIAL.promoteAfter - 1);
  const promoted = recordDomainOutcome(config, { role: 'site', candidate: true }, 'ok', NOW);
  assert.equal(promoted.action, 'promoted');
  assert.deepEqual([promoted.config.roles.site.active, promoted.config.roles.site.alternates, promoted.config.roles.site.candidate], ['https://new.example', ['https://old.example'], undefined]);
  assert.deepEqual([promoted.audit?.action, promoted.audit?.by, promoted.audit?.from, promoted.audit?.to], ['promote-candidate', 'auto', 'https://old.example', 'https://new.example']);
  assert.equal(promoted.config.roles.site.watch?.previous, 'https://old.example');

  // Rejection: three failed runs, and the candidate is gone without the active address ever changing.
  config = staged;
  let dropped;
  for (let i = 0; i < TRIAL.dropAfter; i++) config = (dropped = recordDomainOutcome(config, { role: 'site', candidate: true }, 'failed', NOW)).config;
  assert.equal(dropped?.action, 'dropped');
  assert.deepEqual([config.roles.site.active, config.roles.site.candidate], ['https://old.example', undefined]);
  assert.equal(dropped?.audit?.action, 'drop-candidate');
  // One failure among clean runs keeps the trial open rather than promoting on a mixed record.
  let mixed = recordDomainOutcome(staged, { role: 'site', candidate: true }, 'failed', NOW).config;
  for (let i = 0; i < TRIAL.promoteAfter + 2; i++) mixed = recordDomainOutcome(mixed, { role: 'site', candidate: true }, 'ok', NOW).config;
  assert.equal(mixed.roles.site.active, 'https://old.example');
});

test('after an address change, repeated failures inside the watch window put the previous one back, once', () => {
  const changed = switchActive(base(), 'site', 'https://new.example', NOW);
  assert.deepEqual(changed.roles.site.watch, { previous: 'https://old.example', until: later(WATCH_MS).toISOString(), failed: 0 });
  const use = { role: 'site', candidate: false };

  let config = recordDomainOutcome(changed, use, 'failed', later(1000)).config;
  config = recordDomainOutcome(config, use, 'ok', later(2000)).config; // a clean run resets the count
  assert.equal(config.roles.site.watch?.failed, 0);
  let result;
  for (let i = 0; i < TRIAL.rollbackAfter; i++) config = (result = recordDomainOutcome(config, use, 'failed', later(3000 + i))).config;
  assert.equal(result?.action, 'rolled-back');
  assert.deepEqual([config.roles.site.active, config.roles.site.alternates, config.roles.site.watch], ['https://old.example', ['https://new.example'], undefined]);
  assert.deepEqual([result?.audit?.action, result?.audit?.from, result?.audit?.to], ['auto-rollback', 'https://new.example', 'https://old.example']);
  // No ping-pong: the restored address is not watched in turn.
  assert.equal(recordDomainOutcome(config, use, 'failed', later(9000)).action, undefined);

  // Outside the window the change has settled: failures no longer move anything.
  const settled = recordDomainOutcome(changed, use, 'failed', later(WATCH_MS + 1));
  assert.deepEqual([settled.action, settled.config.roles.site.watch, settled.config.roles.site.active], [undefined, undefined, 'https://new.example']);
});

test('the engine runs a trial end to end: the provider is unchanged, the outcome says which address served it', async () => {
  const demo = defineProvider({
    manifest: { id: 'demo', name: 'Demo', version: '1.0.0', kinds: ['movie'], lookup: ['tmdb'], runtimes: ['server'], domainRoles: ['site'], output: { types: ['hls'] } },
    async getSources(media, { fetch, url, domainSetting, signal }) {
      // The API version belongs to the address, not to the code.
      const info = await getJson<{ file: string }>(fetch, url('site', `/${domainSetting('site', 'api')}/title/${media.ids.tmdb}`), { signal });
      return { streams: [{ url: info.file, type: 'hls' }] };
    },
  });
  const routes: Record<string, MockRoute> = {
    'https://old.example/v1/title/27205': { body: { file: 'https://cdn.example.org/old/master.m3u8' } },
    'https://new.example/v2/title/27205': { body: { file: 'https://cdn.example.org/new/master.m3u8' } },
    'https://new.example/ping': { body: 'pong' },
  };
  let config = (await stageDomain(base(), { role: 'site', origin: 'https://new.example', by: 'ops' }, mockTransport(routes), undefined, NOW)).config;
  const audits: string[] = [];
  let roll = 0.9;
  const outcomes: ProviderOutcome[] = [];
  const h = createHarness({
    providers: [{ module: demo, stage: 'stable', get domains() { return config; } }],
    routes,
    engine: {
      random: () => roll,
      cacheTtlMs: 0,
      onOutcome: (_p, o) => {
        outcomes.push(o);
        for (const use of o.origins ?? []) {
          const r = recordDomainOutcome(config, use, o.outcome === 'error' ? 'failed' : 'ok', NOW);
          config = r.config;
          if (r.audit) audits.push(r.audit.action);
        }
      },
    },
  });
  const run = () => h.engine.runProvider(h.engine.providers()[0], TITLES.movie);

  const usual = await run();
  assert.equal(usual.streams[0].url, 'https://cdn.example.org/old/master.m3u8');
  assert.deepEqual(usual.origins, [{ role: 'site', origin: 'https://old.example', candidate: false }]);
  roll = 0.05; // inside the candidate's share
  for (let i = 0; i < TRIAL.promoteAfter; i++) {
    const r = await run();
    assert.equal(r.streams[0].url, 'https://cdn.example.org/new/master.m3u8', 'the new address, with its own API version');
  }
  assert.deepEqual(audits, ['promote-candidate']);
  assert.equal(config.roles.site.active, 'https://new.example');
  roll = 0.9;
  assert.equal((await run()).streams[0].url, 'https://cdn.example.org/new/master.m3u8', 'every run now');
  assert.equal(outcomes.length, TRIAL.promoteAfter + 2);

  // The same value is available to rule packs.
  const rules = defineRuleProvider(
    { ...demo.manifest, id: 'demo', contract: 2 },
    { schema: 1, id: 'demo', version: '1.0.0', steps: [{ fetch: '{{domain.site}}/{{domainSetting.site.api}}/title/{{media.ids.tmdb}}', as: 'info' }, { extract: 'json', from: 'info', expr: '$.file', as: 'file', required: true }], emit: [{ url: '{{file}}', type: 'hls' }] },
  );
  const viaRules = createHarness({ providers: [{ module: rules, stage: 'stable', domains: base() }], routes });
  assert.equal((await viaRules.engine.runProvider(viaRules.engine.providers()[0], TITLES.movie)).streams[0].url, 'https://cdn.example.org/old/master.m3u8');
});

// ---------- diagnosis ----------

const dnsAnswer = (addresses: string[], status = 0): MockResponse => ({ body: { Status: status, Answer: addresses.map((data) => ({ type: 1, data })) } });
const dnsRoutes = (answers: Record<string, MockResponse>): Record<string, MockRoute> => ({
  'https://cloudflare-dns.com/dns-query*': (req) => answers[req.url.searchParams.get('name') ?? ''] ?? dnsAnswer([], 3),
});

test('domain diagnosis tells apart: gone from DNS, no address, moved, behind a browser check, refusing, not answering', async () => {
  const t = mockTransport({
    ...dnsRoutes({ 'up.example': dnsAnswer(['203.0.113.7']), 'moved.example': dnsAnswer(['203.0.113.8']), 'checked.example': dnsAnswer(['203.0.113.9']), 'blocked.example': dnsAnswer(['203.0.113.10']), 'silent.example': dnsAnswer(['203.0.113.11']), 'norecord.example': dnsAnswer([]) }),
    'up.example': { status: 404, headers: { server: 'nginx' }, body: 'no such page' },
    'moved.example': { url: 'https://elsewhere.example/home', body: '<html>new home</html>' },
    'checked.example': simulate.challenge(),
    'blocked.example': simulate.forbidden(),
    'silent.example': simulate.refused(),
  });
  const verdict = async (host: string) => {
    const d = await diagnoseDomain(`https://${host}`, t);
    return [d.dns.status, d.verdict];
  };
  assert.deepEqual(await verdict('up.example'), ['ok', 'ok']); // a 404 at the root is still a site that answers
  assert.deepEqual(await verdict('gone.example'), ['nxdomain', 'DNS']);
  assert.deepEqual(await verdict('norecord.example'), ['no-record', 'DNS']);
  assert.deepEqual(await verdict('moved.example'), ['ok', 'REDIRECTED']);
  assert.deepEqual(await verdict('checked.example'), ['ok', 'CHALLENGE']);
  assert.deepEqual(await verdict('blocked.example'), ['ok', 'ACCESS_DENIED']);
  assert.deepEqual(await verdict('silent.example'), ['ok', 'CONNECT']);
  const moved = await diagnoseDomain('https://moved.example', t);
  assert.equal(moved.http?.redirectedTo, 'elsewhere.example');
  assert.match(moved.summary, /now sends visitors to elsewhere\.example/);
  assert.match((await diagnoseDomain('https://gone.example', t)).summary, /no longer exists in DNS/);

  // When no resolver can be reached, DNS is "unknown" and the HTTP result decides.
  const noDns = mockTransport({ 'up.example': { body: 'hello' } });
  const d = await diagnoseDomain('https://up.example', noDns);
  assert.deepEqual([d.dns.status, d.verdict], ['unknown', 'ok']);

  // A whole config: every address of every role, with its position.
  const config: DomainConfig = { provider: 'demo', version: 1, updatedAt: '', roles: { site: { active: 'https://gone.example', alternates: ['https://up.example'], candidate: { origin: 'https://moved.example', since: '', share: 0.2, ok: 0, failed: 0 } } } };
  assert.deepEqual((await diagnoseDomains(config, t)).map((x) => [x.position, x.host, x.verdict]), [['active', 'gone.example', 'DNS'], ['alternate', 'up.example', 'ok'], ['candidate', 'moved.example', 'REDIRECTED']]);
});
