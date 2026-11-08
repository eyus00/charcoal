# Provider test (2026-11-08)

Every vendored Nuvio provider was run from a cloud server (similar to Railway) for
**Inception** (movie, TMDB 27205) and **Game of Thrones S1E1** (TV, TMDB 1399). For up to three
streams each, the harness fetched the video (following HLS playlists down to the first segment)
with the headers the provider supplies and recorded whether real video came back.

Raw results: [`provider-test-results-2026-11-08.json`](provider-test-results-2026-11-08.json).

## Summary

- **Castle**: works for movies and TV (HLS). **Ported to Jelly** as `src/providers/castle`.
  Verified through Jelly's proxy for Inception, The Dark Knight, Game of Thrones S1E1 and
  Breaking Bad S2E3.
- **MoviesDrive**: movie streams load, but they're `mkv` (poor browser support); no TV result.
- **4KHDHub**: some `mkv` links load; others are web pages.
- **VidLink**: streams found but the host answered 429 (rate limited). Already an embed in Charcoal.
- Anime providers (HiAnime, AnimePahe, AnimeKai, …) found nothing because the test titles
  aren't anime, so they're untested, not broken.
- Most others found nothing from a server (blocked, changed, or need a browser check).

## Results

| Provider | Movie | TV |
|---|---|---|
| 4khdhub | 14 found, 1/3 load (?/mkv) | 10 found, 1/3 load (?/mkv) |
| allmovieland | none found | none found |
| animekai | none found | none found |
| animepahe | none found | none found |
| anizone | none found | none found |
| castle | 5 found, 3/3 load (m3u8) | 3 found, 3/3 load (m3u8) |
| cinemacity | none found | none found |
| cinevibe | none found | none found |
| dahmermovies | none found | none found |
| dooflix | none found | none found |
| dvdplay | none found | none found |
| hdhub4u | none found | none found |
| hianime | none found | none found |
| kurage | none found | none found |
| mallumv | none found | none found |
| movieblast | 4 found, 0/3 load (?) | 2 found, 0/2 load (?) |
| moviebox | none found | none found |
| moviesdrive | 3 found, 3/3 load (mkv) | none found |
| moviesmod | none found | none found |
| mycima | none found | none found |
| myflixer-extractor | error: mod.getStreams is not a functi | error: mod.getStreams is not a functi |
| netmirror | none found | none found |
| reanime | none found | none found |
| showbox | none found | none found |
| streamflix | 4 found, 0/3 load (mkv) | 1 found, 0/1 load (mkv) |
| uhdmovies | 5 found, 0/3 load (?) | 5 found, 0/3 load (?) |
| videasy | error: timeout | error: timeout |
| vidlink | 3 found, 0/3 load (mp4) | 4 found, 0/3 load (mp4) |
| vidnest | none found | none found |
| vidnest-anime | none found | none found |
| vidrock | none found | none found |
| vixsrc | none found | none found |
| xprime | none found | none found |
| yflix | none found | none found |

## Re-running

```bash
cd tools/provider-test
npm install
npm run test:providers           # all providers
node run.cjs ../../vendor/nuvio-providers/providers ./results.json castle,vixsrc   # some
```

Results depend on the server's IP and change as sites change, so re-run before porting.
