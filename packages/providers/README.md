# @charcoal/providers

The provider pack: every provider is written against `@charcoal/provider-sdk`, so the same module
runs on the server, in the page through a bridge, or anywhere else a transport exists. Nothing
here knows which runtime it is in, and nothing here contains an address: those live in
`src/domains.ts`.

| Provider | Kind | Stage | Runs | Notes |
|---|---|---|---|---|
| Febbox | module | stable | where the viewer's own token is (extension, app, own server) | Original files up to 4K |
| Castle | module | stable | anywhere | Adapted from nuvio-providers (GPL-3.0). The one provider that returned verified streams for most titles from a cloud address |
| VixSrc | module | stable | only on a viewer's own connection | Its API refuses data-centre addresses; links are address-bound |
| VidLink | rule pack (data) | stable | a server with a browser worker | Opens the embed player page and emits the manifest it asks for (DASH, HEVC) |
| VidNest | module | stable | a server with a browser worker | Ported from the legacy class; the site's own page is opened because its API now wants a nonce |
| AnimoTVSlash, Shonen, ZokoAnime, AnimeHeaven | modules (`anime-*`) | stable | anywhere | Anime entries; adapted from Seanime-Providers (MIT); each passed a live gate (`src/packs/anime.ts`) |
| Megavid | module (`anime-megavid`) | canary | anywhere | One of six test entries verified |
| VidRock, Popr, FshareTV, MafiaEmbed, VidSrc, Videasy, VidZee, Tulnex, Peachify | modules | canary | see `docs/platform/PROVIDERS.md` | Ported from the legacy server classes; none returned a verified stream from where they were built |
| CineSu, Icefy | rule packs (data) | canary | anywhere | Ported from the legacy server classes |
| StreamViva sources (`sv-*`) | vendored engine | stable | extension, app, home server | Open network policy; mostly fail from data centres |

`stable` means a stream from the provider has been tried and answered with media (or it was
already first-party and is unchanged). A canary is promoted by a server by itself after three
monitor checks in a row with a verified stream. The full account, provider by provider, is in
`docs/platform/PROVIDERS.md`.

Writing, testing and shipping a provider: `docs/platform/SDK.md`.

## Try it

On this machine's own connection:

```bash
npm run try --workspace packages/providers -- movie 27205 Inception 2010
```

```bash
npm run try --workspace packages/providers -- tv 1396 "Breaking Bad" 2008 2 3
```

```bash
npm run try --workspace packages/providers -- anime 16498 "Attack on Titan" 2013 1 --alt "Shingeki no Kyojin" --mal 16498
```

Every stream that comes back is then tried (manifest and first media bytes) and printed as
verified or failed. Add provider ids at the end to run only those (a canary runs when named).
`EGRESS=user` says the machine is on a home connection; `FALLBACK=true` includes the vendored pack;
`FEBBOX_TOKEN=…` enables Febbox; `BROWSER=1` gives providers a browser worker;
`--domain provider.role=https://new.host` tries a provider at another address.

## Test

```bash
npm test --workspace packages/providers
```

The tests run each provider's real logic (including Castle's decryption) against fixtures
written for the tests. They do not contact any site.
