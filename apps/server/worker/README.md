# Charcoal stream proxy (Cloudflare Worker)

Moves **video traffic** off Jelly's server onto Cloudflare. Jelly still does the
scraping; the Worker only fetches playlists/segments with the headers the video
host expects, adds CORS, and rewrites HLS playlists to keep going through itself.

Whether this helps depends on the video host: some block Cloudflare Workers just
like they block Railway. Deploy it, try a title, and remove it if it doesn't help.

## Deploy from the dashboard (no tools needed)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it (e.g. `charcoal-proxy`) → **Deploy**.
3. **Edit code**, replace everything with the contents of `proxy.js`, then **Deploy**.
4. Open `https://<name>.<your-subdomain>.workers.dev/health`. You should see
   `{"service":"charcoal-proxy","ok":true}`.
5. In Charcoal: **Profile → Settings → Stream proxy**, paste the Worker URL, then **Save**.
   The app checks the Worker before saving it.

Optional: under the Worker's **Settings → Variables**, add
`ALLOWED_ORIGINS = https://charcoal.eys0.fyi` so other sites can't use your proxy.

## Or with Wrangler

```bash
cd worker
npx wrangler deploy
```

## Notes

- Free plan: 100,000 requests/day. Each video segment is one request
  (a 2-hour film is roughly 1,000–2,000).
- When the Worker is in use, keep Jelly's `VALIDATE_SEGMENTS` off (default). Otherwise
  Jelly would drop sources that only Railway is blocked from.
