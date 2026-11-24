# Writing a provider

A provider finds playable streams for one title. With the SDK (`@charcoal/provider-sdk`) you
write only the extraction; the platform supplies the network (with policy, timeouts, retries and
domain fail-over), diagnostics, health, ranking and delivery. You never need to read the server
or the website to add one.

There are two ways to write a provider. Prefer the first when it is enough.

| | Rule pack (data) | Module (code) |
|---|---|---|
| Good for | "Fetch these addresses, pull values out, emit streams" | Custom decryption, sessions, multi-step logic |
| Updated by | Publishing a registry version. No release | A web deploy and a server deploy |
| Runs | Anywhere the SDK runs | Where its manifest says |
| Example | `packages/providers/src/rules/cinesu.ts` | `packages/providers/src/providers/vixsrc.ts` |

## 1. A rule pack

```ts
import type { ProviderManifest, RulePack } from '@charcoal/provider-sdk';

export const manifest: ProviderManifest = {
  id: 'example',                      // lowercase, digits, dashes
  name: 'Example',
  version: '1.0.0',
  contract: 2,
  kinds: ['movie', 'tv'],
  languages: ['en'],                  // omit when it carries original audio
  lookup: ['tmdb'],                   // ids it can find a title by, best first
  runtimes: ['server', 'edge', 'extension', 'app'],
  requires: { features: ['forbidden-headers'] },
  domainRoles: ['site'],              // names only; the addresses live in a DomainConfig
  followDiscovered: true,             // may GET hosts that appeared in a response from its own
  output: { types: ['hls'] },
  rank: 120,
};

export const rules: RulePack = {
  schema: 1,
  id: 'example',
  version: '1.0.0',
  steps: [
    { when: 'movie', fetch: '{{domain.site}}/api/movie/{{media.ids.tmdb}}', as: 'info', headers: { Referer: '{{domain.site}}/' } },
    { when: 'tv',    fetch: '{{domain.site}}/api/tv/{{media.ids.tmdb}}/{{media.season}}/{{media.episode}}', as: 'info' },
    { extract: 'json',  from: 'info', expr: '$.embed', as: 'embed', required: true },
    { fetch: '{{domain.site}}{{embed}}', as: 'page' },
    { extract: 'css',   from: 'page', expr: 'video > source', attr: 'src', as: 'playlist', required: true },
    { extract: 'xpath', from: 'page', expr: '//track/@src', all: true, as: 'subs' },
    { extract: 'regex', from: 'page', expr: "token['\"]?\\s*:\\s*['\"]([^'\"]+)", as: 'token' },
    { require: '{{playlist}}', message: 'no playlist on the page' },
  ],
  emit: [{ url: '{{playlist}}?token={{token | urlencode}}', type: 'hls', headers: { Referer: '{{domain.site}}/' } }],
  captions: [{ each: 'subs', url: '{{item}}', label: 'English', lang: 'en' }],
};
```

Steps run in order. `when` limits a step to a media kind.

| Step | Does |
|---|---|
| `fetch` | Requests a URL (must start with a `{{domain.role}}` or be absolute). 404/410 mean "not here". `optional: true` tolerates failure |
| `extract` | `css` (with optional `attr`), `xpath`, `json` (JSONPath), `regex` (`group`), `jsonld`, `meta` (Open Graph and friends), `iframes`, `media` (stream URLs in any text), `hls` (parse a playlist). `all: true` keeps every match; `required: true` makes "nothing matched" a `SELECTOR_MISSING` failure |
| `set` | Stores a rendered template |
| `require` | Fails (default `STRUCTURE_CHANGED`) when a template renders empty |

Templates: `{{media.ids.tmdb}}`, `{{media.season}}`, `{{domain.site}}`, `{{settings.x}}`, any
variable, `{{item}}` inside `each`. Filters: `urlencode`, `json`, `lower`, `upper`, `trim`,
`pad2`, `default:value`.

Validation (`validateRulePack`) rejects undeclared domain roles, variables read before they are
set, patterns that can hang on crafted input, and relative fetch URLs. The CSS, XPath and
JSONPath dialects are subsets; `packages/provider-sdk/src/extract/*.ts` documents exactly what is
supported.

Register it: add `{ manifest, rules, stage: 'canary' }` to `RULE_PROVIDERS` in
`packages/providers/src/index.ts` and its addresses to `packages/providers/src/domains.ts`.

## 2. A module

```ts
import { defineProvider, expectOk, getJson, NotFoundError, ProviderError } from '@charcoal/provider-sdk';

export const example = defineProvider({
  manifest: { id: 'example', name: 'Example', version: '1.0.0', kinds: ['movie', 'tv'], lookup: ['tmdb'],
              runtimes: ['server', 'extension', 'app'], domainRoles: ['api'], followDiscovered: true,
              output: { types: ['hls'] }, rank: 120 },

  async getSources(media, { fetch, signal, url, domain, settings, store, log }) {
    if (media.kind !== 'movie' && media.kind !== 'tv') throw new NotFoundError();
    // A 404 becomes NOT_FOUND, a 403 ACCESS_DENIED, a bot check CHALLENGE, non-JSON STRUCTURE_CHANGED.
    const info = await getJson<{ file?: string }>(fetch, url('api', `/title/${media.ids.tmdb}`), { headers: { Referer: domain('api') }, signal }, 'Example');
    if (!info.file) throw new NotFoundError();
    const playlist = expectOk(await fetch(info.file, { signal }), 'Example playlist');
    if (!playlist.body.startsWith('#EXTM3U')) throw new ProviderError('INVALID_RESULT', 'Example: not a playlist');
    return { streams: [{ url: info.file, type: 'hls', headers: { Referer: domain('api') } }] };
  },
});
```

Rules of the road:

- **Only `ctx.fetch` reaches the network.** No global `fetch`, no Node built-ins, no DOM. Crypto
  through WebCrypto. That is what lets the same file run on a server, in a page and in an app.
- **Never write a host name.** Ask for `url('role', path)` / `domain('role')`. Fixed third-party
  hosts go in `extraHosts`. A request to anything else is refused (`POLICY`).
- **Throw what happened.** `NotFoundError` for "this title isn't here". `ProviderError(code)` when
  you know more (`SELECTOR_MISSING` with `{ step }`, `AUTH_REQUIRED`, `EXPIRED`, `INVALID_RESULT`).
  Let everything else propagate: the platform classifies it from the request trace. Do not catch
  errors to return an empty list; that hides outages as "not found".
- **Pass `signal` on.** A cancelled or timed-out run must stop.
- **Return plain streams.** `url` and `type` are required. Quality, language, expiry and stream
  type are detected when you leave them out; set `ipBound: true` when links only work from the
  address that asked, `expiresAt` when you know it, `headers` when the host needs them.
- **Personal settings** (`requires.setting`, `config`) exist only in a viewer's own runtime. A
  provider that needs one never runs on a shared server.
- `store` is a small per-provider key-value scratch space with a TTL (session keys, looked-up
  ids). `log(event, data)` goes to the platform log.

Register it in `CODE_PROVIDERS` (`packages/providers/src/index.ts`) with a stage, and add its
domain config.

## 3. Extraction helpers (`extract`)

`import { extract } from '@charcoal/provider-sdk'`

| Helper | For |
|---|---|
| `parseHtml(html)` → `select`, `selectAll`, `xpath`; `textOf`, `rawText`, `attr` | HTML with a tolerant parser, a CSS-selector subset and an XPath subset |
| `jsonPath`, `safeJsonParse` | JSON APIs |
| `findJsonLd`, `findEmbeddedJson`, `extractMeta` | Structured data and state objects embedded in pages |
| `findIframes`, `findVideoElements`, `findMediaUrls` | Players and stream URLs in markup or scripts (escaped ones too) |
| `parseHls`, `parseDash`, `sniffStreamType` | Playlists and manifests: variants, audio renditions, live or VOD, encryption, maximum height |
| `detectQuality`, `detectExpiry`, `resolveUrl` | Labels, signed-URL expiry, relative URLs |

## 4. Domains

```ts
// packages/providers/src/domains.ts
example: {
  provider: 'example', version: 1, updatedAt: '2026-11-24T00:00:00.000Z',
  roles: { api: { active: 'https://api.example.com', alternates: ['https://api.example.net'],
                  health: { path: '/ping', expectText: 'pong' } } },
},
```

- A run fails over to the next alternate by itself when the active address doesn't resolve or
  connect. Your code doesn't see it.
- To change an address: bump `version`, set `updatedAt`, keep the old one as an alternate. Or
  change it at run time without a deploy (OPERATIONS.md): it is validated first, audited, and
  can be rolled back.

## 5. Testing

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContract, createHarness, domainsFor, simulate, TITLES } from '@charcoal/provider-sdk/testing';

const domains = domainsFor('example', { api: 'https://api.example.com' });
const routes = {
  'https://api.example.com/title/27205': { body: { file: 'https://cdn.example.net/v/1080/master.m3u8' } },
  'cdn.example.net': simulate.playlist([1080, 720]),
};

test('finds the stream', async () => {
  const h = createHarness({ providers: [example], domains: { example: domains }, routes });
  const r = await h.engine.runProvider(h.engine.providers()[0], TITLES.movie);
  assert.equal(r.outcome, 'ok', r.message);
  assert.equal(r.streams[0].quality, '1080');
});

test('meets the provider contract', async () => {
  assert.deepEqual(await checkContract(example, { media: TITLES.movie, domains, routes }), []);
});
```

- `mockTransport(routes)` answers from your table; a request with no route fails like an
  unresolvable host, so wandering off your fixtures is noticed. `simulate` has ready-made
  failures (`dns`, `refused`, `hang`, `challenge`, `forbidden`, `rateLimited`, `serverError`).
- `checkContract` checks what every provider must do whatever it scrapes: valid streams of a
  declared type, stays inside its hosts, reports an unreachable site as a network failure and a
  bot check as `CHALLENGE`, and stops when cancelled.
- Fixtures are responses you write in the shape the provider expects. They prove your logic; they
  do not prove the live site still answers that way. That is the canary's job.
- Try it on your own connection: `npm run try --workspace packages/providers -- movie 27205 Inception 2010 example`.

## 6. Shipping it

1. New providers start in `canary`: they run only when named (`only=example`), in tests and in
   canary runs.
2. Check it from a real network (`npm run try`, or `GET /v2/sources?…&only=example` on a server).
3. Promote: `npm run registry -- stage example stable` (files), or
   `POST /v2/admin/providers/example {"stage":"stable"}` (a running server).
4. If it goes wrong: `stage example disabled` takes effect on the next request; `rollback example
   --to <version>` puts back an earlier version's entry.

A new version of a provider always starts in the stage the pack ships it in, even if the previous
version had been promoted.
