# Source availability: what was measured, why it is low, what changed

Everything here is a measurement with its place and date, or is marked as not measured. The raw
runs are in `docs/platform/data/`; the benchmark that produced them is `packages/bench`
(OPERATIONS.md section 7 has the commands).

## 1. How it is measured

A fixed set of 34 titles: 7 Western films (1942 to 2024), 6 Western series, 6 anime (2 films, 4
series, each asked for both as a TMDB title and as an anime entry), 9 Indian titles (Hindi,
Telugu, Tamil, Malayalam, Kannada; 8 films and a series) and 6 titles in Korean, Spanish, French,
German and Portuguese. Every TMDB and IMDb id was checked against Wikidata.

For each title every provider is asked, and four numbers are kept apart:

| Count | Means |
|---|---|
| Discovered | Streams an extraction returned. A URL, nothing more |
| Unique | The same, after removing the same upstream file found by several providers |
| Verified | Unique streams whose manifest parsed and whose first media bytes answered (or, for a file, its header). At most four small requests per stream; nothing is downloaded |
| Started | Verified streams that showed a moving picture in a real browser player: headless Chromium with the website's own player libraries, with the required request headers added the way the helper extension adds them |

Reports never contain stream addresses. A run made against canned responses is labelled
FIXTURES in every table it appears in; all runs below are live.

Where the runs were made:

| Run | From | When |
|---|---|---|
| `baseline-hosted` | The hosted production server (`jelly.up.railway.app`, the build before this branch), through its public API; streams tried through its relay | 2026-11-24 |
| `baseline-cloud` | The branch as it stood before this phase, as a server on a cloud machine in the United States (behind an HTTPS egress proxy) | 2026-11-24 |
| `final-cloud` | This branch, in-process on the same cloud machine, with a browser worker | 2026-11-25 |

## 2. Baseline

**The hosted server returned nothing for any of the 34 titles.** Its own health table, captured
after the run (`data/hosted-health-2026-11-24.json`), lists 29 providers: 14 fail with a
connection-level error after 9.5 s on average (the HTTP client's ten-second connection timeout),
5 run into the 15 s provider limit, 1 is answered HTTP 403, and 9 report no error text (the legacy
classes, which reported failures as "nothing found"). Castle is among the connection failures
there: 1 success, 19 failures.

**The same code from another cloud address found streams for 30 of 34 titles**, but almost all
from one provider:

| Measure | Baseline (cloud) |
|---|---|
| Providers registered | 31 |
| Providers that got an answer from their site (streams or "not here") | 18 |
| Providers that returned a stream | 3 |
| Providers with a verified stream | 2 (Castle: 54 streams; one other: 1) |
| Unique streams, verified | 58, 55 |
| Started in the player | 44 of 44 tried |
| Titles with a verified stream | 30 of 34 |
| Titles with verified streams from two or more providers | 1 of 34 |
| Mean provider response time; median time to first result; to first verified stream | 2.8 s; 1.6 s; 2.3 s |

So the picture before this phase: on the hosted server, nothing; elsewhere, one provider carrying
everything. If Castle's API moves or closes, availability goes to about zero.

## 3. Why sources are insufficient

The ten possible causes in the brief, each with what the measurements say.

| Cause | Verdict | Evidence |
|---|---|---|
| Insufficient provider integrations | Not in number, yes in working number | 31 registered at baseline, 2 with a verified stream |
| Provider domains becoming unavailable | **Major** | Of the 23 addresses the first-party providers are configured with, 3 names no longer exist in DNS, 1 site has moved, 3 do not connect (`data/domains-cloud-2026-11-24.md`). All four anime sources of the vendored pack point at dead hosts (ECOSYSTEM.md 6.2) |
| Network restrictions | **Major** | From the cloud address, 3 addresses answer with a browser check and 2 refuse outright; `CHALLENGE` and `ACCESS_DENIED` account for 105 provider runs in the final benchmark |
| Provider execution location | **Decisive for the hosted server, and not simply "data centre versus home"** | The hosted server fails at the connection level for providers that answer from another cloud network (Castle among them). Section 4 |
| JavaScript-rendered websites | Real | Two sites (VidLink, VidNest) yield nothing to plain requests and verified streams when their own player page is opened in the browser runtime: 35 verified streams in the final run |
| Changed extraction logic | **Major** | VidZee's key endpoint is gone; VidNest's API wants a nonce; VidSrc moved its player behind a run-time gate; Videasy moved its API and its decoder changed interface; CineSu's playlist path is refused on its new host. The published flows of three candidate new sources (VidCore, VaultPlayer, 2Embed) were stale within three months of their last commit |
| Session requirements | Minor | One provider needs a cookie session (and is unreachable anyway); two candidate sources now want a "playback grant" |
| Unsupported playback formats | Secondary | VidLink serves DASH with HEVC video: the website had no DASH player (now it has), and HEVC depends on the device. MKV files on file hosts remain unplayable in browsers |
| Provider-specific dependencies | One case | Videasy depends on a third-party decoding service, which changed its interface |
| Incomplete legacy migration | **It hid the picture** | Seven of the twelve legacy classes reported "nothing found" for all 34 titles while their sites were dead, moved or refusing. As ported modules they now report DNS, CONNECT, CHALLENGE or STRUCTURE_CHANGED |

In short: the provider set had rotted (dead names, changed sites), nothing reported it as rot,
the one host it all ran on cannot connect to most of what is left, and a few sites need a real
browser.

## 4. Where providers can run

What could be measured, and what could not:

| Environment | Measured how | Result |
|---|---|---|
| Existing hosted infrastructure | 34 titles through its public API, and its own health table | 0 of 34. Connection-level failures for half its providers, averaging 9.5 s |
| A cloud machine elsewhere | The benchmark, baseline and final | 30 of 34, then 32 of 34 |
| A browser worker on that cloud machine | The final benchmark; a probe of 15 embed pages | Two sites yield verified streams this way and no other way; the rest answered with a browser check, a gate, a redirect, or nothing |
| Alternative cloud regions | **Not measured** | No access to other regions from where this was built |
| Local application / a home connection | **Not measured** | No home connection was available. `npm run bench --workspace packages/bench -- --target engine --egress user --label home` produces the same report there |
| Browser extension in a real browser | **Not measured** | The extension's protocol is tested with fakes; it has not been driven in a real browser here |

What follows from the two networks that were measured (`data/matrix.md` has every provider side
by side):

- **Connectivity.** The hosted server cannot open connections to hosts the other cloud network
  reaches in under a second. That is a property of that host's network path, not of data centres
  in general, and not of the providers.
- **DNS.** Asked over HTTPS, public DNS gives the same answers everywhere; three API names are
  simply gone. Inside the cloud machine's proxy a dead name surfaces as a timeout, which is why
  the domain diagnosis asks DNS directly.
- **Latency.** Where providers answer: 2.4 s mean per provider, 1.4 s median to the first result,
  2.1 s to the first verified stream.
- **Refusals.** Browser checks and refusals are tied to the network asking. They are the cases
  most likely to differ on a home connection, and the ones nothing here tries to get past.
- **Playback.** 65 of 68 verified streams tried in the player started. 23 more were set aside
  because they are HEVC and the test browser has no HEVC decoder; they are verified, not
  playback-validated.

Do not read this as "move to another cloud and it is fixed". It says the current host is the
first thing to look at, and that the answer has to be measured: deploy this branch there (its
health now says whether a failure is DNS, connection, timeout or refusal), run the benchmark
against it, and compare columns.

The capability model that came out of it is implemented rather than assumed:

- A provider declares what it needs (features, a viewer's own connection, a personal setting, a
  browser); a runtime declares what it has. That decides where it *can* run.
- Health is kept per provider and runtime, and each pair gets a placement from the kinds of
  failure seen: `works`, `blocked` (that network is refused), `unreachable`, `broken`. That
  decides where it *does* run: a blocked runtime is rested, with the reason given.
- `/v2/health` rolls the server's own runs and what viewers' devices report into one verdict per
  provider. One that is refused on the server and answers on viewers' connections reads
  `works-elsewhere`. It is not counted as broken, and clients run it locally.

## 5. After this phase

Final run, same cloud address, one day after the baseline:

| Measure | Baseline | Final | |
|---|---|---|---|
| Providers registered | 31 | 36 | |
| Providers that got an answer from their site | 18 | 21 | |
| Providers that returned a stream | 3 | 11 | |
| Providers with a verified stream | 2 | 10 | |
| Unique streams | 58 | 173 | 34 of the 173 are player pages (frames), which cannot be verified without a browser |
| Unique streams verified | 55 | 127 | |
| Started in the player | 44 of 44 tried | 65 of 68 tried | The final run tried three per title instead of two; 23 HEVC streams were not tried |
| Titles with a verified stream | 30 of 34 | 32 of 34 | Still none for Casablanca and Baahubali 2 |
| Titles with a stream that started | 30 of 34 | 31 of 34 | |
| **Titles with verified streams from two or more providers** | **1 of 34** | **27 of 34** | |
| Mean provider response time | 2.8 s | 2.4 s | |
| Median time to first result / first verified stream | 1.6 s / 2.3 s | 1.4 s / 2.1 s | |

By category (titles with a verified stream; verified streams; titles covered by two or more
providers in the final run):

| Category | Titles | Baseline | Final | Two or more providers |
|---|---|---|---|---|
| Western films | 7 | 6; 17 streams | 6; 24 streams | 4 |
| Western television | 6 | 6; 9 | 6; 18 | 6 |
| Anime | 6 | 5; 10 | 6; 52 | 6 |
| Indian cinema and TV | 9 | 8; 11 | 8; 16 | 6 |
| Other languages | 6 | 5; 8 | 6; 17 | 5 |

Where the verified streams came from in the final run: Castle 55, VidLink 23, VidNest 12,
AnimoTVSlash 12, Shonen 10, ZokoAnime 6, AnimeHeaven 5, two sources of the vendored pack 3,
Megavid 1.

Why provider runs failed in the final run (a provider run is one provider asked for one title):
timeout 187, browser check 59, refused 46, extraction no longer fits 36, certificate rejected 36,
stopped at the provider time limit 35, redirected to another host 34, could not connect 22, HTTP
error 21. The side-by-side report is `data/compare-baseline-final.md`.

What the improvement consists of, so it is not overstated:

- **Anime** went from two providers with a verified stream to nine, on evidence: five new
  providers and the two browser-backed ones.
- **Redundancy** is the real change for films and series: most titles no longer depend on Castle
  alone. Two of the three providers behind that need a browser worker on the server.
- **Indian titles** gained streams from the browser-backed providers, but no provider dedicated to
  Indian catalogues was added (the maintained code for those is under copyleft or no licence).
  Baahubali 2 has no verified stream.
- **The twelve ported legacy providers contribute one working provider** (VidNest, through the
  browser). The other eleven do not return a verified stream from this address.
- **Nothing here is deployed.** The hosted server still returns nothing.

## 6. Targets

These are written with the final numbers in hand, so they are the bar for the next measurement,
not a test this phase passed.

| Target | Reference (cloud address) | To be measured |
|---|---|---|
| The hosted server, running this branch, reaches what the same code reaches from another cloud address: a verified stream for at least 30 of 34 titles; or its health shows, provider by provider, the typed reason it does not | 32 of 34 | After a deploy. Today: 0 of 34 |
| A run from a home connection exists, with the provider matrix next to the cloud one | none | Not yet made |
| Verified streams from two or more providers for at least 80% of titles | 27 of 34 (79%) | Every run |
| Every Indian title covered by two or more providers | 6 of 9 | Needs dedicated providers, which needs the licence decision |
| At least 95% of the verified streams tried in the player start | 65 of 68 (96%) | Every run; HEVC to be checked in a browser that decodes it |
| Median time to the first verified stream at most 2.5 s | 2.1 s | Every run |

## 7. Limits of these measurements

- One cloud address, two consecutive days. Sites of this kind change weekly.
- That machine's traffic leaves through an intercepting HTTPS proxy. Certificate failures (36
  provider runs, all in the vendored pack) and the way dead names show up as timeouts may be
  artefacts of it.
- "Started" means the first moments of playback in headless Chromium, not a whole film, and not
  the helper extension in a real browser.
- Episodes are first episodes; anime entries were checked subbed.
- A stream bound to the address that found it is left unchecked from a server. None was met in
  these runs, because the providers that produce such links did not run from a cloud address.
- The hosted server was measured from outside. What its connections fail on (DNS, routing, an
  egress rule) is not known until this branch, which records that, runs there.
