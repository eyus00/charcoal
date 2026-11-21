# @charcoal/providers

The source scrapers, written once and used in two places:

- **The server** (`apps/server`) runs them with plain `fetch` and relays the video.
- **The website** (`apps/web`) runs them in the browser through the extension, which fetches
  from the viewer's own connection (step 4 of the plan).

That works because a provider never fetches by itself: every request goes through the `fetch`
it is given (`ScrapeContext.fetch`), and decryption uses WebCrypto, which Node and browsers share.
The design follows `@movie-web/providers` (MIT), without its scrapers.

## A provider

```ts
export const example: Provider = {
  id: 'example',
  name: 'Example',
  rank: 100,                    // higher is tried / listed first
  supports: ['movie', 'tv'],
  async scrape(media, { fetch, signal }) {
    const res = await fetch('https://api.example.com/…', { headers: { Referer: '…' }, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // …
    if (nothing) throw new NotFoundError();   // the title isn't there (not a failure)
    return { streams: [{ url, type: 'hls', quality: '1080', headers: { Referer: '…' } }], captions: [] };
  },
};
```

`media.title` is always the movie's or the show's title. Each stream lists the headers its video
needs; the server's proxy or the extension adds them. Add the provider to `providers` in
`src/index.ts`.

## Try it

```bash
npm run try --workspace packages/providers -- movie 27205 Inception 2010
npm run try --workspace packages/providers -- tv 1396 "Breaking Bad" "" 2 3
```

| Provider | From a server | From a home connection |
|---|---|---|
| Febbox (your own token) | not run on servers | original files up to 4K |
| Castle | plays | plays |
| VixSrc | API refuses servers | plays (tested from a home server) |
| VidApi | finds streams, video blocked | video blocked too (Cloudflare) |
