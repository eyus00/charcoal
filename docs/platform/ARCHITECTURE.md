# Provider platform: architecture

What was built, where it lives, and why it is shaped this way. For how to add a provider see
[SDK.md](SDK.md); for running it see [OPERATIONS.md](OPERATIONS.md); for what is proven and what
isn't see [TESTING.md](TESTING.md) and [SECURITY.md](SECURITY.md).

## 1. The picture

```text
 CLIENT (website, optionally with the helper extension or inside an app shell)
 +--------------------------------------------------------------------------------------+
 | apps/web/src/lib/resolver.ts     useSources(): one hook, one growing ranked list     |
 |   @charcoal/client               bridge negotiation, registry client, resolveSources |
 |   @charcoal/provider-sdk         the same engine the server runs                     |
 |   @charcoal/providers            the provider pack (code and rule packs)             |
 | player: per-source delivery = origin | bridge-injected headers | relay | embed frame |
 +----------+----------------------------------------------+----------------------------+
            | GET /v2/registry (signed or plain)           | GET /v2/sources  (NDJSON, progressive)
            v                                              v
 SERVER (apps/server: one process, the existing Fastify instance)
 +--------------------------------------------------------------------------------------+
 | platform/api.ts      /v2/registry  /v2/sources  /v2/health  /v2/report  /v2/admin/*  |
 | platform/catalog.ts  pack + rule packs + fallback pack + legacy classes, with overlay |
 | platform/overlay.ts  stage / rank / domain overrides, audited, reversible (JSON file) |
 | platform/relay*.ts   signed relay links for /v1/proxy and /v2/relay                   |
 | platform/legacy.ts   adapter: OMSS classes -> provider modules                        |
 | Engine (SDK)         waves, budgets, policy, trace, normalise, health, de-duplication |
 | monitor              scheduled canary + recovery                                      |
 | /v1/*                the OMSS endpoints, unchanged for older clients                  |
 +--------------------------------------------------------------------------------------+

 CONTROL PLANE AS FILES (packages/control-plane): build, validate, stage, rank, change a
 domain, roll back, diff, audit, sign. Output: registry.json (+ history, + audit.log).
```

One running service. No queue, no database, no second service. State is two small JSON files
(health snapshot, overlay) when `DATA_DIR` is set, and memory otherwise.

## 2. Separation of concerns

Each concern has one home, and changing it does not touch the others.

| Concern | Home | Changing it means |
|---|---|---|
| Provider identity | `ProviderManifest` (`packages/provider-sdk/src/types.ts`) | Editing data in the provider's module or rule pack |
| Provider domains | `DomainConfig` (`src/domains.ts`), shipped defaults in `packages/providers/src/domains.ts`, overrides in the overlay or the registry | A new config version. No code change, no release (`ctx.url(role, path)` resolves at run time) |
| Extraction logic | A provider module (`getSources`) or a rule pack (`src/rules.ts`) using `src/extract/*` | A new provider version. The app, the runtime and the domains are untouched |
| Execution environment | `RuntimeDescriptor` + `canRun` / `chooseRuntime` / `planExecution` (`src/runtime.ts`) | Nothing in the provider: it only declares what it needs |
| Authentication | Per-device settings handed to local runtimes only (`requires.setting`) | The viewer's settings; never sent to a shared server |
| Playback resolution | `src/playback.ts` (`decideDelivery`, `checkCompatibility`), relay signing | Client capabilities; providers return plain streams |
| Provider health | `HealthStore` (`src/health.ts`), keyed by provider **and runtime** | Nothing: it is measured |
| Source ranking | `src/rank.ts`, weights optionally from the registry | Data |

## 3. Execution environments

A provider declares requirements; a runtime declares capabilities; matching decides where a
provider runs. No provider is tied to one runtime, and the client never needs to know which one
answered.

| Runtime | What it is | Status |
|---|---|---|
| `server` | A long-running process (Railway container, VPS, a home machine with `EGRESS=user`) | Implemented: `apps/server` |
| `edge` | Serverless / edge function (fetch + WebCrypto, no state) | Contract only. Providers that need nothing more declare it (`castle`, `vixsrc`, `cinesu-rules`); the SDK has no Node dependencies, so the engine runs there. No edge deployment is included |
| `extension` | The website through the helper extension | Implemented: `apps/extension` (protocol 2) + `@charcoal/client` |
| `app` | The website inside an app shell with a native bridge | Client side implemented and tested (`window.__charcoalBridge`, same protocol). The shell itself is not built |
| `remote` | Behind someone else's HTTP API | The hosted resolver is used this way by clients (`/v2/sources`). A Stremio-addon adapter is not included |
| `browser` | An automated browser for pages that need JavaScript | Contract only, by decision (below) |
| `frame` | Another site's player in an iframe, in the viewer's own browser | Existing embeds (`apps/web/src/lib/servers.ts`); the page falls back to it when nothing else plays |

Planning (`planExecution`): a provider runs locally when a local runtime fits (the viewer's own
connection resolves links that play from the viewer's own connection); otherwise the resolver
runs it if it can; a provider that needs a personal setting never goes to a remote runtime; a
provider resting locally after repeated failures is left to the resolver for now.

### Browser automation: evaluated, not bundled

Playwright (or an equivalent) was evaluated for providers that need JavaScript rendering or a
browser-managed session.

- What it would take: one Chromium per concurrent page at roughly 300 to 500 MB of memory, a
  separate service with its own queue and sandbox, and per-run times of seconds rather than
  hundreds of milliseconds.
- What it would not change: it still exits from a data-centre address, and bot checks are built
  to catch exactly an automated browser. Getting past such a check is not something this platform
  attempts: a challenge is reported as `CHALLENGE` and the provider rests in that runtime.
- What is done instead: the `browser` runtime and the `js-render` feature exist in the contract,
  so a browser worker can be added later without touching providers or clients. Until then a
  source that needs a real browser session is served by the `frame` runtime: the viewer's own
  browser loads the site's own player, with the session and consent being the viewer's.

## 4. The API (`/v2`)

| Endpoint | Purpose |
|---|---|
| `GET /v2/registry` | `{ signed }` when the server has a signing key, else `{ document }`. Providers, versions, stages, ranks, domains, rule packs, measured health |
| `GET /v2/sources?kind=&tmdb=&s=&e=&title=&year=&imdb=&only=&skip=&accept=` | Newline-delimited JSON, one line per event, written as it happens: `plan`, then one `result` per provider, then `done`. Streams are normalised and carry a signed `relay` link |
| `GET /v2/health` | Health per provider and runtime, pending domain proposals, and what clients report about their own runtimes (kept apart) |
| `POST /v2/report` | `{ reports: [{ provider, runtime, version, outcome, ms }] }`. No titles, no identities. Validated; never affects the server's own circuit breakers |
| `GET /v2/relay?data=&exp=&sig=` | The stream relay. Only links this server signed |
| `/v2/admin/*` | Control plane, behind `Authorization: Bearer $ADMIN_TOKEN`. Not registered at all without the token |

Other kinds: `kind=anime&anilist=&e=`, `kind=live&event=|channel=`. The engine and the API
accept them today; no provider in the pack serves them yet (see section 9).

A `result` line:

```json
{"t":"result","provider":{"id":"castle","name":"Castle","version":"1.1.0"},"outcome":"ok","ms":812,"requests":4,
 "streams":[{"id":"castle:5f0c…","dedupKey":"cdn.example/v/1080/index.m3u8","url":"https://…","type":"hls","quality":"1080",
             "headers":{"User-Agent":"…"},"audio":[{"lang":"en","label":"English"}],"expiresAt":1795550000000,
             "runtime":"server","relay":"https://resolver/v2/relay?data=…&exp=…&sig=…"}],
 "captions":[]}
```

A failed provider: `{"t":"result", …, "outcome":"error","code":"ACCESS_DENIED","scope":"runtime","message":"Refuses this connection (host, 403)"}`.

## 5. Failure taxonomy

Every failure has one code; every code has a scope (who it says something about) and a health
weight. "The provider is dead" is only one of many answers.

| Code | Scope | Counts against health | Reaction |
|---|---|---|---|
| `NOT_FOUND` | title | no | Recorded as a proper (empty) answer |
| `DNS`, `CONNECT`, `TLS` | domain | hard | Fail over to a configured alternate inside the run; recovery proposes promoting it |
| `REDIRECTED` | domain | hard | The provider's own address now points at an unlisted host: reported with the target, never followed; an operator promotes it after validation |
| `TIMEOUT`, `NETWORK`, `HTTP` | transient | soft (half) | One retry for idempotent requests; recovery probes and restores |
| `RATE_LIMITED` | runtime | soft | No retry |
| `ACCESS_DENIED`, `CHALLENGE` | runtime | hard | Rest in this runtime only; other runtimes unaffected. A bot check is never solved |
| `STRUCTURE_CHANGED`, `SELECTOR_MISSING`, `INVALID_RESULT` | provider | hard | Flagged `needs-update`; no automatic change; cleared by a new version or a proper answer |
| `AUTH_REQUIRED` | user | no | Shown to the viewer |
| `UNSUPPORTED_FORMAT`, `UNSUPPORTED_RUNTIME`, `CANCELLED` | client | no | Not recorded |
| `EXPIRED` | transient | soft | Re-resolve |
| `POLICY`, `INTERNAL` | provider | hard | A bug or a policy violation in the provider |

Untyped errors are explained from the request trace: a `TypeError` thrown after a 403 is reported
as the 403 it was; a plain error after every request succeeded is `STRUCTURE_CHANGED`.

## 6. Recovery workflow

```text
provider starts failing ─> outcomes recorded with codes ─> circuit opens (3 hard failures; cool-down 5 min, doubling to 1 h)
        │
        v
monitor (every MONITOR_INTERVAL_MINUTES): canary run with known titles, then recovery:
        ├─ domain down, a configured alternate answers AND a test extraction through it finds streams
        │       ─> proposal (default) or temporary audited override (AUTO_DOMAIN_FAILOVER_MINUTES)
        ├─ refused / challenged here            ─> stays resting in this runtime; nothing to fix here
        ├─ extraction no longer matches         ─> flagged needs-update; never auto-fixed
        └─ transient                            ─> probe; on success the circuit closes
```

Everything automatic is reversible (`POST /v2/admin/providers/:id/domains/rollback`, or the
override simply expires). An extraction change never enters production by itself.

## 7. Decisions

| Decision | Reason |
|---|---|
| A new SDK package rather than growing `@omss/framework` | The framework is archived upstream, waits for the slowest provider, and its providers can't run outside Node. `/v1` still uses it, unchanged |
| Legacy OMSS classes are adapted, not rewritten | They work as before (`network: 'unmanaged'`, `runtimes: ['server']` say honestly what they are). Porting is incremental; `cinesu-rules` shows the path |
| NDJSON over a plain GET for progressive results | Works with `fetch`, proxies and `AbortSignal`; no SSE reconnection semantics to fight; one line per provider |
| Registry is a document, served by the resolver and publishable as a static file | Discovery must not be a second service or a single point of failure. Clients keep the last good copy and work with none |
| Ed25519 signatures with keys pinned in the client | A resolver or mirror that is compromised or replaced cannot push providers or domains to clients built with pinned keys |
| Declarative rule packs | Providers that are "fetch, extract, emit" become data: publishable in the registry, versioned, rolled back, and run without executing anything they brought. This is how a provider updates without an app release and without a remote-code channel |
| No run-time loading of provider *code* | A remote-code channel must be protected like a release pipeline. Code providers ship with the site (a web deploy updates them) and with the server image. Rule packs cover the update-without-release case safely |
| Health per runtime | A provider refused from a data centre is usually fine from a home connection; one store per (provider, runtime) keeps the two apart |
| Client reports never bench anything on the server | Anyone can post a report; they inform, they don't control |
| Relay links are signed | The relay passed any non-HTML URL for anyone. It now serves only what the server handed out |
| Local-first planning | A link resolved on the viewer's connection is the only kind that reliably plays from it, and it costs the server nothing |

## 8. What changed for existing behaviour

| Before | Now |
|---|---|
| Extension users ran 3 first-party providers plus the fallback, or the server, never both | Local and remote run together; the server is asked to skip what runs locally; one merged list |
| The website waited for the slowest provider | Playback starts on the first playable result |
| Every play waited up to 3.7 s for an extension most viewers don't have | A 250 ms "are you there?"; the slow handshake continues in the background |
| "No sources" was retried once (about 23 s to the embed against the hosted server) | The embed takes over as soon as every provider has answered (under 1 s in the smoke test) |
| Server results always went through the relay | Streams that need no headers play from their origin; the relay is used only when needed |
| One global mode per session ("extension" or "server") | Delivery is decided per source |
| `apps/server/src/health.ts` (in-memory, per process) | SDK `HealthStore` (per runtime, typed failures, optional persistence). `/v1/providers/health` keeps its shape |
| `apps/web/src/lib/direct.ts` | Replaced by `lib/resolver.ts` on `@charcoal/client` |
| Provider addresses in code | Domain configs (`packages/providers/src/domains.ts`), overridable at run time |

Kept as they were: `/v1` endpoints, self-hosting, the embeds, the player's failover and
re-search, Febbox's token staying on the device, the extension's original four messages.

## 9. Content categories

The shared infrastructure handles every category; what differs lives in `packages/content`.

| Category | In place | Not in place |
|---|---|---|
| Movies and TV | End to end | |
| Anime | `Media` kind, API parameters, TMDB ↔ AniList/MAL mapping, AniList titles, AniSkip client (113 tests with real data samples) | No anime provider is enabled in the pack; no anime UI |
| Indian and regional cinema | Language as a stream attribute and ranking input; discovery parameters; title matching across scripts; audio languages from release names | No UI for language browsing; MKV sources still need a native player |
| Sports | Event model with live status and TTLs; TheSportsDB schedule source; iptv-org channel catalogue with blocklist and hazard flags; data-driven official link-outs (empty table) | No sports UI; no live player mode; no provider wiring events to channels |

## 10. Known limitations

- The twelve legacy server classes are unmanaged (no policy, no trace, no domain separation)
  until ported. Their failures are classified from their messages, coarsely.
- The vendored fallback pack runs with an open network policy (any public host, still traced,
  capped and kept off private addresses).
- `cinesu-rules` is canary. On 2026-11-24 its address redirected to another host, which failed
  validation from the test environment; see OPERATIONS.md.
- Nothing here changes which addresses stream hosts accept. The hosted server remains on a
  data-centre address; the gain for viewers without a bridge is speed and honesty, not more
  sources. More sources come from local runtimes (the extension today, an app shell next).
- No app shell, no edge deployment, no browser worker, no Stremio-addon adapter.
