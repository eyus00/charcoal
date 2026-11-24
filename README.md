# Charcoal

A movie & TV streaming frontend and the server that finds its streams, in one repository.

```
apps/
  web/        Charcoal, the website (React, Vite)                    → Vercel
  server/     Jelly, finds sources and relays video (Node)           → Railway, Docker, your own machine
  extension/  Charcoal Helper, an optional bridge to the viewer's own connection → GitHub Releases
packages/
  provider-sdk/   The provider platform framework: contracts, diagnostics, extraction, domains,
                  the aggregation engine, health, ranking, the signed registry
  providers/      The provider pack: provider modules, rule packs and their domain configs
  client/         Client side: bridge negotiation, registry client, the unified resolver
  content/        Category adapters: anime identity mapping, sports events, regional discovery
  control-plane/  Command line for the provider registry (stage, domains, rollback, signing)
  streamviva/     StreamViva's provider engine (vendored, MIT), used as a fallback pack
docs/platform/    Architecture, the provider SDK guide, operations, security review, testing
```

## Where streams come from

One search, wherever the sources are. Every provider says what it needs to run; the site runs
what it can in the viewer's own browser and asks a server for the rest, and both feed one ranked
list that grows as providers answer. Playback starts on the first playable source.

1. **In this browser**, when a bridge is present (Charcoal Helper today): providers run on the
   viewer's own connection and video loads straight from its host.
2. **Your own server**, if set in Settings (local or VPS, see below), then **Charcoal's server**:
   they run the remaining providers and send results as they arrive. Streams that need nothing
   special play from their origin; the rest go through the server's relay.
3. **Embedded players** from other sites, when nothing else plays.

See `docs/platform/ARCHITECTURE.md` for how it fits together and `docs/platform/SDK.md` to add a
provider.

## Develop

Needs Node 22+. From the repository root:

```bash
npm install
npm run dev:server     # Jelly on http://localhost:8080 (PORT to change)
npm run dev:web        # Charcoal on http://localhost:5173
npm run typecheck      # every workspace
npm test               # every test suite (nothing contacts a streaming site)
```

To point the local website at the local server, put `VITE_JELLY_URL=http://localhost:8080` in
`apps/web/.env`. Each app's own README has more detail.

## Deploy

| What | Where | Config |
|---|---|---|
| Website | Vercel, project root = repository root | `vercel.json` (installs and builds only `apps/web`; skips deploys when only the server changed) |
| Server | Railway, service root = repository root | `railway.json` → `apps/server/Dockerfile`; redeploys only when `apps/server` or `packages` change |
| Server, anywhere else | Any machine with Docker | see below |

### Run the server yourself (VPS or your own computer)

Anyone can run their own copy of the server and point Charcoal at it in **Profile → Settings →
Your own server**. If it stops answering, Charcoal falls back to the hosted one.

**On your own computer** (needs [Docker](https://docs.docker.com/get-docker/)):

```bash
docker run -d -p 127.0.0.1:8080:8080 --restart unless-stopped ghcr.io/eyus00/charcoal-server
```

Then use `http://localhost:8080` in Settings. Requests to streaming sites leave from your home
connection, which they rarely block, so more sources play. Chrome may ask to let the site reach
"apps and services on this device": allow it. (Or `docker compose up -d` in `deploy/local/`.)

**Febbox (up to 4K) on your own server**: give it your Febbox token and it uses Febbox like the
extension does. The token stays on your machine:

```bash
docker run -d -p 127.0.0.1:8080:8080 -e FEBBOX_TOKEN=your-token --restart unless-stopped ghcr.io/eyus00/charcoal-server
```

Add `-e FEBBOX_MAX_HEIGHT=1080` to cap the quality. Don't set a token on a server other people use:
everyone's watching would count against your Febbox account.

**On a VPS**: Charcoal is an https site, so the server must be https too. `deploy/vps/` runs it
behind Caddy, which gets a certificate automatically:

```bash
git clone https://github.com/eyus00/charcoal && cd charcoal/deploy/vps
DOMAIN=stream.example.com docker compose up -d
```

Point the domain at the VPS first, then use `https://stream.example.com` in Settings. A VPS has a
data-centre address like Railway, so hosts that block Railway will likely block it too; it gives
you your own server, not more sources.

**Without Docker**: `npm install` then `PORT=8080 npm run start:server` from the repository root.

**Build the image yourself**: `docker build -f apps/server/Dockerfile -t charcoal-server .` from the
repository root. The published image (`ghcr.io/eyus00/charcoal-server`) is built by
`.github/workflows/server-image.yml` on every server change, for amd64 and arm64.

Server settings (environment variables) are listed in `apps/server/.env.example`.
