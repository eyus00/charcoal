# Provider platform: implementation report

Branch `claude/gallant-fermi-kf7wqm`, on top of `main` at `b672045`. 122 files changed: 89 added,
31 modified, 2 removed; about 11,100 lines of code, 5,300 lines of tests, 900 lines of docs.
Nothing was deployed and no external system was changed.

## Phase 1. Verification and preparation

- **Created**: `docs/platform/PLAN.md`.
- **Result**: every code reference in the research report re-checked against current `main`;
  baseline typecheck green; the hosted server re-measured (no provider `ok`); one correction to
  the research (the relay refused HTML pages but passed any other URL unsigned).

## Phase 2. Provider contracts and registry

- **Created**: `packages/provider-sdk/` (`types.ts`, `errors.ts`, `runtime.ts`, `semver.ts`,
  `health.ts`, `normalize.ts`, `playback.ts`, `rank.ts`, `registry.ts`, `define.ts`,
  `engine.ts`).
- **Architecture**: one provider contract (manifest + `getSources`), runtime descriptors and
  capability matching, health per provider and runtime with circuit breakers, a normaliser, a
  delivery/compatibility layer, data-driven ranking, a signed registry document with rollback.
- **Dependencies introduced**: none at run time (dev: `tsx`, `typescript`, `@types/node`,
  already in the lockfile).

## Phase 3. Scraper framework

- **Created**: `policy.ts`, `net.ts`, `domains.ts`, `rules.ts`, `recovery.ts`, `extract/`
  (`html.ts`, `json.ts`, `media.ts`), `testing/index.ts`; `docs/platform/SDK.md`.
- **Architecture**: outbound policy per provider; instrumented fetch (timeouts, one careful
  retry, domain fail-over, request trace); versioned domain configs with validated promotion,
  audit and rollback; a typed failure taxonomy with diagnosis from traces; declarative rule
  packs; canary and recovery workflows; extraction modules (HTML with CSS and XPath subsets,
  JSON/JSON-LD/embedded state, iframes and players, HLS and DASH).
- **Tests**: 129 in `packages/provider-sdk`, all passing.
- **Limitations**: the CSS, XPath and JSONPath dialects are documented subsets; rule packs
  cannot express custom decryption; browser-rendered content is a contract, not an
  implementation.

## Phase 4. Remote execution

- **Created**: `apps/server/src/platform/` (`api.ts`, `catalog.ts`, `overlay.ts`, `legacy.ts`,
  `relay.ts`, `relay-routes.ts`, `platform.test.ts`), `apps/server/tools/check-image.sh`,
  `apps/server/tools/load-test.ts`, `packages/control-plane/` (`cli.ts`, `store.ts`).
- **Modified**: `apps/server/src/server.ts`, `shared.ts`, `proxy.ts`, `package.json`,
  `.env.example`; `packages/providers/src/*` (Castle, VixSrc, Febbox, StreamViva adapter moved to
  the SDK; `domains.ts`, `rules/cinesu.ts`, `pack.test.ts` added).
- **Removed**: `apps/server/src/health.ts` (replaced by the SDK health store;
  `/v1/providers/health` keeps its shape).
- **Architecture**: the engine runs every provider on the server; `/v2` API (registry,
  progressive sources, health, reports, admin control plane); signed relay links on `/v1/proxy`
  and `/v2/relay`; rate limiting; scheduled monitoring; legacy OMSS classes adapted in place.
- **Dependencies introduced**: `fastify` as a dev dependency of the server (already installed as
  a dependency of `@omss/framework`), for in-process tests.
- **Tests**: 11 (server) + 11 (pack) + 4 (CLI), all passing; image recipe check passing; load
  test results in TESTING.md.
- **Deployment requirements**: none mandatory. Recommended: `DATA_DIR` on a volume,
  `ADMIN_TOKEN`, `CORS_ORIGIN`, and `RELAY_SECRET` when running more than one instance.
- **Behaviour change to know about**: unsigned relay links are refused. Links are only ever
  produced by the server, so clients are unaffected; `RELAY_REQUIRE_SIGNATURE=false` restores the
  old behaviour.

## Phase 5. Application integration

- **Created**: `packages/client/` (`bridge.ts`, `registry-client.ts`, `resolver.ts`),
  `apps/web/src/lib/resolver.ts`, `apps/web/e2e/smoke.mjs`,
  `apps/extension/test/background.test.mjs`.
- **Modified**: `apps/web/src/pages/Watch.tsx`, `player/Player.tsx`, `lib/extension.ts`,
  `lib/servers.ts`, `lib/store.ts`, `pages/Profile.tsx`; `apps/extension/src/background.js`,
  `content.js` (version 0.2.0).
- **Removed**: `apps/web/src/lib/direct.ts`.
- **Architecture**: one `useSources` hook; local and remote results merged progressively;
  delivery decided per source; expired links skipped; bridge protocol 2 with negotiation and
  instant presence detection; registry applied on the client; anonymous outcome reports with an
  opt-out in Settings.
- **Tests**: 12 (client) + 7 (extension), all passing; 13 browser checks passing.
- **Measured**: playback from the first result 1.6 s after page load while the fake resolver
  took 4.1 s to finish; "no sources" to embed in 0.9 s with one request.
- **Limitations**: no UI redesign beyond what the new flow needed (the Source menu shows the new
  failure reasons through the existing report rows); no DASH player.

## Phase 6. Expansion

- **Created**: `packages/content/` (anime mapping, AniList, AniSkip; sports model, TheSportsDB,
  iptv-org channels, link-outs; discovery/languages).
- **Tests**: 113, all passing.
- **Limitations**: libraries only. No anime provider is enabled, and there is no anime, regional
  or sports UI yet. Sports is limited to schedules, public channels and official link-outs.

## Phase 7. Production readiness

- **Created**: `.github/workflows/test.yml`, `docs/platform/ARCHITECTURE.md`, `OPERATIONS.md`,
  `SECURITY.md`, `TESTING.md`, this report.
- **Modified**: root `package.json` (`test`, `registry`, `check:image` scripts), READMEs.

## Against the success criteria

| Criterion | State |
|---|---|
| Installation without mandatory extensions | Yes, as before; and viewers without one no longer wait 3.7 s per play for it |
| No mandatory home server | Yes, as before |
| Centralized provider management | Yes: registry, catalogue, control plane (API and CLI) |
| Independently updatable providers | Rule packs, stages, ranks and domains: yes, without a release. Code providers: with a web or server deploy |
| Reusable extraction infrastructure | Yes: SDK extraction modules and rule engine |
| Automated provider diagnostics | Yes: typed failures, diagnosis from traces |
| Automated health monitoring | Yes: per-runtime health, scheduled canary and recovery |
| Concurrent source aggregation | Yes: waves, progressive results, shared runs |
| Reliable playback fallbacks | Yes: per-source delivery, expiry tracking, existing player failover, embed as last resort |
| Optional local execution | Yes: extension (protocol 2); app bridge supported on the client side |
| Support for multiple content categories | Contracts, API and libraries: yes. Product UI and providers: movies and TV only |
| Documented deployment | Yes: OPERATIONS.md |
| Automated testing | Yes: 287 tests, CI workflow, smoke and image checks |
| Reasonable operating costs | One container, as before; less relay traffic |

## What this does not change

The hosted server is still on a data-centre address, and stream hosts still refuse those. The
platform makes that path fast, honest and observable; it does not make it find more. More
sources for more people come from local runtimes: the extension today, an installed app shell
next (the client side of its bridge is implemented and tested; the shell is not built).

## Suggested next steps

1. Deploy the server, then the website; set `DATA_DIR`, `ADMIN_TOKEN`, `CORS_ORIGIN`.
2. Run `npm run try` from a home connection for each provider and promote or fix accordingly
   (start with `cinesu-rules`, whose address has moved).
3. Port the twelve legacy classes to the SDK, simplest first (several are rule-pack material).
4. Build the app shell around the existing bridge protocol.
5. Wire `packages/content` into the product: anime first.
