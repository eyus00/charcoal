# Provider ecosystem: what can be reused

Research only. Nothing in this document was integrated, and no third-party scraper was run. It
builds on the first round (`research/charcoal-streaming-architecture/README.md`, Part 2) and
re-checks what that round listed.

Date of all checks: **2026-11-24**. Raw probe data: [`data/ecosystem-probes.json`](data/ecosystem-probes.json)
(271 rows).

## 1. Summary

1. **No project can be integrated as it is.** Every code candidate has its own provider contract,
   and most use `cheerio`, `crypto-js` or Node built-ins that the Charcoal SDK does not allow.
   Reuse means porting single providers to `defineProvider` or to a rule pack. Only data sources
   and HTTP contracts (iptv-org, sports schedule APIs, anime id maps, the Stremio addon contract)
   can be used directly.
2. **The upstream of the 12 legacy server providers is stalled.** `cinepro-org/core` has had no
   commit since 2026-05-27. Charcoal's copies are byte-identical to that last commit (one local
   3-line addition in `fshare`). The maintainers announced a rewrite in June and, in September,
   told users to move to another project. Newer versions of some of these providers exist only
   in two forks and in other ecosystems (section 5). The licence is PolyForm Noncommercial 1.0.0,
   which also covers the copies Charcoal already holds.
3. **Three permissively licensed pools are worth porting from**, in this order:
   - `Seanime-contributions/Seanime-Providers` (MIT, last commit 2026-11-21): anime sources
     written against a `fetch`-only contract. Of the 19 hosts probed for it, 16 answered 200
     directly, two after a redirect and one with a challenge.
   - `Mediamash-org/backend` (MIT, last commit 2026-08-24): 13 provider plugins in the CinePro
     shape, including the current Videasy API shape (seed endpoint) under a licence that allows
     porting.
   - The MIT movie-web forks (`ThePrimeDev/pstream-providers` 2026-10-19, `steveyout/providers`
     2026-11-17, `thingfoil/providers` 2026-07-24): about 40 embed-host resolvers and a handful
     of sources whose hosts still answer. More than twenty of the roughly fifty source hosts
     probed for these forks are gone (section 4.3).
4. **The most current scraper code is copyleft or unlicensed.** The freshest pool by far is the
   Nuvio plugin family (`codeberg.org/eclipsia/nuvio-plugin`, AGPL-3.0-or-later, committed
   today) and `Zenda-Cross/vega-providers` (no licence file, committed today). Both are useful as
   a description of how a site currently behaves. Copying code from them makes the result a
   derivative work under their terms, or, where no licence is stated, is not permitted at all.
5. **VidNest's "nonce" is documented in public code.** `eclipsia/nuvio-plugin`
   (`providers/quinox.js`) sends a random 22-character `_n` query parameter and decrypts a
   `{v:2, d, n}` reply. A GET in that form returned HTTP 200 with that shape today (section 5.3).
6. **Sports and live TV have usable legitimate inputs**: the iptv-org API and database, the
   Free-TV playlist, OpenF1, TheSportsDB (new test key), and the public NHL, MLB and ESPN
   schedule endpoints all answered today.

## 2. How things were checked

| Claim | Method |
|---|---|
| "Last commit" | `git clone --depth 1` of the default branch (or the named branch) over HTTPS, then `git log -1 --format=%cI`. For Codeberg the same, plus the Codeberg API `updated_at`. For npm packages, the registry document's `time` field |
| "Not public" | The clone asked for credentials (`could not read Username`), which is what GitHub answers for a repository that is private, removed or renamed without redirect |
| "Archived" | Only where stated, read from the GitHub web page through a fetch tool. `git` cannot see this flag, so for most rows it is unknown |
| Licence | `LICENSE*` file in the clone (**LF**), `license` field of `package.json` (**PJ**), README statement only (**RM**), or **none stated** |
| Architecture, runtime needs, hosts | Reading the cloned source. Host lists were extracted with `grep` and then read by hand for the deep-dives |
| Host state | One DNS-over-HTTPS lookup (`cloudflare-dns.com`, A then AAAA) and one `curl` GET with a desktop browser User-Agent and a 20 s limit, through this sandbox's egress proxy, TLS verification on |

Reading the probe results:

- Every host state in this document was **measured from a cloud address on 2026-11-24**. A home
  connection can get a different answer, in both directions.
- **"200" means the front page or the named endpoint answered a plain GET.** It does not mean a
  provider for that site returns a playable stream. No extraction was attempted, no playlist was
  fetched, nothing was decrypted.
- "challenge" is a Cloudflare managed challenge (`cf-mitigated: challenge` or the "Just a
  moment..." page). "blocked" is a Cloudflare block page ("Attention Required", error 1005/1020).
  Neither was retried or worked around.
- "DNS failure" means the name returned SERVFAIL on two public resolvers (`cloudflare-dns.com`
  and `dns.google`) because the domain's own name servers refused or did not answer. This is
  different from NXDOMAIN (the name does not exist) and from "no A record" (the name exists and
  has no address). A home ISP resolver was not tried. In the JSON these rows have
  `dns: "unknown"`.
- "no connect" is the egress proxy answering 502 to `CONNECT` while DNS resolves. "TLS error" is
  `curl` exit 60 (certificate not verifiable from here); the cause was not established.
- "parked" is a registrar or for-sale page served with HTTP 200.

## 3. Candidate table

Abbreviations: **LF/PJ/RM** as above. "Fit" is against the Charcoal SDK contract
(`docs/platform/SDK.md`): only `ctx.fetch`, no Node built-ins, no DOM, WebCrypto only.
Recommendation is one of *integrate directly*, *port* (named providers), *reference only*, *skip*.

### 3.1 Movie-web lineage and CinePro family

| Project | Last commit | Public code | Language | Licence | Provider shape and result | Runtime needs | Fit | Recommendation |
|---|---|---|---|---|---|---|---|---|
| `github.com/steveyout/providers` | 2026-11-17 (branch `production`) | Yes | TypeScript | MIT (LF, PJ) | `makeSourcerer({id, rank, flags, scrapeMovie, scrapeShow})` and `makeEmbed({id, scrape})`. Returns `{embeds[], stream[]}`; a stream is `{type: 'hls'\|'file', playlist\|qualities, headers, captions, flags}` | Injected `fetcher`/`proxiedFetcher`. `cheerio`, `crypto-js`, `unpacker`, `hls-parser`, `fuse.js`. `puppeteer` in devDependencies | Port needed (replace `cheerio` with `extract.parseHtml`, `crypto-js` with WebCrypto or small pure functions) | **Port** `fsharetv`, `lookmovie`, `zoechip`, `m4ufree`, `multiembed`, `primesrc`. Ten of its eleven commits since 2026-10-27 are about `youplex`, a bridge to a closed hosted API (`api.youplex.site/scrape`); that is not reusable code |
| `github.com/ThePrimeDev/pstream-providers` | 2026-10-19 | Yes | TypeScript | MIT (LF, PJ) | Same | Same | Port needed | **Port** the embed resolvers (40 files: `voe`, `filemoon`, `streamwish`, `mixdrop`, `dood`, `streamtape`, `vidhide`, `filelions`, `okru`, `vk`, `vidmoly`, `supervideo`, `dropload`, ...) and, if Hungarian is wanted, its roughly 20 Hungarian sources |
| `github.com/thingfoil/providers` | 2026-07-24 | Yes | TypeScript | MIT (LF, PJ) | Same | Same | Port needed | Reference only. Four months without a commit. Unique files: `mapple`, `vidrock`, `vidzee`, `vixsrc`, `watchanimeworld` |
| `github.com/loak7993-code/streamviva-providers` | 2026-09-26 | Yes | TypeScript | MIT (LF, PJ) | Same | Same | Already wrapped (`packages/streamviva`) | Keep. No commit since the vendored one |
| `github.com/badwinton/pstream-providers`, `sussy-code/providers`, `zisra/providers` | 2025-07-21, 2025-01-30, 2024-04-01 | Yes | TypeScript | MIT (LF) | Same | Same | n/a | Skip (abandoned) |
| `github.com/p-stream/providers` | n/a | **No** (clone asks for credentials) | n/a | n/a | n/a | n/a | n/a | Skip |
| `codeberg.org/pee/{backend,proxy,desktop,extension}` | 2026-11-14, 11-01, 11-10, 11-14 (Codeberg API) | Yes, but **no provider code** | TypeScript, JavaScript | GPL-3.0 per round one; not re-read | n/a | n/a | n/a | Reference only, for the bridge and desktop shell as before |
| `github.com/cinepro-org/core` | 2026-05-27 (`main` and `dev`) | Yes | TypeScript | **PolyForm-Noncommercial-1.0.0** (LF) | `class X extends BaseProvider` with `getMovieSources(media)`, `getTVSources(media)`. Returns `ProviderResult {sources[], subtitles[], diagnostics[]}`; URLs wrapped by `createProxyUrl(url, headers)` | Node 20, `@omss/framework`, `cheerio`, `crypto-js` | Licence forbids commercial use; upstream stalled | Reference only. See section 5 |
| `github.com/Jules-Astier/core` (fork) | 2026-11-21 | Yes | TypeScript | PolyForm-Noncommercial-1.0.0 (LF) | Same, plus a provider catalogue with lifecycle states | Node; Playwright for some live providers | Same licence problem | Reference only. The most current copy of the legacy providers (section 5.2) |
| `github.com/simoabid/cineflix-core` (fork) | 2026-10-29 (provider work ended 2026-07-28) | Yes | TypeScript | PolyForm-Noncommercial-1.0.0 (LF) | Same | Node; WebAssembly; optional Playwright; a residential-proxy fetch helper | Same licence problem | Reference only |
| `github.com/Mediamash-org/backend` | 2026-08-24 | Yes | TypeScript | **MIT** (LF; GitHub sidebar) | Same `BaseProvider` shape, one npm-style plugin per provider under `plugins/` | Node 20.6, `@omss/framework` 1.1.26. Two plugins import `node:crypto`; the rest use `fetch` and regular expressions | Port needed, small | **Port** `videasy-provider`, `vidcore-provider`, `vaultplayer-provider`, `filmo-provider`, `twoembed-provider`, `streamingunity-provider`, `netmirror-provider` (section 4.2) |
| `@vyla-entertainment/sdk` (npm; repository now `gitlab.com/vyla-entertainment/sdk`) | npm 1.33.0 on 2026-11-20; the GitHub copy stopped 2026-08-04 | Yes (npm tarball) | JavaScript (ESM) | **CC-BY-NC-4.0** (LF in tarball, PJ) | `getStream(source, tmdbId, s, e)` returning `{url, headers, quality, type}`; 75 source modules | Node 18+ | Non-commercial licence | Reference only. It no longer ships `vidnest` or `videasy` modules |
| `github.com/omss-spec/core` | 2026-09-10 (0.0.2) | Yes | TypeScript | MIT (LF, PJ) | Plugin host, beta | Node | n/a | Skip (unfinished) |
| `github.com/Inside4ndroid/TMDB-Embed-API` | 2026-08-19 | Yes | JavaScript | MIT (LF) | Node server with a provider registry | Node | Port needed | Reference only |

### 3.2 Nuvio plugins, Vega, Stremio addons

| Project | Last commit | Public code | Language | Licence | Provider shape and result | Runtime needs | Fit | Recommendation |
|---|---|---|---|---|---|---|---|---|
| `codeberg.org/eclipsia/nuvio-plugin` | 2026-11-24 | Yes | JavaScript | **AGPL-3.0-or-later** (LF, RM) | One file per scraper: `getStreams(tmdbId, mediaType, season, episode)` returning `[{name, title, url, quality, headers}]`. 51 scrapers | Global `fetch`; 7 files use `cheerio`, 2 `crypto-js`; several carry their own pure-JS SHA-256/AES | Port is easy technically; the result would be AGPL | Reference only for behaviour (VidNest v2, Vidrock, VidLink, VidFast, Castle, MovieBox, 4KHDHub, MoviesDrive, anime sites) |
| `github.com/yoruix/nuvio-providers` (same repository as `tapframe/nuvio-providers`: both names return the same six branch heads) | `main` 2026-06-07 (default branch `template` 2026-02-12) | Yes | JavaScript | GPL-3.0 (LF, PJ; GitHub sidebar) | Same; 34 scrapers | `cheerio-without-node-native`, `crypto-js`; one uses `ws`, one `axios` | GPL derivative if ported | Reference only (Castle was ported from it; the vendored copy has been removed) |
| `github.com/NuvioPlugin/All-in-One-Nuvio` (`D3adlyRocket/All-in-One-Nuvio` returns the same commit) | 2026-10-02 | Yes | JavaScript | **Unclear**: README says GPL-3.0 "see the LICENSE file"; there is no LICENSE file and the GitHub sidebar shows none | Same; 66 scrapers, some bundled with Node shims | Mixed | Not portable without a licence | Reference only |
| `codeberg.org/CENSORED/Nuvio-Plugin` | 2026-09-18 | Yes | JavaScript | GPL-3.0 (LF, RM) | Same; 15 scrapers, Indian sites, with a `domains.json` | `cheerio` | GPL derivative | Reference only |
| `github.com/falsisdev/anthology` | 2026-11-23 | Yes | JavaScript | **Conflict**: LICENSE file is GPL-3.0, `package.json` says MIT | Same; 42 scrapers, Turkish sites and Turkish channel lists | `cheerio`, bundling | Treat as GPL | Reference only (Turkish) |
| `github.com/mooncrown04/nuviotr` | 2026-11-05 | Yes | JavaScript | None stated | Same; 18 scrapers, Turkish | Mixed | No licence | Skip |
| `github.com/phuanh004/direct-streams-providers` | 2026-11-15 | Yes | JavaScript | GPL-3.0 (PJ only; no LICENSE file) | Same; 3 scrapers (`7movies`, `movy`, `flystream`); builds for QuickJS and for a Workers addon | Build step | GPL | Reference only (build layout) |
| `michat88/nuvio-providers`, `Abinanthankv/NuvioRepo` | 2025-12-30, 2026-01-20 | Yes | JavaScript | GPL-3.0 (LF) | Same | n/a | n/a | Skip (stale; the second is reported archived) |
| `phisher98/phisher-nuvio-providers`, `nvmindl/nuvio-providers` | n/a | **No** (clone asks for credentials) | n/a | n/a | n/a | n/a | n/a | Skip |
| `github.com/Zenda-Cross/vega-providers` | 2026-11-24 (several commits a day) | Yes | TypeScript | **None stated**: no LICENSE file, no licence in the GitHub sidebar. `package.json` has `"license": "ISC"`, which is the value `npm init` writes by default | One folder per site: `catalog.ts`, `posts.ts`, `meta.ts`, `episodes.ts`, `stream.ts`. `getStream({link, type, signal, providerContext})` returns `[{server, link, type, quality, subtitles, headers}]`. The provider is given `axios`, `cheerio`, a base-URL lookup and shared file-host extractors. 69 provider folders, 17 extractors | `axios` and `cheerio` in providers. The repository's own test harness uses `curl-cffi-node` (TLS impersonation) and `zlib`. 11 WebAssembly uses | Port needed, and the contract is "browse a site by link", not "look up by TMDB id", so a title search step has to be added | **Use `urls.json` as a domain feed** (53 current site addresses, updated by a bot). Port code only after the author states a licence. Candidates then: `hdhub4u`, `4khdhub`, `drive` (MoviesDrive), `mod`, `uhd`, `vega`, `multi`, plus extractors `hubcloud`, `gdflix`, `vcloud` |
| Stremio addon contract, `github.com/Stremio/stremio-addon-sdk` | 2026-11-01 | Yes | JavaScript | MIT (LF, PJ) | HTTP: `/manifest.json`, `/stream/{type}/{id}.json` | Any HTTP client | **Direct** (a client is a few dozen lines) | **Integrate directly** as a provider type. `v3-cinemeta.strem.io` and `torrentio.strem.fun` manifests answered 200 (measured from a cloud address on 2026-11-24) |
| `github.com/webstreamr/webstreamr` | 2026-03-27; GitHub banner says archived 2026-04-10 | Yes | TypeScript | MIT (LF, PJ) | `Source` classes (site to embed URLs) and `Extractor` classes (embed to `{url, format, meta, requestHeaders}`) | Node; `axios`, `cheerio`, sqlite cache, `unpacker`; several extractors need a MediaFlow proxy | Port needed | Reference only (archived). Best-structured TypeScript for German, French, Italian, Spanish sources |
| `github.com/webstreamr-community/webstreamr`, `github.com/newman2x/WebStreamrMBG` | 2026-05-20, 2026-05-12 | Yes | TypeScript | MIT (LF, PJ) | Same; the first adds a `SOURCE_HEALTH.md`, the second adds MovieBox, Vidzee, FilmpalastTO and HubCloud fixes | Same | Port needed | Reference only (six months without a commit) |
| `github.com/qwertyuiop8899/StreamViX` | 2026-11-24 | Yes | TypeScript, Python helpers | GPL-3.0 (LF) | Stremio addon. Italian sources (`vixsrc`/`vixcloud`, `animeunity`, `animesaturn`, `animeworld`, `guardaserie`, `guardahd`, `eurostreaming`, `cb01`, `toonitalia`). It also contains live-sports resolvers; those were **not examined** | Node, Python, optional FlareSolverr | GPL; mixed scope | Reference only (Italian) |
| `github.com/UrloMythus/MammaMia` | 2026-10-25 | Yes | Python | MIT (LF) | Stremio addon, Italian sources | Python | Different language | Reference only |
| `github.com/Viren070/AIOStreams` | 2026-11-24 | Yes | TypeScript | AGPL-3.0-only (LF, PJ) | Aggregator of other addons | Server | Use over HTTP only | Reach through the Stremio contract; do not copy |
| `tapframe/NuvioStreamsAddon`, `zorosanma/Selfpro` | 2026-02-07, 2026-04-21 | Yes | JavaScript, TypeScript | MIT (LF); ISC (PJ, no file) | Addons | n/a | n/a | Skip (stale) |

### 3.3 Anime

| Project | Last commit | Public code | Language | Licence | Provider shape and result | Runtime needs | Fit | Recommendation |
|---|---|---|---|---|---|---|---|---|
| `github.com/Seanime-contributions/Seanime-Providers` | 2026-11-21 | Yes | JavaScript, TypeScript | **MIT** (LF; GitHub sidebar) | `class Provider { getSettings(); search({query, dub}); findEpisodes(id); findEpisodeServer(episode, server) }`. Returns `{server, headers, videoSources: [{url, type: 'm3u8'\|'mp4', quality, subtitles}]}`. 22 anime sources (plus manga and plugins, not relevant) | Seanime's embedded JS engine: global `fetch`, `LoadDoc` (jQuery-like HTML), `CryptoJS`. No Node APIs | **Port needed, the smallest of all candidates**: `fetch` to `ctx.fetch`, `LoadDoc` to `extract.parseHtml`, two `CryptoJS.AES` uses to WebCrypto | **Port** `animeheaven`, `animegg`, `zokoanime`, `megaplay`, `shonen`, `shiro`, `animotvslash`; by language `AnimeAV1` (es), `animesaturnmirror`, `animeunion` (it), `animetoast` (de), `anitube`, `animesfhd` (pt), `mynimeku` (id), `donghuastream` |
| `github.com/kRYstall9/Seanime-streaming-providers` | 2026-07-06 | Yes | TypeScript | MIT (LF) | Same contract; AnimeKai, AnimeUnity, AnimeSaturn, AnimeWorld, GojoWtf | Same | Port needed | Reference only (four and a half months without a commit) |
| `github.com/5rahim/seanime` | 2026-11-21 | Yes | Go | GPL-3.0 (LF) | The host application; defines the contract above | n/a | n/a | Reference only (contract and manifest format) |
| `github.com/pystardust/ani-cli` | 2026-11-20 | Yes | POSIX shell | GPL-3.0 (LF) | One script. Current flow: `hianime.at` search, episode list, server list, embed page, playlist | `curl`, `sed` | Different language; GPL | Reference only. A short, current description of the HiAnime chain |
| `github.com/sdaqo/anipy-cli` | 2026-10-30 | Yes | Python | GPL-3.0 (LF) | Provider classes: `allanime`, `animekai`, `anidbapp`, `animehub` | Python | Different language; GPL | Reference only |
| `consumet/consumet.ts`, `consumet/api.consumet.org`, `ghoshRitesh12/aniwatch-api`, `itzzzme/anime-api`, `yahyaMomin/hianime-API`, `LinearJet/hianime-API` | n/a | **No** (all six clones ask for credentials). npm still serves `@consumet/extensions` 1.8.8 (2026-01-20) and `aniwatch` 2.27.9 (2026-03-14), both MIT | TypeScript | n/a | n/a | n/a | n/a | Skip |
| `github.com/Eltik/Anify` | 2026-03-09 (a README edit) | Yes | TypeScript | None stated | n/a | n/a | n/a | Skip |
| `github.com/Kohi-den/extensions-source` (Aniyomi) | 2026-05-12 | Yes | Kotlin | Apache-2.0 (LF) | Aniyomi sources (236 extension folders) and 59 shared extractor libraries | Android/JVM | Kotlin | Reference only (six months without a commit) |
| `kodjodevf/mangayomi-extensions`, `yuzono/aniyomi-extensions` | 2025-10-01; not public | Yes; No | JavaScript/Dart | Apache-2.0 (LF) | n/a | n/a | n/a | Skip |

### 3.4 Cloudstream, resolver libraries, extractor collections

| Project | Last commit | Public code | Language | Licence | What it has | Fit | Recommendation |
|---|---|---|---|---|---|---|---|
| `github.com/recloudstream/cloudstream` | 2026-11-22 | Yes | Kotlin | GPL-3.0 (LF) | The app and a library with 105 embed-host extractor files; `MainAPI` (`search`, `load`, `loadLinks`) and `ExtractorApi` | Kotlin, JVM | Reference only (which hosts need which headers) |
| `github.com/phisher98/cloudstream-extensions-phisher` | `master` 2026-11-13, `builds` 2026-11-24 | **Source no longer public.** `master` holds a README and docs; `builds` holds 88 compiled `.cs3` plugins | Kotlin (compiled) | None stated | Compiled plugins only | Cannot be ported | Skip. Round one listed it as a porting source; that no longer holds |
| `github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension` | `master` 2026-11-21, `builds` 2026-11-21 | **Source not public** (README and logos on `master`, compiled plugins on `builds`) | Kotlin (compiled) | None stated | Compiled plugins only | Cannot be ported | Skip |
| `github.com/SaurabhKaperwan/CSX` | 2026-10-02 | Yes | Kotlin | None stated | Bollyflix, CineStream, MoviesDrive, Moviesmod, VegaMovies | Kotlin; no licence | Reference only |
| `recloudstream/extensions` | 2026-05-22 | Yes | Kotlin | None stated | YouTube, Dailymotion, Internet Archive, Twitch, Invidious | Kotlin | Reference only |
| `hexated/cloudstream-extensions-hexated`, `keyiflerolsun/Kekik-cloudstream` | 2024-03-12, 2025-03-13 | Yes | Kotlin | GPL-3.0 (LF) | n/a | n/a | Skip (abandoned). `Rowdy-Avocado/Rowdycado-Extensions` and `likdev256/likdev256-tamil-providers` are not public |
| `github.com/mhdzumair/mediaflow-proxy` | 2026-09-06 | Yes | Python | MIT (LF) | 26 extractor modules (`doodstream`, `filemoon`, `filelions`, `mixdrop`, `streamtape`, `streamwish`, `supervideo`, `uqload`, `voe`, `vixcloud`, `okru`, `vidmoly`, ...). It also has live-TV resolvers, not examined | Python | Reference only |
| `github.com/Gujal00/ResolveURL` | 2026-11-22 | Yes | Python | GPL-2.0 (LF) | 243 host resolver plugins, updated weekly | Python; GPL | Reference only. The most current record of which embed hosts changed |
| `github.com/yt-dlp/yt-dlp` | 2026-11-24 | Yes | Python | Unlicense (LF) | 940 extractor modules. Relevant: official free services (`mxplayer`, `puhutv`, `rai`, `ard`, `zdf`, `francetv`, `rtve`, `plutotv`, `tubitv`, `archiveorg`) | Python | Reference only, for official services |
| `github.com/streamlink/streamlink` | 2026-11-18 | Yes | Python | BSD-2-Clause (LF) | 136 plugins for official live broadcasters (`ard_mediathek`, `zdf_mediathek`, `raiplay`, `rtve`, `pluzz`, `pluto`, `nrk`, `svtplay`, `tvp`, ...) | Python | Reference only, for official live streams |
| `github.com/kuu/hls-parser` | 2026-11-22 (npm 0.16.2) | Yes | JavaScript | MIT (LF, PJ) | HLS playlist parser | Direct, but the SDK already has `extract.parseHls` | Not needed |
| `github.com/mnsrulz/unpacker` (npm `unpacker`) | 2021-05-05 | Yes | JavaScript | MIT (LF, PJ) | Dean Edwards "p.a.c.k.e.r" unpacker, one small file; used by the movie-web forks and WebStreamr | Direct in principle | Reference only. Unmaintained but the format has not changed; a 40-line helper in the SDK is cleaner than a dependency |
| `wyzie-lib` (npm) | npm 2.27.0 on 2026-11-21 | Yes | TypeScript | MIT (LF, PJ) | Client for the Wyzie subtitle API; `sub.wyzie.io` answered 200 (measured from a cloud address on 2026-11-24) | Direct (HTTP API) | Optional subtitle source |

### 3.5 Live TV and sports (legitimate inputs only)

| Source | Last update | Licence | What it gives | State (measured from a cloud address on 2026-11-24) | Recommendation |
|---|---|---|---|---|---|
| `github.com/iptv-org/api`, `iptv-org/database`, `iptv-org/iptv` | 2026-09-18, 2026-11-24, 2026-11-24 | Unlicense text in LICENSE (the README shows a CC0 badge) | JSON on GitHub Pages: channels (31,886 rows in `channels.csv`), feeds, streams, guides, categories, countries, and a blocklist (752 rows) of channels removed for rights or content reasons | `iptv-org.github.io/api/categories.json` 200; `/api/blocklist.json` 200; `/iptv/categories/sports.m3u` 200 | **Integrate directly** as data. Apply the blocklist; show a channel only when the entry has a stream. The project states links are user-submitted and "to the best of our knowledge" published by rights holders; rights per channel were not checked here |
| `github.com/Free-TV/IPTV` | 2026-11-16 (automated channel check) | None stated | One M3U of free-to-air and free-online channels by country; 2,203 entries today | `raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8` 200 | Use as a second list. No licence is stated for the list itself |
| TheSportsDB | n/a | Service terms | Fixtures and results | Key `3` returns 403 "permanently disabled"; test key `123` returns 200 with events | Integrate directly for schedules (key and rate terms per their pricing page) |
| OpenF1 (`api.openf1.org`) | n/a | Service | F1 sessions, timing | 200 | Integrate directly |
| Jolpica F1 (`api.jolpi.ca`; code `github.com/jolpica/jolpica-f1`, Apache-2.0, 2026-11-19) | 2026-11-19 | Apache-2.0 (LF) | Ergast-compatible F1 data | Timed out twice from here | Optional; state from a server unknown |
| NHL (`api-web.nhle.com/v1/schedule/{date}`) | n/a | Undocumented public endpoint | Schedule, broadcasters | 200 | Schedule and official link-outs |
| MLB (`statsapi.mlb.com/api/v1/schedule`) | n/a | Response carries MLB's copyright notice and terms link | Schedule | 200 | Schedule and official link-outs, subject to their terms |
| ESPN (`site.api.espn.com/apis/site/v2/sports/.../scoreboard`) | n/a | Undocumented public endpoint | Scoreboards for many leagues | 200 | Fallback schedule source; no stability promise |
| football-data.org, balldontlie | n/a | Token required | Football, NBA | 403 and 401 without a token | Only with a registered key |
| `i.mjh.nz` | n/a | Not checked | Channel lists for free ad-supported services (Pluto TV and others) | 200 | Optional metadata for official FAST services |
| Official free services (for link-out or an official-stream provider): ARD Mediathek, RaiPlay, france.tv, RTVE Play, Pluto TV, MX Player, puhutv, Internet Archive | n/a | n/a | n/a | `www.ardmediathek.de` 200, `www.raiplay.it` 200, `www.france.tv` 200, `www.rtve.es` 302 to its international page, `pluto.tv` 307 to its live page, `www.mxplayer.in` 200, `puhutv.com` 200, `archive.org` search API 200; `www.redbull.com/int-en/tv` 403 (Akamai) | Link out; where a stream API is public and unrestricted, yt-dlp and streamlink show the request sequence |

Pirate sports-stream sites were not researched. Two candidates above (`Jules-Astier/core`,
`StreamViX`) and MediaFlow contain such resolvers; those files were not read.

## 4. Deep-dives

All host states below were **measured from a cloud address on 2026-11-24**; the tables repeat
this in their headers. See section 2 for what "200" does and does not mean.

### 4.1 `Seanime-contributions/Seanime-Providers` (MIT) — anime

- **What it is.** Community extensions for the Seanime desktop server. The README says it is not
  the official extension repository. 1,201 commits; not archived (GitHub page).
- **Contract.** A file exports `class Provider` with `search`, `findEpisodes` and
  `findEpisodeServer`. Input is a title query and an AniList-derived media object; there is no
  TMDB lookup. Output is one server with `videoSources` (HLS or MP4), optional subtitles and the
  request headers the host needs.
- **Runtime.** Globals `fetch`, `LoadDoc`, `CryptoJS`. No `require`, no Node built-ins, no
  browser. Counted in `src/anime`: `LoadDoc` in 7 files, `CryptoJS.AES` in 2.
- **Porting to Charcoal.** Mechanical. The missing piece is on Charcoal's side: `media.kind =
  'anime'`, a title search, and absolute episode numbers (the first round already lists these).
- **Hosts.** 19 of the 22 anime sources were probed. Not probed: `nontonanime` and two adult
  sources.

| Provider (language) | Host | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| `animeheaven` (en) | `animeheaven.me` | 200 (search page with results) |
| `animegg` (en) | `www.animegg.org` | 200 |
| `zokoanime` (multi) | `zokoanime.video` | 200 |
| `megaplay`, `megavid` (multi) | `megaplay.buzz`, `megavid.buzz` | 200, 200. `megaplay` also calls the third-party `enc-dec.app` (200) |
| `shiro` (en) | `anv.to` | 200 |
| `shonen` (multi) | `shonen.to` | 200 |
| `animotvslash` (en) | `animotvslash.org` | 200 |
| `donghuastream` (en) | `donghuastream.org` | 200 |
| `animetvplus` (multi) | `animetvplus.xyz` | 200 |
| `AnimeAV1` (es) | `animeav1.com` | 200 |
| `animesaturnmirror`, `animeunion` (it) | `animesaturn.ro`, `animeunion.tv` | 200, 200 |
| `animeunitymirror` (it) | `animeunity.ch` | 301 to `animeunity.io`, which answered 200 |
| `animetoast` (de) | `www.animetoast.cc` | 200 |
| `aniworld` (de) | `aniworld.to` | 403, DDoS-Guard challenge |
| `anitube` (pt) | `www.anitube.news` | 301 to `www.anitube.zip`, which answered 200 |
| `animesfhd` (pt-BR) | `animesfhd.net` | 200 |
| `mynimeku` (id) | `www.mynimeku.com` | 200 |

### 4.2 `Mediamash-org/backend` (MIT) — Western, Indian, Italian

- **What it is.** An OMSS server on `@omss/framework` 1.1.26 with 13 provider plugins. A CinePro
  member recommended it in CinePro issue #62 (2026-09-10) as the place to go while CinePro is
  down. 33 commits, 2 stars, not archived (GitHub page). Last commit 2026-08-24, so three months
  without a change.
- **Contract.** CinePro's: `BaseProvider`, `getMovieSources`, `getTVSources`, `ProviderResult`.
- **Runtime.** Node 20.6. `peachify-provider` and `pikashow-provider` import `node:crypto`; the
  others use only `fetch`.
- **Hosts.**

| Plugin | Hosts in the code | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| `videasy-provider` | `player.videasy.to`, `api.speedracelight.com`, `enc-dec.app` | DNS failure (the name servers of `videasy.to` refuse queries); timeout on `/seed?mediaId=27205`; 200 |
| `vidcore-provider` | `vidcore.org` | 200 |
| `vaultplayer-provider` | `vaultplayer.co.uk` | 200 |
| `filmo-provider` | `filmo.to`, `voe.sx` | 200 (DDoS-Guard in front); `voe.sx` not probed |
| `twoembed-provider` | `www.2embed.online`, `play.xpass.top` | 301 to `2embed.stream` (200); 200 |
| `vidsrc-provider` | `vsembed.ru`, `cloudnestra.com` | 200; **no A record** |
| `streamingunity-provider` (it) | `streamingunity.vip`, `vixcloud.co` | 301 to `streamingunity.day` (200); `vixcloud.co` serves a "domain is for sale" page |
| `netmirror-provider` | `net27.cc`, `h5-api.aoneroom.com` | 302 to `net78.cc` (200); 404 at the root (the API host is up) |
| `bingr-provider` | `api.bingr.one` | 302 to `bingr.one`, which redirects to `/home` |
| `dulo-provider` | `dulo.cx` | 302 to `fmhy.net` (the site is gone from this address; `dulo.mov`, used by `eclipsia`, answered 200) |
| `hdmovie2-provider` (Indian) | `hdm2.ink`, `newhdmovie2.beer` | NXDOMAIN; 301 to `newhdmovie2.best`, which is NXDOMAIN |
| `peachify-provider` | `peachify.pro`, `peachify.top`, `uwu.eat-peach.sbs`, `usa.eat-peach.sbs` | blocked; blocked; NXDOMAIN; NXDOMAIN |
| `pikashow-provider` (Indian) | `manoda.co` | 200 (a default "Welcome" page) |

- **Assessment.** Worth porting for the request sequences, which are short and readable. Four of
  the thirteen (`hdmovie2`, `peachify`, `dulo`, `vidsrc` via `cloudnestra`) point at hosts that
  are gone or blocked today.

### 4.3 MIT movie-web forks — Western and several other languages

- **What they are.** Snapshots of the P-Stream provider library. `p-stream/providers` itself is
  not public.
- **Contract.** `makeSourcerer` and `makeEmbed` as in the table. Embeds are the reusable part: a
  source returns `{embedId, url}`, and an embed turns a host page into a stream.
- **Runtime.** Counted in `steveyout`: `unpack(` in 19 places, `cheerio.load` in 9, `eval(` in 8
  (on unpacked player scripts), `CryptoJS.MD5` in 4, `CryptoJS.AES` in 3, `TripleDES` in 1.
  WebCrypto has no MD5 or 3DES, so those need small pure-JS functions. `eval` must be replaced by
  the unpacker plus a regular expression.
- **Source hosts.**

| Source | Host | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| `fsharetv` | `fsharetv.co` | 200 |
| `lookmovie` | `lmscript.xyz` | 200 (JSON) |
| `zoechip` | `zoechip.org` | 200 |
| `m4ufree` | `m4ufree.page` | 200 |
| `multiembed` | `multiembed.mov` | 200 ("Missing video_id") |
| `primesrc`, `primewire` | `primesrc.me` | 200 |
| `vidlink` | `vidlink.pro` (+ `enc-dec.app`) | 200, 200 |
| `vidrock` (thingfoil) | `vidrock.ru` | DNS failure (`vidrock.net` and `vidrock.to` answered 200) |
| `vidzee` (thingfoil) | `player.vidzee.wtf`, `core.vidzee.wtf` | 200; 404 JSON at the root (API up) |
| `vixsrc` (thingfoil) | `vixsrc.to` | challenge |
| `icefy` | `streams.icefy.top` | challenge |
| `mapple` (thingfoil) | `mapple.tv` | 301 to `mapple.fun`: challenge |
| `ridomovies` | `ridomovies.tv` | blocked |
| `hdrezka` | `hdrezka.ag` | 301 to `hdrezka-home.tv` (200) |
| `soapertv` | `soaper.cc` | 302 to `ww17.soaper.cc` (not followed) |
| `ee3` | `ee3.me` | 303 to `/login` (account required) |
| `cuevana3` (es) | `www.cuevana3.eu` | 301 to `wv3.cuevana3.eu` (200) |
| `fsonline` (ro) | `www3.fsonline.app` | 301 to its own `/home2/` |
| Hungarian set (ThePrimeDev) | `filmezek.com`, `mozibox.hu`, `netmozi.com` | 200, 200, challenge |
| `rgshows`, `catflix` | `www.rgshows.ru`, `catflix.su` | both serve the same "domain is for sale" page (same two addresses) |
| `mp4hydra` | `mp4hydra.org` | 200, page title "Back soon" |
| `streambox` | `vidjoy.pro` | 302 to an advertising click domain |
| `embedsu` | `embed.su` | connection reset |
| `pirxcy`, `insertunit`, `animeflv` | `mbp.pirxcy.dev`, `isut.streamflix.one`, `www3.animeflv.net` | 530, 522, 522 (origin down behind Cloudflare) |
| `vidapiclick` | `vidapi.click` | timeout |
| `autoembed`, `coitus`, `dopebox`, `turbovid`, `movies4f`, `warezcdn`, `cinehdplus-es`, `vidsrcvip`, `myanime`, `iosmirror`, `vidnest` (ThePrimeDev: `backend.vidnest.fun`) | — | all NXDOMAIN |
| `pelisplushd`, `tugaflix`, `wecima`, `fullhdfilmizle`, `vidsrc` (ThePrimeDev: `vidsrc.net`) | — | TLS error from here |
| `watchanimeworld` | `watchanimeworld.in` | no connect |
| `youplex` (steveyout) | `api.youplex.site` | 200, an Express default page. Closed hosted service, not a scraper |

- **Assessment.** Port embeds first (they outlive sources), then the six sources named in the
  table in section 3.1. Do not port the dead rows.

### 4.4 `Zenda-Cross/vega-providers` (no licence stated) — Indian, anime, Asian drama

- **What it is.** Providers for the Vega app. 708 commits, 121 stars, not archived (GitHub page).
  At least 25 commits between 2026-11-20 and 2026-11-24, including a bot commit "Update provider
  URLs" most days.
- **Why it matters.** It is the only actively maintained TypeScript pool for Indian sites, and its
  `urls.json` is a live list of where 53 frequently-moving sites are today.
- **Contract and runtime.** See the table. Results for the Indian sites are mostly direct file
  links (MKV) reached through file-host chains (`hubcloud`, `gdflix`, `vcloud`, `pixeldrain`), as
  round one found for the Nuvio equivalents.
- **Licence.** None stated. Without one, copying is not permitted; reading it to learn a site's
  current structure is. Site addresses are facts and can be consumed from `urls.json`.
- **Hosts from `urls.json`.**

| Provider | Host | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| `hdhub4u` | `new16.hdhub4u.cl` | 200 |
| `4khdhub` | `4khdhub.one` | 200 |
| `drive` (MoviesDrive) | `new4.moviesdrive.cyou` | 200 |
| `mod` (MoviesMod) | `moviesmod.fi` | 200 |
| `uhd` | `uhdmovies.ceo` | 200 |
| `vega` | `vegamovies.latino` | 200 |
| `luxMovies` | `rogmovies.beauty` | 200 |
| `multi` | `m1.multimovies.courses` | 200 |
| `world4u` | `world4ufree.men` | 200 |
| `katmovies` | `new.katmoviehd.top` | 200 |
| `moviezwap` (Telugu, Tamil) | `www.moviezwap.boo` | 200 |
| `skyMovieHD` (Bengali) | `new6.skymovieshd.clinic` | 200 |
| `movielinkdb` (Bangla) | `wth3zq.movielinkbd.at` | 302 to `38jntc.movielinkbd.at` (200) |
| `cinefreak`, `gokuHD`, `extraflix` | `cinefreak.net`, `gokuhd.nl`, `e14.extraflix.mobi` | 200, 200, 200 |
| `movies4u` | `movies4u.tc` | 301 to `movies4u.cm`, 301 to `movies4u.td` (not followed further) |
| `kmMovies`, `zeefliz` | `kmmovies.quest`, `zeefliz2.xyz` | challenge, challenge |
| `1cinevood` | `one.cinevood.business` | NXDOMAIN |
| `filmyfly` | `filmyfiy.co.in` | DNS failure |
| `castle` | `api.hlowb.com` | 200 on Charcoal's own health path |
| `mxplayer` (official free service) | `www.mxplayer.in` | 200 |
| `movieBoxWeb` | `officialmoviebox.com` | 200 |
| `netflixMirror` | `net77.cc` | 301 to a `/login_...` path |
| `kissKh` | `kisskh.is` | challenge |
| `dramacool` | `asianc.id` | 200 |
| `mkvDrama` | `mkvdrama.net` | challenge |
| `kickAssAnime` | `kaa.lt` | 200 |
| `anikoto` | `anikototv.bz` | 200 |
| `aniDream` | `anidream.to` | 200 |
| `animesalt` (Hindi, Tamil, Telugu dubs) | `animesalt.in` | 200 |
| `animeworld` (Hindi dubs) | `watchanimeworld.one` | blocked |
| `primewire`, `showbox` | `primewire.pw`, `www.showbox.media` | 200, 200 |
| File hosts used by the chains | `pixeldrain.com`, `new6.gdflix.dad`, `hubcloud.cx`, `hubcloud.ist` | 200; 302 to `gdlink.dev`; NXDOMAIN (from the September `CENSORED` list); 302 to `hubcloud.mov` (from `eclipsia`; target not probed) |

### 4.5 Nuvio plugin repositories (GPL/AGPL or unlicensed) — broadest coverage

- **`eclipsia/nuvio-plugin`** is the one to read. Committed 2026-11-24, 51 scrapers under
  invented names; the manifest's description field names the real site. Readable, unminified
  source (longest line 160 characters in the sampled file).
- **Runtime.** `fetch` everywhere. `cheerio` in 7 files. Six files carry their own hash or AES
  code in plain JavaScript instead of `crypto-js`, which is the same constraint Charcoal has.
- **Licence.** AGPL-3.0-or-later. Ported code would have to be offered under AGPL, including to
  users of a hosted Charcoal. Re-implementing from the observed protocol avoids that; copying
  functions does not.
- **Selected hosts.**

| Scraper (site named in its manifest) | Host | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| `quinox` (VidNest) | `vidnest.fun`, `new.vidnest.fun` | 200; 200 with `_n`, 403 without (section 5.3) |
| `evyrith` (Vidrock) | `vidrock.net` | 200 |
| `haylox` (VidLink) | `vidlink.pro`, `enc-dec.app` | 200, 200 |
| `nyxora` (VidFast) | `vidfast.vc`, `enc-dec.app` | 200, 200 |
| `kethrax` (VixSrc) | `vixsrc.to` | challenge |
| `maelith` (Mapple) | `mapple.fun` | challenge |
| `zevran` (VAplayer) | `streamdata.vaplayer.ru` | 404 at `/api.php` without parameters (`vaplayer.ru` 200) |
| `novus` (Dulo) | `dulo.mov` | 200 |
| `karnis` (Castle) | `api.hlowb.com` | 200 |
| `mavonyx` (MovieBox) | `h5-api.aoneroom.com`, `api3.aoneroom.com` | 404 at the root for both (hosts up) |
| `soryn` (Netmirror) | `net79.cc` | 302 to `net78.cc` (200) |
| `hexion` (4KHDHub), `vornix` (MoviesDrive), `qyrvaen` (HDHub4u) | `4khdhub.one`, `new4.moviesdrive.cyou`, `new8.hdhub4u.cl` | 200; 200; 302 to `new16.hdhub4u.cl` (200) |
| `wrenok` (Purstream, fr) | `purstream.ad` | 301 to `purstream.wiki` (200) |
| `fyron` (KissKH) | `kisskh.ovh` | challenge |
| `lenyr` (AniZone) | `anizone.to`, `api.ani.zip`, `animap.id` | 200, 200, 200 |
| `praxiel` (Re:ANIME) | `reanime.to` | 301 to `reanime.cz` (200) |
| `zyrvael` (Anikoto), `xylos` (AniKage), `xandril` (AniChan), `vitrix` (AniLight), `ozeris` (Anv) | `anikoto.cz`, `anikage.cc`, `anichan.to`, `anilight.live`, `anv.to` | all 200 |
| `onyxia` (Ani.Pm) | `ani.pm` | 200, a notice that the site moved to `anipm.pk` (200) |
| `rylvane` (WcoFlix) | `www.wcoflix.tv` | challenge |
| `gravix` (AnimeWorld, Hindi dubs) | `watchanimeworld.one` | blocked |
| `brellor` (Internet Archive), `jyniq` (Wikimedia) | `archive.org` | 200 |

- **`NuvioPlugin/All-in-One-Nuvio`** (66 scrapers, 2026-10-02) adds `einthusan`
  (`einthusan.tv`: 307 to `/intro/`, 200), `allmovieland` (`allmovieland.you`: redirects to
  `.one`, then `.art`), `animepahe` (`animepahe.pw`: challenge), `allanime`
  (`api.allanime.day`: challenge), `animekai` (`www3.anikai.cc`: DNS failure), `animetsu`
  (`animetsu.live`: no A record). Licence unclear, so reference only.
- **`yoruix/nuvio-providers`**: unchanged since 2026-11-08, when Castle was ported from it (the vendored copy that used to sit in `apps/server/vendor` was removed: nothing loaded it).

### 4.6 WebStreamr family (MIT, archived) — German, French, Italian, Spanish

- Archived by its owner (banner date 2026-04-10; last commit 2026-03-27). Two forks continued to
  May 2026 and then stopped. The public instance is retired (secondary sources).
- Its split into `Source` and `Extractor`, with fixture tests per file, is the best model in
  TypeScript for Charcoal's own embed-resolver module. The fork `webstreamr-community` records in
  `SOURCE_HEALTH.md` that all 20 sources passed *fixture* tests on 2026-05-20 and that no live
  check was made.

| Source (language) | Host in the code | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| Einschalten (de) | `einschalten.in` | 200 |
| KinoGer (de) | `kinoger.com` | 200 |
| MegaKino (de) | `megakino1.to` | 301 to `megakino1.biz`, 301 to `megakino1.cx` (not followed further) |
| StreamKiste (de) | `streamkiste.taxi` | 301 to `streamkiste.bid`, 301 to `streamkiste.onl` (not followed further) |
| MeineCloud (de) | `meinecloud.click` | 301 to `devideosrc.co` (not probed) |
| Frembed (fr) | `frembed.work` | 200, a notice that it moved to `frembed.pics` (200) |
| Movix (fr) | `api.movix.site` | 200 |
| FrenchCloud (fr) | `frenchcloud.cam` | DNS failure |
| Cuevana (es) | `ww1.cuevana3.is` | 301 to `www3.cuevana3.is` (200) |
| HomeCine (es) | `www3.homecine.to` | 200 |
| VerHdLink (es) | `verhdlink.cam` | 522 |
| CineHDPlus (es) | `cinehdplus.gratis` | NXDOMAIN |
| Eurostreaming (it) | `eurostreaming.luxe` | NXDOMAIN |
| MostraGuarda (it) | `mostraguarda.stream` | no A record |
| Kokoshka (sq) | `kokoshka.digital` | TLS error from here |
| VidSrc | `vidsrc-embed.ru` | TLS error from here |
| VixSrc | `vixsrc.to` | challenge |
| RgShows | `rgshows.ru`, `api.rgshows.ru` | "domain is for sale" page |

- **Assessment.** Reference only. Of the 18 hosts above, 4 answer at the address in the code, 5
  have moved, 6 are gone or unreachable, 2 failed TLS from here and 1 challenges. That is six to
  eight months after the last commit, and it is the decay rate to plan for.

### 4.7 `ani-cli` and `anipy-cli` (GPL-3.0) — anime request sequences

- `ani-cli` (shell, 2026-11-20) now reads `hianime.at`: `/search?keyword=`,
  `/api/theme/episode/list/{id}`, `/api/theme/episode/servers?episodeId=`, then an embed page
  that carries its data in a `window.__P` string, then the playlist with a Referer.
  `hianime.at/search?keyword=naruto` answered 301 to `hianime.fm`, which answered 200 (measured
  from a cloud address on 2026-11-24).
- The `Jules-Astier/core` runbook `docs/runbooks/anime-providers.md` (2026-11-17) describes the
  same chain ending at the ZokoAnime player, which is also a Seanime provider (4.1).
- `anipy-cli` (Python, 2026-10-30) has `allanime`, `animekai`, `anidbapp`, `animehub`.
  `api.allanime.day` answered with a challenge and `www3.anikai.cc` failed DNS (measured
  from a cloud address on 2026-11-24).
- GPL and not TypeScript: use as a description of the sequence, write the provider fresh.

### 4.8 Embed-host resolver libraries

There is no maintained, permissively licensed, TypeScript resolver library. The options:

| Library | Licence | Hosts | Use |
|---|---|---|---|
| Embeds in `ThePrimeDev/pstream-providers` and `steveyout/providers` | MIT | about 40 | Port |
| Extractors in `webstreamr-community/webstreamr` | MIT | 22 (DoodStream, Dropload, Fastream, FileLions, FileMoon, Fsst, HubCloud, HubDrive, KinoGer, LuluStream, Mixdrop, SaveFiles, StreamEmbed, Streamtape, SuperVideo, Uqload, Vidora, Voe, ...) | Port, with its fixture tests as a model |
| `mediaflow-proxy` extractors | MIT, Python | 26 | Reference |
| Kodi `ResolveURL` | GPL-2.0, Python | 243, updated weekly | Reference for what changed on a host |
| Cloudstream library extractors | GPL-3.0, Kotlin | 105 files | Reference |
| Aniyomi shared libs (`Kohi-den/extensions-source/lib`) | Apache-2.0, Kotlin | 59 | Reference (stale since May) |

A resolver module in `packages/providers` (one function per host: page in, `Stream` out, plus a
shared unpacker and a host-to-resolver map) would let every ported source return an embed URL and
stop there. That is the structure all six libraries converge on.

### 4.9 Third-party decrypt service `enc-dec.app`

Many current scrapers (VidLink, VidFast, Videasy, KissKH, AnimeKai, MegaPlay in the repositories
above) do not implement decryption. They POST the ciphertext to `https://enc-dec.app/api/dec-*`.
The site answered 200 with the title "EncDec Endpoints" (measured from a cloud address on
2026-11-24). Its operator, source and terms are unknown, and its sample repository named in
CinePro issue #62 could not be found by search or cloned. A provider that depends on it sends
every title request to a third party and stops when that service stops. Prefer a local decoder
where one is public under a usable licence; otherwise declare the host in `extraHosts` and mark
the provider accordingly.

## 5. `cinepro-org/core` upstream changes

### 5.1 Upstream itself

- **State.** `main` is at `98ba005` (2026-05-27, "Merge pull request #58"). `dev` is one CI commit
  ahead (same day). There are no other branches. The tags are per-build (`main-<commit>`); the
  newest is `main-98ba005`. Read with `git ls-remote` and `git log`.
- **Charcoal's copies are current with upstream, which means current as of May.**
  `diff -r apps/server/src/providers/<name> <upstream>/src/providers/<name>` shows no difference
  for `02moviedownloader`, `anyembed`, `cinesu`, `fmovies4u`, `icefy`, `peachify`, `popr`,
  `streammafia`, `tulnex`, `videasy`, `vidnest`, `vidrock`, `vidsrc`, `vidzee`. `fshare/fshare.ts`
  differs by three lines that Charcoal added (an early return when there is no IMDb id).
- **Upstream has two providers Charcoal's server folder lacks**: `src/providers/vidapi/`
  (`vaplayer.ru`, `streamdata.vaplayer.ru/api.php`, `brightpathsignals.com`) and
  `src/providers/vixsrc/` (Charcoal has its own in `packages/providers`).
- **Project status.** Issue #68 (opened 2026-06-18, pinned, locked) says the project is being
  rewritten and nothing is promised to work; a comment of 2026-07-17 moves the date to "before
  November 2026". Issue #62 (2026-06-14) reports 5 of 14 providers returning results; on
  2026-09-10 a member suggests switching to Mediamash and says `@omss/framework` is deprecated.
  No rewrite is visible in any public branch as of 2026-11-24.
- **Open pull requests** (heads fetched by number): #59–#60, #64–#67 edit `package.json`, the
  README or `wrangler.json`; #61 adds a Windows manager binary; #63 (2026-06-15) adds caching;
  #69 (2026-08-15) adds a builder that emits Nuvio-format files from the providers and changes
  import suffixes. **None changes provider logic.**
- **Organisation.** `github.com/orgs/cinepro-org` lists 12 repositories; none is a successor to
  `core`. The older `backend` and `frontend` are archived.
- **Licence.** PolyForm Noncommercial 1.0.0. The files under `apps/server/src/providers/` are
  verbatim copies of code under that licence, and a port of them is a derivative. Charcoal's
  repository root has no LICENSE file. This should be settled before the legacy providers are
  carried into `packages/providers`: either keep the project non-commercial and say so, or
  re-implement each provider from the site's observed behaviour.

### 5.2 Newer versions in forks

GitHub's "active forks" list has three pages; the 25 forks on the first (most recently updated)
were listed and 16 were fetched and diffed against `98ba005` under `src/providers`. Eleven show
no difference there (their changes are to deployment and server files). One changes one line in
`vidapi.ts`, one adds a loader outside `src/providers`, one is pull request #69. Two matter:

**`Jules-Astier/core`** (2026-11-21, PolyForm NC). Provider folders last changed on the dates
shown (`git log -1 -- src/providers/<name>` on an 80-commit fetch).

| Provider | Changed | What changed | Path in the fork |
|---|---|---|---|
| `videasy` | 2026-08-10 | New API host `api.speedracelight.com` (was `api.videasy.net`, `api2.videasy.net`). New first step `GET /seed?mediaId={tmdb}` returning `{seed}`; the seed is sent with `/{server}/sources-with-title` and used in decryption. Decryption is local (`decryptor.ts`, a pure TypeScript decoder with magic `mvm1`) instead of a call to `enc-dec.app`. Six servers active (`cdn`, `m4uhd`, `hdmovie`, `meine`, `lamovie`, `superflix`); `cuevana`, `mb-flix`, `1movies` retired; six more disabled | `src/providers/videasy/{videasy.ts, videasy.config.ts, decryptor.ts, README.md}` |
| `vidnest` | 2026-08-10 | Per-server allow/deny configuration. **Same pre-nonce API**, so it is broken by the nonce change too | `src/providers/vidnest/` |
| `vidzee` | 2026-11-14 | Rewritten around a decoder that takes the player host name; drops `rapidairmax.site` | `src/providers/vidzee/{vidzee.ts, decrypt.ts}` |
| `vixsrc` | 2026-08-10 | Rewritten with tests. `docs/runbooks/vixsrc-egress.md` records that `vixsrc.to` served a residential browser and returned 403 to their data-centre host, and that VixSrc documents a custom-domain route (`/api/domains`) | `src/providers/vixsrc/` |
| `peachify`, `tulnex`, `popr`, `streammafia` | 2026-08-10 | Contract and error-handling repairs. Hosts unchanged (`eat-peach.sbs`, `api.tulnex.com`, `popr.ink`, `player.nhdapi.com`) | same names |
| `cinesu`, `vidrock`, `vidsrc`, `vidapi` | 2026-08-10 | Two changed lines each; hosts unchanged | same names |
| `fshare`, `icefy` | unchanged | — | — |
| New | 2026-08 to 2026-11-20 | `vidking`, `vidlove`, `vidlink`, `vidstorm`, `framex`, `ezvidapi`, `lordflix`, `embedmirrors`, `showboxfebbox`, `4khdhub`, `papadustream` (French), `hianime`, `animeav1`, `wco`, `supercartoons`; schedule providers `openf1`, `nhlweb`, `apisports`. It also adds live-sports stream providers, which were not read | `src/providers/<name>/`, catalogue in `config/provider-catalog.yaml` |

**`simoabid/cineflix-core`** (last commit 2026-10-29; provider work 2026-06-06 to 2026-07-28,
PolyForm NC).

| Provider | What changed | Path in the fork |
|---|---|---|
| `videasy` | "wingsdatabase.com and enc=2 seed decryption" (2026-07-14): API host `api.wingsdatabase.com`, player `player.videasy.to` | `src/providers/videasy/` |
| `vidsrc` | Rewritten (2026-07-01) to run the site's own WebAssembly module: page `vidsrc.ru`, API `themoviedb.vidsrc.su`. Drops `cloudnestra.com` | `src/providers/vidsrc/{vidsrc.ts, vidsrcClient.ts, vidsrcWasm.ts, wasm/}` |
| `vidrock` | Host `vidrock.ru`; `GET /api/movie/{tmdb}` or `/api/tv/{tmdb}/{s}/{e}`, then AES-GCM decryption of each URL with a fixed key | `src/providers/vidrock/` |
| `fshare` | Host `fsharetv.co` (was `.cc`) | `src/providers/fshare/` |
| `vidnest`, `peachify`, `icefy`, `vixsrc` | Robustness changes; same hosts; pre-nonce VidNest | same names |
| `cinesu`, `popr`, `streammafia`, `tulnex`, `vidzee` | **Moved to `src/providers/_archive/`** (given up) | `_archive/<name>/` |
| New | `vidking`, `vidup`, `m111movies`, `lordflix`, `kisskh`, `vidsync`, `hexa`, `vidcore`, `vidfast`, `onetouchtv` and copies of movie-web sources. Some need Playwright or a residential proxy | `src/providers/<name>/` |

### 5.3 VidNest: the nonce

Neither CinePro nor its forks handle it. The only public implementation found is
`codeberg.org/eclipsia/nuvio-plugin`, `providers/quinox.js` (AGPL-3.0-or-later, committed
2026-11-24):

- **Request** (function `fetchServerResponse`, from line 233): `GET https://new.vidnest.fun/{server}/movie/{tmdb}` or
  `/{server}/tv/{tmdb}/{s}/{e}` with query `_n=<22 random characters from A–Z a–z 0–9>`, headers
  `Referer: https://vidnest.fun/` and `Origin: https://vidnest.fun`.
- **Servers** (lines 13–23): `onehd`, `flixhq`, `yflix`, `allmovies`, `rogflix`, `vidzee`,
  `ophim`, `rpmvid`, `nextgencloudfabric`. Upstream CinePro's list (`moviebox`, `allmovies`,
  `catflix`, `purstream`, `hollymoviehd`, `lamda`, `flixhq`, `vidlink`, `onehd`, `klikxxi`, in
  `src/providers/vidnest/vidnest.ts` lines 47–57) shares only `allmovies`, `flixhq` and `onehd`
  with it.
- **Reply**: `{v: 2, d: <base64url>, n: <the nonce>}`. The older form
  `{encrypted: true, data: <custom-alphabet base64>}` is still handled as a fallback.
- **Decryption** (function `decryptResponse`, from line 212): key = SHA-256 of `"<n>|<a fixed string in the file>"`; the
  first 12 bytes of `d` are the IV, the last 16 bytes are skipped, the rest is XORed with an
  AES-256 keystream whose counter starts at 2. That is AES-256-GCM without tag verification, so
  WebCrypto's `AES-GCM` decrypt can do it (and verify the tag) with no extra code.
- **Measured from a cloud address on 2026-11-24**:
  `GET https://new.vidnest.fun/allmovies/movie/27205` returned 403
  `{"error":"missing or invalid nonce"}`; the same URL with `?_n=` and 22 characters returned 200
  with a JSON object with keys `d` (2,502 characters), `n` (the value sent) and `v` (2). The
  payload was not decrypted, so whether the fixed string in that file is still the right one was
  not confirmed.

Other signals: `ThePrimeDev`'s `vidnest.ts` calls `backend.vidnest.fun`, which is NXDOMAIN.
Vyla SDK 1.33.0 no longer has a `vidnest` module.

### 5.4 The twelve legacy providers today

| Provider | Hosts in Charcoal's copy | State (measured from a cloud address on 2026-11-24) | Newer public code |
|---|---|---|---|
| `cinesu` | `cine.su` | 302 to `koddo.to`, which answers 403 (nginx) | None. Archived in `cineflix-core` |
| `fshare` | `fsharetv.cc` | connection reset. `fsharetv.co` answers 200 | `cineflix-core` and the MIT movie-web forks use `.co` |
| `icefy` | `streams.icefy.top` | challenge | None |
| `peachify` | `peachify.top`, `uwu.`/`usa.eat-peach.sbs` | blocked; both API hosts NXDOMAIN | None with a different API host (Mediamash in August and All-in-One-Nuvio in October still use `eat-peach.sbs`) |
| `popr` | `popr.ink` | 200, a registrar page "Domain registration has expired" | None. Archived in `cineflix-core` |
| `streammafia` | `player.nhdapi.com` | connection reset | None with a different host |
| `tulnex` | `api.tulnex.com` | NXDOMAIN | None. Archived in `cineflix-core` |
| `videasy` | `api.videasy.net`, `api2.videasy.net`, `player.videasy.net` | timeout; NXDOMAIN; 301 to `player.videasy.to` (DNS failure) | **Yes**: seed-based API on `api.speedracelight.com` in Mediamash (MIT) and `Jules-Astier/core`. That host resolves and timed out from here; `api.wingsdatabase.com` (the July host) is NXDOMAIN |
| `vidnest` | `vidnest.fun`, `new.vidnest.fun` | 200; 403 without nonce, 200 with | **Yes**: section 5.3 |
| `vidrock` | `vidrock.net` (+ `proxy.vidrock.store`, `sub.vdrk.site`, `lok-lok.cc`) | 200 | `cineflix-core` variant on `vidrock.ru` (DNS failure today); `eclipsia` `evyrith.js` on `vidrock.net` |
| `vidsrc` | `vsembed.ru`, `cloudnestra.com` | 200; **no A record** | `cineflix-core` WebAssembly variant on `vidsrc.ru` (200) and `themoviedb.vidsrc.su` (404 at root, host up). `vidsrc.me` redirects to `vidsrc.sh` (200) |
| `vidzee` | `player.vidzee.wtf`, `core.vidzee.wtf`, `rapidairmax.site` | 200; 404 JSON at the root (API up); not probed | `Jules-Astier/core` rewrite of 2026-11-14 |

## 6. By content category

Each list gives the best options found and their state, **measured from a cloud address on
2026-11-24**. "Answers" means the hosts returned 200 to a plain GET (section 2).

### 6.1 Western movies and TV

1. **VidNest v2** (re-implement from the protocol in 5.3). `new.vidnest.fun` answers a cloud
   address when the nonce is present. The only legacy provider with a confirmed way forward
   today.
2. **Vidrock** (`vidrock.net` 200), **VidZee** (`player.`/`core.vidzee.wtf` up), **VidSrc via
   `vsembed.ru`** (200, but its second hop `cloudnestra.com` has no A record): keep, re-test from
   a real server; for VidSrc read the `cineflix-core` WebAssembly approach before deciding it is
   worth the weight.
3. **Mediamash plugins** (MIT): `vidcore.org`, `vaultplayer.co.uk`, `filmo.to`,
   `2embed.stream`/`play.xpass.top` all answer. Port.
4. **MIT movie-web sources** `fsharetv` (`fsharetv.co`), `lookmovie` (`lmscript.xyz`), `zoechip`,
   `m4ufree`, `multiembed`, `primesrc`: hosts answer. Port.
5. **VidLink** (`vidlink.pro` 200) and **VidFast** (`vidfast.vc` 200): every public
   implementation depends on `enc-dec.app` (4.9). Port only with that dependency declared.
6. **Videasy**: the new API shape is public under MIT (Mediamash) but `api.speedracelight.com`
   timed out from here, and `videasy.to` does not resolve on two public resolvers (its name
   servers refuse queries; `vidking.net` is on the same name servers and fails the same way).
   Unknown whether that is an outage, a refusal aimed at public resolvers or a data-centre
   block. Port behind `egress: 'user'` and test from a home connection.
7. **VixSrc, Icefy, Mapple**: challenge from a cloud address. Leave as user-egress or frame.
8. **Dead for now**: Peachify, Tulnex, Popr, CineSu, StreamMafia (5.4).
9. **ShowBox/FebBox** (already in `packages/providers`): `www.showbox.media` 200,
   `www.febbox.com` 200.

### 6.2 Anime

1. **Port from Seanime-Providers (MIT)**: `animeheaven`, `animegg`, `zokoanime`, `megaplay`,
   `shonen`, `shiro` (`anv.to`), `animotvslash`. All hosts answer.
2. **HiAnime chain** (`hianime.at` → `hianime.fm`, answers): write fresh, using `ani-cli` and
   the `Jules-Astier/core` runbook as descriptions.
3. **Sites that answer and have only copyleft or unlicensed code**: AniZone (`anizone.to`),
   KickAssAnime (`kaa.lt`), Anikoto (`anikototv.bz`, `anikoto.cz`), AniDream, AniKage, AniChan,
   AniLight, Re:ANIME (`reanime.cz`). Candidates for fresh implementations later.
4. **Challenge or dead from a cloud address**: AnimePahe (`animepahe.pw`), AllAnime
   (`api.allanime.day`), WcoFlix; AnimeKai (`www3.anikai.cc`, DNS failure), Animetsu
   (`animetsu.live`, no A record).
   **All four anime sources Charcoal registers through StreamViva point at hosts that did not
   answer**: AnimeKai uses `api.1anime.app` (NXDOMAIN); Animetsu uses `animetsu.net` (no A
   record) and `backend.animetsu.net` (NXDOMAIN); Zunime uses `backend.xaiby.sbs` (302 to a
   `ww38.` parking host); WatchAnimeWorld uses `watchanimeworld.in` (no connect; the newer
   `watchanimeworld.one` is blocked).
5. **Data inputs** all answer: `api.ani.zip` 200, `arm.haglund.dev` 200, `api.aniskip.com` 200,
   `animap.id` 200. `graphql.anilist.co` answers 404 to GET by design ("Use POST"); POST was not
   sent. `api.jikan.moe` reset the connection twice.
6. **Dubs in Indian languages**: `animesalt.in` 200 (Hindi, Tamil, Telugu); code only in
   vega-providers and Nuvio repositories.

### 6.3 Bollywood (Hindi)

1. **Castle** (already ported): `api.hlowb.com` 200 on the health path.
2. **Domain feed**: read `Zenda-Cross/vega-providers/urls.json` into the domain configuration
   for HDHub4u, 4KHDHub, MoviesDrive, MoviesMod, UHDMovies, VegaMovies, RogMovies, MultiMovies.
   All eight answer today.
3. **Code**: the only MIT implementations are WebStreamr's `HDHub4u` and `FourKHDHub` sources
   with `HubCloud`/`HubDrive` extractors (archived; their hard-coded hosts `new5.hdhub4u.fo` and
   `4khdhub.dad` are out of date, which the feed fixes). Vega (no licence) and the Nuvio
   repositories (GPL/AGPL) are current. Decide the licence question first.
4. **Format**: these chains end in MKV files on file hosts (`pixeldrain.com` 200; `gdflix`
   redirecting; `hubcloud.cx` NXDOMAIN and `hubcloud.ist` redirecting to `hubcloud.mov`). Round
   one's playback caveats apply unchanged.
5. **MovieBox** (`h5-api.aoneroom.com`, `api3.aoneroom.com`: hosts up) and **Netmirror**
   (`net78.cc` 200 after redirect): implemented in Mediamash (MIT) and several GPL repositories.
6. **Official free**: MX Player (`www.mxplayer.in` 200). yt-dlp has an `mxplayer` extractor
   (Unlicense) that documents its API.

### 6.4 Indian regional cinema

1. **Einthusan** (Tamil, Telugu, Malayalam, Kannada, Hindi, Bengali): `einthusan.tv` 200 after a
   redirect to `/intro/`. Code only in All-in-One-Nuvio (licence unclear).
2. **Telugu/Tamil**: `www.moviezwap.boo` 200 (vega). **Bengali**: `new6.skymovieshd.clinic` 200,
   `movielinkbd.at` 200 after redirect (vega, eclipsia).
3. **Multi-dub sources** that expose Tamil/Telugu audio: HDHub4u, 4KHDHub, MovieBox,
   AllMovieLand (`allmovieland.you` redirects twice; final host not probed).
4. `eclipsia`'s `bdix-*` scrapers point at Bangladeshi ISP-internal FTP servers
   (`new.circleftp.net`, plain HTTP) and are not usable outside those networks.
5. The Tamil-focused Nuvio repository `Abinanthankv/NuvioRepo` stopped on 2026-01-20; the
   Cloudstream Tamil repository `likdev256/likdev256-tamil-providers` is not public.
6. No permissively licensed, maintained code exists for this category. It depends on the same
   licence decision as 6.3.

### 6.5 International TV

| Language/region | Best option | State (measured from a cloud address on 2026-11-24) |
|---|---|---|
| Korean, Chinese, Thai drama | Dramacool (`asianc.id`), code in vega; KissKH, code in vega, eclipsia, `cineflix-core` | `asianc.id` 200; `kisskh.is` and `kisskh.ovh` challenge; `mkvdrama.net` challenge |
| Italian | StreamingCommunity (`streamingunity`) via Mediamash (MIT); VixSrc; StreamViX and MammaMia as references | `streamingunity.day` 200 after redirect; `vixsrc.to` challenge; `vixcloud.co` serves a for-sale page; `animeunity.io`, `animesaturn.ro` 200 |
| German | WebStreamr `Einschalten`, `KinoGer` (MIT, archived); Seanime `animetoast` | `einschalten.in` 200; `kinoger.com` 200; `megakino1.*` and `streamkiste.*` in redirect chains; `aniworld.to` challenge |
| French | WebStreamr `Movix`, `Frembed` (MIT, archived); `papadustream` in `Jules-Astier/core`; Purstream in eclipsia | `api.movix.site` 200; `frembed.pics` 200; `www.papadustream.club` 200; `purstream.wiki` 200 after redirect; `frenchcloud.cam` DNS failure |
| Spanish, Latin America | movie-web `cuevana3` (MIT); WebStreamr `Cuevana`, `HomeCine`; Seanime `AnimeAV1` | `wv3.cuevana3.eu` 200; `www3.cuevana3.is` 200; `www3.homecine.to` 200; `cinehdplus.gratis` NXDOMAIN; `verhdlink.cam` 522 |
| Portuguese | Seanime `anitube`, `animesfhd` (anime only) | `www.anitube.zip` 200; `animesfhd.net` 200; `warezcdn.link` NXDOMAIN |
| Turkish | `falsisdev/anthology` (reference; licence conflict). Official: puhutv | `www.filmmodu.one` 200; `diziboxizle.com` 200; `puhutv.com` 200; `hdfilmcehennemi.mobi` blocked (1005); `www.diziyou.one` blocked |
| Hungarian | 24 sources in `ThePrimeDev/pstream-providers` (MIT) | `filmezek.com` 200; `mozibox.hu` 200; `netmozi.com` challenge (three sampled) |
| Russian | movie-web `hdrezka` (MIT) | `hdrezka.ag` 301 to `hdrezka-home.tv` (200) |
| Arabic | movie-web `wecima` (MIT) | `wecima.tube` TLS error from here |
| Official public broadcasters | streamlink and yt-dlp as references | ARD, RaiPlay, france.tv 200; RTVE 302; see 3.5 |

### 6.6 Sports (legitimate sources only)

1. **Schedules**: OpenF1 (200), TheSportsDB with the current key (200; the old key `3` is
   disabled, which breaks any code that still uses it), NHL (200), MLB (200), ESPN scoreboards
   (200, undocumented). Jolpica timed out from here.
2. **Channels**: iptv-org API and database (200), filtered by its blocklist and by category
   `sports`; Free-TV playlist (200).
3. **Official streams and link-outs**: broadcaster field from the NHL schedule; Pluto TV and
   other FAST lists (`i.mjh.nz` 200); Red Bull TV refused this address (403, Akamai).
4. `Jules-Astier/core` has small schedule providers (`openf1`, `nhlweb`, `apisports`) that show
   the mapping from these APIs to an event list; licence PolyForm NC, so reference only.

## 7. Notes for porting

- **HTML**: `cheerio` and `LoadDoc` calls map to `extract.parseHtml`. Check each selector against
  the SDK's CSS subset.
- **Crypto**: WebCrypto covers AES-CBC, AES-GCM, AES-CTR, SHA-1/256/512, HMAC, PBKDF2. It does not
  cover MD5, AES-ECB, 3DES or RC4, which appear in the movie-web embeds and several Nuvio
  scrapers. Those need small pure functions in a shared module.
- **Packed scripts**: write one unpacker helper; do not `eval`.
- **Lookup model**: movie-web, CinePro, Mediamash and Nuvio providers take a TMDB id. Seanime and
  Vega providers take a title or a site link, so they need the SDK to supply titles, year and
  alternative titles, and a match rule that refuses ambiguous results.
- **Addresses**: every candidate hard-codes hosts. Move them into `domains.ts` roles while
  porting. Of the 271 probe rows, 37 answered with a redirect to a different host, 24 were
  NXDOMAIN and 7 failed DNS.
- **Third-party helpers** (`enc-dec.app`, Cloudflare Workers proxies listed inside scrapers,
  Hugging Face "id-mapping" spaces): list them in `extraHosts` or leave the provider out.

## 8. What changed since the first round

- `phisher98/cloudstream-extensions-phisher` no longer publishes source (compiled builds only).
- `steveyout/providers` is still committed to, but only to route through a closed hosted API.
- `tapframe/nuvio-providers` and `yoruix/nuvio-providers` are one repository; `main` has not
  moved since 2026-06-07.
- New since round one: `Mediamash-org/backend`, `Seanime-contributions/Seanime-Providers`,
  `codeberg.org/eclipsia/nuvio-plugin`, `codeberg.org/CENSORED/Nuvio-Plugin`, the two CinePro
  forks, `webstreamr-community/webstreamr`, `newman2x/WebStreamrMBG`.
- Unchanged: `codeberg.org/pee` (four repositories, no providers), `thingfoil/providers`
  (2026-07-24), StreamViva (2026-09-26), WebStreamr (archived), Consumet and aniwatch (not
  public), Vyla SDK (still releasing, still CC-BY-NC).

## 9. Not verified

- **Whether any provider returns a playable stream.** No extraction, playlist request or
  decryption was done. Host states are front-page or single-endpoint GETs.
- **Home-connection behaviour.** Every probe came from one cloud egress. Hosts that challenged or
  refused it may serve a home address, and the reverse.
- **Why seven hosts failed TLS verification from here** (`vidsrc.net`, `ww3.pelisplus.to`,
  `tugaflix.love`, `wecima.tube`, `www.fullhdfilmizlesene.tv`, `kokoshka.digital`,
  `vidsrc-embed.ru`). Verification was not disabled.
- **Whether `api.speedracelight.com` and `api.videasy.net` are down or refuse data-centre
  addresses.** Both resolve and time out.
- **Whether the seven DNS-failure domains resolve elsewhere** (`videasy.to`, `vidking.net`,
  `vidlove.cc`, `vidrock.ru`, `anikai.cc`, `frenchcloud.cam`, `filmyfiy.co.in`). Two public
  resolvers got a refusal or no answer from their name servers; an ISP resolver was not tried.
  For `www3.anikai.cc` and `frenchcloud.cam` the first lookup returned an address and later
  lookups failed.
- **Whether the VidNest v2 reply decrypts with the scheme in `quinox.js`.** Only the reply's
  shape was observed.
- **Archived status** for most repositories. It was read from GitHub pages only for
  `steveyout/providers`, `Seanime-contributions/Seanime-Providers`, `Mediamash-org/backend`,
  `Zenda-Cross/vega-providers`, `NuvioPlugin/All-in-One-Nuvio`, `yoruix/nuvio-providers` (none
  archived), `cinepro-org/core` (not archived) and `webstreamr/webstreamr` (archived).
- **Licences beyond the top-level file.** Per-file headers and third-party code inside the
  repositories were not audited. Unresolved: `vega-providers` (none stated),
  `All-in-One-Nuvio` (README versus no file), `falsisdev/anthology` (GPL file versus MIT field),
  `phuanh004/direct-streams-providers` (field only), `codeberg.org/pee` (not re-read).
- **Charcoal's own licence.** No LICENSE file was found at the repository root; how the
  PolyForm-NC and GPL material already in the tree is meant to be handled was not established.
- **The CinePro rewrite.** No public branch contains it; whether it exists privately is unknown.
- **CinePro forks beyond the first page.** 25 listed (the first of three pages), 16 diffed.
- **Mediamash in operation.** Recommended by a CinePro member; not run here.
- **`enc-dec.app`**: operator, source, terms. Its sample repository was not found.
- **A Nuvio repository named "Gowaru"** (round one): not found by search.
  `phisher98/phisher-nuvio-providers` and `nvmindl/nuvio-providers` are not public; a secondary
  source says the second was taken down.
- **Rights status of individual iptv-org and Free-TV channels**, and the licence of the Free-TV
  list.
- **Endpoints that need POST or a key**: AniList GraphQL, football-data.org, balldontlie, TMDB.
  `api.jikan.moe` reset and `api.jolpi.ca` timed out on both attempts.
- **Redirect chains not followed to the end**: `megakino1`, `streamkiste`, `movies4u`,
  `allmovieland`, `meinecloud.click` → `devideosrc.co`, `soaper.cc`.
- **Live-sports stream resolvers** inside `Jules-Astier/core`, `StreamViX`, `mediaflow-proxy`
  and the Cloudstream build lists: out of scope, not read.

## 10. Sources

Cloned on 2026-11-24 (GitHub unless marked): `cinepro-org/core` (+ `dev`, pull heads 59–69),
`simoabid/cineflix-core`, `Jules-Astier/core`, 14 further forks of `cinepro-org/core`,
`Mediamash-org/backend`, `steveyout/providers`, `ThePrimeDev/pstream-providers`,
`thingfoil/providers`, `badwinton/pstream-providers`, `sussy-code/providers`, `zisra/providers`,
`loak7993-code/streamviva-providers`, `xp-technologies-dev/p-stream`, `omss-spec/core`,
`vyla-entertainment/stream-api`, `vyla-entertainment/sdk`, `Inside4ndroid/TMDB-Embed-API`,
`yoruix/nuvio-providers` (all branches), `NuvioPlugin/All-in-One-Nuvio`, `falsisdev/anthology`,
`phuanh004/direct-streams-providers`, `mooncrown04/nuviotr`, `michat88/nuvio-providers`,
`Abinanthankv/NuvioRepo`, `NuvioMedia/NuvioMobile`, Codeberg `eclipsia/nuvio-plugin`, Codeberg
`CENSORED/Nuvio-Plugin`, `Zenda-Cross/vega-providers`, `webstreamr/webstreamr`,
`webstreamr-community/webstreamr`, `newman2x/WebStreamrMBG`, `zorosanma/Selfpro`,
`tapframe/NuvioStreamsAddon`, `qwertyuiop8899/StreamViX`, `UrloMythus/MammaMia`,
`Viren070/AIOStreams`, `Stremio/stremio-addon-sdk`, `Seanime-contributions/Seanime-Providers`,
`kRYstall9/Seanime-streaming-providers`, `5rahim/seanime`, `5rahim/seanime-extensions`,
`pystardust/ani-cli`, `sdaqo/anipy-cli`, `Eltik/Anify`, `Kohi-den/extensions-source`,
`kodjodevf/mangayomi-extensions`, `recloudstream/cloudstream`, `recloudstream/extensions`,
`phisher98/cloudstream-extensions-phisher` (`master`, tree of `builds`),
`NivinCNC/CNCVerse-Cloud-Stream-Extension` (same), `SaurabhKaperwan/CSX`,
`hexated/cloudstream-extensions-hexated`, `keyiflerolsun/Kekik-cloudstream`,
`mhdzumair/mediaflow-proxy`, `Gujal00/ResolveURL`, `yt-dlp/yt-dlp`, `streamlink/streamlink`,
`mov-cli/mov-cli`, `justchokingaround/lobster`, `kuu/hls-parser`, `mnsrulz/unpacker`,
`wyziedevs/wyzie-lib`, `iptv-org/iptv`, `iptv-org/api`, `iptv-org/database`, `Free-TV/IPTV`,
`jolpica/jolpica-f1`.

Not public (clone asked for credentials): `p-stream/providers`, `consumet/consumet.ts`,
`consumet/api.consumet.org`, `ghoshRitesh12/aniwatch-api`, `itzzzme/anime-api`,
`yahyaMomin/hianime-API`, `LinearJet/hianime-API`, `yuzono/aniyomi-extensions`,
`Rowdy-Avocado/Rowdycado-Extensions`, `likdev256/likdev256-tamil-providers`,
`phisher98/phisher-nuvio-providers`, `nvmindl/nuvio-providers`, `AzartX47/EncDecEndpoints`,
`yogesh-hacker/MegacloudKeys`, `Om0019/Flax`, `Thsandorh/flix-streams`, `br3ndonland/openf1`.
The last five names were guesses or search leads, so "not public" there may simply mean "no such
repository".

Web pages read through a fetch tool: `github.com/orgs/cinepro-org/repositories`;
`github.com/cinepro-org/core` issues list, issues #62 and #68, and the active-forks page;
`github.com/Mediamash-org`; `github.com/webstreamr/webstreamr` forks page; the repository pages
named in section 9; `troypoint.com/best-nuvio-plugins-repositories` (a secondary list of Nuvio
repositories); `stremio-addons.net/addons/flix-streams`.

APIs: `registry.npmjs.org` (package times and licences), `codeberg.org/api/v1`,
`cloudflare-dns.com/dns-query`.
