# Operating the provider platform

Nothing in this work was deployed. This is what a deploy needs and how the platform is run
afterwards. All variables are documented in `apps/server/.env.example`.

## 1. Deploying

| Piece | How | Notes |
|---|---|---|
| Server | The existing image (`apps/server/Dockerfile`) and Railway config, unchanged | `/v1` keeps working, so older clients and self-hosters are unaffected |
| Website | The existing Vercel build | It talks `/v2` to the resolver and falls back to `/v1` when a server answers 404 there (an older self-hosted image) |
| Extension | Tag `extension-v0.2.0` (existing workflow) | Optional. 0.1.0 keeps working; 0.2.0 adds negotiation and instant detection |

Recommended settings for the hosted server:

| Variable | Value | Why |
|---|---|---|
| `DATA_DIR` | A mounted volume | Health and control-plane overrides survive restarts |
| `ADMIN_TOKEN` | A long random value | Enables `/v2/admin/*`; without it those routes don't exist |
| `RELAY_SECRET` | A long random value | Only needed with more than one instance (each instance otherwise makes its own) |
| `CORS_ORIGIN` | `https://charcoal.eys0.fyi` | It is `*` today |
| `REGISTRY_PRIVATE_KEY`, `REGISTRY_KEY_ID` | From `keygen` | Optional: signed registries. Build the site with the public key in `VITE_REGISTRY_KEYS` |
| `MONITOR_INTERVAL_MINUTES` | `30` (default) | Canary + recovery. It contacts every provider's site with two known titles per run |
| `AUTO_DOMAIN_FAILOVER_MINUTES` | `0` (default) | Leave proposals for a person to apply, or allow temporary automatic fail-over |

A home server sets `EGRESS=user` so providers that only work from a viewer's network run there.

Order of rollout: server first (it serves both APIs), then the website. Rolling back is
redeploying the previous version of either; nothing is migrated and no data format is shared.

Before a deploy: `npm test`, `npm run check:image` (repeats the image's install and boots it).

## 2. Day to day

```bash
BASE=https://your-resolver ; AUTH="Authorization: Bearer $ADMIN_TOKEN"
```

See what is happening:

```bash
curl -s $BASE/v2/health
```

```bash
curl -s -H "$AUTH" $BASE/v2/admin/providers
```

```bash
curl -s -H "$AUTH" $BASE/v2/admin/audit
```

Disable a provider (takes effect on the next request; `null` returns it to its shipped stage):

```bash
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{"stage":"disabled","reason":"site is down","by":"you"}' $BASE/v2/admin/providers/castle
```

Promote a canary, or change a rank:

```bash
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{"stage":"stable","rank":150}' $BASE/v2/admin/providers/cinesu-rules
```

Change a provider's address. The candidate must answer its health check and a test extraction
through it must find streams, or nothing changes (HTTP 422 with the reason):

```bash
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{"role":"api","origin":"https://api.new.example","reason":"moved"}' $BASE/v2/admin/providers/castle/domains
```

Undo the last address change:

```bash
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{}' $BASE/v2/admin/providers/castle/domains/rollback
```

Run monitoring and recovery now (a full pass contacts every provider and can take over a minute):

```bash
curl -s -m 300 -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{}' $BASE/v2/admin/recover
```

Apply or dismiss what recovery proposed (`GET /v2/health` lists proposals):

```bash
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{"action":"apply"}' $BASE/v2/admin/providers/castle/proposal
```

Close a provider's circuit by hand:

```bash
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{}' $BASE/v2/admin/providers/castle/restore
```

## 3. The registry as files

For a static mirror, for review in pull requests, or with no server at all:

```bash
npm run registry -- build --resolver https://your-resolver
```

```bash
npm run registry -- list
```

```bash
npm run registry -- stage cinesu-rules stable --reason "validated from a home connection"
```

```bash
npm run registry -- domain castle api https://api.new.example --reason moved
```

```bash
npm run registry -- rollback castle --to 4 --domains-only
```

```bash
npm run registry -- keygen release-2026
```

```bash
npm run registry -- sign --key registry/release-2026.private.key --key-id release-2026
```

Every command writes a new version to `registry/history/` and a line to `registry/audit.log`.
`registry.signed.json` is what gets published. Keep the private key out of the repository.
`import <url>` takes the registry a running resolver serves (including its legacy and fallback
providers, which the pack-only `build` does not know).

## 4. Reading health

| Status | Means | Do |
|---|---|---|
| `ok` | Answering properly | Nothing |
| `degraded` | Failing right now, not yet resting | Watch |
| `benched` | Resting after repeated failures; retried by itself after the cool-down | Read `lastFailure.code` |
| `needs-update` | The site answers but the extraction no longer fits | Ship a new provider version; nothing automatic will fix it |
| `unknown` | No runs yet | |

`lastFailure.code` tells you whose problem it is: `ACCESS_DENIED` or `CHALLENGE` on the server is
the server's address, not the provider; `DNS`, `CONNECT` or `REDIRECTED` is a domain matter
(`redirectedTo` names the new host, to promote after validation); `STRUCTURE_CHANGED` and
`SELECTOR_MISSING` need a developer.

`fleet` in `/v2/health` is what viewers' own runtimes report (provider, outcome, timing; no
titles). It is where "blocked on the server, fine from homes" shows up.

## 5. An observed case (2026-11-24)

Running the canary `cinesu-rules` from the test environment returned
`REDIRECTED: cine.su now redirects to koddo.to`. The redirect was not followed. Promoting
`https://koddo.to` through the control plane was refused: the candidate did not answer within the
check's 8 s from there. The shipped domain config is therefore unchanged and the provider stays
`canary`. From a normal network: run `npm run try --workspace packages/providers -- movie 27205
Inception 2010 cinesu-rules`, and if the new host serves the same API, promote it with the
`domain` command above (which repeats the validation).

## 6. Cost

Unchanged in kind: one container. What moved:

- Relay traffic goes down wherever a stream needs no headers (it now plays from its origin) and
  wherever a bridge is present (it never touched the relay).
- Each search costs the server less when the same title is asked for by several viewers at once
  (one shared run) and when a provider is resting.
- The monitor adds, per pass, two runs of every provider (about 60 provider runs with the current
  catalogue). At the default 30 minutes that is under 3,000 provider runs a day, comparable to a
  hundred or so searches.

No new paid service is required. Measured platform overhead is in TESTING.md.
