# Source availability: final-cloud

- Run: `final-cloud`, **LIVE** (real sites over the network)
- Target: provider pack in this process (engine, providers ran from a data-centre address)
- Streams tried from: a data-centre address (cloud sandbox behind an HTTPS egress proxy, 2026-11-25; all providers, browser runtime on)
- Playback in a browser: checked
- When: 2026-11-25T01:22:24.365Z to 2026-11-25T01:39:09.515Z, commit `9a4ee08`

## Summary

| Measure | Value |
|---|---|
| Titles | 34 |
| Providers registered | 36 |
| Providers that got an answer from their site at least once | 21 |
| Providers that returned a stream at least once | 11 |
| Streams discovered (every provider, with duplicates) | 173 |
| Unique streams | 173 |
| Unique streams verified (manifest and first media bytes) | 127 |
| Streams that started in a browser player | 65 of 68 tried |
| Verified streams the test browser cannot decode (not tried) | 23 |
| Titles with at least one stream | 34 of 34 |
| Titles with at least one verified stream | 32 of 34 |
| Titles with a stream that started | 31 of 34 |
| Mean provider response time | 2.4 s |
| Median time to first result | 1.4 s |
| Median time to first verified stream | 2.1 s |

## By category

| Category | Titles | With a verified stream | With playback started | Unique streams | Verified | Started |
|---|---|---|---|---|---|---|
| Western films | 7 | 6 | 6 | 33 | 24 | 17 |
| Western television | 6 | 6 | 6 | 24 | 18 | 12 |
| Anime | 6 | 6 | 6 | 65 | 52 | 18 |
| Indian cinema and TV | 9 | 8 | 8 | 26 | 16 | 10 |
| Other languages | 6 | 6 | 5 | 25 | 17 | 8 |

## Why providers failed

| Failure | Provider runs | Meaning |
|---|---|---|
| `TIMEOUT` | 187 | Took too long to answer |
| `CHALLENGE` | 59 | Is behind a bot check here |
| `ACCESS_DENIED` | 46 | Refuses this connection |
| `STRUCTURE_CHANGED` | 36 | Changed its site; needs an update |
| `TLS` | 36 | Its certificate was rejected |
| `CANCELLED` | 35 | Cancelled |
| `REDIRECTED` | 34 | Has moved to another address |
| `CONNECT` | 22 | Couldn’t connect to it |
| `HTTP` | 21 | Answered with an error |

## By provider

| Provider | Found | Not there | Failed | Skipped | Streams | Verified | Started | Mean time | Main failure |
|---|---|---|---|---|---|---|---|---|---|
| Castle (`castle`) | 30 | 4 | 0 | 0 | 55 | 55 | 40 | 1.4 s |  |
| VidLink (`vidlink`) | 27 | 7 | 0 | 0 | 28 | 23 | 2 | 4.9 s |  |
| VidNest (`vidnest`) | 12 | 22 | 0 | 0 | 12 | 12 | 5 | 9.0 s |  |
| AnimoTVSlash (`anime-animotvslash`) | 6 | 0 | 0 | 0 | 12 | 12 | 6 | 682 ms |  |
| Shonen (`anime-shonen`) | 6 | 0 | 0 | 0 | 11 | 10 | 5 | 3.6 s |  |
| ZokoAnime (`anime-zokoanime`) | 6 | 0 | 0 | 0 | 6 | 6 | 6 | 1.4 s |  |
| AnimeHeaven (`anime-animeheaven`) | 5 | 1 | 0 | 0 | 5 | 5 | 0 | 727 ms |  |
| Cuevana3 (`sv-cuevana3`) | 2 | 18 | 14 | 0 | 2 | 2 | 1 | 2.0 s | `TIMEOUT` ×14 |
| Megavid (`anime-megavid`) | 6 | 0 | 0 | 0 | 6 | 1 | 0 | 1.4 s |  |
| LookMovie (`sv-lookmovie`) | 2 | 20 | 12 | 0 | 2 | 1 | 0 | 1.6 s | `ACCESS_DENIED` ×12 |
| VidSrc (`vidsrc`) | 34 | 0 | 0 | 0 | 34 | 0 | 0 | 830 ms |  |
| CineSu (`cinesu`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 816 ms | `REDIRECTED` ×34 |
| Febbox (`febbox`) | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 0 ms |  |
| FshareTV (`fsharetv`) | 0 | 0 | 20 | 0 | 0 | 0 | 0 | 8.8 s | `CONNECT` ×19 |
| Icefy (`icefy`) | 0 | 14 | 20 | 0 | 0 | 0 | 0 | 631 ms | `HTTP` ×20 |
| Peachify (`peachify`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 710 ms | `TIMEOUT` ×34 |
| Popr (`popr`) | 0 | 31 | 3 | 0 | 0 | 0 | 0 | 4.0 s | `CONNECT` ×3 |
| MafiaEmbed (`streammafia`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 8.0 s | `TIMEOUT` ×34 |
| AnimeKai 🔥 (`sv-animekai`) | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 668 ms | `TIMEOUT` ×14 |
| Animetsu (`sv-animetsu`) | 0 | 8 | 6 | 0 | 0 | 0 | 0 | 667 ms | `TIMEOUT` ×6 |
| CineHDPlus (Latino) (`sv-cinehdplus`) | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 714 ms | `TIMEOUT` ×14 |
| FSOnline (`sv-fsonline`) | 0 | 7 | 27 | 0 | 0 | 0 | 0 | 1.6 s | `CHALLENGE` ×25 |
| HDRezka (`sv-hdrezka`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 881 ms |  |
| Insertunit (`sv-insertunit`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 15.0 s | `CANCELLED` ×34 |
| PelisPlusHD (`sv-pelisplushd`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 638 ms |  |
| RGShows (`sv-rgshows`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 859 ms |  |
| RidoMovies (`sv-ridomovies`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 219 ms | `CHALLENGE` ×34 |
| WatchAnimeWorld (`sv-watchanimeworld`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 771 ms | `TIMEOUT` ×34 |
| Wecima (Arabic) (`sv-wecima`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 217 ms | `TLS` ×34 |
| ZoeChip (`sv-zoechip`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 600 ms |  |
| Zunime (`sv-zunime`) | 0 | 8 | 6 | 0 | 0 | 0 | 0 | 2.7 s | `STRUCTURE_CHANGED` ×3 |
| Tulnex (`tulnex`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 772 ms | `TIMEOUT` ×34 |
| Videasy (`videasy`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 271 ms | `ACCESS_DENIED` ×34 |
| VidRock (`vidrock`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 1.0 s |  |
| VidZee (`vidzee`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 367 ms | `STRUCTURE_CHANGED` ×33 |
| VixSrc (`vixsrc`) | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 0 ms |  |

## By title

| Title | Category | Lang | Year | Queried | Responding | With results | Unique | Verified | Started | First result | First verified | Failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casablanca | Western films | en | 1942 | 25 | 13 | 2 | 2 | 0 | 0/0 | 2.0 s | – | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| the-godfather | Western films | en | 1972 | 25 | 10 | 4 | 5 | 4 | 3/3 | 1.5 s | 2.1 s | TIMEOUT×5 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| the-matrix | Western films | en | 1999 | 25 | 12 | 4 | 4 | 3 | 3/3 | 1.5 s | 2.1 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| inception | Western films | en | 2010 | 25 | 12 | 4 | 6 | 5 | 3/3 | 1.3 s | 1.9 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| interstellar | Western films | en | 2014 | 25 | 12 | 2 | 3 | 2 | 2/2 | 1.3 s | 2.1 s | TIMEOUT×4 CHALLENGE×2 HTTP×1 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| oppenheimer | Western films | en | 2023 | 25 | 11 | 3 | 6 | 4 | 3/3 | 1.4 s | 1.8 s | TIMEOUT×5 TLS×2 STRUCTURE_CHANGED×1 REDIRECTED×1 HTTP×1 ACCESS_DENIED×1 CHALLENGE×1 CONNECT×1 CANCELLED×1 |
| dune-part-two | Western films | en | 2024 | 25 | 13 | 3 | 7 | 6 | 3/3 | 1.4 s | 1.7 s | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| breaking-bad | Western television | en | 2008 | 28 | 12 | 4 | 4 | 3 | 2/2 | 1.4 s | 1.8 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| game-of-thrones | Western television | en | 2011 | 28 | 13 | 5 | 6 | 5 | 3/3 | 1.6 s | 2.3 s | TIMEOUT×6 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| the-office | Western television | en | 2005 | 28 | 13 | 3 | 3 | 2 | 1/1 | 1.4 s | 2.1 s | TIMEOUT×7 STRUCTURE_CHANGED×2 ACCESS_DENIED×2 REDIRECTED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| stranger-things | Western television | en | 2016 | 28 | 12 | 3 | 3 | 2 | 1/1 | 1.6 s | 1.8 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| the-last-of-us | Western television | en | 2023 | 28 | 13 | 3 | 5 | 4 | 3/3 | 1.9 s | 2.2 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| severance | Western television | en | 2022 | 28 | 12 | 3 | 3 | 2 | 2/2 | 1.4 s | 1.7 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| spirited-away | Anime | ja | 2001 | 30 | 16 | 7 | 9 | 7 | 3/3 | 1.4 s | 1.6 s | TIMEOUT×5 CONNECT×2 STRUCTURE_CHANGED×1 REDIRECTED×1 HTTP×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| your-name | Anime | ja | 2016 | 30 | 17 | 9 | 10 | 7 | 3/3 | 1.4 s | 2.3 s | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 HTTP×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| attack-on-titan | Anime | ja | 2013 | 33 | 16 | 9 | 14 | 11 | 3/3 | 1.4 s | 1.8 s | TIMEOUT×8 STRUCTURE_CHANGED×2 ACCESS_DENIED×2 HTTP×1 REDIRECTED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| demon-slayer | Anime | ja | 2019 | 33 | 16 | 9 | 12 | 11 | 3/3 | 1.8 s | 2.4 s | TIMEOUT×9 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| one-piece | Anime | ja | 1999 | 33 | 16 | 7 | 9 | 7 | 3/3 | 2.1 s | 2.6 s | TIMEOUT×7 STRUCTURE_CHANGED×2 ACCESS_DENIED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| jujutsu-kaisen | Anime | ja | 2020 | 33 | 17 | 8 | 11 | 9 | 3/3 | 1.8 s | 2.4 s | TIMEOUT×9 ACCESS_DENIED×2 STRUCTURE_CHANGED×1 REDIRECTED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| 3-idiots | Indian cinema and TV | hi | 2009 | 25 | 12 | 4 | 4 | 2 | 1/1 | 1.1 s | 2.2 s | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| dangal | Indian cinema and TV | hi | 2016 | 25 | 13 | 2 | 2 | 1 | 1/1 | 1.2 s | 1.8 s | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| lagaan | Indian cinema and TV | hi | 2001 | 25 | 12 | 3 | 3 | 2 | 1/1 | 1.7 s | 2.4 s | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| rrr | Indian cinema and TV | te | 2022 | 25 | 13 | 3 | 3 | 2 | 1/2 | 1.3 s | 1.8 s | TIMEOUT×4 TLS×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 CONNECT×1 CANCELLED×1 |
| baahubali-2 | Indian cinema and TV | te | 2017 | 25 | 13 | 1 | 1 | 0 | 0/0 | 6.8 s | – | TIMEOUT×4 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 CONNECT×1 TLS×1 CANCELLED×1 |
| vikram | Indian cinema and TV | ta | 2022 | 25 | 11 | 2 | 3 | 2 | 2/2 | 2.0 s | 2.7 s | TIMEOUT×4 CHALLENGE×2 CONNECT×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| drishyam | Indian cinema and TV | ml | 2013 | 25 | 14 | 3 | 3 | 2 | 1/1 | 1.2 s | 1.6 s | TIMEOUT×4 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 CONNECT×1 TLS×1 CANCELLED×1 |
| kgf-chapter-2 | Indian cinema and TV | kn | 2022 | 25 | 13 | 3 | 4 | 3 | 2/2 | 1.1 s | 1.8 s | TIMEOUT×4 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 CONNECT×1 TLS×1 CANCELLED×1 |
| sacred-games | Indian cinema and TV | hi | 2018 | 28 | 15 | 3 | 3 | 2 | 1/1 | 2.0 s | 2.5 s | TIMEOUT×6 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| parasite | Other languages | ko | 2019 | 25 | 11 | 3 | 7 | 4 | 3/3 | 1.2 s | 1.8 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CONNECT×1 TLS×1 CANCELLED×1 |
| squid-game | Other languages | ko | 2021 | 28 | 12 | 4 | 4 | 3 | 1/1 | 1.6 s | 2.1 s | TIMEOUT×7 ACCESS_DENIED×2 CHALLENGE×2 STRUCTURE_CHANGED×1 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| money-heist | Other languages | es | 2017 | 28 | 13 | 4 | 5 | 4 | 2/2 | 1.9 s | 2.3 s | TIMEOUT×6 ACCESS_DENIED×2 CHALLENGE×2 HTTP×1 STRUCTURE_CHANGED×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| amelie | Other languages | fr | 2001 | 25 | 12 | 3 | 3 | 2 | 0/1 | 1.7 s | 2.1 s | TIMEOUT×5 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CONNECT×1 CANCELLED×1 |
| dark | Other languages | de | 2017 | 28 | 13 | 3 | 3 | 2 | 1/1 | 1.5 s | 2.2 s | TIMEOUT×7 CHALLENGE×2 CANCELLED×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 |
| city-of-god | Other languages | pt | 2002 | 25 | 13 | 3 | 3 | 2 | 1/2 | 953 ms | 1.4 s | TIMEOUT×4 CHALLENGE×2 STRUCTURE_CHANGED×1 REDIRECTED×1 ACCESS_DENIED×1 CONNECT×1 TLS×1 CANCELLED×1 |

## Discovered streams that did not verify

| Provider and reason | Streams |
|---|---|
| anime-megavid: TIMEOUT (Took too long to answer (host)) | 5 |
| vidlink: HTTP (Answered with an error (host)) | 4 |
| vidlink: RATE_LIMITED (Is rate-limiting requests (host)) | 1 |
| anime-shonen: HTTP (Answered with an error (host)) | 1 |
| sv-lookmovie: HTTP (Answered with an error (host)) | 1 |

## Verified streams that did not start in the player

| Title | Provider | Type | Why |
|---|---|---|---|
| rrr | vidnest | mkv | media error 4 |
| amelie | vidnest | mkv | media error 4 |
| city-of-god | sv-lookmovie | hls | networkError: manifestLoadError |
