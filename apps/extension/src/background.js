/**
 * Charcoal Helper (background). Only Charcoal's own pages can talk to it (see ALLOWED and the
 * content script's "matches"). It offers three things:
 *
 *  hello          → { version, hasPermission }
 *  request        → fetch a URL from this browser (the viewer's own connection) with the headers a
 *                   streaming site expects, and return the text. Used by Charcoal's scrapers.
 *  allowStream    → let Charcoal's video player load one host's playlists and segments: adds the
 *                   expected request headers and a CORS header for Charcoal, only for requests
 *                   made by that Charcoal tab.
 *  releaseStreams → removes those rules for the tab.
 *
 * Deliberately not offered (unlike some similar extensions): reading cookies, sending cookies,
 * arbitrary headers, private / local network addresses, or use by any other website.
 */
const ALLOWED = ['https://charcoal.eys0.fyi'];
const isAllowedOrigin = (o) => ALLOWED.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o);

/** Request headers a scraper may set. */
const HEADER_ALLOWLIST = ['user-agent', 'referer', 'origin', 'accept', 'accept-language', 'content-type', 'x-requested-with', 'range'];
/** These can't be set by fetch(), so they go on a short-lived network rule instead. */
const RULE_HEADERS = ['user-agent', 'referer', 'origin'];
const MAX_BODY = 15 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const dnr = chrome.declarativeNetRequest;

// ---------- address guard ----------

function isPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(h)) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224);
  }
  if (h.includes(':')) return !(h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h));
  return true;
}

// ---------- rules ----------

let nextId = 1;
const takeId = () => (nextId = (nextId % 1_000_000) + 1);

/** Per tab: domain → rule id, for allowStream. */
const streamRules = new Map();

const ruleHeaders = (headers) =>
  Object.entries(headers)
    .filter(([k]) => RULE_HEADERS.includes(k))
    .map(([header, value]) => ({ header, operation: 'set', value }));

function cleanHeaders(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    const key = k.toLowerCase();
    if (HEADER_ALLOWLIST.includes(key) && typeof v === 'string' && v.length < 2000) out[key] = v;
  }
  return out;
}

/** "img1.hscow.com" → "hscow.com" (good enough: rules also match subdomains). */
function baseDomain(host) {
  const parts = host.split('.');
  if (parts.length <= 2 || /^\d+$/.test(parts[parts.length - 1])) return host;
  const two = parts.slice(-2).join('.');
  // co.uk, com.br and friends
  return /^(co|com|net|org|gov|edu|ac)\.[a-z]{2}$/.test(two) ? parts.slice(-3).join('.') : two;
}

// ---------- handlers ----------

async function hello() {
  const hasPermission = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  return { version: chrome.runtime.getManifest().version, hasPermission };
}

async function request({ url, method = 'GET', headers, body }) {
  if (!isPublicUrl(url)) throw new Error('Address not allowed');
  if (!['GET', 'POST', 'HEAD'].includes(method)) throw new Error('Method not allowed');
  const h = cleanHeaders(headers);
  const special = ruleHeaders(h);
  const plain = Object.fromEntries(Object.entries(h).filter(([k]) => !RULE_HEADERS.includes(k)));
  const host = new URL(url).hostname;
  const id = takeId();
  if (special.length) {
    await dnr.updateSessionRules({
      addRules: [
        {
          id,
          priority: 2,
          action: { type: 'modifyHeaders', requestHeaders: special },
          // Only this extension's own requests (tab -1) to this host.
          condition: { requestDomains: [host], tabIds: [-1], resourceTypes: ['xmlhttprequest', 'other'] },
        },
      ],
    });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers: plain, body, credentials: 'omit', redirect: 'follow', signal: ctrl.signal, cache: 'no-store' });
    const reader = res.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BODY) {
          reader.cancel();
          throw new Error('Response too large');
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(chunks.length === 1 ? chunks[0] : new Uint8Array(await new Blob(chunks).arrayBuffer()));
    const outHeaders = {};
    res.headers.forEach((v, k) => k !== 'set-cookie' && (outHeaders[k] = v));
    return { status: res.status, ok: res.ok, url: res.url, headers: outHeaders, body: text };
  } catch (e) {
    throw new Error(ctrl.signal.aborted ? 'The site took too long to answer' : `Couldn’t reach the site (${e.message})`);
  } finally {
    clearTimeout(timer);
    if (special.length) dnr.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
  }
}

async function allowStream({ host, headers }, sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined || tabId < 0) throw new Error('No tab');
  if (!isPublicUrl(`https://${host}/`)) throw new Error('Address not allowed');
  const origin = new URL(sender.url).origin;
  const domain = baseDomain(host);
  const perTab = streamRules.get(tabId) ?? new Map();
  streamRules.set(tabId, perTab);
  const old = perTab.get(domain);
  const id = takeId();
  await dnr.updateSessionRules({
    removeRuleIds: old ? [old] : [],
    addRules: [
      {
        id,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          ...(ruleHeaders(cleanHeaders(headers)).length ? { requestHeaders: ruleHeaders(cleanHeaders(headers)) } : {}),
          // Let Charcoal's page read the response (hls.js loads playlists and segments with XHR).
          responseHeaders: [
            { header: 'access-control-allow-origin', operation: 'set', value: origin },
            { header: 'access-control-expose-headers', operation: 'set', value: '*' },
          ],
        },
        condition: { requestDomains: [domain], tabIds: [tabId], resourceTypes: ['xmlhttprequest', 'media'] },
      },
    ],
  });
  perTab.set(domain, id);
  return { domain };
}

async function releaseStreams(_payload, sender) {
  const tabId = sender.tab?.id;
  const perTab = streamRules.get(tabId);
  if (!perTab) return {};
  await dnr.updateSessionRules({ removeRuleIds: [...perTab.values()] });
  streamRules.delete(tabId);
  return {};
}

const HANDLERS = { hello, request, allowStream, releaseStreams };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const origin = (() => {
    try {
      return new URL(sender.url).origin;
    } catch {
      return '';
    }
  })();
  const fn = HANDLERS[msg?.type];
  if (!fn || sender.id !== chrome.runtime.id || !isAllowedOrigin(origin)) {
    sendResponse({ ok: false, error: 'Not allowed' });
    return false;
  }
  Promise.resolve()
    .then(() => fn(msg.payload ?? {}, sender))
    .then((result) => sendResponse({ ok: true, result }), (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // answer asynchronously
});

// Clean up when a tab goes away, and start clean.
chrome.tabs?.onRemoved?.addListener((tabId) => releaseStreams({}, { tab: { id: tabId } }).catch(() => {}));
chrome.runtime.onStartup?.addListener(async () => {
  const rules = await dnr.getSessionRules();
  await dnr.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) });
});
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Firefox asks for site access separately; the popup has the button.
  if (reason === 'install' && !(await chrome.permissions.contains({ origins: ['<all_urls>'] }))) chrome.action.openPopup?.().catch(() => {});
});
