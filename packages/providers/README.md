# @charcoal/providers

The provider pack: every provider is written against `@charcoal/provider-sdk`, so the same module
runs on the server, in the page through a bridge, or anywhere else a transport exists. Nothing
here knows which runtime it is in, and nothing here contains an address: those live in
`src/domains.ts`.

| Provider | Kind | Stage | Runs | Notes |
|---|---|---|---|---|
| Febbox | module | stable | where the viewer's own token is (extension, app, own server) | Original files up to 4K |
| Castle | module | stable | anywhere | Adapted from nuvio-providers (GPL-3.0) |
| VixSrc | module | stable | only on a viewer's own connection | Its API refuses data-centre addresses; links are address-bound |
| CineSu (`cinesu-rules`) | rule pack (data) | canary | anywhere | A port of the server-only class; not yet validated against the live site |
| StreamViva sources (`sv-*`) | vendored engine | stable | extension, app, home server | Open network policy; mostly fail from data centres |

Writing, testing and shipping a provider: `docs/platform/SDK.md`.

## Try it

On this machine's own connection:

```bash
npm run try --workspace packages/providers -- movie 27205 Inception 2010
```

```bash
npm run try --workspace packages/providers -- tv 1396 "Breaking Bad" 2008 2 3
```

Add provider ids at the end to run only those (a canary runs when named). `EGRESS=user` says the
machine is on a home connection; `FALLBACK=true` includes the vendored pack; `FEBBOX_TOKEN=…`
enables Febbox.

## Test

```bash
npm test --workspace packages/providers
```

The tests run each provider's real logic (including Castle's decryption) against fixtures
written for the tests. They do not contact any site.
