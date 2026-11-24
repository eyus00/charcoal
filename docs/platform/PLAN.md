# Provider platform: verification and implementation plan

Date: 2026-11-24. Base: `main` at `b672045`. Research report:
`eyus00/research`, branch `claude/gallant-fermi-kf7wqm`, `charcoal-streaming-architecture/README.md`.

## 1. Verification of the research against the current code

| Check | Result |
|---|---|
| Code references in the report | Re-run against `b672045`: every in-repository `path:line` reference resolves and is in range. One drift: the Febbox settings card in `apps/web/src/pages/Profile.tsx` moved from 465-520 to 469-524. Nothing in the streaming pipeline changed in `b672045` (it touched library, cards and details UI only) |
| Baseline | `npm ci`, then `npm run typecheck`: web, server and providers all pass |
| Hosted server finds nothing | Re-checked 15:03 UTC: 0 providers `ok`, 13 failing, 2 benched, 14 unknown, 2 successes in total since restart. Conclusion stands |
| "The proxy is open" (B8) | **Corrected.** `/v1/proxy` relays any non-HTML public URL with no signature (`https://registry.npmjs.org/-/ping` came back through it), but it refuses HTML pages (`proxy.ts:278-285`). It is an open media/file relay, not an open web proxy. Still worth signing |
| CORS on the hosted server | `access-control-allow-origin: *` confirmed |
| Server waits for the slowest provider; validates each source with an extra fetch | Confirmed in `@omss/framework` 1.1.26 `dist/services/source.service.js` |
| Extension users run only 3 first-party providers | Confirmed: `apps/web/src/lib/direct.ts:81-87` uses the shared list; the 12 enabled classes in `apps/server/src/providers` are server-only |

What already works and stays: the isomorphic provider contract with an injected `Fetcher`
(`packages/providers`), the four-message bridge (`apps/extension`), the stream relay
(`apps/server/src/proxy.ts`), the player's failover and re-search (`apps/web/src/player/Player.tsx`),
embeds as the last resort, the `/v1` OMSS endpoints, self-hosting.

## 2. Design rules

The eight concerns are kept in separate modules and separate data:

| Concern | Lives in | Changes without touching |
|---|---|---|
| Provider identity | `ProviderManifest` (data) | everything else |
| Provider domains | `DomainConfig` documents, resolved at run time by role | extraction code, the app |
| Extraction logic | provider module (code) or rule pack (data) using SDK extraction helpers | the app, the runtime |
| Execution environment | `Runtime` descriptors + capability matching | the provider's code |
| Authentication | per-device settings handed to local runtimes only | providers that need none |
| Playback resolution | normaliser + `delivery` decision + relay signing | providers |
| Provider health | health store keyed by provider and runtime, fed by typed failures | ranking code |
| Source ranking | scoring function with weights from the registry | providers |

Other rules: no new heavy dependencies (tests use `node:test`); nothing new is deployed by this
work; existing `/v1` behaviour and the current website path keep working until the new path is
proven; every new module has tests; anything not exercised by a test is listed as untested.

## 3. Where the code goes

```text
packages/provider-sdk/     NEW  framework: contracts, failure taxonomy, network policy, instrumented
                                fetch, extraction modules, domains, rule engine, aggregation engine,
                                normaliser, ranking, health + circuit breaker, signed registry,
                                runtime selection, test utilities
packages/providers/        the first-party provider pack: manifests, domain configs, rule packs,
                                existing providers adapted to the SDK (old exports kept)
packages/content/          NEW  category adapters: anime id/episode mapping, sports events, channels
tools/registry/            NEW  control-plane CLI: build, validate, sign, promote, roll back
apps/server/               /v2 API on the same Fastify instance: registry, progressive sources,
                                health, reports, admin overlay; signed relay; rate limits
apps/web/                  unified resolver (local + remote, progressive), per-source delivery
apps/extension/            protocol v2: version and capability negotiation (v1 messages kept)
docs/platform/             plan, architecture decisions, SDK guide, deployment, security review
```

## 4. Phases and deliverables

| Phase | Deliverable | Evidence required |
|---|---|---|
| 1 | This document | Done |
| 2 | SDK contracts, registry, configuration, normaliser, health | Unit tests |
| 3 | Extraction modules, domain management, diagnostics, rule engine, recovery, SDK guide | Unit tests with fixtures; failure simulations |
| 4 | Engine on the server, `/v2` API, signed relay, rate limits, admin overlay, registry CLI | Integration tests against an in-process server with fake providers |
| 5 | Website resolver with progressive results; bridge protocol v2 | Unit tests; typecheck; build |
| 6 | Anime mapping, sports events and channels, language-aware helpers | Unit tests with fixtures |
| 7 | Security review, CI workflow, deployment and migration notes | CI runs the suites |

## 5. Scope decisions

- **Bot checks are detected and reported, not solved.** A challenge page becomes a typed
  `CHALLENGE` failure scoped to the runtime that met it; the planner then prefers another runtime
  or an embedded player. This matches `apps/server/docs/research/pstream/README.md` section 3.
- **Browser automation is a runtime contract, not a bundled service.** The SDK defines the
  `browser` runtime and its capability; no headless-browser fleet is added (cost and reliability
  reasons are in the research report, Part 4.5). Providers that need a real browser session fall
  back to the `frame` runtime (the viewer's own browser).
- **Domain alternates are configured, validated and promoted; they are not auto-discovered** from
  third-party sources.
- **Existing scrapers are adapted, not multiplied.** The work is the platform; the provider pack
  carries what the repository already has. Providers that cannot be validated from this
  environment enter the registry as `canary`, never `stable`.
- **Sports covers schedules, public channels and official link-outs**, as the directive states.
- **Nothing is deployed.** Railway, Vercel and release workflows are not triggered.
