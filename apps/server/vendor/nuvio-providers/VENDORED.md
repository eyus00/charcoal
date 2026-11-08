# Vendored: nuvio-providers

- **Source:** https://github.com/yoruix/nuvio-providers (branch `main`, snapshot taken 2026-11-08)
- **License:** GPL-3.0, see [`LICENSE`](LICENSE). Code ported from here (for example
  `src/providers/castle`) is a derivative work under the same license.
- **What it is:** 34 stream providers written for the Nuvio app. Each `providers/<name>.js`
  exports `getStreams(tmdbId, mediaType, season, episode)` and returns
  `{ name, title, url, quality, headers }` streams. `manifest.json` lists them.
- **Why it's here:** a reference library. Jelly doesn't load these files; providers that work
  from a server are ported into `src/providers/` in Jelly's own format.

This copy is unmodified. To refresh it, replace this folder with a newer download and re-run
`tools/provider-test` (see [`docs/provider-test.md`](../../docs/provider-test.md)).
