# The browser runtime

Some sites have nothing to fetch and parse: their player page builds the stream address in page
JavaScript. For those, a provider can open the page in a real browser and take what the page
itself asks for. `@charcoal/browser-runtime` is that browser: a headless Chromium worker driven
with Playwright, kept on a short lead.

It is an optional part of a server. Without it nothing changes: the runtime simply has no
`js-render` feature and providers that need one are skipped with that reason.

## What a provider can do with it

A provider declares `requires: { features: ['js-render'] }` (or uses the browser only when
`ctx.browser` exists, as `vidnest` does) and gets a `BrowserSession`:

```ts
const page = await ctx.browser.open(ctx.url('site', `/movie/${media.ids.tmdb}`), { waitFor: { media: true } });
const playlists = page.media().filter((m) => m.type === 'hls');   // url, type, the Referer/Origin the page sent, the frame that asked
await page.close();
```

| Call | For |
|---|---|
| `open(url, { waitFor, timeoutMs, referer })` | Opens a page. `waitFor`: `'load'`, `'domcontentloaded'`, `'networkidle'`, `{ selector }`, `{ media: true }`, `{ ms }` |
| `page.html()` | The document after its scripts ran (capped at 2 MB) |
| `page.select(css, { attr, frames })` | Text or an attribute of matching elements, read inside the page (and its frames) |
| `page.evaluate(expression)` | A JavaScript expression evaluated in the page, as JSON (capped, 5 s) |
| `page.media()` | Playlists, manifests, files and caption files the page and its frames have asked for |
| `page.frames()`, `page.click(css, { frames })`, `page.waitFor(…)`, `page.goto(url)` | Embedded players, play buttons, moving on |

A rule pack can do the same with no code:

```ts
{ render: '{{domain.site}}/movie/{{media.ids.tmdb}}', as: 'page', waitFor: 'media', capture: 'found', captureCaptions: 'subs', noMediaIs: 'NOT_FOUND' }
// …
emit: [{ each: 'found', url: '{{item}}', type: 'auto' }]   // the headers the page sent are attached automatically
```

`packages/providers/src/rules/vidlink.ts` is a complete provider written that way.

## What the worker guarantees

**Isolation.** One browser context per provider run: its own cookie jar and storage, no service
workers, no downloads, no permissions; pop-ups and dialogs are closed. The context is destroyed
when the run ends, however it ends.

**Network policy.** Two layers, because one is not enough:

1. *In the browser*: every request is intercepted. The page itself may only navigate to hosts the
   provider's policy allows (its domain roles, declared extra hosts, hosts its own pages named).
   Requests to private or internal addresses are refused. Media files and segments are noted and
   then cancelled, so no video flows through the worker. Each session has a request budget.
2. *Below the browser*: every connection a launched browser makes goes through an **egress guard**,
   a forward proxy inside the worker process. It resolves each name itself, refuses a name if
   *any* of its addresses is private (the trick DNS rebinding relies on), connects to the address
   it checked rather than to the name again, and allows only web ports. This layer exists because
   a browser follows redirects without asking the interceptor; a page redirecting to
   `http://127.0.0.1/…` or to a cloud metadata address is stopped here. After a navigation, the
   host the page ended on must also be one the policy allows, or nothing is read from it
   (`REDIRECTED` for one of the provider's own addresses, `POLICY` otherwise).

Callers of the platform choose a title, never an address, and a provider cannot make the worker
fetch outside these bounds. A worker is therefore not a general-purpose proxy.

**Limits.** Concurrent sessions (default 2) with a bounded queue (8, 10 s; beyond that
`RATE_LIMITED`), pages per session (3), requests per session (300), navigation time (15 s), and the
run's own time budget. The browser is recycled after 60 sessions or 30 minutes.

**Sessions and cookies.** Cookies set by a provider's own sites are kept between runs so that an
ordinary visitor session is not rebuilt on every lookup: only for the provider's own hosts, at
most 60 cookies and 32 KB, session cookies for two hours, nothing longer than seven days, never
shared between providers. On a server with `DATA_DIR` they are stored in
`DATA_DIR/browser-sessions/`.

**A viewer's own account.** A provider for a service the viewer has an account with declares
`auth: { setting, loginUrl?, signedOutSelector? }`. The session is something the viewer supplies
on their own device (cookies exported from their logged-in browser, as a cookie list or a
Playwright storage state); it is a per-device setting, never sent to a shared server and never
written to the cookie store. Nothing here logs in on anyone's behalf. A supplied session whose
cookies have all expired is `AUTH_REQUIRED` before any page is opened; landing on the login page,
a 401, or the signed-out marker is `AUTH_REQUIRED` too.

**Bot checks.** A challenge interstitial (by status, headers, title or body) is reported as
`CHALLENGE` the moment it is seen. A human-verification widget that explains why awaited content
never appears is `CHALLENGE` as well. Nothing waits a check out, answers it, or disguises the
browser: the automation flags Chromium sets are left as they are and no stealth tooling is used. A
site that requires passing a check is reported as such and the fallback is the site's own player
in a frame on the viewer's device.

**Health.** `worker.health()` reports state (`stopped`, `ready`, `busy`, `down`), browser version,
launches, crashes, open and served sessions, queue length, challenges seen and requests blocked by
policy; `worker.probe()` opens a blank page and evaluates an expression. A browser that ends
unexpectedly is relaunched on the next use; three crashes within five minutes rest the worker for
a minute (`UNSUPPORTED_RUNTIME` meanwhile) instead of relaunching in a loop. A server shows all of
this under `browser` in `GET /v2/health`.

**Diagnostics.** Page navigations are added to the run's request trace, so a browser run is
diagnosed like a fetch run. Chromium's network errors are mapped to the usual failure codes; where
the browser only knows "the proxy tunnel failed", the egress guard supplies the real reason (DNS,
connection, timeout).

## Running one

```bash
# In the server's own container
BROWSER_WORKER=local npm run start:server

# Or use a browser running in its own container (recommended for isolation)
BROWSER_WS_ENDPOINT=ws://browser:3000/ npm run start:server          # a Playwright server
BROWSER_WS_ENDPOINT=http://browser:9222 BROWSER_WS_PROTOCOL=cdp …    # Chrome DevTools Protocol
```

| Setting | Meaning |
|---|---|
| `BROWSER_WORKER=local` | Launch Chromium in this process's container |
| `BROWSER_WS_ENDPOINT`, `BROWSER_WS_PROTOCOL` | Connect to a browser elsewhere (`playwright` by default, or `cdp`) |
| `BROWSER_EXECUTABLE` | Path of a Chromium to launch, when it is not Playwright's own |
| `BROWSER_MAX_SESSIONS` | Concurrent sessions (default 2). Budget about 300 MB of memory per session |

The server probes the worker at start; if no browser can be started it logs why and carries on
without `js-render`.

Chromium is not in the default image. `playwright-core` (the driver, no browser) is installed with
the server's dependencies; the browser itself is added with:

```bash
docker build -f apps/server/Dockerfile --build-arg WITH_BROWSER=true -t charcoal-server:browser .
```

which runs `npx playwright-core install --with-deps chromium` in the image (about 400 MB more).

Notes for operators:

- With `BROWSER_WS_ENDPOINT` the egress guard cannot be put in front of the browser (it is not
  this process that launches it). Restrict that container's network where it runs: no route to
  internal services, no cloud metadata address. The in-browser layer still applies.
- A browser on a data-centre address is refused by the same sites that refuse a server there. The
  browser runtime adds sites whose content needs JavaScript; it does not make a refused network
  welcome.

## What was measured

Live, from a cloud address, on 2026-11-24 (details in AVAILABILITY.md):

| Page | Result |
|---|---|
| `vidlink.pro` player page | Asked for a DASH manifest without any interaction; verified at manifest level, up to 1080p (HEVC video) |
| `vidnest.fun` player page | Asked for an HLS playlist; verified to a first media segment, 536 to 720p |
| `vidsrc.cc` | Browser check: reported as `CHALLENGE` in 0.5 s |
| `vidrock.net` | Asked only for a file that is not video (`INVALID_RESULT` when tried) |
| `player.videasy.net`, `moviesapi.club` | Do not connect |

## Tests

`packages/browser-runtime/src/worker.test.ts`: 14 tests in a real headless Chromium against a
local fixture site (rendering, frames and clicks, capture, both policy layers including redirects
and a rebinding name, challenge detection, failure classification, limits, queueing, cookie
lifecycle, a viewer's session, crash recovery, and two runs through the engine). They prove the
runtime; they say nothing about any real site.

Not exercised: connecting to a remote browser (`BROWSER_WS_ENDPOINT`), and the Docker image with
Chromium (no Docker daemon was available where this was built).
