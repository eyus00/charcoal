# StreamViva providers: test and integration

Date: 2026-11-21. Source: `loak7993-code/streamviva-providers`, branch `production`, commit
`2292c61` (2026-09-26), MIT. It continues movie-web → P-Stream → sussy-code providers.

## Test (from a data-centre machine)

Every source (53, including the 30 StreamViva itself switched off) for Inception and Breaking Bad
S2E3, every embed followed, each stream checked down to real segment / file bytes. Raw results:
[test-results-2026-11-21.json](test-results-2026-11-21.json).

**Nothing played.** Of the 23 sources enabled in their build:

| Outcome | Sources |
|---|---|
| Not found / changed site | RidoMovies, ZoeChip, LookMovie, HDRezka, Cuevana3, PelisPlusHD, 8stream, RGShows (bot page), vidsrc.sh ("invalid api token") |
| Unreachable / errors | embed.su, M4F, TurboVid, WatchAnimeWorld, Wecima, CineHDPlus, EE3 (500), Insertunit (timeout), AnimeKai |
| Anime only | Zunime, Animetsu (no AniList id for these titles) |
| Frame-only players | vidsrc-embed, videasy-embed (same idea as our embed servers) |

PrimeSrc (in their repo, not registered in their build) works as a directory: one call lists
18–26 file-host servers per title (Voe, Dood, Streamtape, Mixdrop, Filemoon, Streamwish…), but its
link endpoint answers with a Cloudflare bot check ("Just a moment…") from here, so the file-host
resolvers never got a link. The older public packages (`@movie-web/providers` on npm, the sussy
fork) were tested before and had 0 working sources; StreamViva supersedes both.

So from servers in data centres these are dead; they're built for viewers' own connections.

## Integration

- `packages/streamviva`: their prebuilt engine, vendored unchanged (update steps in its README).
- `packages/providers/src/streamviva.ts`: each enabled StreamViva source (minus frame-only ones)
  becomes a fallback provider; it follows the source's embeds with StreamViva's resolvers and
  converts streams / subtitles. Plus our own PrimeSrc → StreamViva file-host resolvers.
- Website, with Charcoal Helper: our providers answer first and playback starts; the fallback runs
  in the browser (from ≤4 s, or as soon as ours are in) and its sources are appended. If everything
  else failed, the player waits ("Looking for more sources…") and picks the new ones up. The engine
  (~190 KB gzipped) loads only when the fallback runs.
- Server: registered as providers too (`STREAMVIVA=false` to leave out). On Railway they fail and
  provider health benches them; a server at home can use them.
