import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRegistry, verifyRegistry, type RegistryDocument, type SignedRegistry } from '@charcoal/provider-sdk';
import { run } from './cli.js';
import { buildFromPack, RegistryStore } from './store.js';

function cli(dir: string) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    run: (...argv: string[]) => run([...argv, '--dir', dir, '--by', 'tester'], { out: (l) => out.push(l), err: (l) => err.push(l) }),
    doc: () => JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')) as RegistryDocument,
  };
}
const entry = (doc: RegistryDocument, id: string) => doc.providers.find((p) => p.manifest.id === id)!;

test('build → stage → rank → domain → rollback: every step is a new version, kept in history and audited', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'charcoal-registry-'));
  const c = cli(dir);

  assert.equal(await c.run('validate'), 1, 'nothing to validate yet');
  assert.equal(await c.run('build', '--resolver', 'https://resolver.example.com'), 0);
  assert.deepEqual(validateRegistry(c.doc()), []);
  assert.deepEqual(c.doc().providers.map((p) => `${p.manifest.id}:${p.stage}`), ['febbox:stable', 'castle:stable', 'vixsrc:stable', 'cinesu-rules:canary']);
  assert.equal(entry(c.doc(), 'cinesu-rules').rules?.steps.length, 5, 'the declarative provider travels in the registry as data');
  assert.equal(c.doc().version, 1);
  assert.equal(await c.run('validate'), 0);

  // Promote the canary; demote and re-rank another.
  assert.equal(await c.run('stage', 'cinesu-rules', 'stable', '--reason', 'validated from a home connection'), 0);
  assert.equal(await c.run('stage', 'vixsrc', 'disabled'), 0);
  assert.equal(await c.run('rank', 'castle', '50'), 0);
  assert.deepEqual([c.doc().version, entry(c.doc(), 'cinesu-rules').stage, entry(c.doc(), 'vixsrc').stage, entry(c.doc(), 'castle').rank], [4, 'stable', 'disabled', 50]);

  // A domain change without touching any code (unchecked here: no network in tests).
  assert.equal(await c.run('domain', 'castle', 'api', 'https://api.new-castle.example', '--no-check', '--reason', 'moved'), 0);
  const d = entry(c.doc(), 'castle').domains!;
  assert.deepEqual([d.version, d.roles.api.active, d.roles.api.alternates], [2, 'https://api.new-castle.example', ['https://api.hlowb.com']]);
  assert.equal(await c.run('domain', 'castle', 'api', 'http://192.168.1.5', '--no-check'), 1, 'a private address is refused');
  assert.equal(await c.run('domain', 'castle', 'nope', 'https://x.example.com', '--no-check'), 1);

  // Rebuilding from the pack keeps the operator's decisions.
  assert.equal(await c.run('build'), 0);
  assert.deepEqual([entry(c.doc(), 'vixsrc').stage, entry(c.doc(), 'castle').rank, entry(c.doc(), 'castle').domains!.roles.api.active], ['disabled', 50, 'https://api.new-castle.example']);

  // Roll the domains back to how version 4 had them; then the whole provider back to version 1.
  assert.equal(await c.run('rollback', 'castle', '--to', '4', '--domains-only'), 0);
  assert.deepEqual([entry(c.doc(), 'castle').domains!.roles.api.active, entry(c.doc(), 'castle').domains!.version, entry(c.doc(), 'castle').rank], ['https://api.hlowb.com', 3, 50]);
  assert.equal(await c.run('rollback', 'castle', '--to', '1'), 0);
  assert.equal(entry(c.doc(), 'castle').rank, undefined);
  assert.equal(await c.run('rollback', 'castle', '--to', '99'), 1);

  // Nothing was lost on the way.
  const store = new RegistryStore(dir);
  assert.deepEqual(store.versions(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(store.audit().map((a) => a.action), ['build', 'stage', 'stage', 'rank', 'domain', 'build', 'rollback-domains', 'rollback']);
  assert.ok(store.audit().every((a) => a.by === 'tester'));
  assert.equal(store.audit()[4].note, 'moved');
  c.out.length = 0;
  assert.equal(await c.run('diff', '1', '5'), 0);
  assert.deepEqual(c.out.sort(), ['castle: domains 1 → 2', 'castle: rank 200 → 50', 'cinesu-rules: stage canary → stable', 'vixsrc: stage stable → disabled']);
  assert.equal(await c.run('stage', 'castle', 'stable'), 1, 'a change that changes nothing is refused');
  assert.equal(await c.run('stage', 'castle', 'sideways'), 1);
  assert.equal(await c.run('frobnicate'), 64);
});

test('sign and verify: the published file checks out against the pinned public key only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'charcoal-registry-'));
  const c = cli(dir);
  await c.run('build');
  assert.equal(await c.run('keygen', 'release-2026'), 0);
  const publicKey = c.out[c.out.length - 1];
  assert.ok(existsSync(join(dir, 'release-2026.private.key')));
  assert.equal(await c.run('keygen', 'release-2026'), 1, 'a key is never overwritten');

  assert.equal(await c.run('sign', '--key', join(dir, 'release-2026.private.key'), '--key-id', 'release-2026'), 0);
  const signedFile = join(dir, 'registry.signed.json');
  assert.equal(await c.run('verify', signedFile, '--pub', publicKey, '--key-id', 'release-2026'), 0);
  const signed = JSON.parse(readFileSync(signedFile, 'utf8')) as SignedRegistry;
  assert.equal((await verifyRegistry(signed, { 'release-2026': publicKey })).version, 1);

  writeFileSync(signedFile, JSON.stringify({ ...signed, payload: signed.payload.replace('"stable"', '"canary"') }));
  assert.equal(await c.run('verify', signedFile, '--pub', publicKey, '--key-id', 'release-2026'), 1);
  assert.match(c.err.join('\n'), /Signature does not match/);
});

test('import takes a registry served by a resolver, and an invalid document is never written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'charcoal-registry-'));
  const c = cli(dir);
  await c.run('build');
  const served = { document: { ...c.doc(), version: 500, providers: c.doc().providers.map((p) => ({ ...p, health: [{ provider: p.manifest.id }] })) } };
  const file = join(dir, 'served.json');
  writeFileSync(file, JSON.stringify(served));
  assert.equal(await c.run('import', file), 1, 'identical content: nothing changed');
  served.document.providers[0].stage = 'disabled';
  writeFileSync(file, JSON.stringify(served));
  assert.equal(await c.run('import', file), 0);
  assert.deepEqual([c.doc().version, c.doc().providers[0].stage, 'health' in c.doc().providers[0]], [500, 'disabled', false]);

  const store = new RegistryStore(dir);
  const broken = { ...c.doc(), version: 501, providers: [{ ...c.doc().providers[0], manifest: { ...c.doc().providers[0].manifest, version: 'not-a-version' } }] };
  assert.throws(() => store.write(broken, 'tester', 'manual'), /Refusing to write an invalid registry/);
  assert.throws(() => store.write({ ...c.doc(), version: 3 }, 'tester', 'manual'), /doesn't move forward/);
  assert.equal(c.doc().version, 500, 'the current registry is untouched');
});

test('a new provider version always starts in the stage the pack ships it in', () => {
  const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', contract: 2 as const, kinds: ['movie' as const], lookup: ['tmdb' as const], runtimes: ['server' as const], domainRoles: [], extraHosts: ['demo.example.com'], output: { types: ['hls' as const] } };
  const pack = (version: string) => ({ code: [{ manifest: { ...manifest, version }, stage: 'canary' as const }], rules: [], domains: {} });
  const v1 = buildFromPack(pack('1.0.0'), { now: new Date('2026-11-01T00:00:00Z') });
  const promoted = { ...v1, version: 2, providers: [{ ...v1.providers[0], stage: 'stable' as const, rank: 300 }] };
  const same = buildFromPack(pack('1.0.0'), { previous: promoted });
  assert.deepEqual([same.providers[0].stage, same.providers[0].rank, same.version], ['stable', 300, 3]);
  const next = buildFromPack(pack('1.1.0'), { previous: promoted, now: new Date('2026-12-01T00:00:00Z') });
  assert.deepEqual([next.providers[0].stage, next.providers[0].rank, next.providers[0].release.previous], ['canary', undefined, '1.0.0']);
});
