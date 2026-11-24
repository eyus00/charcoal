# Testing and evidence

What is tested, how to run it, and what each suite does and does not prove. Run on 2026-11-24
(Node 22.23, Linux).

## Running

```bash
npm ci
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run check:image
```

The browser smoke test needs Playwright with a Chromium, and ffmpeg, on the machine:

```bash
VITE_JELLY_URL=http://localhost:18181 npm run build --workspace apps/web
```

```bash
npm run test:e2e --workspace apps/web
```

The load test:

```bash
npm exec --workspace apps/server -- tsx tools/load-test.ts 2000 200 12 100
```

CI (`.github/workflows/test.yml`) runs the typecheck, every suite, both builds and the image
recipe check on pushes to `main` and on pull requests.

## Suites

| Suite | Tests | Kind | Proves |
|---|---|---|---|
| `packages/provider-sdk` | 129 | Unit + integration over a mock network | The framework: taxonomy, policy, domains, engine, rules, registry, health, recovery, extraction |
| `packages/content` | 113 | Unit, with trimmed samples of real public metadata | Anime mapping, sports model and sources, discovery helpers |
| `packages/providers` | 11 | Provider logic against synthetic fixtures | Castle (real decryption of test-encrypted answers), VixSrc, Febbox, the CineSu rule pack; domain separation; failure classes |
| `packages/control-plane` | 4 | CLI driven in a temp directory | Build, stage, rank, domain change, rollback, diff, audit, sign, verify, import |
| `packages/client` | 12 | Resolver against a real engine over a mock network | Local + remote merging, fail-over, lost bridge, registry application, ranking |
| `apps/server` | 11 | In-process Fastify (`inject`) with the real catalogue | `/v2` API, signed relay, control plane, recovery |
| `apps/extension` | 7 | Background and content scripts in a sandbox with a fake `chrome` | Who may talk to it, what it fetches and sets, protocol 2 |
| `apps/web/e2e/smoke.mjs` | 13 checks | Headless Chromium against a local fake resolver | The built site: progressive playback, embed fall-back timing, bridge path |
| `apps/server/tools/check-image.sh` | 5 checks | The image's install steps repeated in a scratch directory | Production install, boot, health, relay locked, control plane off by default |
| **Total** | **287 tests + 18 checks** | | |

## Failure scenarios

| Scenario | Where | Result |
|---|---|---|
| Provider unavailable | `engine.test.ts` "provider unavailable: DNS failure…" | `DNS`, scope domain; circuit opens after three; the plan then skips it with the reason |
| Domain changed | `engine.test.ts` "domain changed…", "recovery: an address that died…"; `pack.test.ts` "VixSrc: a domain change is a config change…" | Fail-over inside the run; a validated, reversible proposal; no extraction code touched |
| Address now redirects elsewhere | `engine.test.ts` "a redirect that leaves the allow-list…" | `REDIRECTED` with the target; not followed; recovery names it |
| Provider timeout | `engine.test.ts` "provider timeout…", "a provider that throws, hangs…" | `TIMEOUT`; the run ends on budget; others unaffected |
| Invalid source response | `engine.test.ts` "a provider that throws, hangs, returns garbage…" | `INVALID_RESULT` |
| Changed page structure | `engine.test.ts` "changed page structure…"; `pack.test.ts` (VixSrc, CineSu, Castle) | `SELECTOR_MISSING` / `STRUCTURE_CHANGED`; provider flagged `needs-update` |
| Expired playback URL | `engine.test.ts` "already-expired links…", "a run is never reused past the expiry of its links…" | `EXPIRED`; cached runs honour link expiry; the player skips an expired link |
| Unsupported playback format | `engine.test.ts` "streams in a format the client did not ask for…", "playback: compatibility…" | `UNSUPPORTED_FORMAT`, not counted against the provider; unplayable codecs explained |
| Remote execution unavailable | `client.test.ts` "remote execution unavailable…"; e2e check 3 | Next server; then local only; then the embed, in under a second |
| Extension disconnected | `client.test.ts` "extension disconnected mid-run…" | Its providers are asked of the resolver; no provider is blamed |
| Duplicate results | `engine.test.ts` "multiple providers returning duplicates…"; `client.test.ts` "with a bridge…" | One entry per upstream file; the locally resolved copy wins |
| Bot check | `checkContract`; `pack.test.ts`; `platform.test.ts` | `CHALLENGE`, scope runtime; never retried or solved |
| Concurrency | `engine.test.ts` "identical requests made together share one run…", "waves…", "when every listener leaves…" | One run per title; later waves don't wait for slow earlier ones; abandoned runs stop |

## Load (platform overhead only)

`tools/load-test.ts`: a real engine, catalogue and Fastify instance in one process; synthetic
providers making two requests each to "sites" that answer after 5 to 125 ms; some always refuse,
some lack half the titles. One CPU core.

| Run | Requests/s | Errors | Full answer p50 / p95 | First playable result p50 / p95 | Provider runs |
|---|---|---|---|---|---|
| 2,000 requests, 200 at once, 12 providers, 100 titles | 2,053 | 0 | 2 ms / 499 ms | 74 ms / 79 ms | 1,200 instead of 24,000 (shared runs and cache) |
| 1,000 requests, 100 at once, 12 providers, all distinct | 357 | 0 | 257 ms / 366 ms | 34 ms / 65 ms | 10,200 (19,200 upstream requests) |
| 300 requests, 300 at once, 30 providers, all distinct | 164 | 0 | 1,698 ms / 1,813 ms | 214 ms / 227 ms | 9,000 |

Reading: the platform's own cost is well under a millisecond of CPU per provider run; a single
small instance handles far more searches than the hosted server sees; and the first playable
result arrives 4 to 8 times sooner than the complete answer, which is the point of streaming.
Memory grew by 150 to 220 MB during these bursts (buffered responses and cached runs).

## What is NOT proven

- **That any third-party site currently answers.** Provider tests use fixtures written for the
  tests. The only live run was one request for `cinesu-rules`, which found the site redirecting
  (OPERATIONS.md, section 5). Which providers work from which network is what the canary and
  `npm run try` are for.
- **The website's `/v2` path against the real hosted server.** It was exercised against a local
  server and a fake resolver; the hosted server still runs the old build.
- **The extension in a real browser.** Its logic is tested in a sandbox with a fake `chrome`
  API; it was not loaded into Chrome or Firefox.
- **HLS playback through the bridge.** The smoke test plays a WebM clip (the test Chromium has
  no H.264); the hls.js loader path for bridged streams is unchanged code but was not replayed.
- **The Docker image itself.** No Docker daemon was available; the image's steps were repeated
  outside a container.
- **Anime, sports and regional modules in the product.** They are libraries with tests; no UI or
  provider uses them yet.
- **`/v1` end to end.** The legacy adapter (`platform/legacy.ts`) is unit-tested; the `/v1`
  wrappers in `shared.ts` and `server.ts` are type-checked and the server boots with them, but
  `/v1/movies/:id` was not called end to end (it needs TMDB).
