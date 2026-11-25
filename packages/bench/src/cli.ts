/**
 * Source-availability benchmark.
 *
 *   npm run bench --workspace packages/bench -- [options]
 *     --target engine|<server url>   what to measure (default: engine, the pack in this process)
 *     --api v2|v1                    which API a server target speaks (default v2)
 *     --titles all|quick|a,b,c       which titles (default all)
 *     --label <name>                 name of the run (default: target and date)
 *     --egress user|datacenter       what kind of network this machine is on (default datacenter)
 *     --playback <n>                 also start up to n verified streams per title in a browser
 *     --via direct|relay             try streams directly, or through the server's relay links
 *     --only a,b                     engine target: only these providers
 *     --no-fallback                  engine target: without the vendored fallback pack
 *     --browser                      engine target: give providers a browser worker
 *     --admin-token <token>          server target: reset circuit breakers before each title
 *     --out <file.json>              where to write the result (default: docs/platform/data/bench-<label>.json)
 *
 *   npm run report --workspace packages/bench -- <run.json> [<after.json>] [--out <file.md>]
 *   npm run report --workspace packages/bench -- --matrix <run.json> <run.json> …   one column per run
 *   npx tsx src/cli.ts domains [--label <name>] [--extra pack.ts,…]   diagnose every configured provider address
 *
 * Run it from a home connection with --egress user to measure what viewers' own networks reach.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeRuntime } from '@charcoal/provider-sdk';
import { createPlaybackChecker } from './playback.js';
import { renderComparison, renderMatrix, renderReport } from './report.js';
import { runBenchmark, type BenchReport } from './run.js';
import { engineTarget, v1Target, v2Target, type Target } from './targets.js';
import { QUICK, TITLES } from './titles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parse(argv: string[]) {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) rest.push(a);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
    else flags[a.slice(2)] = true;
  }
  return { flags, rest };
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parse(argv);
  const str = (k: string) => (typeof flags[k] === 'string' ? (flags[k] as string) : undefined);

  if (command === 'report') {
    const reports = rest.map((f) => JSON.parse(readFileSync(f, 'utf8')) as BenchReport);
    if (!reports.length) throw new Error('report needs at least one result file');
    const md = flags.matrix === true ? renderMatrix(reports) : reports.length > 1 ? renderComparison(reports[0], reports[1]) : renderReport(reports[0]);
    if (str('out')) writeFileSync(str('out')!, md);
    else process.stdout.write(md + '\n');
    return;
  }
  if (command === 'domains') {
    // What is wrong with each configured address, from this machine: DNS (over HTTPS), the answer, redirects, browser checks.
    const { DEFAULT_DOMAINS } = await import('@charcoal/providers');
    const { diagnoseDomains, fetchTransport } = await import('@charcoal/provider-sdk');
    const extra: Record<string, import('@charcoal/provider-sdk').DomainConfig> = {};
    for (const file of str('extra')?.split(',') ?? []) Object.assign(extra, ((await import(path.resolve(file))) as { domains?: typeof extra }).domains ?? {});
    const all = { ...DEFAULT_DOMAINS, ...extra };
    const rows: (Awaited<ReturnType<typeof diagnoseDomains>>[number] & { provider: string })[] = [];
    for (const [provider, config] of Object.entries(all)) {
      const found = await diagnoseDomains(config, fetchTransport, { timeoutMs: 12_000 });
      for (const d of found) {
        rows.push({ provider, ...d });
        console.error(`${provider.padEnd(14)} ${String(d.role).padEnd(9)} ${d.verdict.padEnd(14)} ${d.summary}`);
      }
    }
    const label = str('label') ?? new Date().toISOString().slice(0, 10);
    const out = str('out') ?? path.join(ROOT, 'docs/platform/data', `domains-${label}.json`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ label, checkedFrom: str('egress') === 'user' ? 'user' : 'datacenter', note: str('note'), rows }, null, 1));
    const md = ['| Provider | Role | Address | DNS | Answer | Verdict |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.provider} | ${r.role} (${r.position}) | ${r.host} | ${r.dns.status} | ${r.http?.status ?? '–'}${r.http?.redirectedTo ? ` → ${r.http.redirectedTo}` : ''} | ${r.verdict === 'ok' ? 'answers' : `\`${r.verdict}\`: ${r.summary}`} |`)].join('\n');
    writeFileSync(out.replace(/\.json$/, '.md'), `# Provider addresses: ${label}\n\nChecked from a ${str('egress') === 'user' ? 'home' : 'data-centre'} address${str('note') ? ` (${str('note')})` : ''}. DNS is asked over HTTPS (public resolvers), so it is what the world sees, not what one machine resolves.\n\n${md}\n`);
    const bad = rows.filter((r) => r.verdict !== 'ok');
    console.error(`\n${rows.length - bad.length} of ${rows.length} addresses answer · written to ${out}`);
    return;
  }
  if (command !== 'run') throw new Error('usage: cli.ts run|report|domains (see the header of this file)');

  const targetArg = str('target') ?? 'engine';
  const egress = str('egress') === 'user' ? 'user' : 'datacenter';
  const titlesArg = str('titles') ?? 'all';
  const keys = titlesArg === 'all' ? undefined : titlesArg === 'quick' ? QUICK : titlesArg.split(',');
  const titles = keys ? TITLES.filter((t) => keys.includes(t.key)) : TITLES;
  if (!titles.length) throw new Error(`no titles match "${titlesArg}"`);

  let target: Target;
  let close: (() => Promise<void>) | undefined;
  if (targetArg === 'engine') {
    const { loadPack } = await import('@charcoal/providers');
    const only = str('only')?.split(',');
    const providers = (await loadPack({ fallback: flags['no-fallback'] !== true })).filter((p) => !only || only.includes(p.module.manifest.id));
    const settings: Record<string, unknown> = {};
    if (process.env.FEBBOX_TOKEN) settings.febboxToken = process.env.FEBBOX_TOKEN;
    let engine: Record<string, unknown> | undefined;
    let features = describeRuntime('server').features;
    if (flags.browser === true) {
      const mod = (await import('@charcoal/browser-runtime' as string).catch(() => undefined)) as { createBrowserWorker?: (o?: unknown) => Promise<{ close(): Promise<void> }> } | undefined;
      if (!mod?.createBrowserWorker) throw new Error('--browser needs @charcoal/browser-runtime');
      const worker = await mod.createBrowserWorker();
      engine = { browser: worker };
      features = [...features, 'js-render'];
      close = () => worker.close();
    }
    target = engineTarget({ providers, runtime: { ...describeRuntime('server', { egress }), features }, settings, providerTimeoutMs: Number(str('provider-timeout')) || undefined, engine });
  } else {
    target = str('api') === 'v1' ? v1Target(targetArg) : v2Target(targetArg, { adminToken: str('admin-token') });
  }

  const playbackN = Number(str('playback') ?? 0);
  const playback = playbackN > 0 ? await createPlaybackChecker() : undefined;
  if (playbackN > 0 && !playback) console.error('No browser available here: playback will not be checked.');
  let commit: string | undefined;
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* not a checkout */
  }
  const label = str('label') ?? `${targetArg === 'engine' ? 'engine' : new URL(targetArg).hostname}-${new Date().toISOString().slice(0, 10)}`;
  const local = targetArg === 'engine' || /\/\/(localhost|127\.0\.0\.1)/.test(targetArg);
  const report = await runBenchmark(target, {
    label,
    mode: 'live',
    titles,
    checker: describeRuntime('server', { egress }),
    via: (str('via') as 'direct' | 'relay' | undefined) ?? (local ? 'direct' : 'relay'),
    playback,
    playbackPerTitle: playbackN || undefined,
    commit,
    note: str('note'),
    onProgress: (line) => console.error(line),
  });
  await playback?.close();
  await close?.();

  const out = str('out') ?? path.join(ROOT, 'docs/platform/data', `bench-${label}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1));
  writeFileSync(out.replace(/\.json$/, '.md'), renderReport(report));
  const s = report.summary;
  console.error(`\n${s.titlesWithVerified}/${s.titles} titles with a verified stream · ${s.unique} unique streams, ${s.verified} verified${playback ? `, ${s.started}/${s.playbackTried} started` : ''}\nwritten to ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
