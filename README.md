# Charcoal

A movie & TV streaming frontend and the server that finds its streams, in one repository.

```
apps/
  web/        Charcoal, the website (React, Vite)                    → Vercel
  server/     Jelly, finds sources and relays video (Node, OMSS)     → Railway, Docker, your own machine
packages/     Code shared by the apps (coming: providers, proxy)
```

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

```bash
git clone https://github.com/eyus00/charcoal && cd charcoal
docker build -f apps/server/Dockerfile -t charcoal-server .
docker run -p 8080:8080 -e PUBLIC_URL=http://localhost:8080 charcoal-server
```

Set `PUBLIC_URL` to the address people will reach it at (the stream links it hands out point
there). Other settings are in `apps/server/.env.example`. Without Docker: `npm install` then
`npm run start:server`.

A server on your own computer fetches from your home connection, which streaming hosts rarely
block. A VPS is a data-centre address, like Railway, so hosts that block Railway will likely
block it too.
