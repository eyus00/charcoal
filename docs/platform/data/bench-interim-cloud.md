# Source availability: interim-cloud

- Run: `interim-cloud`, **LIVE** (real sites over the network)
- Target: provider pack in this process (engine, providers ran from a data-centre address)
- Streams tried from: a data-centre address (cloud sandbox behind an HTTPS egress proxy, 2026-11-24; ports and browser runtime, before the new provider packs)
- Playback in a browser: checked
- When: 2026-11-24T20:35:47.403Z to 2026-11-24T20:59:13.378Z, commit `3249145`

## Summary

| Measure | Value |
|---|---|
| Titles | 34 |
| Providers registered | 31 |
| Providers that got an answer from their site at least once | 16 |
| Providers that returned a stream at least once | 5 |
| Streams discovered (every provider, with duplicates) | 126 |
| Unique streams | 126 |
| Unique streams verified (manifest and first media bytes) | 87 |
| Streams that started in a browser player | 38 of 59 tried |
| Titles with at least one stream | 34 of 34 |
| Titles with at least one verified stream | 32 of 34 |
| Titles with a stream that started | 30 of 34 |
| Mean provider response time | 2.7 s |
| Median time to first result | 1.5 s |
| Median time to first verified stream | 2.3 s |

## By category

| Category | Titles | With a verified stream | With playback started | Unique streams | Verified | Started |
|---|---|---|---|---|---|---|
| Western films | 7 | 6 | 6 | 34 | 25 | 9 |
| Western television | 6 | 6 | 6 | 23 | 17 | 7 |
| Anime | 6 | 6 | 5 | 23 | 16 | 6 |
| Indian cinema and TV | 9 | 8 | 8 | 25 | 16 | 10 |
| Other languages | 6 | 6 | 5 | 21 | 13 | 6 |

## Why providers failed

| Failure | Provider runs | Meaning |
|---|---|---|
| `TIMEOUT` | 222 | Took too long to answer |
| `CHALLENGE` | 59 | Is behind a bot check here |
| `ACCESS_DENIED` | 46 | Refuses this connection |
| `STRUCTURE_CHANGED` | 38 | Changed its site; needs an update |
| `TLS` | 36 | Its certificate was rejected |
| `CANCELLED` | 35 | Cancelled |
| `REDIRECTED` | 34 | Has moved to another address |
| `CONNECT` | 33 | Couldn’t connect to it |
| `HTTP` | 31 | Answered with an error |

## By provider

| Provider | Found | Not there | Failed | Skipped | Streams | Verified | Started | Mean time | Main failure |
|---|---|---|---|---|---|---|---|---|---|
| Castle (`castle`) | 30 | 4 | 0 | 0 | 56 | 56 | 35 | 1.5 s |  |
| VidLink (`vidlink`) | 27 | 7 | 0 | 0 | 28 | 23 | 2 | 5.2 s |  |
| VidNest (`vidnest`) | 7 | 0 | 27 | 0 | 7 | 7 | 1 | 9.8 s | `TIMEOUT` ×27 |
| Cuevana3 (`sv-cuevana3`) | 1 | 18 | 15 | 0 | 1 | 1 | 0 | 2.8 s | `TIMEOUT` ×15 |
| VidSrc (`vidsrc`) | 34 | 0 | 0 | 0 | 34 | 0 | 0 | 943 ms |  |
| CineSu (`cinesu`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 981 ms | `REDIRECTED` ×34 |
| Febbox (`febbox`) | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 0 ms |  |
| FshareTV (`fsharetv`) | 0 | 0 | 20 | 0 | 0 | 0 | 0 | 10.4 s | `CONNECT` ×11 |
| Icefy (`icefy`) | 0 | 3 | 31 | 0 | 0 | 0 | 0 | 705 ms | `HTTP` ×31 |
| Peachify (`peachify`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 713 ms | `TIMEOUT` ×34 |
| Popr (`popr`) | 0 | 12 | 22 | 0 | 0 | 0 | 0 | 6.9 s | `CONNECT` ×22 |
| MafiaEmbed (`streammafia`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 8.0 s | `TIMEOUT` ×34 |
| AnimeKai 🔥 (`sv-animekai`) | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 691 ms | `TIMEOUT` ×14 |
| Animetsu (`sv-animetsu`) | 0 | 8 | 6 | 0 | 0 | 0 | 0 | 710 ms | `TIMEOUT` ×6 |
| CineHDPlus (Latino) (`sv-cinehdplus`) | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 773 ms | `TIMEOUT` ×14 |
| FSOnline (`sv-fsonline`) | 0 | 7 | 27 | 0 | 0 | 0 | 0 | 1.9 s | `CHALLENGE` ×25 |
| HDRezka (`sv-hdrezka`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 983 ms |  |
| Insertunit (`sv-insertunit`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 15.0 s | `CANCELLED` ×34 |
| LookMovie (`sv-lookmovie`) | 0 | 22 | 12 | 0 | 0 | 0 | 0 | 1.7 s | `ACCESS_DENIED` ×12 |
| PelisPlusHD (`sv-pelisplushd`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 724 ms |  |
| RGShows (`sv-rgshows`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 924 ms |  |
| RidoMovies (`sv-ridomovies`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 279 ms | `CHALLENGE` ×34 |
| WatchAnimeWorld (`sv-watchanimeworld`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 806 ms | `TIMEOUT` ×34 |
| Wecima (Arabic) (`sv-wecima`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 241 ms | `TLS` ×34 |
| ZoeChip (`sv-zoechip`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 556 ms |  |
| Zunime (`sv-zunime`) | 0 | 8 | 6 | 0 | 0 | 0 | 0 | 2.1 s | `STRUCTURE_CHANGED` ×4 |
| Tulnex (`tulnex`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 761 ms | `TIMEOUT` ×34 |
| Videasy (`videasy`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 338 ms | `ACCESS_DENIED` ×34 |
| VidRock (`vidrock`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 1.1 s |  |
| VidZee (`vidzee`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 448 ms | `STRUCTURE_CHANGED` ×34 |
| VixSrc (`vixsrc`) | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 0 ms |  |

## By title

| Title | Category | Lang | Year | Queried | Responding | With results | Unique | Verified | Started | First result | First verified | Failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casablanca | Western films | en | 1942 | 25 | 10 | 2 | 2 | 0 | 0/0 | 2.4 s | – | TIMEOUT×6 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| the-godfather | Western films | en | 1972 | 25 | 11 | 5 | 6 | 5 | 1/2 | 1.4 s | 2.8 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CONNECT×1 TLS×1 CANCELLED×1 |
| the-matrix | Western films | en | 1999 | 25 | 10 | 4 | 4 | 3 | 2/2 | 1.5 s | 2.7 s | TIMEOUT×5 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| inception | Western films | en | 2010 | 25 | 11 | 4 | 6 | 5 | 1/2 | 1.4 s | 2.2 s | TIMEOUT×4 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| interstellar | Western films | en | 2014 | 25 | 10 | 2 | 3 | 2 | 2/2 | 1.4 s | 2.1 s | TIMEOUT×5 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| oppenheimer | Western films | en | 2023 | 25 | 9 | 3 | 6 | 4 | 2/2 | 1.6 s | 2.3 s | TIMEOUT×6 TLS×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 CANCELLED×1 |
| dune-part-two | Western films | en | 2024 | 25 | 11 | 3 | 7 | 6 | 1/2 | 1.4 s | 1.5 s | TIMEOUT×6 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| breaking-bad | Western television | en | 2008 | 28 | 11 | 4 | 4 | 3 | 1/2 | 1.8 s | 2.5 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| game-of-thrones | Western television | en | 2011 | 28 | 11 | 4 | 5 | 4 | 1/2 | 1.8 s | 2.2 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| the-office | Western television | en | 2005 | 28 | 10 | 3 | 3 | 2 | 1/2 | 1.3 s | 1.9 s | TIMEOUT×9 ACCESS_DENIED×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 CHALLENGE×1 CONNECT×1 TLS×1 CANCELLED×1 |
| stranger-things | Western television | en | 2016 | 28 | 10 | 3 | 3 | 2 | 1/2 | 1.8 s | 2.4 s | TIMEOUT×8 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| the-last-of-us | Western television | en | 2023 | 28 | 10 | 3 | 5 | 4 | 1/2 | 1.7 s | 2.5 s | TIMEOUT×8 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| severance | Western television | en | 2022 | 28 | 10 | 3 | 3 | 2 | 2/2 | 1.4 s | 1.9 s | TIMEOUT×8 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| spirited-away | Anime | ja | 2001 | 25 | 11 | 3 | 3 | 2 | 2/2 | 1.4 s | 2.3 s | TIMEOUT×5 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| your-name | Anime | ja | 2016 | 25 | 9 | 3 | 3 | 1 | 1/1 | 1.6 s | 2.5 s | TIMEOUT×7 CHALLENGE×2 HTTP×1 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| attack-on-titan | Anime | ja | 2013 | 28 | 11 | 4 | 7 | 6 | 1/2 | 1.4 s | 1.8 s | TIMEOUT×8 STRUCTURE_CHANGED×2 ACCESS_DENIED×2 REDIRECTED×1 HTTP×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| demon-slayer | Anime | ja | 2019 | 28 | 9 | 3 | 4 | 3 | 1/2 | 1.6 s | 2.1 s | TIMEOUT×9 ACCESS_DENIED×2 CHALLENGE×2 CANCELLED×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 |
| one-piece | Anime | ja | 1999 | 28 | 10 | 2 | 2 | 1 | 0/1 | 2.1 s | 2.7 s | TIMEOUT×8 STRUCTURE_CHANGED×2 ACCESS_DENIED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| jujutsu-kaisen | Anime | ja | 2020 | 28 | 9 | 3 | 4 | 3 | 1/2 | 1.8 s | 2.6 s | TIMEOUT×9 STRUCTURE_CHANGED×2 ACCESS_DENIED×2 HTTP×1 REDIRECTED×1 CHALLENGE×1 TLS×1 CONNECT×1 CANCELLED×1 |
| 3-idiots | Indian cinema and TV | hi | 2009 | 25 | 10 | 3 | 3 | 2 | 1/2 | 1.4 s | 2.6 s | TIMEOUT×5 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| dangal | Indian cinema and TV | hi | 2016 | 25 | 11 | 2 | 2 | 1 | 1/1 | 1.2 s | 2.1 s | TIMEOUT×5 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| lagaan | Indian cinema and TV | hi | 2001 | 25 | 10 | 3 | 3 | 2 | 1/2 | 1.4 s | 2.4 s | TIMEOUT×6 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 HTTP×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| rrr | Indian cinema and TV | te | 2022 | 25 | 11 | 2 | 3 | 2 | 2/2 | 1.4 s | 2.1 s | TIMEOUT×6 TLS×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 CANCELLED×1 |
| baahubali-2 | Indian cinema and TV | te | 2017 | 25 | 12 | 1 | 1 | 0 | 0/0 | 7.0 s | – | TIMEOUT×6 STRUCTURE_CHANGED×1 REDIRECTED×1 HTTP×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| vikram | Indian cinema and TV | ta | 2022 | 25 | 12 | 2 | 3 | 2 | 2/2 | 1.7 s | 2.3 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| drishyam | Indian cinema and TV | ml | 2013 | 25 | 12 | 3 | 3 | 2 | 1/2 | 1.3 s | 1.7 s | TIMEOUT×5 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CONNECT×1 CANCELLED×1 |
| kgf-chapter-2 | Indian cinema and TV | kn | 2022 | 25 | 12 | 3 | 4 | 3 | 1/2 | 1.6 s | 2.2 s | TIMEOUT×6 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| sacred-games | Indian cinema and TV | hi | 2018 | 28 | 14 | 3 | 3 | 2 | 1/2 | 1.5 s | 2.2 s | TIMEOUT×7 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| parasite | Other languages | ko | 2019 | 25 | 9 | 3 | 7 | 4 | 2/2 | 1.4 s | 1.8 s | TIMEOUT×6 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| squid-game | Other languages | ko | 2021 | 28 | 10 | 3 | 3 | 2 | 1/2 | 2.1 s | 2.8 s | TIMEOUT×8 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| money-heist | Other languages | es | 2017 | 28 | 11 | 3 | 4 | 3 | 1/2 | 2.2 s | 2.8 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 STRUCTURE_CHANGED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| amelie | Other languages | fr | 2001 | 25 | 10 | 2 | 2 | 1 | 0/1 | 2.3 s | 2.8 s | TIMEOUT×7 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| dark | Other languages | de | 2017 | 28 | 10 | 3 | 3 | 2 | 1/2 | 1.4 s | 2.4 s | TIMEOUT×8 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| city-of-god | Other languages | pt | 2002 | 25 | 11 | 2 | 2 | 1 | 1/1 | 1.6 s | 2.6 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |

## Discovered streams that did not verify

| Provider and reason | Streams |
|---|---|
| vidlink: HTTP (Answered with an error (host)) | 4 |
| vidlink: RATE_LIMITED (Is rate-limiting requests (host)) | 1 |

## Verified streams that did not start in the player

| Title | Provider | Type | Why |
|---|---|---|---|
| the-godfather | vidlink | dash | no picture after 25s (readyState 4) |
| inception | vidlink | dash | no picture after 25s (readyState 4) |
| dune-part-two | vidlink | dash | no picture after 25s (readyState 4) |
| breaking-bad | vidlink | dash | no picture after 25s (readyState 4) |
| game-of-thrones | vidlink | dash | no picture after 25s (readyState 4) |
| the-office | vidlink | dash | no picture after 25s (readyState 4) |
| stranger-things | vidlink | dash | no picture after 25s (readyState 4) |
| the-last-of-us | vidlink | dash | no picture after 25s (readyState 4) |
| attack-on-titan | vidlink | dash | no picture after 25s (readyState 4) |
| demon-slayer | vidlink | dash | no picture after 25s (readyState 4) |
| one-piece | vidlink | dash | no picture after 25s (readyState 4) |
| jujutsu-kaisen | vidlink | dash | no picture after 25s (readyState 4) |
| 3-idiots | vidlink | dash | no picture after 25s (readyState 4) |
| lagaan | vidlink | dash | no picture after 25s (readyState 4) |
| drishyam | vidlink | dash | no picture after 25s (readyState 4) |
| kgf-chapter-2 | vidlink | dash | no picture after 25s (readyState 4) |
| sacred-games | vidlink | dash | no picture after 25s (readyState 4) |
| squid-game | vidlink | dash | no picture after 25s (readyState 4) |
| money-heist | vidlink | dash | no picture after 25s (readyState 4) |
| amelie | vidlink | dash | no picture after 25s (readyState 4) |
| dark | vidlink | dash | no picture after 25s (readyState 4) |
