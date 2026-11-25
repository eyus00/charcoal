# Providers: migration and status

Two tables. The first accounts for the twelve legacy server classes one by one. The second says,
for every integration in the pack, how far its evidence goes. The words mean exactly this:

| Status | Means |
|---|---|
| Implemented | The code is in the pack |
| Unit-tested | Its extraction logic passes tests against fixtures (responses written for the test, in the shape the site returns) |
| Integration-tested | It runs through the engine under the network policy and passes the provider contract check (valid streams of a declared type, stays inside its hosts, reports an unreachable site and a bot check as what they are, stops when cancelled) |
| Live-validated | Run against the real site, it returned a stream that then answered with media (manifest parsed and first media bytes, or a file's header). Where and when is stated |
| Playback-validated | A stream it returned from the real site started in a real browser player (a moving picture in headless Chromium with the website's player libraries) |

Fixtures prove logic. Only the last two columns say anything about availability, and they describe
one network on one day: a cloud address in the United States, 2026-11-24 and 25. No run from a
home connection has been made.

## 1. The twelve legacy providers

All twelve are now SDK modules in `packages/providers` (two of them rule packs, with no code).
The server-only classes are removed. Nothing is wrapped in the compatibility adapter any more
except the three classes that were already disabled upstream (`02moviedownloader`, `anyembed`,
`fmovies4u`), which are left untouched.

What every port changed: requests go through the policy-enforced `ctx.fetch` (the classes called
the global `fetch`); addresses moved to the domain config; Node `crypto` and `Buffer` became
WebCrypto and plain byte helpers, so the module also runs in an edge function, the extension or an
app; errors are thrown as typed failures instead of being caught and returned as an empty list.
That last point matters for diagnosis: before, an outage looked like "not found".

| Provider | Was | Is now | Needs | State of the live site (cloud address, 2026-11-24/25) | Stage |
|---|---|---|---|---|---|
| `cinesu` | Class: playlist address built from the TMDB id | Rule pack | Referer/Origin headers | `cine.su` redirects to `koddo.to`; the playlist path there answers 403 | canary |
| `fsharetv` | Class: film page by IMDb id → watch page → file API | Module (films only) | IMDb id; headers | `fsharetv.cc` resolves but does not connect. `fsharetv.co` answers, but not at the same path (404) | canary |
| `icefy` | Class: one API call returns a playlist | Rule pack | Headers | Site root answers with a browser check; the API path answered 500 | canary |
| `peachify` | Class: six back-ends, AES-GCM-sealed answers | Module (WebCrypto) | Headers | Both API hosts are gone from DNS; the site answers with a browser check | canary |
| `popr` | Class: ten servers, each stream opened before it is offered | Module (probes with a capped read) | Headers | Resolves, does not connect (the domain's registration is reported expired) | canary |
| `streammafia` | Class: session cookie → token → AES-256-GCM answer → other audio versions | Module (WebCrypto) | Cookies and custom headers, so a server or an app | Resolves; connections time out | canary |
| `tulnex` | Class: fourteen back-ends, four-layer payload | Module (WebCrypto, PBKDF2) | Nothing special | API host is gone from DNS | canary |
| `videasy` | Class: back-ends answer an encrypted blob, decoded by a third-party service | Module, updated to the API's current seed-based flow | Headers; the third-party decoder `enc-dec.app` | The old API hosts do not answer; the new one refuses this network (403). Not validated | canary |
| `vidnest` | Class: ten back-ends, shuffled-alphabet base64 | Module. With a browser it opens the site's own player page; the API path is kept for the day it works again | A browser worker | The API answers 403 "missing or invalid nonce". Through the browser runtime: verified streams | **stable** (browser) |
| `vidrock` | Class: AES-encrypted id → table of servers | Module (WebCrypto) | Headers | The API answers in the expected shape with every server empty; subtitles answer | canary |
| `vidsrc` | Class: iframe → inline address → `file:` with host placeholders | Module: reads that layout when it is served; otherwise offers the site's own player as a frame | Headers | The site now loads its player through a run-time gate (short-lived host-bound token, automation detection). The port does not go through it; it returns the frame | canary |
| `vidzee` | Class: wrapped key + fourteen servers with AES-CBC links | Module (WebCrypto) | Headers | The key endpoint answers 404 and the server API returns the site's page: the protocol is gone | canary |

Not faithful copies, by decision:

- **vidsrc**: the gated player is not extracted. A frame is the way an embed service is meant to
  be used, and it is what the website already falls back to.
- **videasy**: follows the site's move to a new API. It still hands the blob to the third-party
  decoding service the class used; that service sees the title id of each lookup and is a single
  point of failure. Canary, and a candidate for removal if that dependency is unwanted.
- **vidnest**: the nonce the API now wants is not reproduced. Where a browser exists the site's own
  page makes the call itself.
- **streammafia**: download links use their own address (the class reused the playlist address
  for them, so they never appeared).

What could not be migrated: nothing. What could not be *verified* is most of them, for the reasons
in the table; `canary` is where they wait. A server promotes a canary by itself after three
monitor checks in a row with a verified stream (`PROMOTE_CANARY_AFTER`), so a home server on a
network that reaches these sites will bring back the ones that work there without anyone acting.
By hand: `npm run registry -- stage vidrock stable --reason "…"` or
`POST /v2/admin/providers/vidrock {"stage":"stable"}`.

Licence note. The legacy classes came from `cinepro-org/core`, which is published under
PolyForm Noncommercial 1.0.0. The ports are derived from them, so that licence's terms apply to
these twelve modules as they applied to the classes. This repository has no root LICENSE file.
Whether that is acceptable is the owner's decision; it is flagged here rather than assumed.

## 2. New in this phase

| Provider | Source | How it works | Stage |
|---|---|---|---|
| `vidlink` | Written for this pack (a rule pack, no code) | Opens the embed player page in the browser runtime and emits the manifest the page asks for | stable (needs a browser worker) |
| `anime-animotvslash`, `anime-shonen`, `anime-zokoanime`, `anime-animeheaven`, `anime-megavid` | Adapted from `Seanime-contributions/Seanime-Providers` (MIT) | Anime entries by AniList or MyAnimeList id, or searched by title with the shared matcher; sub/dub where the site distinguishes | four stable, `anime-megavid` canary |

Tried and not added:

| Candidate | Why not |
|---|---|
| AnimeGG (Seanime) | Extraction worked, but no stream could be verified: files are served from a port this network does not carry, and the site's search timed out on the second day |
| Megaplay (Seanime) | Needs a third-party decoding service |
| VidCore, VaultPlayer, 2Embed/xpass (Mediamash, MIT) | The published flows are stale: the APIs now answer "playback verification required", "missing playback grant", or an encrypted data response. Their pages did not yield a verifiable stream in the browser runtime either |
| Other embed pages tried in the browser runtime (`vidsrc.cc`, `vidsrc.to`, `vidsrc.dev`, `vidfast.pro`, `111movies.com`, `multiembed.mov`, `vidcore.org`) | A browser check, a run-time gate, a moved domain, or no media request without further interaction |
| Providers for Indian catalogues (HDHub4u, 4KHDHub, MoviesDrive, Einthusan and others) | The only maintained code is under copyleft or no licence (ECOSYSTEM.md 6.3, 6.4). A licence decision comes first |

## 3. Status of every integration

Live and playback columns are from one run: `data/bench-final-cloud.json`, 34 titles (6 of them
anime entries), from a cloud address on 2026-11-25 with the browser runtime on. "Verified" and
"started" are defined at the top. The run starts at most three verified streams per title in the
player, spread over providers, so "not tried" is not a failure.

| Provider | Implemented | Unit-tested | Integration-tested | Live-validated | Playback-validated |
|---|---|---|---|---|---|
| `castle` | yes | yes | contract check | **yes**: a verified stream for 30 of 34 titles (55 streams) | **yes**: 40 of 40 tried started |
| `vidlink` (rule pack + browser) | yes | yes, with a stand-in worker | through the engine | **yes**: 23 of 34 titles (23 streams; DASH manifests) | 2 of 2 tried started. 21 more were not tried: they are HEVC, which the test browser cannot decode |
| `vidnest` (browser path) | yes | yes | contract check (API path); stand-in worker (browser path) | **yes**: 12 of 34 titles (12 streams) | **yes**: 5 of 7 tried started (two MKV files did not); 2 HEVC not tried |
| `anime-animotvslash` | yes | yes | contract check | **yes**: 6 of 6 anime entries (12 streams) | **yes**: 6 of 6 tried started |
| `anime-shonen` | yes | yes | contract check | **yes**: 6 of 6 (10 streams; 2 more did not answer) | **yes**: 5 of 5 tried started |
| `anime-zokoanime` | yes | yes | contract check | **yes**: 6 of 6 (6 streams) | **yes**: 6 of 6 tried started |
| `anime-animeheaven` | yes | yes | contract check | **yes**: 5 of 6 (5 streams; one title is not in its catalogue) | not tried |
| `anime-megavid` | yes | yes | contract check | 1 of 6 (5 other streams timed out when tried) | not tried |
| `febbox` | yes | yes | contract check | not run: needs the viewer's own account token | no |
| `vixsrc` | yes | yes | contract check | not run: only planned on a viewer's own connection (its site answers a cloud address with a browser check) | no |
| `vidsrc` | yes | yes | contract check | no stream to verify: it returned its player page as a frame for all 34, which cannot be tried without a browser | no |
| `vidrock` | yes | yes | contract check | no: the API answered with every server empty for all 34 | no |
| `icefy` (rule pack) | yes | yes | contract check | no: HTTP 500 for 20, nothing for 14 | no |
| `popr` | yes | yes | contract check | no: nothing for 31, did not connect for 3 | no |
| `fsharetv` | yes | yes | contract check | no: did not connect (films only: 19 of 20) | no |
| `streammafia` | yes | yes | contract check | no: timed out for all 34 | no |
| `videasy` | yes | yes | contract check | no: refused (HTTP 403) for all 34 | no |
| `vidzee` | yes | yes | contract check | no: `STRUCTURE_CHANGED` (the key endpoint is gone) | no |
| `tulnex` | yes | yes | contract check | no: its API host is gone from DNS (seen as a timeout through this network's proxy) | no |
| `peachify` | yes | yes | contract check | no: its API hosts are gone from DNS (same) | no |
| `cinesu` (rule pack) | yes | yes | contract check | no: `REDIRECTED` for all 34 | no |
| Vendored fallback pack (`sv-*`, 15 sources) | yes (vendored, unchanged) | manifest checks only | loaded through the engine | 2 of 15 returned a verified stream: `sv-cuevana3` (2 titles), `sv-lookmovie` (1) | `sv-cuevana3`: 1 of 1 started; `sv-lookmovie`: 0 of 1 |

Read down the last two columns: ten providers returned a stream that verified, seven of them
also had a stream start in the player. At the baseline, on the previous day from the same
address, those numbers were two and two.

## 4. Other integrations

| Integration | Implemented | Unit-tested | Integration-tested | Live-validated | Playback-validated |
|---|---|---|---|---|---|
| Browser runtime (`packages/browser-runtime`) | yes | 14 tests in a real Chromium against a local fixture site | Through the engine, with a code provider and a rule pack | `vidlink.pro` and `vidnest.fun` player pages yielded verified streams; `vidsrc.cc` reported as a browser check | Through the providers that use it (table above) |
| Stream verification (`validateStream`, `verify` lines) | yes | yes | Server and client tests | Every live number in AVAILABILITY.md comes from it | n/a |
| Domain diagnosis | yes | yes | Server test | Run over all configured addresses (`data/domains-cloud-2026-11-24.md`) | n/a |
| Domain trials and automatic rollback | yes | yes | Server test, end to end through the admin API | No live trial was run (no address was found that passes validation) | n/a |
| Canary graduation | yes | Server test | Server test | Not observed live (nothing is deployed) | n/a |
| Anime identity mapping, AniList titles, AniSkip | yes | 113+ tests with real data samples | Browser check with canned responses | AniList, AniSkip and the mapping list answered with the expected shapes | n/a |
| Sports stream directory (PPV `GET /api/streams`): live events, upcoming events and always-on channels, each opened in the directory's own player in a frame | yes (`packages/content/src/sports/directory.ts`, the Sports pages) | 7 tests over a cut-down sample of the real response | 76 browser checks (`apps/web/e2e/modes.mjs`) with the sample and a stand-in player page | The API: yes, on 2026-11-25 (206 streams in 10 categories, CORS open, read by curl and by a real browser). Its second address (`api.ppv.cx`) did not connect from here | **No.** The player page is 269 KB of obfuscated script with no stream address in it, so nothing is extracted; and it refused the test browser, so the frame itself was not seen playing |
| TheSportsDB schedules, iptv-org channels, official link-outs | yes | yes | Browser check with canned responses | The APIs answered with the expected shapes; a curl sample of 13 channel streams found 7 answering | No real channel was played in a browser |
| DASH playback in the website's player | yes | n/a | 56 browser checks with generated DASH, HLS and MP4 streams (`apps/web/e2e/playback.mjs`) | A live DASH manifest (VidLink) verified; it is HEVC | A generated DASH stream plays in the player. A live one did not get tried: the test browser has no HEVC decoder |
