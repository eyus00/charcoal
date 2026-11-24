# Source availability: baseline-cloud

- Run: `baseline-cloud`, **LIVE** (real sites over the network)
- Target: http://127.0.0.1:3907 (v2)
- Streams tried from: a data-centre address (cloud sandbox behind an HTTPS egress proxy, 2026-11-24)
- Playback in a browser: checked
- When: 2026-11-24T19:48:05.816Z to 2026-11-24T20:03:11.043Z, commit `fd7ce76`

## Summary

| Measure | Value |
|---|---|
| Titles | 34 |
| Providers registered | 31 |
| Providers that got an answer from their site at least once | 18 |
| Providers that returned a stream at least once | 3 |
| Streams discovered (every provider, with duplicates) | 58 |
| Unique streams | 58 |
| Unique streams verified (manifest and first media bytes) | 55 |
| Streams that started in a browser player | 44 of 44 tried |
| Titles with at least one stream | 30 of 34 |
| Titles with at least one verified stream | 30 of 34 |
| Titles with a stream that started | 30 of 34 |
| Mean provider response time | 2.8 s |
| Median time to first result | 1.6 s |
| Median time to first verified stream | 2.3 s |

## By category

| Category | Titles | With a verified stream | With playback started | Unique streams | Verified | Started |
|---|---|---|---|---|---|---|
| Western films | 7 | 6 | 6 | 17 | 17 | 11 |
| Western television | 6 | 6 | 6 | 9 | 9 | 8 |
| Anime | 6 | 5 | 5 | 11 | 10 | 8 |
| Indian cinema and TV | 9 | 8 | 8 | 13 | 11 | 11 |
| Other languages | 6 | 5 | 5 | 8 | 8 | 6 |

## Why providers failed

| Failure | Provider runs | Meaning |
|---|---|---|
| `TIMEOUT` | 117 | Took too long to answer |
| `STRUCTURE_CHANGED` | 74 | Changed its site; needs an update |
| `CHALLENGE` | 59 | Is behind a bot check here |
| `TLS` | 36 | Its certificate was rejected |
| `REDIRECTED` | 34 | Has moved to another address |
| `CANCELLED` | 34 | Cancelled |
| `HTTP` | 26 | Answered with an error |
| `NETWORK` | 20 | Couldn’t be reached |
| `ACCESS_DENIED` | 12 | Refuses this connection |

## By provider

| Provider | Found | Not there | Failed | Skipped | Streams | Verified | Started | Mean time | Main failure |
|---|---|---|---|---|---|---|---|---|---|
| Castle (`castle`) | 30 | 4 | 0 | 0 | 54 | 54 | 43 | 1.5 s |  |
| Cuevana3 (`sv-cuevana3`) | 1 | 18 | 15 | 0 | 1 | 1 | 1 | 3.4 s | `TIMEOUT` ×15 |
| LookMovie (`sv-lookmovie`) | 3 | 19 | 12 | 0 | 3 | 0 | 0 | 2.0 s | `ACCESS_DENIED` ×12 |
| CineSu (`cinesu`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 797 ms |  |
| CineSu (`cinesu-rules`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 839 ms | `REDIRECTED` ×34 |
| Febbox (`febbox`) | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 0 ms |  |
| FshareTV (`fsharetv`) | 0 | 0 | 20 | 0 | 0 | 0 | 0 | 6.7 s | `NETWORK` ×20 |
| Icefy (`icefy`) | 0 | 8 | 26 | 0 | 0 | 0 | 0 | 704 ms | `HTTP` ×26 |
| Peachify (`peachify`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 273 ms |  |
| Popr (`popr`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 4.8 s |  |
| MafiaEmbed (`streammafia`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 10.3 s |  |
| AnimeKai 🔥 (`sv-animekai`) | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 744 ms | `TIMEOUT` ×14 |
| Animetsu (`sv-animetsu`) | 0 | 8 | 6 | 0 | 0 | 0 | 0 | 813 ms | `TIMEOUT` ×6 |
| CineHDPlus (Latino) (`sv-cinehdplus`) | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 882 ms | `TIMEOUT` ×14 |
| FSOnline (`sv-fsonline`) | 0 | 7 | 27 | 0 | 0 | 0 | 0 | 2.2 s | `CHALLENGE` ×25 |
| HDRezka (`sv-hdrezka`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 1.1 s |  |
| Insertunit (`sv-insertunit`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 15.0 s | `CANCELLED` ×34 |
| PelisPlusHD (`sv-pelisplushd`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 840 ms |  |
| RGShows (`sv-rgshows`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 1.1 s |  |
| RidoMovies (`sv-ridomovies`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 312 ms | `CHALLENGE` ×34 |
| WatchAnimeWorld (`sv-watchanimeworld`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 956 ms | `TIMEOUT` ×34 |
| Wecima (Arabic) (`sv-wecima`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 254 ms | `TLS` ×34 |
| ZoeChip (`sv-zoechip`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 609 ms |  |
| Zunime (`sv-zunime`) | 0 | 8 | 6 | 0 | 0 | 0 | 0 | 400 ms | `STRUCTURE_CHANGED` ×6 |
| Tulnex (`tulnex`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 285 ms |  |
| Videasy (`videasy`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 15.0 s | `TIMEOUT` ×34 |
| VidNest (`vidnest`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 535 ms |  |
| VidRock (`vidrock`) | 0 | 34 | 0 | 0 | 0 | 0 | 0 | 3.3 s |  |
| VidSrc (`vidsrc`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 868 ms | `STRUCTURE_CHANGED` ×34 |
| VidZee (`vidzee`) | 0 | 0 | 34 | 0 | 0 | 0 | 0 | 442 ms | `STRUCTURE_CHANGED` ×34 |
| VixSrc (`vixsrc`) | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 0 ms |  |

## By title

| Title | Category | Lang | Year | Queried | Responding | With results | Unique | Verified | Started | First result | First verified | Failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casablanca | Western films | en | 1942 | 25 | 14 | 0 | 0 | 0 | 0/0 | – | – | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 REDIRECTED×1 HTTP×1 TLS×1 NETWORK×1 CANCELLED×1 |
| the-godfather | Western films | en | 1972 | 25 | 14 | 1 | 2 | 2 | 2/2 | 1.5 s | 2.5 s | TIMEOUT×3 CHALLENGE×2 STRUCTURE_CHANGED×2 REDIRECTED×1 TLS×1 NETWORK×1 CANCELLED×1 |
| the-matrix | Western films | en | 1999 | 25 | 13 | 1 | 1 | 1 | 1/1 | 1.4 s | 2.6 s | TIMEOUT×3 CHALLENGE×2 STRUCTURE_CHANGED×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| inception | Western films | en | 2010 | 25 | 14 | 1 | 3 | 3 | 2/2 | 1.6 s | 1.9 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 REDIRECTED×1 HTTP×1 NETWORK×1 TLS×1 CANCELLED×1 |
| interstellar | Western films | en | 2014 | 25 | 14 | 1 | 2 | 2 | 2/2 | 1.6 s | 2.2 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| oppenheimer | Western films | en | 2023 | 25 | 13 | 1 | 4 | 4 | 2/2 | 1.4 s | 2.4 s | TIMEOUT×3 STRUCTURE_CHANGED×2 TLS×2 HTTP×1 REDIRECTED×1 CHALLENGE×1 NETWORK×1 CANCELLED×1 |
| dune-part-two | Western films | en | 2024 | 25 | 14 | 1 | 5 | 5 | 2/2 | 2.0 s | 2.4 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| breaking-bad | Western television | en | 2008 | 28 | 14 | 1 | 1 | 1 | 1/1 | 1.8 s | 2.6 s | TIMEOUT×5 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| game-of-thrones | Western television | en | 2011 | 28 | 15 | 1 | 2 | 2 | 2/2 | 1.4 s | 2.1 s | TIMEOUT×5 STRUCTURE_CHANGED×2 CHALLENGE×2 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| the-office | Western television | en | 2005 | 28 | 14 | 1 | 1 | 1 | 1/1 | 1.2 s | 2.2 s | TIMEOUT×5 STRUCTURE_CHANGED×3 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| stranger-things | Western television | en | 2016 | 28 | 14 | 1 | 1 | 1 | 1/1 | 1.9 s | 2.8 s | TIMEOUT×5 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| the-last-of-us | Western television | en | 2023 | 28 | 15 | 1 | 3 | 3 | 2/2 | 1.8 s | 2.3 s | TIMEOUT×5 STRUCTURE_CHANGED×2 CHALLENGE×2 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| severance | Western television | en | 2022 | 28 | 15 | 1 | 1 | 1 | 1/1 | 1.2 s | 1.7 s | TIMEOUT×5 STRUCTURE_CHANGED×2 CHALLENGE×2 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| spirited-away | Anime | ja | 2001 | 25 | 14 | 2 | 2 | 1 | 1/1 | 1.6 s | 2.2 s | TIMEOUT×3 STRUCTURE_CHANGED×2 REDIRECTED×1 HTTP×1 CHALLENGE×1 NETWORK×1 TLS×1 CANCELLED×1 |
| your-name | Anime | ja | 2016 | 25 | 14 | 2 | 2 | 2 | 2/2 | 1.7 s | 2.5 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| attack-on-titan | Anime | ja | 2013 | 28 | 13 | 1 | 4 | 4 | 2/2 | 1.7 s | 2.3 s | TIMEOUT×6 STRUCTURE_CHANGED×3 REDIRECTED×1 HTTP×1 ACCESS_DENIED×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| demon-slayer | Anime | ja | 2019 | 28 | 12 | 1 | 2 | 2 | 2/2 | 1.8 s | 2.4 s | TIMEOUT×6 STRUCTURE_CHANGED×3 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| one-piece | Anime | ja | 1999 | 28 | 13 | 0 | 0 | 0 | 0/0 | – | – | TIMEOUT×5 STRUCTURE_CHANGED×3 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| jujutsu-kaisen | Anime | ja | 2020 | 28 | 14 | 1 | 1 | 1 | 1/1 | 1.8 s | 2.8 s | TIMEOUT×6 STRUCTURE_CHANGED×3 REDIRECTED×1 CHALLENGE×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| 3-idiots | Indian cinema and TV | hi | 2009 | 25 | 15 | 1 | 1 | 1 | 1/1 | 1.4 s | 2.4 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| dangal | Indian cinema and TV | hi | 2016 | 25 | 15 | 2 | 2 | 1 | 1/1 | 1.3 s | 1.9 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| lagaan | Indian cinema and TV | hi | 2001 | 25 | 15 | 1 | 1 | 1 | 1/1 | 1.5 s | 2.2 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 REDIRECTED×1 TLS×1 NETWORK×1 CANCELLED×1 |
| rrr | Indian cinema and TV | te | 2022 | 25 | 14 | 2 | 3 | 2 | 2/2 | 1.3 s | 2.0 s | STRUCTURE_CHANGED×2 TIMEOUT×2 TLS×2 REDIRECTED×1 HTTP×1 NETWORK×1 CHALLENGE×1 CANCELLED×1 |
| baahubali-2 | Indian cinema and TV | te | 2017 | 25 | 15 | 0 | 0 | 0 | 0/0 | – | – | STRUCTURE_CHANGED×2 TIMEOUT×2 REDIRECTED×1 HTTP×1 CHALLENGE×1 NETWORK×1 TLS×1 CANCELLED×1 |
| vikram | Indian cinema and TV | ta | 2022 | 25 | 14 | 1 | 2 | 2 | 2/2 | 2.0 s | 2.7 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| drishyam | Indian cinema and TV | ml | 2013 | 25 | 15 | 1 | 1 | 1 | 1/1 | 1.6 s | 2.2 s | STRUCTURE_CHANGED×2 TIMEOUT×2 HTTP×1 REDIRECTED×1 NETWORK×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| kgf-chapter-2 | Indian cinema and TV | kn | 2022 | 25 | 15 | 1 | 2 | 2 | 2/2 | 1.4 s | 2.2 s | STRUCTURE_CHANGED×2 TIMEOUT×2 REDIRECTED×1 HTTP×1 NETWORK×1 CHALLENGE×1 TLS×1 CANCELLED×1 |
| sacred-games | Indian cinema and TV | hi | 2018 | 28 | 16 | 1 | 1 | 1 | 1/1 | 1.8 s | 2.7 s | TIMEOUT×4 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| parasite | Other languages | ko | 2019 | 25 | 13 | 1 | 4 | 4 | 2/2 | 2.0 s | 2.3 s | TIMEOUT×3 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| squid-game | Other languages | ko | 2021 | 28 | 14 | 1 | 1 | 1 | 1/1 | 2.0 s | 2.3 s | TIMEOUT×5 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| money-heist | Other languages | es | 2017 | 28 | 15 | 1 | 1 | 1 | 1/1 | 1.9 s | 2.6 s | TIMEOUT×4 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 ACCESS_DENIED×1 TLS×1 CANCELLED×1 |
| amelie | Other languages | fr | 2001 | 25 | 13 | 0 | 0 | 0 | 0/0 | – | – | TIMEOUT×3 STRUCTURE_CHANGED×2 CHALLENGE×2 HTTP×1 REDIRECTED×1 NETWORK×1 TLS×1 CANCELLED×1 |
| dark | Other languages | de | 2017 | 28 | 14 | 1 | 1 | 1 | 1/1 | 1.4 s | 2.7 s | TIMEOUT×5 STRUCTURE_CHANGED×3 CHALLENGE×2 HTTP×1 REDIRECTED×1 TLS×1 CANCELLED×1 |
| city-of-god | Other languages | pt | 2002 | 25 | 14 | 1 | 1 | 1 | 1/1 | 1.3 s | 1.8 s | STRUCTURE_CHANGED×2 CHALLENGE×2 TIMEOUT×2 REDIRECTED×1 HTTP×1 NETWORK×1 TLS×1 CANCELLED×1 |

## Discovered streams that did not verify

| Provider and reason | Streams |
|---|---|
| sv-lookmovie: HTTP (Answered with an error (host)) | 3 |
