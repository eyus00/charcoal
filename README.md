# Charcoal

A movie & TV streaming frontend and the server that finds its streams, in one repository.

```
apps/
  web/        Charcoal, the website (React, Vite)                    → Vercel
  server/     Jelly, finds sources and relays video (Node, OMSS)     → Railway, Docker, your own machine
  extension/  Charcoal Helper, finds and plays sources from the viewer's browser → GitHub Releases
packages/
  providers/  Source scrapers shared by the server and the website
```

## Where streams come from

Charcoal tries these in order, falling back to the next:

1. **Charcoal Helper** (browser extension), if installed: the scrapers in `packages/providers` run in
   the page and everything loads from the viewer's own connection. See `apps/extension`.
2. **Your own server**, if set in Settings (local or VPS, see below).
3. **Charcoal's server** on Railway.
4. **Embedded players** from other sites.

## Develop

Needs Node 22+. From the repository root:

```bash
npm install
npm run dev:server     # Jelly on http://localhost:8080 (PORT to change)
npm run dev:web        # Charcoal on http://localhost:5173
npm run typecheck      # both apps
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
