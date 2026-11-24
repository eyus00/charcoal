/**
 * Quick live check of providers from the command line, on this machine's own connection. Each
 * stream that comes back is then actually tried (manifest and first media bytes), because a URL
 * proves nothing by itself.
 *
 *   npm run try --workspace packages/providers -- movie 27205 "Inception" 2010
 *   npm run try --workspace packages/providers -- tv 1396 "Breaking Bad" 2008 2 3
 *   npm run try --workspace packages/providers -- anime 16498 "Attack on Titan" 2013 1 --alt "Shingeki no Kyojin" --mal 16498 --tmdb 1429
 *
 * Provider ids after the positional arguments run only those (canary ones included when named).
 * Options: --imdb tt…  --alt "Other title" (repeatable)  --audio sub|dub  --olang ja
 *          --domain provider.role=https://new.host   try a provider at another address
 *          --extra ./path/to/module.ts               also load providers from a pack file
 *                                                    (it exports `providers` and `domains`)
 * Environment: EGRESS=user on a home connection; FALLBACK=true for the vendored pack;
 * NODE_USE_ENV_PROXY=1 where traffic has to leave through HTTPS_PROXY.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collect, describeRuntime, Engine, fetchTransport, HealthStore, validateStream, type DomainConfig, type LoadedProvider, type Media, type Stage } from '@charcoal/provider-sdk';
import { DEFAULT_DOMAINS, loadPack } from '../src/index.js';

const argv = process.argv.slice(2);
const flags: Record<string, string[]> = {};
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) (flags[argv[i].slice(2)] ??= []).push(argv[++i] ?? '');
  else positional.push(argv[i]);
}
const flag = (name: string) => flags[name]?.[0];
const [kind = 'movie', id = '27205', title = 'Inception', year, ...rest] = positional;
const numbers = kind === 'tv' ? 2 : kind === 'anime' ? 1 : 0;
const only = rest.slice(numbers);
const common = { title, year: year ? Number(year) : undefined, altTitles: flags.alt, originalLanguage: flag('olang') };
const media: Media =
  kind === 'tv'
    ? { kind: 'tv', ...common, ids: { tmdb: id, imdb: flag('imdb') }, season: Number(rest[0] || 1), episode: Number(rest[1] || 1) }
    : kind === 'anime'
      ? { kind: 'anime', ...common, ids: { anilist: id, mal: flag('mal'), tmdb: flag('tmdb') }, episode: Number(rest[0] || 1), audio: flag('audio') === 'dub' ? 'dub' : 'sub', originalLanguage: flag('olang') ?? 'ja' }
      : { kind: 'movie', ...common, ids: { tmdb: id, imdb: flag('imdb') } };

// Address overrides: --domain fsharetv.site=https://fsharetv.co
const domains: Record<string, DomainConfig> = {};
const extraDomains: Record<string, DomainConfig> = {};
const extra: LoadedProvider[] = [];
for (const file of flags.extra ?? []) {
  const mod = (await import(pathToFileURL(path.resolve(file)).href)) as { providers?: { module: LoadedProvider['module']; stage: Stage }[]; domains?: Record<string, DomainConfig> };
  Object.assign(extraDomains, mod.domains ?? {});
  for (const p of mod.providers ?? []) extra.push({ module: p.module, stage: p.stage, domains: mod.domains?.[p.module.manifest.id] });
}
for (const d of flags.domain ?? []) {
  const [target, origin] = d.split('=');
  const [provider, role] = target.split('.');
  const base = domains[provider] ?? extraDomains[provider] ?? DEFAULT_DOMAINS[provider];
  if (!base || !origin) throw new Error(`--domain ${d}: expected provider.role=https://host of a known provider`);
  domains[provider] = { ...base, roles: { ...base.roles, [role]: { ...base.roles[role], active: origin } } };
}
const providers = [...(await loadPack({ fallback: process.env.FALLBACK === 'true', domains })), ...extra.map((p) => ({ ...p, domains: domains[p.module.manifest.id] ?? p.domains }))];

const runtime = describeRuntime('server', { egress: process.env.EGRESS === 'user' ? 'user' : 'datacenter' });
const engine = new Engine({
  providers,
  runtime,
  transport: fetchTransport,
  health: new HealthStore(),
  settings: process.env.FEBBOX_TOKEN ? { febboxToken: process.env.FEBBOX_TOKEN } : undefined,
  log: process.env.VERBOSE ? (e) => console.log(`  · ${e.provider ?? ''} ${e.event} ${JSON.stringify(e.data ?? {}).slice(0, 300)}`) : undefined,
});
const { results, plan } = await collect(engine.resolve({ media, only: only.length ? only : undefined }));
for (const s of plan?.skipped ?? []) console.log(`${s.name.padEnd(14)} skipped   ${s.reason}`);
for (const r of results) {
  console.log(`${r.provider.name.padEnd(14)} ${r.outcome.padEnd(9)} ${String(r.ms).padStart(5)}ms  ${r.requests} requests  ${r.outcome === 'ok' ? `${r.streams.length} streams, ${r.captions.length} captions` : `${r.code}: ${r.message}`}`);
  for (const s of r.streams.slice(0, 6)) {
    const v = await validateStream(s, fetchTransport, { runtime });
    const host = s.url.startsWith('data:') ? '(inline)' : new URL(s.url).hostname;
    console.log(`               ${s.type} ${s.quality.padEnd(5)} ${s.audio.map((a) => a.lang).join('+').padEnd(5)} ${host.padEnd(34)} → ${v.state}${v.state === 'verified' ? ` (${v.level}${v.detail?.maxHeight ? `, up to ${v.detail.maxHeight}p` : ''}${v.detail?.container ? `, ${v.detail.container}` : ''})` : v.code ? ` ${v.code}: ${v.message}` : ` ${v.message ?? ''}`}`);
  }
}
