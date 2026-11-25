# Charcoal

A lightweight movie & TV frontend. Metadata comes from TMDB; playback uses the
[Jelly](../server) scraper backend, with third-party embed
players as a fallback.

## Run

From the repository root:

```bash
npm install
npm run dev:web     # http://localhost:5173
npm run build:web   # type-checks, then builds to apps/web/dist/
```

Configuration (`.env`, optional; see `.env.example`):

| Variable            | Default                           |
| ------------------- | --------------------------------- |
| `VITE_TMDB_API_KEY` | bundled public key                |
| `VITE_JELLY_URL`    | `https://jelly.up.railway.app`    |

## Layout

```
src/
  main.tsx            routes, query client
  lib/                tmdb client, image sizing, filters, local store, servers, episode logic,
                      the resolver, anime (AniList) and sports adapters
  components/         layout (sidebar, mode switch, search, phone bar), hero, cards, rows, filters
  pages/              Home, Discover, Details, Watch, Profile, Calendar · AnimeTitle, AnimeWatch (anime
                      TMDB lacks) · Sports, SportsWatch, Live · Admin (server status)
  player/             Player (Jelly: hls.js, dash.js), EmbedPlayer (iframes)
e2e/                  browser checks of the built site (npm run test:e2e)
```

## Notes

- **Routing:** `base: '/'` in `vite.config.ts` must stay absolute. A relative
  base breaks every nested route on refresh. SPA fallbacks are in the root `vercel.json`,
  `public/_redirects` (Netlify / Cloudflare Pages), and `public/.htaccess`.
- **Data:** history, bookmarks and settings live in `localStorage` under
  `charcoal:v2`. Data from the previous app (`watch-history`) is migrated on first
  load and left in place. Library → Settings has export/import.
- **Filters** live in the URL (`?genres=action,scifi&from=2010&to=2019&rating=7&sort=rating`),
  so every filtered page can be refreshed and shared.
- **Player keys:** press `?` in the app for the full list (YouTube-style keys).
