# P-Stream's sources: test of the surviving fork

Date: 2026-11-08.

P-Stream's own provider package (`github:p-stream/providers`) has been taken down: the site's README
says the project stopped "due to legal pressure", and the pinned tarball returns 403. The closest
surviving relative is **`sussy-code/providers`** (the movie-web providers library, last commit
2025-01-30): 32 sources and 32 embed extractors.

## Method

Every source was run from a server (this container), **including the 22 the fork had already
disabled**, against Inception (movie) and Breaking Bad S2E3 (show). The target was `native`
(no CORS limits). For each source, the test followed up to 4 embeds and then fetched the stream
itself: the playlist, a variant and one segment for HLS, or the first KB for files. The harness is
not committed (it imports the fork's TypeScript directly). Raw output is in
[providers-test-results-2026-11-08.json](providers-test-results-2026-11-08.json).

## Result: 0 of 32 work

| Why it fails | Sources |
|---|---|
| **Domain gone** (no DNS) | autoembed, whvx, catflix, soapertv, remotestream, bombtheirish, nsbx, theyallsayflix (tasf), warezcdn |
| **Server unreachable** | m4ufree, primewire, flixhq, ee3 |
| **Site changed, scraper finds nothing** | gomovies, goojara, zoechip, kissasian, insertunit, vidsrc, vidsrcto, vidsrcsu, nites, tugaflix, fsharetv, showbox, redstar, nepu |
| **Site down or "back soon"** | mp4hydra |
| **Bot check / 403 for servers** | ridomovies (Cloudflare "Just a moment"), hdrezka (403) |
| **Found a stream, but it's dead** | lookmovie (playlist answers "WRONG HASH!": tied to the requesting IP), smashystream (embed broken) |

## Conclusion

Nothing here is worth porting as it stands. These scrapers were written for sites that have since
moved, changed or shut down, and the ones still alive block servers. Castle (from the Nuvio set)
remains the only server-side source that works end to end.
