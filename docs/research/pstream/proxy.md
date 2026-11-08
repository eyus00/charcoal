# P-Stream proxy: read-only analysis

Repo root: `codeberg.org/pee/proxy` (one commit, `0ab9687 pushin p`). It is small, about 2.8k lines including tests. Nitro maps each file in `src/routes/*.ts` to a route: `index.ts` is `/`, `stream.ts` is `/stream`, and so on. Every route answers every HTTP method. The routes use h3 helpers (`defineEventHandler`, `getQuery`, `readBody`, `readRawBody`) that Nitro auto-imports. I only read files and executed nothing.

**Some files you named do not exist:**
- `streamRewrite.ts` and `streamSniff.ts` are missing. Only their tests exist (`src/utils/streamRewrite.test.ts`, `src/utils/streamSniff.test.ts`), and both import from `src/routes/stream.ts` (`rewriteM3U8`, `peekBody`).
- `peekBody` (stream.ts:126-161) is dead code in production. The route uses `peekBytes` from `mediaSniff.ts`.
- There is no prefetching anywhere in the codebase.

---

## 1. Routes

### `/` generic proxy (`src/routes/index.ts`)
- **Request format:** `?url=<destination>`. The value is either a plain URL or a hex "encoded" URL, decoded by `readDestination` (see §5). Any method is accepted. For PUT/POST/PATCH/DELETE the body is read fully into memory by `getBodyBuffer` (`src/utils/body.ts:8-14`, `readRawBody(event,false)`) with no size limit.
- **No `url`:** GET returns `{ gate:false, ...keyAdvert() }` (index.ts:47-50), which hands the client the XOR key. Other methods get 405.
- **Upstream call** (index.ts:71-77): `fetch(destination,{method, redirect:'follow', headers:getProxyHeaders(event.headers,destination), signal, body})`.
- **Headers timeout:** 6 s if the client sent `Range` (a "probe"), otherwise 15 s (lines 13-14, 62-64).
- **How request headers are passed** (`src/utils/headers.ts:72-127`, `getProxyHeaders`): client headers are mostly not forwarded. It builds a fresh header set:
  - `Content-Type` and `Range` are copied.
  - Fixed browser headers are always set: Chrome 137 UA, `Accept: */*`, `Accept-Language`, `sec-ch-ua*`, `sec-fetch-dest: empty`, `sec-fetch-mode: cors`.
  - `sec-fetch-site` is computed by `inferFetchSite` (headers.ts:27-40).
  - The caller supplies real upstream headers through an X- prefix, via `headerMap` (headers.ts:3-14): `X-Cookie→Cookie`, `X-Referer→Referer`, `X-Origin→Origin`, `X-User-Agent→User-Agent`, `X-Authorization→Authorization`, `X-X-Real-Ip→X-Real-Ip`, `X-Mal-Client-Id`, `X-Sec-Fetch-Site/Mode/Dest`.
  - Any other `x-*` header that is not in `blacklistedHeaders` (headers.ts:42-60) is forwarded unchanged. The blacklist covers `cf-*`, `cdn-loop`, `x-forwarded-*`, `forwarded`, `x-real-ip`, `x-amzn-trace-id`, `content-length` and `x-token*`.
- **Response headers** (index.ts:82-101):
  - Upstream headers are copied, then `set-cookie`, `content-encoding`, `transfer-encoding` and `content-length` are deleted. Fetch has already decompressed the body, so these would be wrong.
  - `getAfterResponseHeaders` (headers.ts:129-153) adds ACAO, `Access-Control-Expose-Headers: *`, `Vary: Origin`, `X-Set-Cookie` (upstream Set-Cookie re-exposed to JS), and `X-Final-Destination` (origin+path after redirects, query stripped so signed tokens don't leak; tested in headers.test.ts:86-94).
- **Status:** `corsSafeStatus(upstream.status)`. Thrown errors return JSON with status 503 and `X-Upstream-Status: 502`.

### `/stream` (`src/routes/stream.ts:163-354`)
- **Request format:** `?url=<url or encoded>&hdr=<JSON object of upstream headers>`. `hdr` is `JSON.parse`d; if parsing fails it becomes `{}` (206-213).
- **Upstream headers:** `{ 'User-Agent': Firefox 93 UA, ...customHeaders }` (215-219), so `hdr` can override the UA. The client's `range` and `if-range` are forwarded (220-223).
- **Not-OK upstream** (239-254): returns a text body `Upstream error: …` with `corsSafeStatus` and CORS headers.
- **Playlist detection:**
  - `isPlaylistResponse(contentType,url)` (`src/utils/playlist.ts`) returns true if the content type contains `mpegurl`/`m3u8`, or if the URL contains `.m3u8` or even just `playlist` anywhere. That last check is too broad.
  - Otherwise, if the content type is not trusted (`needsSniff`, 119-124) and the response starts at byte 0, it peeks 189 bytes. If the start (with BOM stripped) is `#EXTM3U` and status is 200, it treats the response as a playlist even under a lying content type (262-282). Otherwise it calls `sniffMediaType`.
- **Media pass-through** (284-310): sends the same status. Headers set:
  - `Content-Type`: the sniffed type, else upstream's, else `video/mp4`
  - CORS headers
  - `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges`
  - `Cache-Control: public, max-age=3600`
  - `content-range`, `accept-ranges`, `etag`, `last-modified` copied from upstream
  - `content-length` only when there is no `content-encoding`
- **Playlist** (312-336): the whole text is read and rewritten with `baseProxyUrl = ${x-forwarded-proto||'http'}://${host}` (316-320). The response is 200 with `application/vnd.apple.mpegurl` and `Cache-Control: no-cache, no-store, must-revalidate`.
- **Thrown errors:** 500 text, with CORS headers.
- **`DISABLE_STREAMING=true`:** returns 404 (184-189).

### `/fragment` (`src/routes/fragment.ts`)
- Same request format, `hdr`, UA and range handling as `/stream` (47-80).
- **Retry:** one retry after 250 ms on a network error, or on statuses `500,502,503,504,520-524` (17, 87-102). The first response body is cancelled before retrying.
- **Content type:** `declaredType || 'video/mp2t'`. If the declared type is not a media type (`isDeclaredMedia`) and the response starts at 0, it sniffs 189 bytes and overrides (125-135).
- **Headers:** like `/stream`, except `etag`/`last-modified` are not forwarded. Status is normalised to 206 or 200 (150).
- **Not-OK upstream:** same text error as `/stream` (109-123).

### `/cache` (`src/routes/cache.ts`)
- **Request format:** `?key=` (decoded by `readKey`). Not a proxy: it shares scraper results between users.
- **Methods:** GET returns `{found, output, validated:false}`. POST stores the body if `isValidRunOutput` passes (`{source:string, stream:{type:'hls'|'file'}}`). DELETE removes the entry, optionally only if `?source=` matches.
- **No authentication.** Anyone can poison or delete entries.

### `/quality` (`src/routes/quality.ts`)
- GET returns `{qualities: {sourceId: '1080',…}}`. POST `{source, quality}` records the best quality seen (see §3).

### `/health` (`src/routes/health.ts`)
- Plain GET returns `{status:'ok', uptime}`.
- `?bps=N` returns N random bytes (capped at 512 KiB, line 3, 38-40) with `no-store`. This is a bandwidth probe the client can use to pick a proxy.

### CORS and `corsSafeStatus`
- **CORS:** `getCorsOriginHeader` (`src/utils/origins.ts:27-33`):
  - With `ALLOWED_ORIGINS` unset, it returns `*`.
  - If the request origin's hostname equals an allowed host or is a subdomain of one, it echoes the origin.
  - Otherwise it returns `https://<first allowed>`, so the browser blocks the response.
  - When the value is not `*`, `Access-Control-Allow-Credentials: true` is added.
- **Preflight:** OPTIONS returns 204 in every route.
- **Errors:** `src/error.ts` is a CORS-aware Nitro error handler, so `createError` throws also carry ACAO.
- **`corsSafeStatus`** (`src/utils/upstream.ts:37-47`):
  ```ts
  return status === 502 || status === 504 ? 503 : status;
  ```
  The real status goes into `X-Upstream-Status`. The reason (see corsSafeStatus.test.ts:10): Cloudflare replaces 502/504 responses with its own error page, which has no CORS headers, so the browser sees an opaque CORS failure instead of a retryable error.
  - Caveat: `/stream` and `/fragment` do not list `X-Upstream-Status` in Expose-Headers, so hls.js cannot read it there.

### Range requests
- `Range` and `If-Range` are forwarded in stream/fragment. `index` forwards only `Range`.
- `Content-Range` and `Accept-Ranges` are returned, and 206 is preserved.
- Sniffing runs only when `startsAtZero(status, content-range)` (`mediaSniff.ts:79-86`), so mid-file ranges are never sniffed.
- Playlist responses are always sent as 200 with full text. A ranged playlist request would be wrong, but this is rare.

## 2. Playlist rewriting (`rewriteM3U8`, stream.ts:27-117)
- **Master detection:** `content.includes('#EXT-X-STREAM-INF:') || content.includes('#EXT-X-MEDIA:TYPE=')` (34-36).
- **Per-line logic:**
  - `#EXT-X-STREAM-INF:` sets `nextIsVariant`, and the next URI line goes to `/stream`.
  - `#EXT-X-KEY:` and `#EXT-X-MAP:`: `URI=` (quoted or unquoted, regex `/URI=(?:"([^"]+)"|([^,\s]+))/g`) is resolved and rewritten to `/fragment`.
  - `#EXT-X-MEDIA:` URI (audio and subtitle renditions) is rewritten to `/stream`, so it gets rewritten again as a playlist.
  - Bare URI lines: if `nextIsVariant || (isMaster && !content.includes('#EXTINF:'))`, they go to `/stream`. Otherwise they go to `/fragment`.
- **Relative URLs:** `new URL(line, playlistUrl)` (19-25). The base is the requested URL, not the post-redirect `upstream.url`. That is a bug: relative URLs break if the playlist URL redirects to another path.
- **Headers propagation:** `&hdr=<encoded JSON>` is appended to every child URL (41-51), so referer and cookies follow the chain.
- **Not handled (lines fall through unchanged):**
  - `EXT-X-BYTERANGE` and `EXT-X-MAP:BYTERANGE` are left intact. It works only because hls.js sends a `Range` header, which `/fragment` forwards.
  - `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-SESSION-KEY`, `#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-RENDITION-REPORT` and `#EXT-X-SESSION-DATA` keep their URIs un-proxied. LL-HLS and I-frame playlists would leak to the origin.
- **How this differs from a naive "rewrite every non-# line" approach:**
  1. Attribute URIs (KEY/MAP/MEDIA) are rewritten.
  2. Variant playlists and segments go to different routes, so playlists get re-rewritten and segments get type sniffing and a retry.
  3. Unquoted URIs are handled.
  4. Blank lines and unparsable lines are preserved.
  5. Disguised playlists are detected by content (`#EXTM3U` peek), not only by extension.
- **Tests:** `src/utils/streamRewrite.test.ts`, `src/utils/playlist.test.ts`.

## 3. streamCache / quality / "fragment cache"
- **Media is not cached.** Fragments are streamed through and only marked `Cache-Control: public, max-age=3600` so a CDN or browser may cache them. There is no prefetching.
- **Stream cache** (`src/utils/streamCache.ts`): an in-memory `Map` of scraper outputs keyed by media key.
  - TTL is 15 min (line 9), with a maximum of 500 entries and FIFO/LRU-ish eviction (52-66).
  - Expired entries are swept every 3 min (27-30) and when size ≥ 100.
  - Helpers not used by any route: `getMediaCacheKey` (121-135) gives `show-<tmdb>-<seasonTmdb>-<epTmdb>`, `movie-<tmdb>`, or an `anime-` prefix. `canServeCachedEntry` (79-86) refuses a cached source the viewer has filtered out.
  - The cache is per instance, so it is not shared across Cloudflare isolates or replicas.
- **Quality:** `rememberQuality` (103-119) keeps, per mediaKey, the best quality per source. Ranks run `360<480<720<1080<2160`, and the stored value can only be upgraded. A maximum of 1000 keys is kept. This is a hint for ordering sources in the UI, not HLS variant selection.

## 4. Media sniffing (`src/utils/mediaSniff.ts`)
- **`isDeclaredMedia`** (3-14): trusts `video/*`, `audio/*`, `application/mp4`, `application/dash+xml` and `application/vnd.apple.mpegurl`. Anything else (`image/jpeg`, `image/png`, `text/html`, `octet-stream`, empty) triggers a sniff.
- **`sniffMediaType`** (16-30):
  - TS requires `0x47` at bytes 0 and 188 (two sync bytes, hence `SNIFF_BYTES=189`).
  - ISO BMFF box types `ftyp|styp|moof|moov|sidx|free|skip|mdat` at offset 4 give `video/mp4`.
  - `ID3` or an ADTS sync word gives `audio/aac`.
  - HTML, JPEG and PNG return null, so the declared type is kept. The design goal is "a block page must stay a block page" (mediaSniff.test.ts:83).
- **`peekBytes`** (32-77): reads at least N bytes, then rebuilds a `ReadableStream` that replays those chunks and pulls the rest. It propagates cancel and avoids buffering the whole segment.
- **No fake-header stripping.** Nothing removes a PNG/JPEG prefix prepended to TS data, and nothing scans for a later 0x47 sync byte. Such a segment is passed through as `image/png` and hls.js would fail on it. This proxy only fixes the content type when the bytes really start as TS or MP4. If your hosts prepend image headers, you need your own scan-for-sync logic, for example find offset k where `buf[k]==0x47 && buf[k+188]==0x47`.

## 5. Security
- **`src/utils/ssrf.ts` `isSafeProxyTarget`** (53-71):
  - Allows http/https only.
  - Rejects `localhost`, `0.0.0.0` and `::1`.
  - Rejects private IPv4: 0/8, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 198.18/15, and everything ≥224.
  - Rejects private IPv6: `::`, `::1`, v4-mapped (dotted and hex forms), fc/fd, fe80-febf, ff.
  - Rejects dotless hostnames (Docker service names) and `.local/.internal/.localhost/.lan/.home.arpa`.
  - Gaps: no checks for NAT64 `64:ff9b::/96`, `2002::/16` 6to4, `192.0.0/24`, or the TEST-NETs. These are mostly mitigated by the egress guard.
- **`src/node/egress-guard.ts`** (Node presets only; nitro.config.ts:11): `setGlobalDispatcher(new Agent({connect: guardedConnect}))`.
  - `guardedLookup` resolves *all* addresses and refuses if *any* is private (63-64).
  - DNS results are cached for a fixed 60 s, up to 2000 entries.
  - `guardedConnect` blocks literal private IPs.
  - Connect timeout 8 s, keep-alive 30 s / 120 s.
  - Because the check happens at connect time, it covers redirects and DNS rebinding. On Cloudflare/Netlify only the string check applies, and redirects are not re-validated.
- **`src/utils/destination.ts`:** XOR obfuscation with a hardcoded key `5f3c9a1e7b2d4f60a8c1e9b37d5f2a46`.
  - The format is hex `iv` byte followed by `byte ^ key[(i+iv)%len] ^ iv`. The key is advertised publicly at `GET /` with a 24 h "expiry" `oe` that is never enforced.
  - This is not security. Its only effect is to keep target URLs out of plain query strings, plausibly to dodge URL-pattern filters or log scanning.
  - `readDestination` falls back to the raw value if decoding fails.
- **`src/utils/origins.ts`:** `ALLOWED_ORIGINS` only shapes the CORS header. It does not reject requests, so curl and server-to-server callers can use the proxy freely. It is not access control.
- **Concurrency** (`src/utils/concurrency.ts`): a global semaphore, `MAX_CONCURRENT_FETCHES` (default 500), with an unbounded FIFO queue.
  - The slot is released once headers or the playlist text arrive (stream.ts:240,286,314; fragment.ts:107; index.ts finally). It bounds upstream header waits, not active body streams.
- **Memory guard:**
  - `src/utils/memory.ts` takes the limit from `process.constrainedMemory()` (cgroup) or total memory.
  - A 15 s watch (`src/node/memory.ts`) checks RSS: at ≥75% it trims 50% of registered maps, at ≥88% it clears them. Only `streamCache` and `qualityCache` register (streamCache.ts:21-25).
- **Crash guard** (`src/node/crash-guard.ts`): logs and ignores `unhandledRejection`. On `uncaughtException` it writes to stderr, then `exit(1)`, with a 2 s fallback.
- **Body limits:** none.
  - `/` buffers arbitrary request bodies.
  - `/cache` POST stores arbitrary JSON up to 500 entries.
  - `/health?bps` is capped at 512 KiB.
- **Other risks:**
  - It is an open proxy by default. `hdr` and `X-*` let callers set Cookie, Authorization and `X-Real-Ip` upstream.
  - `hdr` (which may hold cookies) is embedded in every rewritten URL.
  - `baseProxyUrl` trusts the `Host` and `x-forwarded-proto` headers.

## 6. Upstream behaviour, and what looks like bot-protection evasion
`src/utils/upstream.ts` holds only `makeUpstreamSignal` and the status helpers. The actual requests are plain `fetch` (undici on Node, native fetch on Cloudflare).

- **Timeouts:** `makeUpstreamSignal` (3-33) uses an AbortController covering *headers only*. `headersReceived()` clears the timer, so body streaming has no timeout.
  - It is combined via `AbortSignal.any` with a client-disconnect signal (`event.node.res` 'close' while `!writableFinished`). That signal is Node-only; on Cloudflare `event.node` is absent.
  - Defaults: `PROXY_PLAYBACK_TIMEOUT_MS` 20 s (stream/fragment); 15 s, or 6 s for range probes, on `/`.
  - Tests: `upstream.test.ts`. Note it uses 127.0.0.1 servers, so it would conflict with the egress guard if that were loaded.
- **Redirects:** followed (explicit on `/`, the fetch default elsewhere).
- **Retries:** only `/fragment`, once, after 250 ms.

**Ordinary proxying:**
- Header-only timeouts
- Client-abort propagation
- Retry on 5xx
- Stripping hop-by-hop, encoding and cookie headers
- Stripping `x-forwarded-for`, `cf-connecting-ip` and similar, which hides the end user's IP. This is common for privacy proxies.

**Disguise / evasion indicators (flag these):**
1. **Browser impersonation at the header level.** `getProxyHeaders` (headers.ts:86-106) sets a Chrome 137 UA plus matching `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `sec-fetch-dest/mode`. It also computes a realistic `sec-fetch-site` from the claimed page via `inferFetchSite` (headers.ts:27-40; test "matches what a browser would send", headers.test.ts:136-167). This is deliberate imitation of a browser's request fingerprint. Stream/fragment send a hardcoded Firefox 93 UA (stream.ts:216-217, fragment.ts:72-73).
2. **Spoofing the requesting page.** Referer, Origin, Cookie, Authorization and `X-Real-Ip` are spoofable per request (headerMap). `X-X-Real-Ip→X-Real-Ip` lets a caller assert a client IP to the upstream.
3. **Stripping `cdn-loop` and CF identity headers** (headers.ts:43-50). This hides that the request came through Cloudflare.
4. **XOR-obfuscated destination URLs** (destination.ts).
5. **README:54-55** recommends VPS or home servers because "streaming sites block the addresses of Cloudflare, Netlify and other serverless platforms". This is advice to use residential or less-flagged IPs; the code itself does nothing about IPs.

**Not present:**
- No TLS/JA3/HTTP2 fingerprint spoofing (no curl-impersonate, no custom ciphers)
- No IP or proxy rotation, and no outbound proxy pool
- No Cloudflare/captcha challenge or cookie solving
- No headless browser

The "evasion" is limited to browser-like headers, referer/origin spoofing and URL obfuscation.

## 7. Deployment and config
- **`nitro.config.ts`:** preset from `NITRO_PRESET` (default `node-server`). Node-only plugins (egress-guard, crash-guard, memory) load only when the preset starts with `node`. Alias `@`→`src`, error handler `@/error`.
- **Docker:** `Dockerfile` is node:24-alpine, multi-stage, pnpm via corepack, running `node .output/server/index.mjs` on port 3000. `docker-compose.yaml` adds an optional `.env`, `restart: unless-stopped`, and a healthcheck with `wget` on `/health`.
- **Cloudflare:** `wrangler.toml` sets `main = ./.output/server/index.mjs` and `nodejs_compat`. Build with `pnpm build:cloudflare` (`NITRO_PRESET=cloudflare_module`). `ssrf.ts` and `memory.ts` import `node:net`/`node:os`, which rely on nodejs_compat. There is no egress guard and no client-disconnect abort there.
- **Netlify:** `netlify.toml` runs `pnpm build:netlify` (`netlify_edge`) and publishes `dist`.
- **Env vars** (`.env.example`):
  - `PORT`
  - `ALLOWED_ORIGINS` (read via `env()`, which calls `process.loadEnvFile()`, `src/utils/env.ts`)
  - `MAX_CONCURRENT_FETCHES`
  - `DISABLE_STREAMING`
  - `PROXY_PLAYBACK_TIMEOUT_MS`
  - Note: on Cloudflare, `process.env` values come from wrangler vars only with nodejs_compat env population.
- **Dependencies:** `h3`, `nitropack`, `undici` (for the dispatcher). Dev: `vitest`. License GPL-3.0-only (package.json:7). Copying code verbatim into Jelly creates GPL obligations if you distribute it; re-implementing the ideas avoids that.

## 8. Porting assessment for Jelly `/v1/proxy` and the Worker
Ranked by value; each item lists effort, risk, and where to look.

1. **Content-based playlist detection plus byte sniffing.**
   - Source: stream.ts:256-282, `mediaSniff.ts` (`isDeclaredMedia`, `sniffMediaType`, `peekBytes`, `startsAtZero`).
   - Value: high. It fixes hosts that serve m3u8 or TS as `image/*`/`text/html`; hls.js and MSE reject wrong MIME types less often, and playlists behind odd URLs get rewritten.
   - Effort: low (about 80 lines, pure web streams, Worker-compatible). Risk: low.
   - Add your own fake-image-prefix stripper (scan for the TS sync pair) if your hosts need it; this repo lacks one.
2. **Attribute-URI rewriting and the playlist/segment split.**
   - Source: `rewriteM3U8` stream.ts:27-117.
   - Value: high if Jelly currently does a naive rewrite (KEY, MAP and MEDIA URIs; unquoted URIs; variant vs segment routing).
   - Effort: low. Risk: low.
   - Improve on it:
     - Resolve against `upstream.url` after redirects.
     - Also handle `I-FRAME-STREAM-INF`, `SESSION-KEY`, `PART` and `PRELOAD-HINT`.
     - In Jelly's single `/v1/proxy?data=` scheme, encode `{url, headers}` once per child.
3. **`corsSafeStatus` plus `X-Upstream-Status`.**
   - Source: upstream.ts:35-47.
   - Value: high for the Cloudflare Worker, medium for Railway. Without it, 502/504 become opaque CORS errors in hls.js, so it cannot retry properly.
   - Effort: trivial. Risk: none. Also add the header to `Access-Control-Expose-Headers`.
4. **Header-only upstream timeout with client-abort propagation.**
   - Source: `makeUpstreamSignal`, upstream.ts:3-33.
   - Value: high on Railway, where a hung CDN otherwise ties up sockets; aborting on disconnect saves bandwidth.
   - Effort: low. Risk: low.
   - For the Worker, use `request.signal` instead of `event.node.res`.
5. **One retry for segments on 5xx/52x and network errors.**
   - Source: fragment.ts:17, 87-102.
   - Value: medium-high (fewer stalls). Effort: trivial.
   - Risk: low. Only retry before the body is streamed, as the source does.
6. **Response header hygiene.**
   - Source: index.ts:82-86; stream.ts:286-305; headers.ts:129-153.
   - Pass through `Content-Range`, `Accept-Ranges` and `Content-Length` (only without content-encoding), expose them, and keep 206. Strip `set-cookie`, `content-encoding` and `transfer-encoding`. Return `X-Final-Destination` without the query.
   - Forward `Range` and `If-Range`. Playlists get `no-store`; segments get `max-age=3600`.
   - Value: medium-high (seeking in MP4 and byte-range HLS). Effort: low. Risk: low.
7. **Egress guard at DNS/connect level (Railway/Node only).**
   - Source: `src/node/egress-guard.ts` and `ssrf.ts`.
   - Value: high for security; Railway's private network is reachable via service names and internal IPs.
   - Effort: low-medium (undici `setGlobalDispatcher`). Risk: medium, since it affects every outbound fetch in Jelly, including internal calls. Scope it with a dedicated `Agent` passed as `dispatcher` to proxy fetches only.
   - The string check `isSafeProxyTarget` is worth adding to the Worker too.
8. **Concurrency semaphore and memory-pressure trimming.**
   - Source: `concurrency.ts`, `utils/memory.ts`.
   - Value: medium on Railway's memory-limited containers. Effort: low. Risk: low.
   - Improve on it: bound the queue and hold the slot for the body's lifetime if you want real limits.
9. **CORS allowlist echo with `Vary: Origin` and a CORS-aware error handler.**
   - Source: `origins.ts`, `error.ts`.
   - Value: medium. Effort: low. Remember it is not authentication; add a signed-token or HMAC check on `data` if you want to prevent open-proxy abuse. Neither project has one.
10. **`/health?bps=` bandwidth probe.**
    - Source: health.ts:26-48.
    - Value: low-medium, for client-side selection between Railway and the Worker. Effort: trivial.

**Skip or treat with caution:**
- The XOR "encoding" in `destination.ts` (obfuscation only).
- The unauthenticated `/cache` POST/DELETE.
- Browser-fingerprint headers (`sec-ch-ua`/`sec-fetch-*` spoofing, `X-Real-Ip` injection, `cdn-loop` stripping). These are designed to make server traffic look like a browser, to get past hosts that block servers. That is the evasion category: weigh it against the hosts' terms and the risk of breaking further.
- Note: a matching `Referer`/`Origin` sent via `headers` (as Jelly already does) is the ordinary, minimal form of this.
- None of this changes the server-IP problem. The repo's own answer (README:54-55) is "run on a VPS or home server". It contains no IP rotation or TLS-fingerprint code.

**Reusable tests** (vitest, self-contained, the ideas port with small edits):
- `src/utils/mediaSniff.test.ts`: TS/MP4/AAC sniffing, block pages, `peekBytes` cancel.
- `src/utils/streamRewrite.test.ts`: master/media rewrite, KEY/MAP/MEDIA.
- `src/utils/streamSniff.test.ts`: playlist split across chunks.
- `src/utils/playlist.test.ts`
- `src/utils/corsSafeStatus.test.ts`
- `src/utils/ssrf.test.ts`: a good SSRF matrix.
- `src/utils/upstream.test.ts`: timeout and abort semantics, using local HTTP servers.
- `src/utils/origins.test.ts`
- `src/utils/headers.test.ts`: only the `getAfterResponseHeaders` parts are relevant.

`streamCache.test.ts` and `destination.test.ts` are P-Stream-specific.
