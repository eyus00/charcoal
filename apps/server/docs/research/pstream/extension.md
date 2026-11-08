# P-Stream extension: read-only analysis for Charcoal

Repo: `codeberg.org/pee/extension` (one commit, `30e0162`). It is built with Plasmo 0.90.5 and React 19, version 1.5.0, license GPL-3.0-only. I only read files; nothing was run or built. Paths below are relative to the repo root.

One limit up front: `node_modules` is not in the repo, so I could not read `@plasmohq/messaging` itself. The message format in section 2 comes from the userscript and its test (`userscript/p-stream.user.js`, `userscript/p-stream.user.test.mjs`), which say they copy the extension's messages exactly.

---

## 1. Architecture

**Manifest** (`manifest.json` plus the `manifest` block in `package.json`)
- It is Manifest V3 (`manifest.json:2`).
- Permissions are `["storage", "declarativeNetRequest", "activeTab", "cookies"]` (`manifest.json:5`).
- Access to every website is optional at install: `"optional_host_permissions": ["<all_urls>"]` (`manifest.json:4`). It is requested at runtime.
- Two icons are web-accessible on all URLs (`manifest.json:8-13`).
- Firefox gets the gecko ID `{e613be14-…}` for desktop and Android. It declares `data_collection_permissions.required: ["browsingActivity","authenticationInfo","websiteContent"]` (`package.json` manifest block).
- Supported browsers are Chromium and Firefox (desktop and Android). The README says "Safari, Orion and iOS are not supported" (`README.md:12`). Build commands: `plasmo build` and `plasmo build --target=firefox-ps`.

**Background service worker** (`src/background.ts`)
- Line 4: `sweepStorage()` deletes every storage key except `domains`.
- Lines 6-14: on browser startup it calls `chrome.runtime.reload()` (or `browser.runtime.reload()`). This is an odd workaround.
- Message handlers are one file each under `src/background/messages/`. Plasmo routes them by file name: `hello.ts`, `makeRequest.ts`, `prepareStream.ts`, `openPage.ts`.

**Content script** (`src/contents/movie-web.ts`)
- `matches: ['<all_urls>']` (lines 4-6). It does not set `all_frames`, so it runs in top-level frames only.
- Lines 8-22 call Plasmo's `relayMessage({name})` for each of the 4 messages. It is only a relay: the page sends a `window.postMessage`, the content script forwards it to the background, and the reply comes back to the page.
- The script has no logic of its own. In particular it never checks whether the site is allowed.

**Popup** (`src/popup.tsx`)
- Without the `<all_urls>` permission it shows `SetupScreen`. That screen opens `tabs/PermissionRequest.html` (`src/components/SetupScreen.tsx:9-13`).
- Otherwise it shows a power-button toggle for the current tab's domain (`src/hooks/useDomainWhitelist.ts:26-43`). The toggle adds or removes the domain with no confirmation step.

**Permission pages**
- `src/tabs/PermissionRequest.tsx:21-25`: `grantPermission()` triggers `chrome.permissions.request({origins:['<all_urls>']})`, implemented in `src/hooks/usePermission.ts:15-22`.
- `src/tabs/PermissionGrant.tsx:10-12`: reads `?redirectUrl=`, takes the domain from it, and asks "The website X wants to use the extension… Do you trust them?". If the user grants (lines 36-40), it requests `<all_urls>`, runs `addDomain(domain)`, then navigates the tab back to `redirectUrl`.

**Storage** (`src/utils/storage.ts`)
- Plasmo `Storage` (chrome.storage) holds a single key, `domains: string[]` (line 26).
- A domain comes from `makeUrlIntoDomain` (`src/utils/domains.ts:1-9`). It returns `u.host.toLowerCase()` for http and https only, so the port is part of the domain.

---

## 2. Message protocol

The shapes are in `src/types/protocol.ts`. `src/types/request.ts` and `src/types/response.ts` only re-export them.

```ts
export type BaseResponse<T = object> = ({ success: true } & T) | { success: false; error: string };   // :3
```

**How messages travel.** The page calls `window.postMessage({ name, body, instanceId }, …)`. The reply comes back as `{ name, instanceId, body: <BaseResponse>, relayed: true }`. In the userscript this is `p-stream.user.js:746-758`, which replies with `pageWindow.postMessage({ name, instanceId, body: result, relayed: true }, '/')`. The test checks this format at `p-stream.user.test.mjs:55-62`. On the site side, P-Stream presumably uses `sendToBackgroundViaRelay({ name, body })` from `@plasmohq/messaging`, which handles `instanceId` and matches the `relayed` reply. If nothing is installed, no reply ever comes, so the site has to apply its own timeout.

| Message | Request body | Response | Allowlist check? |
|---|---|---|---|
| `hello` | none | `{success, version, allowed, hasPermission}` (`protocol.ts:5-9`; `hello.ts:15-27`) | **No.** It answers any page. `allowed` = `isDomainWhitelisted(sender.tab.url)`; `hasPermission` = `permissions.contains(<all_urls>)` |
| `makeRequest` | `MakeRequestBody` (`protocol.ts:11-20`): `url, baseUrl?, method?, headers?, query?, readHeaders?, body?, bodyType?: 'string'\|'FormData'\|'URLSearchParams'\|'object'` | `{success, response:{statusCode, headers, finalUrl, body}}` (`protocol.ts:22-29`) | Yes (`makeRequest.ts:77`) |
| `prepareStream` | `PrepareStreamBody` (`protocol.ts:31-37`): `ruleId, targetDomains?, targetRegex?, requestHeaders?, responseHeaders?` | `{success}` | Yes (`prepareStream.ts:25`) |
| `openPage` | `OpenPageBody` (`protocol.ts:39-42`): `page, redirectUrl` | `{success}` | **No** |

**How the site detects the extension.** It sends `hello`. Any reply means something is installed, and `version` comes from `runtime.getManifest().version` (`src/hooks/useVersion.ts`). The site then branches on `allowed` and `hasPermission`. The userscript always answers `allowed: true, hasPermission: true` with `version: '2.0.0'` (`p-stream.user.js:682-687`).

**makeRequest in detail** (`src/background/messages/makeRequest.ts`)
- URL: `makeFullUrl` (`src/utils/fetcher.ts:3-21`) joins `baseUrl` and `url`, requires `http://` or `https://`, and merges `query` with `searchParams.set`.
- Headers:
  - Fetch cannot set forbidden headers such as Referer, Origin, User-Agent or Cookie. To get around that, the handler briefly installs a declarativeNetRequest (DNR) rule. The rule uses an ID from a pool of 64 (`MAKE_REQUEST_RULE_BASE = 23498`, lines 10-29), is scoped by `requestDomains: [hostname]`, and SETs every `req.body.headers` entry (lines 82-91).
  - It then runs `fetch(url, {method, headers, body})` (lines 93-97) and deletes the rule in a `finally` block (lines 98-101).
  - While the fetch runs, that rule applies to every request in the browser to that host, from any tab.
- Body: built by `mapBodyToFetchBody` (lines 51-69). For `FormData` it expects an array of `[k, v]` pairs; `object` is JSON-stringified.
- Response body: `content-type` containing `application/json` gives `response.json()`; anything else gives `response.text()` (lines 102-103). **Binary is not supported**: it is decoded as text and corrupted.
- Response headers: `Object.fromEntries(response.headers)`. Fetch hides `Set-Cookie`.
- Cookies: only hosts matching the hard-coded `hostsWithCookiesAccess` regexes (`storage.ts:9-17`: ee3.me, rips.cc, m4ufree, goojara.to, levidia.ch, wootly.ch, multimovies) get cookie handling.
  - For those hosts it adds `Access-Control-Allow-Credentials: true`.
  - It reads `chrome.cookies.getAll({url: response.url})`, which includes httpOnly cookies, and returns them as a synthetic `Set-Cookie: name=value, …` header (lines 105-121).
  - The fetch itself does not set `credentials`, so the default `same-origin` applies.
- Redirects: followed automatically. `finalUrl = response.url`. There is no `redirect: 'manual'` option.
- Missing features: `readHeaders` is accepted but never used. There is no timeout and no way to abort.
- Errors: any exception becomes `{success:false, error: message}` (lines 125-131). Non-2xx HTTP statuses still return `success: true` together with `statusCode`.

**openPage** (`openPage.ts:15-22`) navigates the sender's tab to `runtime.getURL('/tabs/${page}.html?redirectUrl=…')`. P-Stream uses `page: 'PermissionGrant'`.

---

## 3. prepareStream and declarativeNetRequest

`prepareStream.ts:15-26` keeps only the `responseHeaders` keys listed in `MODIFIABLE_RESPONSE_HEADERS` (`protocol.ts:44-51`): the three `access-control-allow-*` headers, `content-security-policy`, `content-security-policy-report-only` and `content-disposition`. It then calls `setDynamicRules(req.body)` without further changes. **`requestHeaders` are not filtered**, so the site can set Referer, Origin, User-Agent, Cookie, or anything else.

`src/utils/declarativeNetRequest.ts:22-67` (Chrome; Firefox is the same at 69-108) runs `updateDynamicRules({ removeRuleIds:[ruleId], addRules:[rule] })` with this rule:
- `condition: { requestDomains: targetDomains, regexFilter: targetRegex }`.
  - **There is no `initiatorDomains`, no `tabIds` and no `resourceTypes`.** The rule therefore applies browser-wide, to every tab and every resource type.
- `action: modifyHeaders`
  - `requestHeaders`: SET each supplied header.
  - `responseHeaders`: always SET `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS` and `Access-Control-Allow-Headers: *`, plus the filtered caller headers.

**Scope and cleanup**
- The site chooses `ruleId`. Re-sending the same ID replaces the old rule.
- **No message removes a prepareStream rule.** DNR dynamic rules persist across browser restarts and updates, so these rules stay until the same ID is overwritten.
- The only cleanup at startup is `removeDynamicRules` for the 64 makeRequest slot IDs (`makeRequest.ts:15`).
- A site-chosen `ruleId` between 23498 and 23561 would collide with the makeRequest pool.

**Why the page's own `<video>` or hls.js then works.** Take a CDN that needs `Referer: https://embedhost/` and sends no CORS headers. After `prepareStream({ruleId, targetDomains:['cdn.example'], requestHeaders:{Referer, Origin}})`:
- every playlist, key and segment request the page makes to that host goes out with the spoofed Referer and Origin;
- every response comes back with `ACAO: *`.

hls.js can then XHR the CDN directly from the user's IP, with no proxy and with binary segments intact. Only uncredentialed requests work, because `*` does not allow credentials, which is fine for hls.js by default. Segments served from other hosts must also be covered, either in `targetDomains` or with `targetRegex`.

---

## 4. Domain restrictions and security

**How a site gets on the list.** Either the user clicks the popup power button, which adds the current tab's host with no prompt, or the user accepts on the PermissionGrant page. **No origins are hard-coded.** Any domain the user approves can use the extension.

**Enforcement.** `assertDomainWhitelist(sender.tab.url)` (`storage.ts:51-58`) is checked in makeRequest and prepareStream only. Problems I found:

1. **Substring matching bug** (`storage.ts:35-38`):
   ```ts
   return whitelist?.some((d) => d.includes(domain)) ?? false;
   ```
   The stored entry is tested with `.includes(currentDomain)`. If `watch.example.com` is allowed, then `ch.example.com`, `example.com` and `e.com` also pass. This should be an exact comparison.
2. **The checks use the top-level tab URL.** Every script running on an allowed page can use every capability: ads, third-party scripts, and any XSS.
3. **No SSRF protection.** makeRequest has no block on private, loopback or link-local addresses, and no scheme check beyond http(s). Running from the extension with `<all_urls>`, it bypasses CORS and Private Network Access, so an allowed page can read `http://192.168.1.1/` or `http://localhost:…` and get the body back.
4. **prepareStream is very powerful.** An allowed site can, browser-wide:
   - rewrite or remove CSP on any domain;
   - add `ACAO:*` on any domain;
   - set arbitrary request headers, including Cookie and Authorization, for any host. `targetRegex: '.*'` covers every host.
   
   Nothing restricts these rules to streaming hosts or to requests the page itself makes.
5. **openPage** builds the "Do you trust X?" prompt from the caller-supplied `redirectUrl`, not from the sender's URL. Any page, allowed or not, can trigger it.
6. **hello** answers every page, so any site can detect the extension and read its version (fingerprinting).
7. **Cookies.** For the 7 listed hosts, the browser's cookies for that host, including httpOnly ones, are returned to page JavaScript.
8. There are no rate limits, size limits or timeouts.

The only abuse protection in the extension is the domain list plus the `<all_urls>` permission prompt. The userscript adds `HOST_BLOCKLIST = ['fsharetv.co','lmscript.xyz']` (`p-stream.user.js:54`).

---

## 5. The userscript (`userscript/p-stream.user.js`)

- **Metadata block** (lines 13-17): `@match *://*/*`, `@grant GM_xmlhttpRequest`, `@grant unsafeWindow`, `@run-at document-start`, `@connect *`.
- **Same 4 messages.** It listens on `window` `message` events, ignores anything already `relayed`, and accepts only known names (746-758).
- **makeRequest** (689-725): uses `GM_xmlhttpRequest` with `responseType: 'arraybuffer'`. The body is decoded to text, and JSON is parsed when the content-type says so (still no binary). It adds permissive CORS headers. Unlike the extension, it honours `body.credentials` and `body.withCredentials`, and sends cookies when they say `'include'` (695, 167-173).
- **prepareStream** (727-738): stores the rule in memory and then **monkey-patches the page**:
  - `fetch` (285-314) and `XMLHttpRequest` (a complete `ProxyXHR` replacement, 316-600) send any URL matching a rule (host equal to, or a subdomain of, `targetDomains`, or matching `targetRegex`) through `GM_xmlhttpRequest` with the rule's headers. Responses are rebuilt with synthetic CORS headers. If that fails, it falls back to the native request (or retries natively).
  - Media `src` and `setAttribute('src')` (602-671): direct media up to `MAX_BUFFERED_BYTES` = 32 MB (line 26) is downloaded whole into a `blob:` URL. `.m3u8` and `.mpd` are skipped there, because hls.js loads those through the patched XHR. Larger direct videos are left alone.
- **openPage** only does `location.href = redirectUrl`.
- **Limits:**
  - Each segment is fully buffered and copied across the GM bridge.
  - No streaming, no real progress events, no Range or seek support for large MP4s.
  - Rules apply only inside the page that registered them.
  - There is no cleanup beyond blob sweeping.
- **Security: serious.** The userscript answers **every page** (`allowed: true` always) and has `@connect *` with credential support. In practice, any website a user with this script visits can make **cookie-authenticated cross-origin reads of any other site**. The only exceptions are the 2 blocklisted hosts. This is a universal CORS bypass. Do not ship a userscript designed this way.

---

## 6. What Charcoal's site would need to implement

1. **Transport.** Use `sendToBackgroundViaRelay` from `@plasmohq/messaging`, or a small postMessage client that sends `{name, body, instanceId}` and waits for a reply with the same `instanceId` and `relayed: true`. Add a timeout of about 500-1000 ms.
2. **Detection and onboarding.**
   - Call `hello`.
   - No reply: offer to install the extension.
   - Reply with `!hasPermission || !allowed`: call `openPage({page:'PermissionGrant', redirectUrl: location.href})`.
   - Check `version` against your minimum supported version.
3. **Scraping.** The hard part is that Jelly scrapes on the server. P-Stream runs its provider code **in the browser** and sends each HTTP call through `makeRequest`. Charcoal has two options:
   - (a) move the provider and extractor logic into the client (or a shared package) and inject an "extension fetcher", as P-Stream does; or
   - (b) a hybrid where Jelly returns a plan of steps ("fetch URL X with headers Y, send me the body"), the client runs them through `makeRequest` and posts the results back. This is chattier and more fragile.
   
   Either way, expect text or JSON bodies only.
4. **Playback.**
   - Today hls.js gets `/v1/proxy?data={url,headers}`.
   - With the extension, call `prepareStream({ ruleId: <fixed per tab/session>, targetDomains: [playlist host, segment and key hosts], requestHeaders: {Referer, Origin} })` and give hls.js the **direct** URL.
   - Reuse one fixed `ruleId`, outside 23498-23561, so each title overwrites the previous rule. No remove message exists.
   - If the extension is missing, fall back to the Jelly proxy, then to iframe embeds.
5. **Can Charcoal use P-Stream's published extension as-is?** **Technically yes.** Nothing is tied to P-Stream origins, any approved domain works, and the desktop app speaks the same messages.
   - Drawbacks:
     - the prompts and store listing say "P-Stream";
     - the cookie host list is hard-coded;
     - you depend on another team's store listing and roadmap;
     - you inherit the security issues above (substring bug, browser-wide DNR rules, CSP rewriting).
   - License: only exchanging messages with the extension probably does not make Charcoal a GPL derivative, but get your own legal view. A fork must stay GPL-3.0 and its source must be published.

---

## 7. Porting assessment for Charcoal

**Copy (GPL-3.0 applies):** the structure of `makeRequest`, `fetcher.ts`, `declarativeNetRequest.ts` and the content-script relay, and the shape of the permission-grant flow.

**Change in a fork:**
- Use **exact** domain matching, or better, hard-code Charcoal's origins in `host_permissions`/`externally_connectable` and replace the open allowlist.
- Add `initiatorDomains: [charcoal domain]` (and ideally `tabIds`) to every DNR rule. Rules then only affect Charcoal's own requests, not the whole browser.
- Add a `clearStream` message, and remove rules when the tab closes or the extension starts.
- Drop CSP and `content-disposition` from the allowed response headers.
- Only allow a fixed set of request headers: Referer, Origin, User-Agent if really needed.
- Block private IP ranges, localhost and non-standard ports in makeRequest. Add timeouts and size limits.
- Optionally add binary support (base64 or ArrayBuffer) and `redirect: 'manual'`.
- Remove the cookie-reading feature unless you really need it.
- Make `hello` reply only to allowed origins.
- Remove the startup `runtime.reload()`.

**Effort estimate:**
- Forked and hardened extension, Chrome and Firefox: about 3-5 days.
- Site-side client (detection, onboarding, prepareStream wired into the hls.js player with fallback): about 2-4 days.
- Moving the scraping from OMSS to the client, or building the step-plan hybrid: **the largest item**, about 1-3+ weeks depending on how many providers there are.
- Store submission and review, plus updates: ongoing work.

**Pitfalls:**
- **Store review.** CWS and AMO look closely at `<all_urls>` combined with header modification. Listings tied to streaming copyrighted content risk removal for "facilitating piracy". AMO requires the data-collection declarations and signing.
- **No Safari or iOS, and no Chromium on Android** (Firefox Android works). A large share of mobile viewers would still need the server proxy or iframe embeds.
- **MV3 limits.**
  - The service worker can be suspended, so long makeRequests risk being cut off.
  - runtime messages are JSON-serialized, with no ArrayBuffer, and large text bodies are expensive.
  - DNR allows about 5,000 dynamic rules and about 1,000 regex rules.
  - Rules are global unless you scope them.
  - Rules persist across restarts.
- **Adoption.** Most users won't install an extension, so the server path is still needed.

**Explicitly flagged: behaviour beyond "use the user's own browser"**
- **Header spoofing.** `requestHeaders` set arbitrary Referer, Origin, User-Agent or Cookie (`declarativeNetRequest.ts:33-41`, `makeRequest.ts:82-91`). This exists to defeat hotlink and embed protection by impersonating the host's authorised embedding site.
- **Forced CORS.** Every matched response gets `ACAO:*` regardless of what the origin server allows.
- **CSP rewriting.** prepareStream can replace `content-security-policy` on third-party responses.
- **Cookie extraction.** It reads the browser's cookies, including httpOnly ones, for specific scraping-target hosts and hands them to page JavaScript (`makeRequest.ts:105-121`, `storage.ts:9-17`). This could carry over session or clearance cookies.
- **What I did not find.** No Cloudflare challenge solving, no TLS or JA3 fingerprint spoofing, and no code naming `cf_clearance` specifically. Getting past bot protection here comes from the user's real browser, residential IP and existing cookies, combined with the header spoofing above.
- **The userscript's universal credentialed CORS bypass** for any page is a real user-security hazard. Do not copy that design.

**Bottom line.** The mechanism is small and easy to port: a relay content script, a background fetch whose forbidden headers are injected through DNR, and DNR rules that add Referer and Origin plus CORS headers so hls.js can play CDN streams directly. Charcoal could even test it today against the published P-Stream extension. For production, fork it and tighten it (exact origin match, initiator-scoped and removable rules, SSRF blocks, no CSP rewriting). Most of the work and risk is elsewhere: moving the scraping off the Jelly server to the client, and getting through store review.
