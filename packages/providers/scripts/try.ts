/**
 * Quick check of the pack from the command line, on this machine's own connection:
 *   npm run try --workspace packages/providers -- movie 27205 "Inception" 2010
 *   npm run try --workspace packages/providers -- tv 1396 "Breaking Bad" 2008 2 3
 * Add provider ids at the end to run only those (canary ones included when named).
 */
import { collect, describeRuntime, Engine, fetchTransport, HealthStore, type Media } from '@charcoal/provider-sdk';
import { loadPack } from '../src/index.js';

const [kind = 'movie', tmdb = '27205', title = 'Inception', year, season, episode, ...only] = process.argv.slice(2);
const common = { ids: { tmdb }, title, year: year ? Number(year) : undefined };
const media: Media = kind === 'tv' ? { kind: 'tv', ...common, season: Number(season || 1), episode: Number(episode || 1) } : { kind: 'movie', ...common };

const engine = new Engine({
  providers: await loadPack({ fallback: process.env.FALLBACK === 'true' }),
  runtime: describeRuntime('server', { egress: process.env.EGRESS === 'user' ? 'user' : 'datacenter' }),
  transport: fetchTransport,
  health: new HealthStore(),
  settings: process.env.FEBBOX_TOKEN ? { febboxToken: process.env.FEBBOX_TOKEN } : undefined,
});
const { results, plan } = await collect(engine.resolve({ media, only: only.length ? only : undefined }));
for (const s of plan?.skipped ?? []) console.log(`${s.name.padEnd(12)} skipped   ${s.reason}`);
for (const r of results) {
  console.log(`${r.provider.name.padEnd(12)} ${r.outcome.padEnd(9)} ${String(r.ms).padStart(5)}ms  ${r.outcome === 'ok' ? `${r.streams.length} streams, ${r.captions.length} captions` : `${r.code}: ${r.message}`}`);
  for (const s of r.streams.slice(0, 2)) console.log(`             ${s.type} ${s.quality} ${s.url.slice(0, 90)}`);
}
