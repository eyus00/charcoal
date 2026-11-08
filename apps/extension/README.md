# Charcoal Helper (browser extension)

With it installed, Charcoal finds and plays sources **from your own browser and home
connection**, with no server in between. Streaming hosts that block servers (data-centre
addresses like Railway's) usually don't block a home connection, so more sources play.

Without it, Charcoal works as before through its server (or your own, see the main README).

## Install

Download the latest `charcoal-helper-*.zip` (and, for Firefox, `.xpi` if there is one) from
[Releases](https://github.com/eyus00/charcoal/releases). It isn't in the browser stores.

**Chrome, Edge, Brave** (computer only):
1. Unzip the file somewhere you'll keep it (the browser loads it from that folder).
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

**Firefox**:
- If the release has a signed `.xpi`: open it with Firefox and confirm.
- Otherwise (for testing): `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
  pick `manifest.json` in the unzipped folder. Firefox removes it when it restarts.
- Then click the extension's icon and **Allow access to streaming sites** (Firefox asks for this
  separately).

Check it in Charcoal → Profile → Settings → Charcoal Helper. Not available for Safari, iPhone or
Chrome on Android (they don't run extensions like this).

## How it works

1. Its content script runs only on Charcoal's own pages (`charcoal.eys0.fyi`, and `localhost`
   for development) and relays messages between the page and the extension.
2. **`request`**: Charcoal runs the scrapers from `packages/providers` in the page; each request
   goes through the extension, which fetches it from your browser with the headers the site
   expects (User-Agent, Referer, Origin) via a short-lived network rule.
3. **`allowStream`**: before the player loads from a new video host, the extension adds the
   expected headers and a CORS header for Charcoal, for requests from that Charcoal tab only.
   The player then loads playlists and segments straight from the host.
4. **`releaseStreams`**: closing the player (or the tab) removes those rules.

What it deliberately doesn't do: work for any other website, read your browser's cookies, send a
cookie anywhere except febbox.com (your own Febbox token, pasted in Charcoal's settings), set
arbitrary headers, or reach private / local network addresses.

## Develop

```bash
npm run build:extension          # → apps/extension/dist (load that folder unpacked)
```

Change `ALLOWED` in `src/background.js` and `matches` in `src/manifest.json` together if Charcoal
moves to another address. Releases: push a tag like `extension-v0.1.0` (the version comes from
`package.json`); the workflow attaches the zip, and a signed Firefox `.xpi` when the
`AMO_JWT_ISSUER` / `AMO_JWT_SECRET` repository secrets are set (free keys from
addons.mozilla.org → Developer Hub → API keys).
