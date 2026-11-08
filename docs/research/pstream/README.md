# P-Stream: how their system works and what we can use

Research date: 2026-11-08. Source: the four public P-Stream repos on Codeberg, read at these commits:

| Repo | Commit | What it is |
|---|---|---|
| `pee/extension` | `30e0162` | Browser extension (Chrome, Firefox) plus a userscript |
| `pee/proxy` | `0ab9687` | Stream proxy (Nitro; Docker, Netlify or Cloudflare) |
| `pee/backend` | `f7edbe9` | Account sync (Nitro, Prisma, Postgres) |
| `pee/desktop` | `02c0d18` | Electron desktop app |

All four are **GPL-3.0-only**. Copying their code into Jelly or Charcoal puts that code under GPL
(it only matters if you distribute the software). Re-implementing the ideas avoids it. Nothing
from these repos was run; this is from reading the source.

Detailed per-repo notes: [extension](extension.md) · [proxy](proxy.md) · [backend](backend.md) ·
[desktop](desktop.md).

---

## 1. The big picture

P-Stream is the successor of movie-web. Its core idea differs from ours:

- **Charcoal / Jelly:** the server (Jelly) finds sources and proxies the video.
- **P-Stream:** the **website finds sources in the viewer's browser** (provider code ships to the
  client). Every HTTP call a provider makes goes through a "fetcher". Which fetcher depends on what
  the viewer has:
  1. **Extension or desktop app installed:** requests leave from the viewer's own browser and home
     IP, with the headers the host expects. Video plays straight from the host's servers.
  2. **Otherwise:** requests go through a proxy server (their `proxy` repo), which has the same
     problem we have: many hosts block server IPs. Their README says to run it on a VPS or a home
     server because "streaming sites block Cloudflare, Netlify and other serverless platforms".
  3. **Accounts (`backend`)** only sync bookmarks, progress, history and settings. It never touches
     video.

So the "big guys" don't have a server-side trick we're missing. They get past IP blocks by **moving
the requests to the viewer's machine** (extension or desktop app), and fall back to a proxy that
works only for hosts that don't block servers.

### How the extension works (the core mechanism)

1. A content script on every page relays `window.postMessage` messages to the background worker.
2. The site sends `hello` and gets `{version, allowed, hasPermission}` back, so it knows the
   extension is installed and whether this site is approved. If it isn't, `openPage` shows a
   "Do you trust this site?" page that grants permission.
3. **`makeRequest`**: the background fetches a URL for the page. Headers a web page can't set
   (Referer, Origin, User-Agent) are added with a short-lived `declarativeNetRequest` rule. The body
   comes back as text or JSON.
4. **`prepareStream`**: installs a `declarativeNetRequest` rule for the video host. It adds the
   expected Referer/Origin to requests and `Access-Control-Allow-Origin: *` to responses. After that
   the site's **normal hls.js player loads playlists and segments directly** from the host, from the
   viewer's IP, with no proxy in between.

The desktop app speaks the **same four messages**, so the website treats it like the extension.

---

## 2. What to port, ranked

### Tier 1: worth doing now (low effort, clear value, no policy issues)

| # | What | From | Where it goes | Effort |
|---|---|---|---|---|
| 1 | **Smarter playlist rewriting**: rewrite `EXT-X-KEY`, `EXT-X-MAP` and `EXT-X-MEDIA` URIs (quoted and unquoted), send variant playlists and segments to different handlers, resolve relative URLs against the **final** URL after redirects | proxy `stream.ts` `rewriteM3U8` | Jelly `/v1/proxy`, our Worker | 0.5 day |
| 2 | **Content sniffing**: detect a playlist by its `#EXTM3U` start and TS/MP4 segments by their bytes when the host sends a wrong content type (e.g. segments as `image/jpeg`, which Castle does) | proxy `mediaSniff.ts` | Jelly proxy, Worker | 0.5 day |
| 3 | **CORS-safe errors**: return 503 instead of 502/504 (Cloudflare replaces those with a page without CORS headers, so hls.js can't retry) and put the real status in an exposed `X-Upstream-Status` | proxy `upstream.ts` | Worker, Jelly | 1 hour |
| 4 | **Timeouts and aborts**: time out only while waiting for headers, cancel the upstream fetch when the viewer disconnects, retry a segment once on 5xx | proxy `upstream.ts`, `fragment.ts` | Jelly proxy, Worker | 0.5 day |
| 5 | **Range and header hygiene**: forward `Range`/`If-Range`, pass `Content-Range`/`Accept-Ranges`, keep 206, drop `set-cookie`/`content-encoding`, `no-store` on playlists, `max-age` on segments | proxy `stream.ts`, `headers.ts` | Jelly proxy, Worker | 0.5 day |
| 6 | **SSRF protection**: refuse private and internal addresses (checked at DNS and connect time on Node) so nobody can use our proxy to reach Railway's private network | proxy `ssrf.ts`, `egress-guard.ts` | Jelly proxy, Worker | 0.5 day |
| 7 | **Provider health**: Jelly records success/not-found/failure per provider and skips providers that keep failing for a cooldown period. (P-Stream only planned this: their endpoint is a stub.) | backend `/providers/health` shape | Jelly | 1-2 days |

Their test files (`mediaSniff`, `streamRewrite`, `ssrf`, `corsSafeStatus`, `upstream`) are good test
cases to re-create.

### Tier 2: a real fix for blocked hosts (needs a decision)

**A Charcoal browser extension, playback only.** This is the smallest useful version of P-Stream's
approach, and it fits our architecture:

- Jelly keeps scraping on the server (VidApi scraping already works there; only its **video** is
  blocked for servers).
- If the extension is installed, Charcoal calls `prepareStream` for the video's host, then gives
  hls.js the **direct** URL instead of `/v1/proxy`. The video loads from the viewer's own browser
  and home connection.
- If not, it falls back to Jelly's proxy, then to embeds (as today).

| | |
|---|---|
| Effort | Extension (fork and harden) 3-5 days, Charcoal side 2-3 days |
| Works on | Chrome, Edge, Brave, Firefox (desktop and Android). **Not** Safari, iOS, or Chrome on Android |
| Adoption | Only viewers who install it; everyone else keeps today's path |
| Store review | Chrome Web Store and Firefox Add-ons look hard at `<all_urls>` plus header rewriting, and may reject listings tied to streaming copyrighted content |
| Policy | It sends the Referer/Origin the host expects, the same thing Jelly's proxy does today, but from the viewer's browser. Decide whether you're comfortable with that |

If we build it, fix P-Stream's security problems (see [extension.md](extension.md)): exact domain
matching instead of substring, rules limited to Charcoal's own requests (`initiatorDomains`), a
"clear" message so rules don't pile up, no CSP rewriting, no cookie reading, a fixed set of allowed
headers, and private-address blocking.

The full P-Stream model (moving all scraping into the browser) is a much bigger job, 1-3+ weeks, and
only helps viewers with the extension. Not recommended unless the playback-only version proves
popular.

### Tier 3: nice features, unrelated to sources

| What | From | Notes | Effort |
|---|---|---|---|
| **Optional account sync, no email or password**: a 12-word phrase creates a key pair; the server only sees a public key and signatures | backend auth (challenge signing, JWT sessions) | Go further than P-Stream: encrypt the whole `charcoal:v2` data with a key from the phrase, so the server can't see what anyone watches (P-Stream stores it readable). Needs Postgres on Railway | 3-5 days |
| **Watch party** (synced play/pause and time between friends) | backend `/player/status` (polling) | Better done with WebSockets. Needs Redis or a single instance | 1-3 days |
| **Desktop app** wrapping charcoal.eys0.fyi, Discord "Watching" status, offline downloads of HLS (rewrite the playlist to local files, download segments with resume and back-off on 429, serve them through a custom scheme) | desktop | Downloads raise copyright questions. Lock the app to our own address, sign builds, use a fixed update URL | 2-3 days shell, 1-2 weeks with downloads |
| **Similar titles** | backend uses IMDb's private API | We already use TMDB recommendations; skip | - |

---

## 3. What not to port

These exist to get around blocking or protections, or are unsafe:

| Item | Where | Why not |
|---|---|---|
| **Cloudflare WARP routing** | desktop `warp-proxy.js` | Routes all traffic through Cloudflare's VPN to change the exit IP and get past IP blocks. Also accepts Cloudflare's terms for the user and runs unverified downloaded binaries |
| **Cloudflare challenge solver** | desktop `ipc-handlers.js` | Opens a hidden window to pass "Just a moment…" bot checks and reuses the clearance cookie |
| **Browser fingerprint imitation** | proxy `headers.ts` (fake Chrome `sec-ch-ua*`, `sec-fetch-*`), desktop (hides Electron from the user agent) | Makes server traffic look like a real browser to get past hosts that block servers |
| **Hiding proxy/CDN identity** | proxy (strips `cdn-loop`, accepts a fake `X-Real-Ip`) | Same purpose |
| **XOR-scrambled target URLs** | proxy `destination.ts` | Only hides URLs from filters; the key is public |
| **Reading cookies of scraped sites** | extension `makeRequest.ts`, desktop | Hands httpOnly cookies (possibly clearance cookies) to page scripts |
| **Domain discovery from a paste site** and **update URL taken from page content** | desktop `links.js`, `auto-updater.js` | Built to survive domain takedowns; also lets whoever controls the page choose what binary the app installs |
| **Open, unauthenticated endpoints** | proxy `/cache`, backend `/metrics/*` | Anyone can poison or wipe them |
| **The userscript design** | extension `userscript/` | Answers every website and allows cookie-carrying cross-site reads of any other site: a security hole for anyone who installs it |

---

## 4. Recommendation

1. **Now:** Tier 1 items 1-6 in Jelly's proxy and the Worker (about 2-3 days total). They make
   every source that already works (like Castle) more reliable, and close an SSRF hole.
2. **Next:** provider health in Jelly (item 7), so failing providers stop slowing everything down.
3. **Decide:** whether to build the playback-only Charcoal extension. It's the only approach here
   that makes server-blocked hosts like VidApi play, and only for viewers who install it.
4. **Later, optional:** encrypted phrase-based sync, watch party, desktop app.
