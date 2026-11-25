# Three parts and live sports: implementation report (phase 3)

Branch `claude/gallant-fermi-kf7wqm`, with `main` (the visual updates, `69e7c93`) merged in.
Nothing was deployed. The earlier reports follow below, unchanged.

## What was delivered

| Asked for | Delivered | Where |
|---|---|---|
| The platform work on top of the visual updates | `main` merged; three conflicts (player, layout, shortcuts) resolved keeping main's visuals and this branch's streaming | merge `061baa0` |
| A switch below the logo: movies and TV (one word), anime, sports | **Screen**, **Anime**, **Sports**: a pill in the open sidebar, three icons in the collapsed one, a pill at the top of the page below `lg`. Each part has its own navigation, phone bar, search and home; the part follows the page, and opening the site lands in the one used last | `lib/mode.ts`, `components/Layout.tsx` |
| The anime version | A home (banner, continue watching, six rows) and a browse page that also searches by name; shortcuts and search stay inside Anime | `pages/Anime.tsx`, `AnimeBrowse.tsx` |
| The sports version, with the streams the listed sites embed | Live now, coming up (by day, in the viewer's time zone), sport pills, search; a watch page that frames the directory's player; channels; the schedule with official links kept as its own page | `pages/Sports*.tsx`, `packages/content/src/sports/directory.ts` |
| Extract streams from the embed if possible, otherwise embed | Embed. See below | |
| Minimal setup to start a stream | A viewer with no helper and no server of their own gets the embedded player after seven seconds of an empty search (was: when the whole search ended); sports events are one tap from their player; nothing asks for an install | `pages/Watch.tsx` |
| Smooth and fast | The details peek loads on demand: main bundle 325 kB (350 before, 336 before this phase). Pointing at a part fetches its code, and for Sports what is on. Anime rows and the sports list paint from the last visit's copy | `main.tsx`, `lib/mode.ts`, `lib/persist.ts` |
| Mobile | Every new page checked at 390 px and 320 px for overflow; the switch, the bar, search and the player page have phone layouts | `e2e/modes.mjs` section D |
| Clean the repository | 110 files removed: an unused vendored reference library and its test tool and results, the carried-out plan, an intermediate benchmark run, two stray screenshots | commit `be8bcdd` |

## The sports source

The list of live-sports sites this project follows used to lead with Streamed, whose API many
of them embedded. **Streamed has closed**: `streamed.pk` now serves a closure notice that
recommends other sites, PPV first. One of the aggregators on the list (Reedstreams) serves PPV's
images through its own API. So the directory read here is PPV's `GET /api/streams`:

- It answers any web page (`Access-Control-Allow-Origin: *`), so the site reads it straight
  from the browser: no server, nothing to set up.
- On 2026-11-25 it listed 206 streams in ten categories: events with a start and an end, and
  always-on channels, each with the address of a player page and alternatives (HD / SD, other
  broadcasts).
- Its answer carries the line "Interested in using our API? Contact us for more information."
  It is open, and its owner asks integrators to get in touch. **That is a step for the operator
  before this goes to production.**
- A second address named by the site's own pages (`api.ppv.cx`) is tried when the first does not
  answer. It did not connect from here; the fail-over is tested against a mock.

**Extraction was not possible, so events are framed.** The player page is 269 KB of obfuscated
script with an encrypted configuration and no stream address in it. Taking a stream out of it
would mean defeating that, which this project does not do. The frame is given no referrer, and
with "Block pop-ups" it is sandboxed (scripts yes; pop-ups and leaving the page no). The watch
page says the player is another site's.

## Evidence and limits

- 374 unit tests and 218 browser checks pass; the typecheck is clean (TESTING.md).
- **The framed player was not seen playing.** Its host answers curl with 200 and refused this
  sandbox's test browser with 502, so the page tests use a stand-in. Whether the real player
  starts inside a frame, and whether it still starts with pop-ups blocked, has to be checked in
  an ordinary browser. If it refuses sandboxing, the default (pop-ups not blocked) still works
  as the site's other embedded players do.
- The name **Screen** for movies and TV is one constant (`MODES` in `lib/mode.ts`).
- Removed files are in history: `git checkout be8bcdd^ -- <path>` restores any of them.

# Source expansion: implementation report (phase 2)

Branch `claude/gallant-fermi-kf7wqm`, on top of `fd7ce76` (the provider platform). Nothing was
deployed and no external system was changed. The earlier report follows below, unchanged.

The short version: from one cloud address, verified streams went from 55 to 127, providers with a
verified stream from 2 to 10, and titles covered by two or more providers from 1 of 34 to 27 of
34. The hosted server still returns nothing, because nothing is deployed and its failure is a
connection problem of that host. No run from a home connection exists. AVAILABILITY.md has the
measurements; PROVIDERS.md says, integration by integration, how far the evidence goes.

## What was delivered

| Objective | Delivered | Where |
|---|---|---|
| 1, 11. Measure availability | A benchmark (34 titles; discovered, unique, verified, started; per provider, category and failure code; single, side-by-side and matrix reports), a baseline, a final run | `packages/bench`, `docs/platform/data/`, AVAILABILITY.md |
| 2. Port the twelve legacy providers | All twelve are SDK modules (two are rule packs); the classes are removed; a migration table | `packages/providers`, PROVIDERS.md |
| 3. Research and integrate more providers | A second ecosystem survey with live probes; six providers added on evidence (five anime, VidLink); candidates that failed the gate documented | ECOSYSTEM.md, PROVIDERS.md |
| 4. Browser extraction runtime | A Playwright worker with two network layers, sessions, limits, challenge and sign-in detection, health; a `render` step for rule packs | `packages/browser-runtime`, BROWSER.md |
| 5. Scraper framework | Address trials with automatic promotion and rollback, per-address settings, DNS-over-HTTPS domain diagnosis, wider discovery rules, embedded-player and packed-script extraction, title matching | `packages/provider-sdk` |
| 6. Remote execution | Measured where it could be; a placement verdict per provider and runtime from the kinds of failure; `works-elsewhere` | AVAILABILITY.md section 4, `health.ts` |
| 7. Aggregation | Streams sent as discovered, then tried and reported as verified or failed; ranking uses it; per-provider verification counts | `validate.ts`, `/v2/sources`, `packages/client` |
| 8. Playback | DASH in the existing player (lazy), DRM refused, undecodable codecs skipped with a reason, expired links renewed, live mode | `apps/web/src/player` |
| 9. Content expansion | Anime, Indian cinema and sports as working pages and flows | `apps/web`, `packages/content` |
| 10. User experience | Anime and regional titles need no extra step; audio language and sub/dub are preferences; sources say whether they were verified and why one cannot play | `apps/web` |

## Files

- **Created**: `packages/bench/`, `packages/browser-runtime/`; in
  `packages/provider-sdk/src`: `validate.ts`, `browser.ts`, `match.ts`, `diagnose-domain.ts`,
  `extract/players.ts` and five test files; in `packages/providers/src`: twelve ported providers
  (`providers/*.ts`, `rules/icefy.ts`), `rules/vidlink.ts`, five `providers/anime-*.ts` with
  `packs/anime.ts`, `providers/shared.ts`, three test files; in `apps/web/src`: `pages/Anime.tsx`,
  `Indian.tsx`, `Sports.tsx`, `Live.tsx`, `lib/anime.ts`, `content.ts`, `regional.ts`,
  `sports.ts`, `sportsConfig.ts`, `playback-engines.ts`, `player/dash.ts`,
  `components/Segmented.tsx`, `e2e/content.mjs`, `e2e/playback.mjs`; docs AVAILABILITY.md,
  PROVIDERS.md, BROWSER.md, ECOSYSTEM.md and `docs/platform/data/`.
- **Modified**: the SDK (`types`, `net`, `policy`, `domains`, `engine`, `rules`, `health`, `rank`,
  `playback`, `recovery`, `errors`), the server (`server.ts`, `platform/api.ts`, `overlay.ts`,
  Dockerfile, `.env.example`), `packages/client/src/resolver.ts`, the website's Watch, Details,
  Home and Profile pages, player, resolver and store, `packages/content` (TheSportsDB key
  handling), the CI workflow, the existing docs.
- **Removed**: the twelve legacy classes under `apps/server/src/providers/` (ported). The three
  classes that were already disabled upstream are untouched.

## Architecture changes

- Providers can use a browser (`ctx.browser`, the `js-render` feature) and rule packs can render
  a page. The server starts a worker only when asked.
- A stream now has a `verification`; `/v2/sources` sends `verify` lines after results.
- Health has a placement per provider and runtime, and a rollup across runtimes.
- A domain role can carry a candidate address on trial, a watch after a change, and settings
  that belong to an address.
- Stages are assigned on evidence: `stable` needs a verified stream. A canary graduates by
  itself after three monitor checks in a row with a verified stream.
- The website asks for two identities for anime, and plays HLS, DASH and files through one
  engine interface.

## Dependencies introduced

- `playwright-core` 1.63.0 (the browser driver; no browser is downloaded with it) in
  `packages/browser-runtime`. Chromium itself is optional: `--build-arg WITH_BROWSER=true`.
- `dashjs` 5.3 in the website, as a lazy chunk (825 kB, 243 kB gzipped; the main chunk grew by
  0.1 kB).

## Tests

367 tests in nine packages and 145 browser and image checks, all passing; typecheck clean; both
builds succeed. TESTING.md lists the suites and, at length, what is not proven.

## Behaviour changes to know before deploying

- **Stages.** Eleven ported providers that were "enabled" as classes (and returning nothing) are
  now `canary`: they do not run for ordinary requests until they pass three monitor checks with a
  verified stream, or someone promotes them. On a home server they will come back by themselves
  where they work; `PROMOTE_CANARY_AFTER=0` turns that off.
- **Verification** is on: the server makes up to four small requests per discovered stream.
  `VERIFY_STREAMS=false` turns it off.
- **VidLink and VidNest need a browser worker.** Without `BROWSER_WORKER=local` (and an image
  built with Chromium) or `BROWSER_WS_ENDPOINT`, they are skipped, and the redundancy measured
  here for films and series is not there.
- **VidSrc now returns its player page as a frame** instead of failing. It is canary.
- **The website** has four new pages, loads the anime mapping list (1.2 MB once, then cached for
  seven days) for anime titles only, and contacts AniList, AniSkip, TheSportsDB and iptv-org from
  the browser.

## Decisions for the owner

1. **Licence.** The legacy classes came from `cinepro-org/core`, published under PolyForm
   Noncommercial 1.0.0; the ports are derived from them. Castle is adapted from a GPL-3.0
   project. The repository has no root LICENSE. Nothing here changes that situation, but it
   should be a decision rather than an accident. It also decides whether providers for Indian
   catalogues can be added: the maintained code for those is copyleft or unlicensed.
2. **Videasy** depends on a third-party decoding service that sees every lookup. Keep it canary,
   or remove it.
3. **Sports channels** are a hand-picked allow-list of 36 ids judged free-to-air. It needs a
   review by whoever operates the site.
4. **The hosted server.** Its providers fail at the connection level where another cloud network
   connects. Deploy this branch there and read its health, or try another host with the
   benchmark; either is a production change, so neither was made.

## Remaining limitations

- No measurement from a home connection, another region, or the extension in a real browser.
- Two titles of 34 have no verified stream; Indian titles have no dedicated provider.
- An alternate title containing a comma is not sent to providers.
- DASH through the server relay is not supported (the relay rewrites only HLS playlists); HEVC
  playback depends on the device.
- The browser runtime with a remote browser, and the Docker image with Chromium, were not run.

## Deployment requirements

None are mandatory. In order: deploy the server (optionally from an image built with
`WITH_BROWSER=true`, with `BROWSER_WORKER=local`), check `GET /v2/health` and run the benchmark
against it, then deploy the website. OPERATIONS.md has the settings and the commands.

---

# Provider platform: implementation report

Branch `claude/gallant-fermi-kf7wqm`, on top of `main` at `b672045`. 122 files changed: 89 added,
31 modified, 2 removed; about 11,100 lines of code, 5,300 lines of tests, 900 lines of docs.
Nothing was deployed and no external system was changed.

## Phase 1. Verification and preparation

- **Created**: an implementation plan (removed once it was carried out; this report records what was built).
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
