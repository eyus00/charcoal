#!/usr/bin/env -S npx tsx
/**
 * charcoal-registry: the control plane as a command line.
 *
 *   keygen <key-id>                          a signing key pair (public key to pin in clients)
 *   build   [--resolver URL]… [--mirror URL]…  (re)build the registry from the provider pack
 *   import  <url-or-file>                    take a registry served by a resolver (/v2/registry)
 *   validate                                  check the current registry
 *   list                                      providers, versions, stages, domains
 *   stage   <provider> <stable|canary|disabled>
 *   rank    <provider> <number|default>
 *   domain  <provider> <role> <origin> [--reason TEXT] [--no-check]
 *   rollback <provider> --to <version> [--domains-only]
 *   diff    <version-a> <version-b>
 *   history | audit
 *   sign    --key <private-key-file> --key-id <id>
 *   verify  <signed-file> --pub <base64-public-key> --key-id <id>
 *
 * Common options: --dir <registry directory> (default ./registry), --by <name> (default $USER).
 * Nothing here deploys anything: it edits files that you publish.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffRegistry, fetchTransport, generateRegistryKey, signRegistry, validateRegistry, verifyRegistry, type RegistryDocument, type SignedRegistry, type Stage } from '@charcoal/provider-sdk';
import { CODE_PROVIDERS, DEFAULT_DOMAINS, RULE_PROVIDERS } from '@charcoal/providers';
import { buildFromPack, RegistryStore, rollback, rollbackDomains, setDomain, setRank, setStage } from './store.js';

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

function parse(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) (flags[name] ??= []).push('true');
      else {
        (flags[name] ??= []).push(next);
        i++;
      }
    } else positional.push(a);
  }
  return { positional, flag: (n: string) => flags[n]?.[flags[n].length - 1], flags: (n: string) => flags[n] ?? [] };
}

const STAGES: Stage[] = ['stable', 'canary', 'disabled'];

/** Runs one command. Returns the process exit code. Exported so tests can drive it without a shell. */
export async function run(argv: string[], io: Io = { out: (l) => console.log(l), err: (l) => console.error(l) }): Promise<number> {
  const { positional, flag, flags } = parse(argv);
  const [command, ...args] = positional;
  const dir = flag('dir') ?? './registry';
  const by = flag('by') ?? process.env.USER ?? 'unknown';
  const store = new RegistryStore(dir);
  const need = (n: number, usage: string) => {
    if (args.length < n) throw new Error(`Usage: ${usage}`);
  };

  try {
    switch (command) {
      case 'keygen': {
        need(1, 'keygen <key-id>');
        const key = await generateRegistryKey(args[0]);
        const file = join(dir, `${args[0]}.private.key`);
        if (existsSync(file)) throw new Error(`${file} already exists`);
        writeFileSync(file, key.privateKey + '\n', { mode: 0o600 });
        io.out(`Private key written to ${file} (keep it out of the repository; it signs what every client trusts).`);
        io.out(`Public key to pin in clients as "${key.keyId}":`);
        io.out(key.publicKey);
        return 0;
      }
      case 'build': {
        const previous = store.exists() ? store.read() : undefined;
        const doc = buildFromPack(
          { code: CODE_PROVIDERS.map((c) => ({ manifest: c.module.manifest, stage: c.stage })), rules: RULE_PROVIDERS, domains: DEFAULT_DOMAINS },
          { previous, resolvers: flags('resolver').length ? flags('resolver') : undefined, mirrors: flags('mirror').length ? flags('mirror') : undefined, channel: flag('channel') as 'stable' | 'canary' | undefined },
        );
        const line = store.write(doc, by, 'build', flag('note'));
        io.out(`Registry version ${doc.version}: ${doc.providers.length} providers, ${line.changes.length} change(s).`);
        for (const c of line.changes) io.out(`  ${c.provider}: ${c.kind}${c.from || c.to ? ` ${c.from ?? '-'} → ${c.to ?? '-'}` : ''}`);
        return 0;
      }
      case 'import': {
        need(1, 'import <url-or-file>');
        const raw = /^https?:/.test(args[0]) ? (await fetchTransport(args[0])).body : readFileSync(args[0], 'utf8');
        const parsed = JSON.parse(raw) as { document?: RegistryDocument; signed?: SignedRegistry } | RegistryDocument;
        const incoming = 'providers' in parsed ? parsed : (parsed.document ?? (parsed.signed ? (JSON.parse(parsed.signed.payload) as RegistryDocument) : undefined));
        if (!incoming) throw new Error('That is not a registry');
        const current = store.exists() ? store.read() : undefined;
        const doc = { ...incoming, version: Math.max(incoming.version, (current?.version ?? 0) + 1), providers: incoming.providers.map(({ health: _h, ...p }) => p) };
        const line = store.write(doc, by, 'import', args[0]);
        io.out(`Imported as version ${doc.version}: ${doc.providers.length} providers, ${line.changes.length} change(s).`);
        return 0;
      }
      case 'validate': {
        const errors = validateRegistry(store.read());
        if (!errors.length) {
          io.out('Registry is valid.');
          return 0;
        }
        errors.forEach((e) => io.err(e));
        return 1;
      }
      case 'list': {
        const doc = store.read();
        io.out(`Registry version ${doc.version} (${doc.channel}), generated ${doc.generatedAt}`);
        for (const p of doc.providers) {
          const m = p.manifest;
          const domains = Object.entries(p.domains?.roles ?? {}).map(([r, d]) => `${r}=${d.active}${d.alternates?.length ? ` (+${d.alternates.length})` : ''}`);
          io.out(`  ${m.id.padEnd(22)} ${m.version.padEnd(8)} ${p.stage.padEnd(9)} rank ${String(p.rank ?? m.rank ?? '-').padEnd(4)} ${p.rules ? 'rules' : 'code '} [${m.runtimes.join(',')}] ${domains.join(' ')}`);
        }
        return 0;
      }
      case 'stage': {
        need(2, 'stage <provider> <stable|canary|disabled>');
        if (!STAGES.includes(args[1] as Stage)) throw new Error(`Stage must be one of ${STAGES.join(', ')}`);
        const doc = setStage(store.read(), args[0], args[1] as Stage);
        store.write(doc, by, 'stage', flag('reason'));
        io.out(`${args[0]} is now ${args[1]} (registry version ${doc.version}).`);
        return 0;
      }
      case 'rank': {
        need(2, 'rank <provider> <number|default>');
        const rank = args[1] === 'default' ? undefined : Number(args[1]);
        if (rank !== undefined && (!Number.isFinite(rank) || rank < 0 || rank > 1000)) throw new Error('Rank must be 0..1000 or "default"');
        const doc = setRank(store.read(), args[0], rank);
        store.write(doc, by, 'rank');
        io.out(`${args[0]} rank is now ${rank ?? 'the manifest default'} (registry version ${doc.version}).`);
        return 0;
      }
      case 'domain': {
        need(3, 'domain <provider> <role> <origin> [--reason TEXT] [--no-check]');
        // --no-check is for a machine that can't reach the site; the change is logged as unchecked.
        const result = await setDomain(store.read(), args[0], args[1], args[2], by, flag('no-check') ? null : fetchTransport, flag('reason'));
        if (!result.accepted) {
          io.err(`Not promoted: ${args[2]} failed its check (${result.audit.validation?.checks.map((c) => c.failure ?? c.status).join(', ')}). The registry is unchanged.`);
          return 2;
        }
        store.write(result.doc, by, 'domain', flag('reason'), { ...result.audit, checked: !flag('no-check') });
        io.out(`${args[0]} ${args[1]}: ${result.audit.from} → ${result.audit.to} (domain config v${result.audit.toVersion}, registry version ${result.doc.version}).`);
        return 0;
      }
      case 'rollback': {
        need(1, 'rollback <provider> --to <version> [--domains-only]');
        const to = Number(flag('to'));
        if (!Number.isInteger(to)) throw new Error('--to <version> is required (see "history")');
        const earlier = store.readVersion(to);
        const doc = flag('domains-only') ? rollbackDomains(store.read(), earlier, args[0], by) : rollback(store.read(), earlier, args[0]);
        store.write(doc, by, flag('domains-only') ? 'rollback-domains' : 'rollback', `to version ${to}`);
        io.out(`${args[0]} is back to how version ${to} had it (registry version ${doc.version}).`);
        return 0;
      }
      case 'diff': {
        need(2, 'diff <version-a> <version-b>');
        const changes = diffRegistry(store.readVersion(Number(args[0])), store.readVersion(Number(args[1])));
        if (!changes.length) io.out('No differences.');
        for (const c of changes) io.out(`${c.provider}: ${c.kind}${c.from || c.to ? ` ${c.from ?? '-'} → ${c.to ?? '-'}` : ''}`);
        return 0;
      }
      case 'history':
        io.out(store.versions().join('\n') || 'No versions yet.');
        return 0;
      case 'audit':
        for (const a of store.audit()) io.out(`${a.at} ${a.by.padEnd(10)} ${a.action.padEnd(16)} v${a.fromVersion ?? '-'} → v${a.toVersion} ${a.changes.map((c) => `${c.provider}:${c.kind}`).join(' ')}${a.note ? ` (${a.note})` : ''}`);
        return 0;
      case 'sign': {
        const keyFile = flag('key');
        const keyId = flag('key-id');
        if (!keyFile || !keyId) throw new Error('Usage: sign --key <private-key-file> --key-id <id>');
        const signed = await signRegistry(store.read(), { keyId, privateKey: readFileSync(keyFile, 'utf8').trim() });
        writeFileSync(join(dir, 'registry.signed.json'), JSON.stringify(signed) + '\n');
        io.out(`Signed registry version ${store.read().version} with "${keyId}" → ${join(dir, 'registry.signed.json')}`);
        return 0;
      }
      case 'verify': {
        need(1, 'verify <signed-file> --pub <base64-public-key> --key-id <id>');
        const pub = flag('pub');
        const keyId = flag('key-id');
        if (!pub || !keyId) throw new Error('Usage: verify <signed-file> --pub <base64-public-key> --key-id <id>');
        const doc = await verifyRegistry(JSON.parse(readFileSync(args[0], 'utf8')) as SignedRegistry, { [keyId]: pub });
        io.out(`Valid: registry version ${doc.version}, ${doc.providers.length} providers.`);
        return 0;
      }
      default:
        io.err('Commands: keygen, build, import, validate, list, stage, rank, domain, rollback, diff, history, audit, sign, verify');
        return command ? 64 : 0;
    }
  } catch (e) {
    io.err((e as Error).message);
    return 1;
  }
}

// Run when executed directly (not when imported by a test).
if (process.argv[1] && /cli\.ts$/.test(process.argv[1])) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
