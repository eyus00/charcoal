/**
 * Load and concurrency test of the /v2/sources path, in process and without any network: a real
 * engine, catalogue and Fastify instance, with synthetic providers whose "sites" answer after a
 * configurable delay. It measures what the platform itself costs (planning, policy, tracing,
 * normalising, health, serialising), not what third-party sites cost.
 *
 *   npx tsx tools/load-test.ts [requests=2000] [concurrency=200] [providers=12] [titles=100]
 */
import Fastify from 'fastify';
import { defineProvider, describeRuntime, Engine, getJson, HealthStore, NotFoundError, type ProviderModule } from '@charcoal/provider-sdk';
import { mockTransport, type MockRoute } from '@charcoal/provider-sdk/testing';
import { registerApi } from '../src/platform/api.js';
import { Catalog } from '../src/platform/catalog.js';
import { Overlay } from '../src/platform/overlay.js';
import { registerRelay } from '../src/platform/relay-routes.js';

const [REQUESTS = 2000, CONCURRENCY = 200, PROVIDERS = 12, TITLES = 100] = process.argv.slice(2).map(Number);

const provider = (i: number): ProviderModule =>
  defineProvider({
    manifest: { id: `load-${i}`, name: `Load ${i}`, version: '1.0.0', kinds: ['movie'], lookup: ['tmdb'], runtimes: ['server'], domainRoles: [], extraHosts: [`p${i}.load.example`], followDiscovered: true, output: { types: ['hls'] } },
    async getSources(media, ctx) {
      // Two requests per run, like a small real provider: a lookup, then the stream info.
      const found = await getJson<{ id?: number }>(ctx.fetch, `https://p${i}.load.example/search/${media.ids.tmdb}`, { signal: ctx.signal });
      if (!found.id) throw new NotFoundError();
      const s = await getJson<{ url: string }>(ctx.fetch, `https://p${i}.load.example/stream/${found.id}`, { signal: ctx.signal });
      return { streams: [{ url: s.url, type: 'hls', headers: { Referer: `https://p${i}.load.example/` } }] };
    },
  });

const routes: Record<string, MockRoute> = {};
for (let i = 0; i < PROVIDERS; i++) {
  // A spread of behaviours: fast, slow, missing, refused, broken.
  const delayMs = 5 + ((i * 37) % 120);
  routes[`https://p${i}.load.example/search/*`] = (req) => {
    const tmdb = Number(req.url.pathname.split('/').pop());
    if (i % 6 === 4) return { status: 403, body: 'Forbidden', delayMs };
    if (i % 6 === 5 && tmdb % 2) return { status: 404, body: '', delayMs };
    return { body: { id: tmdb }, delayMs };
  };
  routes[`https://p${i}.load.example/stream/*`] = (req) => ({ body: { url: `https://cdn${i % 3}.load.example/v/${req.url.pathname.split('/').pop()}/1080/master.m3u8?expires=${Math.floor(Date.now() / 1000) + 3600}` }, delayMs: 5 });
}

const transport = mockTransport(routes);
const health = new HealthStore();
const overlay = new Overlay();
const catalog = await Catalog.create({ legacy: Array.from({ length: PROVIDERS }, (_, i) => provider(i)), overlay, health, fallback: false, publicUrl: 'http://load.test' });
const engine = new Engine({ providers: () => catalog.providers(), runtime: describeRuntime('server'), transport, health, cacheTtlMs: 120_000 });
const app = Fastify();
registerRelay(app as never, { proxy: async () => ({ data: Buffer.alloc(0), contentType: 'text/plain', statusCode: 200, headers: {} }) });
registerApi({ app: app as never, engine, catalog, overlay, health, transport, lookup: async () => ({ title: 'Load' }), publicUrl: 'http://load.test', canaries: {}, limits: { sourcesPerMinute: 1e9, sourcesBurst: 1e9 } }); // every request here comes from one address
await app.ready();

const only = Array.from({ length: PROVIDERS }, (_, i) => `load-${i}`).join(',');
const latencies: number[] = [];
const firstResult: number[] = [];
let streams = 0;
let errors = 0;
const startRss = process.memoryUsage().rss;
const started = performance.now();
let next = 0;

async function worker() {
  while (next < REQUESTS) {
    const n = next++;
    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url: `/v2/sources?kind=movie&tmdb=${1000 + (n % TITLES)}&title=Load&only=${only}` });
    const ms = performance.now() - t0;
    if (res.statusCode !== 200) {
      errors++;
      continue;
    }
    latencies.push(ms);
    const lines = res.body.trim().split('\n');
    for (const l of lines) {
      const e = JSON.parse(l) as { t: string; streams?: unknown[]; ms?: number };
      if (e.t === 'result' && e.streams?.length) streams += e.streams.length;
    }
    const first = lines.map((l) => JSON.parse(l) as { t: string; outcome?: string; ms?: number }).find((e) => e.t === 'result' && e.outcome === 'ok');
    if (first?.ms !== undefined) firstResult.push(first.ms);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const seconds = (performance.now() - started) / 1000;

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))] ?? 0;
const providerRuns = health.list().reduce((n, r) => n + r.ok + r.empty + r.failed, 0);
console.log(
  JSON.stringify(
    {
      requests: REQUESTS,
      concurrency: CONCURRENCY,
      providers: PROVIDERS,
      distinctTitles: TITLES,
      seconds: Number(seconds.toFixed(2)),
      requestsPerSecond: Math.round(REQUESTS / seconds),
      errors,
      latencyMs: { p50: Math.round(pct(latencies, 50)), p95: Math.round(pct(latencies, 95)), p99: Math.round(pct(latencies, 99)) },
      firstPlayableResultMs: { p50: Math.round(pct(firstResult, 50)), p95: Math.round(pct(firstResult, 95)) },
      streamsReturned: streams,
      // Each distinct title is resolved once; every other request for it shared that run.
      providerRuns,
      providerRunsWithoutSharing: REQUESTS * PROVIDERS,
      upstreamRequests: transport.calls.length,
      rssGrowthMb: Math.round((process.memoryUsage().rss - startRss) / 1e6),
      benched: health.list().filter((r) => r.circuit !== 'closed').map((r) => r.provider),
    },
    null,
    2,
  ),
);
await app.close();
