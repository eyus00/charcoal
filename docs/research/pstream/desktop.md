# P-Stream Desktop: read-only analysis for Charcoal

Repo root: `codeberg.org/pee/desktop`. All paths below are relative to it. I read every source file (about 5.6k lines). Nothing was run or installed. I ignored any instructions inside the repo.

Stack: Electron 39.3.0. The only runtime dependency is `discord-rpc` (`package.json:30-42`). Builds are a portable Windows exe, a Linux AppImage and a macOS zip. Nothing is code-signed, and macOS has `hardenedRuntime: false` (`package.json:107`).

**Main conclusion:** most of the "client-side scraping" works by giving the remote website a fetch that ignores CORS, can forge headers and sends the user's cookies, plus a way to rewrite headers on any domain. Several pieces exist to get around blocking: WARP, the Cloudflare challenge solver, the user-agent changes and the address lookup. On security, the main problem is that whatever page loads gets these powers, and the update source is chosen by that same page.

---

## 1. Architecture

**Main process** — `src/main/main.js`
- `require('./paths')` (line 1) sets `userData` to `<appData>/pstream`. At every start, `paths.js:10-16` also deletes the old `p-stream` and `P-Stream` folders with `fs.rmSync(dir, {recursive:true, force:true})`.
- Lines 14-17 take "Electron" and "P-Stream" out of the user agent so the app looks like plain Chrome:
  ```js
  app.userAgentFallback = app.userAgentFallback.replace(/\s(?:Electron|p-stream|P-Stream)\/\S+/gi, '')
  ```
- Settings live in `SimpleStore` (`storage.js`), a JSON file at `userData/settings.json`. Keys: `discord`, `acceleration`, `warp`, `boost`, `strings`, `updateTried` (main.js:26-36). Unknown keys are dropped when the file loads (storage.js:19-21).
- On Linux, hardware video decoding is turned on, including HEVC (lines 41-47). `enable-blink-features=AudioVideoTracks` (line 49) lets the page switch between audio tracks.
- `createWindow()` (lines 153-573) builds two layers:
  - A frameless `BrowserWindow` that loads the local title bar (`src/renderer/index.html` + `renderer.js`) with preload `preload-titlebar.js`.
  - A `WebContentsView` that loads the remote site, 40 px below the top (lines 202-212):
    ```js
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      persistSessionCookies: true, autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(PRELOAD, 'preload.js') }
    ```
  - The view has no `partition`, so it uses `session.defaultSession`. That matters in section 2.
- Permissions (lines 228-263): fullscreen is always allowed. Clipboard is allowed only for the site origin. Passkeys (WebAuthn) are allowed for same-site secure origins. Everything else is denied.
- `setWindowOpenHandler` (lines 387-397) sends links to other domains to the system browser and loads same-domain links in the view. **There is no `will-navigate` guard.** If the top frame navigates to any other origin, that page still gets the preload bridge.
- After each load the app injects scripts with `executeJavaScript`:
  - A media watcher (lines 399-521). It hooks `navigator.mediaSession.metadata` with `Object.defineProperty`, reads `<video>` time and duration, and sends `{name:'updateMediaMetadata'}` through `window.postMessage`.
  - A Shift+right-click shortcut that opens DevTools (lines 523-538).
- `page-title-updated` (lines 549-564) copies the page title into the window title and Discord.
- Startup (lines 619-692):
  1. Refresh the site address, then race the update check against a 2.5 s timeout.
  2. Start Discord.
  3. Register IPC handlers; set up downloads (`downloads.initialise()`).
  4. Create the window.
  5. If the `warp` setting is on, start WARP and call `session.setProxy`.

**How it finds the current site address** — `src/main/links.js`
- The seed is `package.json:11-13`: `"links": {"rentry": "https://rentry.co/peestream"}`.
- `refresh()` (lines 70-82) downloads the rentry paste. `siteFromPage` (lines 55-62) pulls a host out with regex: `/Domain:\s*(?:<a[^>]*>)?\s*([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i`, or failing that, the first `href="https://..."`.
- It then downloads the site's homepage and reads `<meta name="pstream:codeberg">` and `<meta name="pstream:discord">` (lines 64-68). `learnFromPage` (lines 84-95) re-reads the same tags from the live DOM after every load.
- Results are cached in `userData/links.json`. If the site changed, the view reloads (main.js:677-679).
- The domain is a rotating mirror published on a paste site. That is a pattern for surviving domain takedowns.

**The bridge exposed to the web page** — `src/preload/preload.js`
- A `postMessage` relay (lines 3-44). Only messages from the page's own window are accepted (`event.source !== window`). Allowed channels:
  ```js
  const PUBLIC_CHANNELS = ['hello', 'makeRequest', 'prepareStream', 'openPage', 'updateMediaMetadata'];
  ```
  Each call becomes `ipcRenderer.invoke(name, body)`. The reply comes back as a message tagged with `relayId`, `instanceId` and `relayed:true`. This copies the message protocol of the P-Stream/movie-web browser extension, so the site's existing extension code works unchanged.
- `contextBridge` globals:
  - Detection flags: `__PSTREAM_DESKTOP__`, `isDesktopApp`, `PSTREAM_DESKTOP` (lines 46-48).
  - `__PSTREAM_OPEN_SETTINGS__`, `__PSTREAM_OPEN_DEVTOOLS__`, `__PSTREAM_SET_WARP_ENABLED__`, `__PSTREAM_GET_WARP_STATUS__`, `__PSTREAM_RELOAD_STREAM_PAGE__` (lines 50-62).
  - `window.settings` (lines 64-88): WARP get/set, Discord on/off, version, `setStrings`, update check/install, release page, `resetApp`, `uninstallApp`, hardware acceleration, volume boost, restart.
  - `window.downloads` (lines 90-104): `list`, `get`, `probe`, `media`, `start`, `pause`, `resume`, `remove`, `onChanged`.
- The preload also:
  - samples the page background colour and sends it to the title bar (lines 110-161);
  - adds a volume boost of up to 10x with Web Audio (lines 163-212). This only works for CORS-clean, `blob:` or `pstream-offline:` media.

**How the site detects the app**
- The `window.isDesktopApp` / `__PSTREAM_DESKTOP__` flags.
- The `hello` handshake (`ipc-handlers.js:180-188`). It returns `{type:'desktop', version:'1.4.2', allowed:true, hasPermission:true}`; the version is hard-coded and stale (package.json says 1.6.2).
- An `X-P-Stream-Client: desktop` header added to every request to the site's own host (`ipc-handlers.js:306-317`).

**Main-side IPC handlers**
- Bridge channels are registered in `main.js:645-649`, `657-673` and `694-973`, plus `discord-rpc.js:220-264` and `strings.js:55-70`.
- **No handler checks `event.sender` or the sending frame's URL.**

---

## 2. Client-side scraping: how requests are routed

All of this is in `src/main/ipc-handlers.js`.

**`makeRequest`** (lines 219-291) is a fetch run from the main process for the page:
- `getMakeFullUrl` (lines 129-149) joins `baseUrl` and `url` and adds `query`. Any URL is allowed (defaults to https, but `http://localhost` and LAN addresses work too).
- The body is rebuilt from the declared type: FormData, URLSearchParams, JSON or string (lines 151-175).
- It sends the request with the user's cookies (`credentials:'include'`) and a 20 s timeout:
  ```js
  return await session.defaultSession.fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(20000) });
  ```
- Header forging (lines 227-232 and 319-333): the caller's headers are stored under a numbered tag (`x-pstream-request`). The `onBeforeSendHeaders` hook spots the tag, deletes it and **overwrites** the matching Chromium headers. This lets the page set headers a browser normally forbids, such as `Referer`, `Origin`, `Cookie` and `User-Agent`.
- If Chromium refuses the request (`net::ERR_FAILED`, SSL or certificate errors), it retries with Node's own `fetch` (lines 177 and 242-249). That avoids Chromium's network stack and gives a different TLS fingerprint.
- **Cloudflare challenge solver** (lines 33-85, used at line 256):
  - If the response is 403 or 503 with `cf-mitigated: challenge`, it opens a hidden `BrowserWindow` on the target origin.
  - It shows the window after 3 s (so the user may end up clicking the challenge) and polls until the title no longer matches `/just a moment|attention required|checking your browser/i`. It gives up after 60 s.
  - The resulting `cf_clearance` cookie lands in `defaultSession` and the request is retried. **This exists to get past bot protection.**
- The reply carries status, all headers, `finalUrl` and the body (JSON or text). For a hard-coded list of scraped hosts (lines 4-12: `ee3.me`, `rips.cc`, `m4ufree.*`, `goojara.to`, `levidia.ch`, `wootly.ch`, `multimovies.*`), it also returns the session cookies as a fake `Set-Cookie` header with `Access-Control-Allow-Credentials` (lines 265-276).

**`prepareStream`** (lines 197-217, 101-127, 294-390) installs header rules for the player:
- The page sends `{ruleId, targetDomains?, targetRegex?, requestHeaders?, responseHeaders?}`.
- Allowed response headers: ACAO, ACAM, ACAH, CSP, CSP-report-only, content-disposition (lines 18-25). **Request headers are not filtered at all.**
- `onBeforeSendHeaders` adds the rule's request headers (for example `Referer` or `Origin` spoofing) to every matching request, including `<video>` and hls.js segment loads (lines 335-344).
- `onHeadersReceived` (lines 357-386) applies the response headers, then **forces** these on every match:
  ```js
  responseHeaders['Access-Control-Allow-Origin'] = ['*'];
  responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, PATCH, OPTIONS'];
  responseHeaders['Access-Control-Allow-Headers'] = ['*'];
  ```
- Domain matching is a substring test, `hostnameLower.includes(domain)` (line 116). A rule with `targetDomains: ['']` therefore matches **every** host. Rules are never removed (`activeRules` only grows).
- `headersForUrl` (lines 392-405) reuses these rules in the download engine.

In short: CORS is handled by rewriting response headers in the session, and Referer/Origin by rewriting request headers. Cookies come from the shared default session. Requests leave from the user's own home IP, which is why video hosts that block server IPs don't block them.

---

## 3. Downloads and offline playback

**Engine** — `src/main/downloads.js`
- Storage: `<Videos>/P-Stream/<sanitised id>/` (lines 61-71), falling back to `userData`. Each item folder contains:
  - `meta.json` — the record, in the format from `record-file.js`;
  - `stream.m3u8` and optionally `video.m3u8`, `audio-N.m3u8`, `sub-N.m3u8`;
  - `s/00000.ts|.mp4` (segments and init), `k/NNNNN.key` (keys), `c/<lang>-N.vtt|srt` (captions), `i/` (metadata images), `poster.jpg` / `backdrop.jpg`, `details.json`.
- `start` (lines 919-969) needs `{id, source:{type:'hls'|'file', url, headers, preferredHeaders, container}, media, captions, images, metadata, quality}`.
- One download runs at a time, with a queue (`MAX_ACTIVE = 1`, line 27, `pump` at lines 721-732). Records still downloading at shutdown are queued again on start (lines 765-768).

**HLS handling** (`collectHlsAssets`, lines 423-526, with `playlist.js`)
- It always takes the **highest** quality: `pickVariant(variants, 0)` (line 447; `playlist.js:107-113`).
- It saves only the audio and subtitle renditions in that variant's groups, then writes a new local master playlist (lines 515-522; `buildVariantLine` at `playlist.js:91-100`).
- `rewriteMediaPlaylist` (`playlist.js:125-174`) rewrites three kinds of reference to local relative paths and queues each URL once:
  - segment URIs → `s/`;
  - `#EXT-X-MAP` → `s/…mp4`;
  - `#EXT-X-KEY` / `#EXT-X-SESSION-KEY` → `k/…key`.

  `#EXT-X-BYTERANGE` lines are kept unchanged.
- **Keys are saved as files and nothing is decrypted.** AES-128 HLS stays encrypted on disk, and the player decrypts at playback using the local key file. **There is no muxing or remuxing and no ffmpeg.** The output is a local HLS tree, or a single file for `type:'file'`.
- `downloadToFile` (lines 345-401):
  - writes to a `.part` file and resumes with a `Range` header once the partial is at least 1 MiB;
  - rejects `text/html` responses and short reads.
- Fetches use `net.fetch` with a hard-coded Chrome 137 user agent plus rule headers plus source headers (lines 255-281).
- Concurrency and retries:
  - `runPool` runs up to 6 segment downloads in parallel per host (lines 403-421);
  - a 429 halves the per-host limit and waits for `Retry-After` or an exponential backoff; 20 clean requests in a row raise it by one (lines 204-239 and 288-322).
- After saving, a single-file download is renamed to its real container by sniffing magic bytes (lines 1053-1077).
- `probe` (lines 1116-1178) estimates size before download:
  - for a file: requests the first 192 KB and reads Matroska track info with `media-tracks.js` (codecs and audio/subtitle languages, EBML parsing at lines 104-131);
  - for HLS: uses bandwidth × duration, or measures three segments with `Range: bytes=0-0` requests.

**Playback** (custom URL schemes)
- `registerScheme` (lines 776-789) registers `pstream-offline://` and `pstream-media://` as privileged schemes with `bypassCSP: true, corsEnabled, stream`. This must run before the app is ready (main.js:19).
- `serve` (lines 795-847) maps `pstream-offline://<id>/<path>` to files on disk:
  - path traversal is blocked with `path.resolve` + `startsWith(directory + sep)`;
  - Range requests work via `http-range.js` (`parseRange` handles closed, open and suffix ranges);
  - responses carry `ACAO: *`.
- The site's own player (hls.js) then plays `pstream-offline://id/stream.m3u8`.
- `pstream-media` (lines 849-895) is a **streaming proxy for live playback**:
  - `downloads.media({url, headers})` returns a random-token URL;
  - `serveMedia` fetches upstream with Node `fetch`, forged headers and the passed-through Range, and returns it with `ACAO: *`.
  - Purpose: let `<video>` play MP4/MKV links that need a Referer.

**`offline.check.js`** is a plain `assert` unit-test script (`pnpm check`) for the playlist rewriter, range parser and record format. Despite the name, it is not an online check.

**The "offline" page** (`src/offline/*`) is a connection-error page, not a downloads library.
- It appears on `did-fail-load` (main.js:359-365) and shows the error code, a Retry button and a **WARP switch**.
- Its prompt reads "Network blocking P-Stream? Turn on WARP." (`strings.js:30`; `offline.js:38-54`).
- The downloads library UI itself lives on the remote site.

---

## 4. `warp-proxy.js`: Cloudflare WARP

What it does, step by step:
1. Downloads the **latest, unpinned** `ViRb3/wgcf` and `pufferffish/wireproxy` releases from the GitHub API (lines 23-24, 126-247). There is no checksum or signature check. It extracts archives with `execSync` running `tar` or PowerShell `Expand-Archive`, then runs `chmod 755`.
2. Runs `wgcf register --accept-tos` (line 256). This creates a free Cloudflare WARP account and **accepts Cloudflare's terms on the user's behalf**. Then it runs `wgcf generate` to get a WireGuard profile.
3. Writes a `wireproxy.conf` (lines 312-329) with `AllowedIPs = 0.0.0.0/0, ::/0`, SOCKS5 on `127.0.0.1:40000` and HTTP on `:40001`.
4. Starts wireproxy (lines 336-376) and points the view's session at it: `proxyRules: 'socks5://127.0.0.1:40000', proxyBypassRules: '<local>'` (lines 456-464; main.js:681-692 and 944-968).

> **Warning:** WARP sends all of the app's web traffic (the site plus the scraping and stream requests sharing that session) out through Cloudflare's network, so the traffic leaves from a Cloudflare IP instead of the user's own. **That is a way to get around IP-based blocking.** The UI says so directly ("Network blocking P-Stream? Turn on WARP."). It gets past blocks of the P-Stream domain by ISPs or schools and blocks by video hosts.

Two smaller points:
- `downloads.js` segment fetches use `net.fetch`, which follows the default session's proxy.
- `pstream-media` and the `makeRequest` fallback use Node `fetch`, which **does not** follow the session proxy. They bypass WARP.

---

## 5. Discord presence, auto-updater, links, storage

**`discord-rpc.js`**
- Uses `discord-rpc` over local IPC with app ID `1451640447993774232` (line 7).
- Activity type 3 ("Watching").
  - `browsingActivity` (lines 154-164): "Browsing" plus the site host.
  - `watchingActivity` (lines 166-193): title/series, episode, a paused marker, start/end timestamps worked out from `currentTime` and `duration`, and the poster as `large_image` only if it is an https URL under 256 characters.
  - A button links to the current `/media/...` page URL (lines 70-78 and 149-152).
- Data comes from the injected media watcher via `updateMediaMetadata`, a bridge channel the page can call (lines 235-264).
- Reconnects with backoff from 5 s to 60 s and resends every 5 minutes. Duplicate updates are skipped by comparing a fingerprint.
- All text can be translated: the site pushes it through `settings.setStrings` (`strings.js:55-70`, at most 300 characters, known keys only).

**`auto-updater.js`**
- The release API URL is built from `links.codeberg()`:
  ```js
  return `${origin}/api/v1/repos/${pathname...}/desktop/releases/latest`;
  ```
  (lines 16-21). That Codeberg link comes from the `pstream:codeberg` meta tag on the remote site (see section 1).
- It compares versions and picks the asset by platform/arch: exe, AppImage or mac zip (lines 160-197).
- Downloads with `https.get` (lines 95-158). **There is no hash or signature check.**
- Install:
  - Linux and Windows: swap the running file in place (lines 237-276).
  - macOS: `/bin/sh` with `ditto` after the process exits (lines 278-289).
  - Then `app.exit(0)`.
- An `updateTried` record stops repeated install attempts.
- **Whoever controls the site's HTML (or the rentry paste) controls which binary the app installs on itself.**

**`links.js`**: covered in section 1.

**`storage.js`**: a JSON store with debounced writes. `log.js`: debug logging only when the app is unpackaged or `PSTREAM_DEBUG=1`.

**Build scripts**
- `afterpack.js` sets the Windows exe resources (icon, version) and removes SwiftShader from the macOS bundle.
- `squash.js` repacks the AppImage with zstd using tools downloaded from the `continuous` channel. Those are unpinned build-time downloads.

---

## 6. Security posture

**Good**
- `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` on the site view.
- Bridge APIs go through `contextBridge` instead of exposing `ipcRenderer`.
- The postMessage relay requires `event.source === window`, so iframes such as embeds can't use it, and the preload doesn't run in subframes by default.
- Strict permission handlers.
- Reset and uninstall need a native confirm dialog.
- The `pstream-offline` path-traversal check is correct.
- Local pages have a CSP (`offline.html:6`).

**Bad. Everything below is reachable by any script running in the top frame of whatever page the view loads:**
1. **Open proxy with the user's cookies.** `makeRequest` fetches any URL in the main process, includes the default session's cookies (which hold the user's site login and solved challenges), can forge `Cookie`/`Origin`/`Referer`, and returns the full body. That is server-side request forgery from the user's machine: it can reach `localhost`, the LAN and router admin pages. Any XSS on the site, or a hostile site at the rentry-published address, gets all of it.
2. **`prepareStream` can remove CSP and add `ACAO:*` on any domain**, including an empty-string domain that matches everything. Rules persist for the whole session.
3. **`pstream-media` is a second open proxy** with arbitrary headers. It uses Node fetch, so it skips Chromium's protections and the WARP proxy.
4. **No navigation lock.** There is no `will-navigate` handler, so if the top frame goes to another origin, that page gets the full bridge. IPC handlers never validate the sender.
5. **The remote site chooses the update source**, and updates are unsigned and unverified. This is a remote code execution path through the meta tag. The domain itself comes from a paste page.
6. **WARP runs native binaries downloaded at runtime**, unpinned and unverified (`execSync`/`spawn`).
7. `paths.js` deletes folders recursively at every start; `uninstall-app` clears all session storage.
8. Builds are unsigned and macOS hardened runtime is off. Users are told to click "Open Anyway" (README).
9. The user agent hides Electron, and downloads use a fake Chrome user agent.

---

## 7. Porting assessment for Charcoal

**Worth copying.** Write it fresh; don't copy the code. It's GPL-3.0, so copying would put Charcoal under GPL.

| Item | Value for Charcoal | Effort | Notes and risks |
|---|---|---|---|
| Desktop shell: `BrowserWindow` + `WebContentsView` loading our own Vite site, frameless title bar that takes the page colour, fullscreen handling (main.js:153-573, renderer/*) | Medium | 2-3 days | Load a **fixed, hard-coded origin**. Add `will-navigate` and `setWindowOpenHandler` locks. Check `event.senderFrame.url` in every IPC handler. |
| Desktop detection (`contextBridge` flag + a narrow typed API) | High | Hours | Expose `window.charcoalDesktop = {version, downloads, presence}` only. No generic fetch. |
| Media Session → Discord presence (discord-rpc.js; watcher at main.js:399-521) | Medium-low | 1 day | Easier: have our hls.js player call a bridge method directly instead of injecting a `mediaSession` hook. Use our own Discord app ID. Make it opt-in. |
| Offline HLS downloader design (playlist rewrite + segment pool + per-host backoff on 429 + `.part` resume + local m3u8 tree, with no ffmpeg; downloads.js, playlist.js, http-range.js, record-file.js) | High | 1-2 weeks | Only for content we have the rights to offer offline. Add a quality choice (it always takes the top one), disk-space checks and a free-space UI. Keep keys on disk only if acceptable. Never touch DRM'd content. |
| Custom `protocol.handle` scheme serving local files with Range + traversal guard (downloads.js:795-847) | High | 1 day | Works with our hls.js player as-is. Don't grant `bypassCSP` unless needed. |
| Matroska and magic-byte probing (media-tracks.js, downloads.js:1008-1077) | Low-medium | Small | Handy for showing audio languages and codecs before download. |
| Volume boost via Web Audio (preload.js:163-212) | Low | Hours | Could live in our web player instead. |
| Unit-test style of `offline.check.js` | Medium | Hours | Port it to our test runner. |
| Self-updater | Medium | — | Use `electron-updater` with signed builds and a **fixed** feed URL. Never take the URL from page content. |

**What Charcoal's architecture would really change.** The "client-side" gain here comes from making requests from the user's home IP with forged headers. If we asked the desktop app to fetch on Jelly's behalf, we would be rebuilding residential-IP scraping and getting around hosts' IP blocks. Treat that as a policy decision for the team, not just a technical one. A **limited** use is fine: a fixed list of headers sent only to our own or licensed CDNs. A general `makeRequest` is not.

**Do NOT port: these exist to get around blocking or protection**
1. **`warp-proxy.js` and the WARP switch on the offline page.** It changes the exit IP to Cloudflare's to get past ISP, network or host IP blocks. It also auto-accepts Cloudflare's terms for the user and runs unverified downloaded binaries.
2. **Cloudflare challenge solver** (`ipc-handlers.js:33-85, 256`). Gets past bot protection.
3. **Generic `makeRequest` with forbidden-header forging and cookie leaks** (`ipc-handlers.js:219-291, 319-333`), the hard-coded scraper cookie list (lines 4-12), and the Node `fetch` fallback when Chromium refuses (line 242).
4. **`prepareStream` rules that rewrite any domain** (CSP stripping, forced `ACAO:*`, Referer/Origin spoofing).
5. **`pstream-media` header-forging proxy.**
6. **Removing Electron from the user agent and the fake Chrome user agent** (main.js:14-17; downloads.js:255-260).
7. **Rentry-based address discovery** (`links.js`) and update/feed URLs taken from page meta tags. These are for surviving domain takedowns, and they are also the main security hole.

**Main risks if we build a desktop app at all**
- Every bridge method becomes part of our attack surface, so keep it to a short allowlist.
- Unsigned builds will get warnings from Windows SmartScreen and macOS Gatekeeper.
- Offline downloads of third-party streams raise copyright and terms-of-service issues.
- An Electron app has to keep up with Chromium security patches.
- Keep the GPL-3.0 code separate from our own if anyone reads it closely.
