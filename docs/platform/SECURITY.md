# Security review of the provider platform

Scope: the code added for the platform (SDK, pack, server `/v2`, client, extension protocol 2).
Each control names the test that exercises it. "Residual" is what remains true after the control.

## Threats and controls

| # | Threat | Control | Evidence | Residual |
|---|---|---|---|---|
| 1 | The relay used as a free proxy for any URL | Relay links carry an expiry and an HMAC over the target and its headers; `/v1/proxy` and `/v2/relay` refuse anything else | `platform.test.ts` "relay links are signed…", "GET /v2/sources streams one line…" (forged, unsigned and re-targeted links get 403); `check-image.sh` | A signed link works for anyone who has it until it expires (12 h default). `RELAY_REQUIRE_SIGNATURE=false` reopens it |
| 2 | A provider reaching internal services (cloud metadata, private network) | Every request passes a policy guard: public hosts only (literal private, loopback, link-local, numeric-disguised addresses refused), plus a DNS check on the server (`resolvesPublic`) | `core.test.ts` "private, loopback and disguised addresses…", "a runtime-supplied DNS check…"; `engine.test.ts` "a provider that throws, hangs…" (no forbidden request left) | Legacy classes call the global `fetch` and bypass the guard (see 6) |
| 3 | A provider used to fetch arbitrary hosts ("remote execution as a proxy") | Allow-list per provider: its domain roles, `extraHosts`, and hosts that appeared in a response from one of those (GET only, capped). Redirects that leave the list are refused. 40 requests per run | `core.test.ts` "the guard refuses undeclared hosts…", "a response from an undeclared host cannot widen the allow-list"; `engine.test.ts` "a redirect that leaves the allow-list is refused…" | The fallback pack runs with `network: 'open'` (any public host). `STRICT_PROVIDER_NETWORK=true` turns those and legacy classes off |
| 4 | Remote code execution through provider updates | No provider code is loaded at run time. Updates without a release are rule packs: data interpreted by the engine under the same policy. Patterns that can hang are rejected at validation; inputs to regexes are capped | `engine.test.ts` "rule packs are validated…"; `client.test.ts` "the registry changes what a client runs…" | A rule pack can still point a provider at a different site within its own allow-list; signing (5) is what authenticates it |
| 5 | A tampered or replayed registry (wrong domains, disabled kill-switch) | Ed25519 signatures verified against keys pinned in the client; older versions refused; an invalid document never replaces the last good one | `core.test.ts` "registries are signed…", "a reader keeps its last good registry…"; `client.test.ts` "registry client: verifies signatures…" | Signing is optional. Without pinned keys the client trusts its resolver's registry as it already trusts its results |
| 6 | Untrusted provider code reading secrets or other users' data | Providers receive only `ctx`: no environment, no file system, no other provider's store. Personal settings exist only in a viewer's own runtime and are never sent to the resolver. The server process holds no per-user state | `pack.test.ts` "Febbox: runs only where the viewer’s token is…" (cookie sent to one host only); `client.test.ts` "with a bridge…" (the setting never appears in the resolver query) | First-party modules and legacy classes run in the server process without an OS-level sandbox. That is acceptable for code reviewed in this repository; it is **not** a sandbox for third-party code. Isolating that would need a separate process with a network allow-list (isolated-vm, a Deno worker or a container) |
| 7 | One provider taking the others down (hang, crash, flood) | Per-provider abort scope and time budget, per-request timeout, request cap, failures contained and classified; circuit breaker with exponential cool-down | `engine.test.ts` "results arrive as each provider finishes…", "a provider that throws, hangs, returns garbage or breaks policy is contained…", "provider unavailable…" | CPU-bound loops in a provider are not interruptible in-process |
| 8 | Abuse of the search endpoint | Token bucket per client address (60/min, burst 20, configurable); identical concurrent searches share one run; short result cache | `platform.test.ts` "rate limits…"; `load-test.ts` | In-memory, per instance. Behind a proxy the limit keys on the forwarded address (the framework trusts its proxy) |
| 9 | Taking over the control plane | `/v2/admin/*` exists only when `ADMIN_TOKEN` is set; constant-time comparison; every change audited with who and why | `platform.test.ts` "control plane: needs the token…" | A single shared token, no roles. Keep it out of logs; rotate by redeploying |
| 10 | Unsafe changes entering production automatically | Domain changes are validated (endpoint + a real extraction) before taking effect; automatic fail-over only to an address already configured as an alternate, temporary and audited; extraction changes are never automatic | `core.test.ts` "a domain change is validated before it is promoted…"; `engine.test.ts` "recovery: an address that died…", "recovery: each cause gets its own response…"; `platform.test.ts` "control plane: a domain change is validated…" | A site that moves to a hostile host which still serves working streams would pass validation. Promotion of a *new* host is a human decision for that reason |
| 11 | Poisoned health through fake client reports | Reports are validated (known provider, client runtimes only, known outcome), rate-limited, stored apart, and never open a circuit on the server | `platform.test.ts` "health and reports…" | They can skew the published `fleet` numbers |
| 12 | A website abusing the extension | Unchanged and now tested: only Charcoal's origins are answered; private addresses refused; a fixed header allow-list; a cookie only to one allow-listed site; the browser's own cookies never sent; rules scoped to the requesting tab | `apps/extension/test/background.test.mjs` (7 tests) | `<all_urls>` host permission is still required for the helper to do its job |
| 13 | Leaking what people watch | No titles in client reports; the server keeps no per-user data; logs are per provider run (id, outcome, timing) | `client.test.ts` report assertions | Request logs of `/v2/sources` contain TMDB ids, as `/v1` logs already did |

## Secrets

| Secret | Where it lives | Notes |
|---|---|---|
| `ADMIN_TOKEN`, `RELAY_SECRET`, `REGISTRY_PRIVATE_KEY`, `TMDB_API_KEY`, `FEBBOX_TOKEN` | Server environment | Never returned by any endpoint; manifest fields marked `secret` are rejected from a registry (`validateRegistry`) |
| A viewer's Febbox token | The viewer's browser (`localStorage`) | Sent only to febbox.com through the bridge |
| Registry private key | The operator's machine or the server | `keygen` writes it with mode 0600 and refuses to overwrite |

## Not addressed here

- Bot checks, fingerprinting and similar access controls are detected and reported
  (`CHALLENGE`), never worked around.
- DRM-protected streams are out of scope; DASH manifests report `protected: true` and nothing
  plays them.
- Third-party embeds remain third-party pages with their own behaviour (the existing sandbox
  option is unchanged).
