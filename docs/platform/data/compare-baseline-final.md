# Source availability: baseline-cloud → final-cloud

**Before**

- Run: `baseline-cloud`, **LIVE** (real sites over the network)
- Target: http://127.0.0.1:3907 (v2)
- Streams tried from: a data-centre address (cloud sandbox behind an HTTPS egress proxy, 2026-11-24)
- Playback in a browser: checked
- When: 2026-11-24T19:48:05.816Z to 2026-11-24T20:03:11.043Z, commit `fd7ce76`

**After**

- Run: `final-cloud`, **LIVE** (real sites over the network)
- Target: provider pack in this process (engine, providers ran from a data-centre address)
- Streams tried from: a data-centre address (cloud sandbox behind an HTTPS egress proxy, 2026-11-25; all providers, browser runtime on)
- Playback in a browser: checked
- When: 2026-11-25T01:22:24.365Z to 2026-11-25T01:39:09.515Z, commit `9a4ee08`

## Summary

| Measure | Before | After | Change |
|---|---|---|---|
| Providers registered | 31 | 36 | +5 |
| Providers that got an answer from their site | 18 | 21 | +3 |
| Providers that returned a stream | 3 | 11 | +8 |
| Unique streams | 58 | 173 | +115 |
| Unique streams verified | 55 | 127 | +72 |
| Streams started in a browser player | 44 | 65 | +21 |
| Titles with a verified stream | 30/34 | 32/34 | +2 |
| Titles with playback started | 30/34 | 31/34 | +1 |
| Median time to first result | 1.6 s | 1.4 s |  |
| Median time to first verified stream | 2.3 s | 2.1 s |  |

## By category (titles with a verified stream)

| Category | Titles | Before | After | Verified streams before | Verified streams after |
|---|---|---|---|---|---|
| Western films | 7 | 6 | 6 | 17 | 24 |
| Western television | 6 | 6 | 6 | 9 | 18 |
| Anime | 6 | 5 | 6 | 10 | 52 |
| Indian cinema and TV | 9 | 8 | 8 | 11 | 16 |
| Other languages | 6 | 5 | 6 | 8 | 17 |

## By title (unique → verified → started)

| Title | Before | After |
|---|---|---|
| casablanca | 0 → 0 → 0 | 2 → 0 → 0 |
| the-godfather | 2 → 2 → 2 | 5 → 4 → 3 |
| the-matrix | 1 → 1 → 1 | 4 → 3 → 3 |
| inception | 3 → 3 → 2 | 6 → 5 → 3 |
| interstellar | 2 → 2 → 2 | 3 → 2 → 2 |
| oppenheimer | 4 → 4 → 2 | 6 → 4 → 3 |
| dune-part-two | 5 → 5 → 2 | 7 → 6 → 3 |
| breaking-bad | 1 → 1 → 1 | 4 → 3 → 2 |
| game-of-thrones | 2 → 2 → 2 | 6 → 5 → 3 |
| the-office | 1 → 1 → 1 | 3 → 2 → 1 |
| stranger-things | 1 → 1 → 1 | 3 → 2 → 1 |
| the-last-of-us | 3 → 3 → 2 | 5 → 4 → 3 |
| severance | 1 → 1 → 1 | 3 → 2 → 2 |
| spirited-away | 2 → 1 → 1 | 9 → 7 → 3 |
| your-name | 2 → 2 → 2 | 10 → 7 → 3 |
| attack-on-titan | 4 → 4 → 2 | 14 → 11 → 3 |
| demon-slayer | 2 → 2 → 2 | 12 → 11 → 3 |
| one-piece | 0 → 0 → 0 | 9 → 7 → 3 |
| jujutsu-kaisen | 1 → 1 → 1 | 11 → 9 → 3 |
| 3-idiots | 1 → 1 → 1 | 4 → 2 → 1 |
| dangal | 2 → 1 → 1 | 2 → 1 → 1 |
| lagaan | 1 → 1 → 1 | 3 → 2 → 1 |
| rrr | 3 → 2 → 2 | 3 → 2 → 1 |
| baahubali-2 | 0 → 0 → 0 | 1 → 0 → 0 |
| vikram | 2 → 2 → 2 | 3 → 2 → 2 |
| drishyam | 1 → 1 → 1 | 3 → 2 → 1 |
| kgf-chapter-2 | 2 → 2 → 2 | 4 → 3 → 2 |
| sacred-games | 1 → 1 → 1 | 3 → 2 → 1 |
| parasite | 4 → 4 → 2 | 7 → 4 → 3 |
| squid-game | 1 → 1 → 1 | 4 → 3 → 1 |
| money-heist | 1 → 1 → 1 | 5 → 4 → 2 |
| amelie | 0 → 0 → 0 | 3 → 2 → 0 |
| dark | 1 → 1 → 1 | 3 → 2 → 1 |
| city-of-god | 1 → 1 → 1 | 3 → 2 → 1 |

## Failures

| Failure | Before | After |
|---|---|---|
| `ACCESS_DENIED` | 12 | 46 |
| `CANCELLED` | 34 | 35 |
| `CHALLENGE` | 59 | 59 |
| `CONNECT` | 0 | 22 |
| `HTTP` | 26 | 21 |
| `NETWORK` | 20 | 0 |
| `REDIRECTED` | 34 | 34 |
| `STRUCTURE_CHANGED` | 74 | 36 |
| `TIMEOUT` | 117 | 187 |
| `TLS` | 36 | 36 |
