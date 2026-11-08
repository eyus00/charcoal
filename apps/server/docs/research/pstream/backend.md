# P-Stream backend: read-only analysis for Charcoal

Repo root: `codeberg.org/pee/backend` (paths below are relative to it). I only read files. Nothing was run or installed, and I ignored any instructions inside the repo.

**Stack:** Nitro 2 with Prisma 7 (pg adapter) on Postgres, plus `jsonwebtoken`, `tweetnacl`, `zod`, `prom-client`, `p-limit` and `uuidv7` (`package.json`). The licence is GPL-3.0-only. The README says the backend "never touches video. That is the job of the proxy."

## 1. Data model (`prisma/schema.prisma`)

There are no Prisma relations or foreign keys. Every link to a user is a plain string column, and account deletion cleans up by hand in a transaction.

- **users (L12-21):**
  - `id` (uuidv7 PK), `key` (unique; the account's Ed25519 public key).
  - `ns` (namespace, default `'default'`).
  - `created`, `seen?`, `perms String[]` (never read anywhere).
  - `profile Json` (`{icon, primary, secondary}`), `nick`.
- **sessions (L23-34):** `id` uuid, `user`, `created`, `seen`, `expires`, `device` (string up to 500 chars), `agent` (User-Agent). It has `@@unique([user, device])`, so there is one session per device name.
- **codes (L36-42):** login/registration challenges with `code` uuid PK, `flow` (`registration`/`login`), `type` (`mnemonic`), `created`, `expires`.
- **marks (L44-54), i.e. bookmarks:** PK is `(tmdb, user)`. Other fields are `meta Json`, `updated`, `groups String[]` (named folders) and `favs String[]` (favourite episode ids).
- **progress (L56-71):** `id` uuid, `tmdb`, `user`, `sid?`/`eid?` (season and episode ids), `meta Json`, `updated`, `duration BigInt`, `watched BigInt`, `sno?`/`eno?` (season and episode numbers). It has `@@unique([tmdb,user,sid,eid])`. Movies store the sentinel `'\n'` in `sid`/`eid`.
- **history (L73-90):** like progress, but `duration`/`watched` are Float, plus `at` (when watched), `done Boolean` and `updated @default(now())`. Same unique key, and an index on `(user, at desc)`.
- **groups (L92-98):** one row per user (`user @unique`) holding `sort String[]`, the order of the bookmark groups.
- **settings (L100-159):** one row per user, with `id` equal to the user id. It has about 58 typed columns:
  - Appearance: `theme`, `customTheme`, `language`, `region`.
  - Subtitles and audio: `subLang`, `subtitleStyle`, `audioLang`.
  - Third-party keys and proxying: `proxies[]`, `proxyTmdb`, `tidbKey`, `wyzieKey`.
  - UI flags: autoplay, carousel, discover, logos and similar.
  - Sources: `sourceOrder[]`, `offSources[]`, `orderSources`, `manualSource`, `lastSource`, `stickySource`.
  - Quality and age: `qualityFilter`, `qualityLimit` (default `"1080"`), `dub`, `ageFilter`, `ageLimit`.
  - Player: `autoResume`, `dblSeek`, `autoSkip`, `segMarkers`, `segColors`, `shortcuts`, `gamepadMap`, video filters (`brightness`, `contrast`, `saturation`, `hue`, `boost`), `sound`, `scale`, `sleep`, `partyOverlay`.

The database is created with `prisma db push --accept-data-loss` every time the container starts (`Dockerfile` L45). There are no migrations.

## 2. Auth: no passwords or passkeys; a seed phrase signs a challenge

**Design.** The client keeps a mnemonic (seed phrase; the auth type is literally `'mnemonic'`) and derives an Ed25519 keypair from it. The server only ever sees the public key and signatures. There is no email, password, passkey or WebAuthn.

**Register start** (`server/routes/auth/register/start.ts`):
- Body: `{captcha?}`.
- If captcha is enabled, it verifies Cloudflare Turnstile (L20-28).
- It then calls `createChallengeCode('registration','mnemonic')` and returns `{challenge}`, a uuidv7 that expires after 10 minutes (`utils/challenge.ts` L5).

**Register complete** (`register/complete.ts`):
- Body: `{key, challenge:{code, signature}, ns?, device (1-500 chars), profile:{icon, primary, secondary}}` (L8-21).
- It runs `verifyChallengeCode`, which checks the flow and type, the expiry, and `nacl.sign.detached.verify(Buffer.from(code), sig, pubkey)` on base64url input. The code is deleted after use, so it is single-use (`challenge.ts` L23-79).
- It returns 409 if the key already exists.
- It creates the user with `nick: generateRandomNickname()` (`utils/nickname.ts`, an adjective plus a noun such as "Swift Falcon").
- It calls `makeSession` and returns `{user, session, token}`.

**Login start** (`login/start/index.ts`): `{key}`. It returns 401 "user cannot be found" if the key is unknown, otherwise a fresh challenge. The challenge is not tied to the key at this point.

**Login complete** (`login/complete/index.ts`): `{key, challenge, device}`. It verifies the signature, bumps `seen`, upserts the session for `(user, device)` and returns the token.

**Sessions** (`utils/auth.ts`):
- Lifetime is 21 days, sliding: every authenticated request goes through `getSessionAndBump`, which pushes `expires` forward (L6, L20-34).
- The token is `sign({ sid: session.id }, cryptoSecret, { algorithm: 'HS256' })` (L77). That is the only use of `CRYPTO_SECRET`. Changing it signs everyone out (`.env.example`). Nothing is encrypted with it.
- Requests send `Authorization: Bearer <jwt>` (L103-131).
- `sessions/[sid]` handles PATCH (rename the device; 409 if the name is a duplicate) and DELETE (log out a device). `users/[id]/sessions.ts` lists sessions.
- `users/@me.ts` returns the current user and session.
- `users/[id]/index.ts` handles PATCH of `profile`/`nick`, and DELETE, which wipes marks, progress, history, groups, settings, sessions and the user inside one `$transaction` (L80-110).

**Captcha** (`utils/captcha.ts`): Turnstile siteverify with a 10 s timeout, used only on register/start. It is on when `CAPTCHA=true` and `CAPTCHA_SECRET` is set. The public site key is exposed through `/meta` as `pass` (`utils/config.ts` L5-18).

**Privacy and encryption:**
- Accounts are pseudonymous: no PII, a random nickname, and the identity is a public key.
- **The server stores everything in plaintext.** Bookmark, progress and history `meta` (title, year, poster, type) plus TMDB ids are readable to the operator.
- The only field that may be client-encrypted is `device` (500-character free string). In the upstream movie-web/P-Stream frontend the device name is encrypted with a key derived from the mnemonic. That is a frontend convention; this backend does not enforce it, so it is an inference.
- The server also stores the User-Agent and the `seen` timestamps.
- `PATCH users/[id]` logs the whole request body (L34).
- There is no rate limiting on login or sync, and login/start reveals whether a public key is registered.

## 3. Sync API (all under `/users/:id/...`; the session user must equal `:id`, otherwise 403)

**Bookmarks** (`users/[id]/bookmarks.ts`):
- GET returns `[{tmdb, meta, groups, favs, updated}]`.
- PUT takes up to **10,000** items: `[{tmdb, meta:{title, year?, poster?, type:'movie'|'show'}, groups?: string|string[], favs?: string[]}]`. Each item is upserted in one `$transaction` (L52-94).
- **Upsert only:** bookmarks missing from the body are not deleted.
- `updated` is set to the server's `now`; client timestamps are ignored.

**Single bookmark** (`bookmarks/[tmdbid]/index.ts`):
- POST upserts one bookmark, with `groups` limited to 30.
- DELETE always returns success, even if the bookmark was missing.

**Groups** (`groups.ts`): GET `{sort}`; PUT takes a `string[]` of at most 30 and replaces the order.

**Progress, single item** (`progress/[tmdbid]/index.ts`):
- PUT body: `{meta (adds an anime flag), tmdb, duration, watched (rounded), sid?, eid?, season?, episode?, updated? (ISO)}`.
- `updated` is clamped between 2021-07-13 and now (L28-33).
- It upserts on `(tmdb, user, sid, eid)` and the last write wins; there is no timestamp comparison.
- It uses `tmdb` from the body, not from the URL.
- For a show with no `sid`, NULL is stored, and Postgres treats NULLs as distinct, so duplicates are possible.
- DELETE takes a body of `{sid?, eid?, meta?}` and calls `deleteMany`.

**Progress, list** (`progress.ts`):
- GET returns `[{id, tmdb, episode:{id, number}, season:{id, number}, meta, duration, watched, updated}]`. Durations are strings because the columns are BigInt.
- The file also contains server-side "worth saving" rules (L6-56): skip if `watched < 20 s`, treat as completed if fewer than 2 minutes remain.
- It also contains a `/progress/cleanup` branch. Nitro probably routes `/progress/cleanup` to `[tmdbid]/index.ts`, which would make that branch dead code. I inferred this; I did not test it.

**Progress import** (`progress/import.ts`):
- PUT takes up to **5,000** items.
- It loads all of the user's existing progress, and for each match on `(tmdb, sid, eid)` **keeps whichever has the larger `watched`** (L99). New items are inserted.
- Writes run with `pLimit(10)` and are not wrapped in a transaction.
- This is the only conflict-resolution rule in the whole API: furthest-watched wins.

**History:**
- GET (`history.ts`) returns everything sorted by `at desc`, with no pagination. Items are `{tmdb, episode, season, meta, duration, watched, at, done}`.
- PUT on `history/[tmdbid]` takes one item or an array of at most **1,000**: `{meta, tmdb, duration, watched, at (ISO, required), done?, sid?, eid?, season?, episode?}`. Items are upserted in a `$transaction`, last write wins, and `updated` is the server's now.
- DELETE on `history/[tmdbid]` takes `{sid?, eid?}`.

**Settings** (`settings.ts`):
- A table-driven `FIELDS` list (L86-145) gives each column a zod type and a default.
- PUT is a **partial** update: only keys present in the body are updated (L215-219). On first create, missing keys get their defaults.
- GET (`toResponse`) leaves out null or empty values and anything that no longer validates.

**General:**
- There are no ETags, versions or `If-Unmodified-Since` checks.
- The client is expected to merge: pull everything, merge locally, then push. Deletes are explicit per-item calls.

## 4. Metrics and provider health

**What the client reports** (all endpoints are unauthenticated and have no rate limit):
- **POST `/metrics/providers`** (`routes/metrics/providers.post.ts`): `{items:[{status:'success'|'notfound'|'failed', source (max 40), embed?}]}`, 1-10 items. It increments the Prometheus counter `sources{source=embed??provider, status}` (`utils/metrics.ts` L7, L21-23).
- **POST `/metrics/content`**: `{cdn, status:'success'|'failed'}`, or `{items:[...]}` with 1-50 items. Counter `content{cdn, status}` tracks which stream hosts or CDNs actually play.
- **POST `/metrics/captcha`**: `{success, kind?:'register'|'gate'}`, counter `captchas`.
- **POST `/metrics/quality`** and **`/metrics/blocks`** are no-ops that read the body and return `{ok:true}`. They only exist so older clients don't get errors.
- **GET `/metrics`** is a public Prometheus scrape. It also exposes a `latency` histogram per route, collected by `plugins/metrics-timing.ts`. `plugins/metrics.ts` calls `setupMetrics()`, which is empty.

**Why it exists:** the client reports scrape outcomes per source and per embed, so the operator (typically through Grafana) can see which providers and CDNs are succeeding.

**Limitations:**
- Counters live in process memory and are lost on restart.
- They are never fed back to clients.
- `GET /providers/health` (`routes/providers/health.get.ts`) is a hard-coded stub: `{ unhealthy: [], cooldown: {}, updated: Date.now() }`. The response shape (`unhealthy` list, `cooldown` map) shows a planned "skip sick providers" feature, but there is no logic behind it.
- **Useful for Charcoal:** the schema of what to report (per-source and per-embed `success`/`notfound`/`failed`, plus per-CDN play success) and the planned `{unhealthy, cooldown}` contract. There is no algorithm to copy.

## 5. Similar titles

**`similar/[id].get.ts`:**
- Takes an IMDb id (`^tt\d{5,10}$`).
- It sends IMDb's **private GraphQL** endpoint `https://caching.graphql.imdb.com/` the query `moreLikeThisTitles(first: 20)`, spoofing a browser User-Agent and `origin: https://www.imdb.com` (L12-26).
- It returns `{items:[{id: 'tt…', type, year}]}`.
- In-memory 24 h cache with at most 5,000 entries, de-duplication of concurrent lookups, and stale results served on error. Response header is `Cache-Control: private, max-age=3600`.
- This is unofficial use that could break or violate IMDb's terms.

**`similar/mal/[id].get.ts`:**
- Calls the official MyAnimeList API v2 `GET /v2/anime/{id}?fields=recommendations` with `X-MAL-CLIENT-ID`, taken from `MAL_CLIENT_ID` or `VITE_MAL_CLIENT_ID`.
- It returns `{items:[{mal, votes}]}`, or empty items if no client id is set. Same caching as above.

## 6. `/api/player/status`: watch-party presence and sync relay

This is in-memory only (`utils/playerStatus.ts`), with no database and no auth.

- **POST** body: `{user, room, host?, control?, nick?, source?, content:{title, type, tmdb, sid, eid, season, episode}, player:{playing, paused, loading, started, time, duration, volume, rate, buffered}}`. It is sanitised in `status.post.ts` L34-62.
- **GET `?room=&user=`** returns either one user's last statuses or every user's statuses in the room.
- Limits:
  - The last 5 statuses per user are kept, for 30 minutes.
  - Up to 5,000 rooms and 50 users per room.
  - Room code must match `^[A-Za-z0-9_-]{1,32}$`.
  - Each network may touch at most 12 rooms per 10 minutes. The network is a /24 for IPv4 and /48 for IPv6, via `CF-Connecting-IP` or X-Forwarded-For (`utils/ip.ts`).
- What it is: a polling-based **watch party**. A host posts its playback state, and guests poll to sync time and play/pause. `host`/`control` mark the host and whether guests may control playback. The `partyOverlay` setting styles the on-screen party UI.
- It is not a remote control in the casting sense.
- It does not work across multiple replicas because the state is per process.

## 7. Miscellaneous

- **`/meta`** (`routes/meta.ts` and `utils/config.ts`): `{name, desc, ver, gate (captcha on), pass? (Turnstile site key)}`. The client fetches this when the user adds a backend URL.
- **CORS** (`middleware/cors.ts`): `Access-Control-Allow-Origin: *`, all methods and headers, and a 204 reply to OPTIONS. That is acceptable here because auth is a Bearer header, not cookies.
- **`/health`:** `SELECT 1` with a 3 s timeout and a 5 s cache; returns 503 if the database is down.
- **`utils/ip.ts`:** client IP lookup and /24 or /48 network grouping. `isOwnIpTool` is unused.
- **`utils/views.ts`:** response shaping for users and sessions; `profileView` fills defaults (`cat`, `#0A54FF`).
- **`plugins/db-cleanup.ts`:** deletes expired `codes` and `sessions` 5 s after boot and then every 30 minutes.
- **`utils/prisma.ts`:** pg Pool with max 30 connections, or 10 when `DB_PROVIDER=supabase`, which uses the `DATABASE_URL_SUPABASE` pooler.
- **`utils/languages.ts`:** an ISO-639-1 checker that nothing uses.
- **`utils/logger.ts`:** JSON logs, printed only in production.

## 8. Porting assessment for Charcoal

**Fit.** Charcoal's `charcoal:v2` data maps almost one-to-one onto this backend:
- History maps to `history` (plus `progress` for resume points).
- The watchlist maps to `marks`. Charcoal's statuses (watching, planned, completed) could go in `groups` (`groups:["planned"]`), but a dedicated `status` column is cleaner.
- Settings map to a settings table. Charcoal should use a **single JSON column** rather than 58 typed columns.

**Recommended design: copy the identity model, not the storage model.**
1. **Optional account-less identity.** Generate a BIP39 mnemonic in the browser and derive an Ed25519 keypair (tweetnacl, @scure/bip39). Registration and login use the same challenge-sign flow as `utils/challenge.ts` (about 80 lines), and sessions use HS256 JWTs as in `utils/auth.ts`. There is no email or password, and "export/import" becomes "write down 12 words". It stays opt-in: localStorage remains the source of truth until the user enables sync.
2. **Go further on privacy than P-Stream: end-to-end encrypt the blob.** Derive a symmetric key from the mnemonic (HKDF, then XChaCha20-Poly1305 or AES-GCM via WebCrypto). Store one encrypted `charcoal:v2` document per user: `{user, version int, ciphertext, updated}`. The server then cannot see what anyone watches, which P-Stream's backend can.
3. **Concurrency control.** Use an integer `version` with compare-and-swap (`PUT` with `If-Match: version`; 409 on mismatch, then the client pulls, merges and retries). The client-side merge is: per item, newest `updatedAt` wins, keep max(`watched`) for progress (P-Stream's import rule, `progress/import.ts` L99), and use tombstones for deletes. This avoids P-Stream's per-row last-write-wins and the gap where bulk PUT can't delete anything.
4. **Size limit.** Cap the blob at about 1-2 MB. That plays the role of P-Stream's 10k bookmarks / 5k progress / 1k history caps.

**Provider-health telemetry for Jelly.**
- Reuse P-Stream's report shape: `{source, embed?, status: success|notfound|failed}` plus a per-CDN `success|failed`.
- Jelly already scrapes server-side, so it can record outcomes itself instead of trusting client POSTs. That avoids the unauthenticated, poisonable endpoints P-Stream has.
- Then actually build the planned `{unhealthy, cooldown}` endpoint: a rolling success rate per source over a window, with a cooldown when failures exceed a threshold. Use it to reorder or skip providers.
- In-memory or Redis is enough, and Postgres works if you want persistence. Don't expose `/metrics` publicly.

**Effort estimate:**
- Minimal encrypted-blob sync (Postgres with 3 tables: users, sessions, blobs; about 6 endpoints) plus client crypto and merge: roughly **3-5 developer-days**.
- Copying P-Stream's per-entity REST model instead: about **1.5-2 weeks**, more surface area and plaintext data.
- Provider-health scoring in Jelly: **1-2 days**.
- Watch party (if wanted): about 1 day using P-Stream's polling design, but it needs Redis or a single instance. WebSockets are a better fit.

**Hosting.**
- Railway Postgres plugin plus one Node service (it can live inside Jelly or alongside it). The required env vars are `DATABASE_URL` and a JWT secret.
- Use real migrations (`prisma migrate deploy`), not P-Stream's `db push --accept-data-loss` on boot.
- Storage is tiny: kilobytes per user.

**Risks:**
- **Licence:** GPL-3.0-only. Copying its code into Jelly or Charcoal brings GPL obligations. Re-implement from the design instead; the challenge/JWT pattern is generic.
- **Seed-phrase UX:** a lost phrase means lost data, with no recovery. Warn users clearly and keep JSON export.
- **Privacy:** P-Stream stores titles, timestamps, User-Agents and session `seen` in plaintext, and logs request bodies. Avoid all of that, and avoid storing third-party API keys (`tidbKey`, `wyzieKey`) server-side in plaintext.
- **Abuse:**
  - No rate limiting on login or sync in P-Stream. Add per-IP limits and keep Turnstile on register, as P-Stream does.
  - login/start reveals which public keys are registered (low risk).
  - P-Stream's metrics endpoints have no auth.
- **Similar titles:** P-Stream's IMDb GraphQL scraping is unofficial and fragile. Prefer TMDB `/recommendations`, and MAL's official API for anime.
- **Bugs not to copy:** NULL `sid` in the progress unique key allows duplicates; there is likely dead `/progress/cleanup` code; `progress/[tmdbid]` ignores the URL id; history GET has no pagination.
