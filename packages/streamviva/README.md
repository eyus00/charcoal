# @charcoal/streamviva (vendored)

StreamViva's provider engine, the community continuation of movie-web / P-Stream providers,
vendored unchanged from its prebuilt `lib/` (MIT, see LICENSE).

- Source: https://github.com/loak7993-code/streamviva-providers (branch `production`)
- Vendored commit: `2292c61` (2026-09-26), package version 3.2.0

Charcoal uses it as a **fallback**: our own providers (`packages/providers`) answer first; the
StreamViva sources run afterwards and are added to the list. The adapter is
`packages/providers/src/streamviva.ts`.

## Update

```bash
git clone --depth 1 -b production https://github.com/loak7993-code/streamviva-providers /tmp/sv
cp /tmp/sv/lib/index.js /tmp/sv/lib/index.d.ts packages/streamviva/lib/
# bump "version" in package.json, note the commit above, then run the tests
```

From a data-centre address (Railway, a VPS, CI) almost none of its sources work (tested
2026-11-21: 0 of 23 enabled). They're meant for viewers' own connections: the browser extension
or a server on your own computer.
