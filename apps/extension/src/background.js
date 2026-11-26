/**
 * Charcoal Helper (background). Only Charcoal's own pages can talk to it (see ALLOWED and the
 * content script's "matches"). It is an optional capability module: the website works without it
 * and uses whatever it offers when it is there.
 *
 * Protocol 2 (protocol 1 pages keep working: they ignore the extra fields):
 *
 *  hello          → { version, protocol, kind, capabilities, hasPermission }
 *                   The page says which protocol it speaks; both sides use the lower one.
 *  status         → { version, protocol, activeRules, requests: { ok, failed }, since }
 *  request        → fetch a URL from this browser (the viewer's own connection) with the headers a
 *                   streaming site expects, and return the text. Used by Charcoal's scrapers.
 *  allowStream    → let Charcoal's video player load one host's playlists and segments: adds the
 *                   expected request headers and a CORS header for Charcoal, only for requests
 *                   made by that Charcoal tab.
 *  releaseStreams → removes those rules for the tab.
 *  febboxToken    → the viewer's own Febbox sign-in token (febbox.com's "ui" cookie), when they are
 *                   signed in to Febbox in this browser. Asked for only when they press "Get it
 *                   from Febbox" in Charcoal's setup; the token is used for Febbox and nothing else.
 *
 * Deliberately not offered (unlike some similar extensions): reading any other cookie (the one
 * exception is Febbox's own sign-in cookie, above, which is the viewer's key to their own account),
 * sending cookies anywhere but febbox.com, arbitrary headers, private / local network addresses, or
 * use by any other website.
 */
const ALLOWED = ['https://charcoal.eys0.fyi'];
const isAllowedOrigin = (o) => ALLOWED.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o);

/** Request headers a scraper may set. */
const HEADER_ALLOWLIST = ['user-agent', 'referer', 'origin', 'accept', 'accept-language', 'content-type', 'x-requested-with', 'range'];
/** These can't be set by fetch(), so they go on a short-lived network rule instead. */
const RULE_HEADERS = ['user-agent', 'referer', 'origin', 'cookie'];
/**
 * The only sites a Cookie header may be sent to: the viewer pastes their own login token for these
 * in Charcoal's settings. The browser's real cookies are never read or sent (credentials: 'omit').
 */
const COOKIE_HOSTS = ['febbox.com'];
const cookieAllowed = (host) => COOKIE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
const MAX_BODY = 15 * 1024 * 1024;
const TIMEOUT_MS = 20000;

/** The newest protocol this build speaks, and what it can do (the page plans around these). */
const PROTOCOL = 2;
const CAPABILITIES = ['request', 'allowStream', 'releaseStreams', 'cookies', 'status', 'febboxToken'];
const counters = { ok: 0, failed: 0, since: Date.now() };

/** An error with a code the page can act on: TIMEOUT, NETWORK, NOT_ALLOWED, TOO_LARGE, BAD_REQUEST. */
class HelperError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

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

// Random ids: session rules outlive this worker (the browser restarts it often), so a counter that
// starts again at 1 would hand out ids that are still in use ("Duplicate rule ID").
const used = new Set();
const takeId = () => {
  let id;
  do id = 1 + Math.floor(Math.random() * 2_000_000_000);
  while (used.has(id));
  used.add(id);
  return id;
};
const freeId = (id) => used.delete(id);

/** Per tab: domain → rule id, for allowStream. */
const streamRules = new Map();

const ruleHeaders = (headers) =>
  Object.entries(headers)
    .filter(([k]) => RULE_HEADERS.includes(k))
    .map(([header, value]) => ({ header, operation: 'set', value }));

function cleanHeaders(input, host = '') {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    const key = k.toLowerCase();
    const allowed = HEADER_ALLOWLIST.includes(key) || (key === 'cookie' && cookieAllowed(host));
    if (allowed && typeof v === 'string' && v.length < 4000) out[key] = v;
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

async function hello(payload) {
  const hasPermission = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  // Speak the highest protocol both sides know (a page that doesn't say speaks 1).
  const theirs = Number.isInteger(payload?.protocol) && payload.protocol >= 1 ? payload.protocol : 1;
  return { version: chrome.runtime.getManifest().version, protocol: Math.min(PROTOCOL, theirs), kind: 'extension', capabilities: CAPABILITIES, hasPermission };
}

async function status() {
  const rules = await dnr.getSessionRules();
  return { version: chrome.runtime.getManifest().version, protocol: PROTOCOL, activeRules: rules.length, requests: { ok: counters.ok, failed: counters.failed }, since: counters.since };
}

async function request({ url, method = 'GET', headers, body }) {
  if (typeof url !== 'string') throw new HelperError('BAD_REQUEST', 'No address given');
  if (!isPublicUrl(url)) throw new HelperError('NOT_ALLOWED', 'Address not allowed');
  if (!['GET', 'POST', 'HEAD'].includes(method)) throw new HelperError('NOT_ALLOWED', 'Method not allowed');
  const host = new URL(url).hostname;
  const h = cleanHeaders(headers, host);
  const special = ruleHeaders(h);
  const plain = Object.fromEntries(Object.entries(h).filter(([k]) => !RULE_HEADERS.includes(k)));
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
          throw new HelperError('TOO_LARGE', 'Response too large');
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(chunks.length === 1 ? chunks[0] : new Uint8Array(await new Blob(chunks).arrayBuffer()));
    const outHeaders = {};
    res.headers.forEach((v, k) => k !== 'set-cookie' && (outHeaders[k] = v));
    counters.ok++;
    return { status: res.status, ok: res.ok, url: res.url, headers: outHeaders, body: text };
  } catch (e) {
    counters.failed++;
    if (e instanceof HelperError) throw e;
    throw ctrl.signal.aborted ? new HelperError('TIMEOUT', 'The site took too long to answer') : new HelperError('NETWORK', `Couldn’t reach the site (${e.message})`);
  } finally {
    clearTimeout(timer);
    if (special.length) dnr.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
    freeId(id);
  }
}

async function allowStream({ host, headers }, sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined || tabId < 0) throw new HelperError('BAD_REQUEST', 'No tab');
  if (typeof host !== 'string' || !isPublicUrl(`https://${host}/`)) throw new HelperError('NOT_ALLOWED', 'Address not allowed');
  const origin = new URL(sender.url).origin;
  const domain = baseDomain(host);
  const perTab = streamRules.get(tabId) ?? new Map();
  streamRules.set(tabId, perTab);
  const old = perTab.get(domain);
  const id = takeId();
  // Video requests keep the browser's own User-Agent: replacing it only makes the request look
  // less like the real browser it is. Only the Referer / Origin the host expects are set.
  const set = ruleHeaders(cleanHeaders(headers)).filter((h) => h.header !== 'user-agent');
  await dnr.updateSessionRules({
    removeRuleIds: old ? [old] : [],
    addRules: [
      {
        id,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          ...(set.length ? { requestHeaders: set } : {}),
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
  if (old) freeId(old);
  perTab.set(domain, id);
  return { domain };
}

async function releaseStreams(_payload, sender) {
  const tabId = sender.tab?.id;
  const perTab = streamRules.get(tabId);
  if (!perTab) return {};
  await dnr.updateSessionRules({ removeRuleIds: [...perTab.values()] });
  perTab.forEach(freeId);
  streamRules.delete(tabId);
  return {};
}

/**
 * Febbox's sign-in cookie ("ui"), read only on febbox.com and only by name. Nothing else is looked at.
 * Every cookie store is searched: in Firefox a sign-in can live in a container or a private window,
 * each with its own store (the tab asking comes first). Several distinct values (an old and a new
 * sign-in) are all returned so the page can try each with Febbox; when there is none, `reason`
 * says why: no site access to febbox.com, or simply not signed in.
 */
/** The call's answer, or null when it throws or rejects. */
async function attempt(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function febboxToken(_payload, sender) {
  if (!chrome.cookies) throw new HelperError('NOT_ALLOWED', 'This build of Charcoal Helper can’t read the Febbox sign-in');
  const access = (await attempt(() => chrome.permissions.contains({ origins: ['https://www.febbox.com/*'] }))) ?? true;
  if (!access) return { token: null, tokens: [], reason: 'no-access' };
  const stores = (await attempt(() => chrome.cookies.getAllCookieStores())) ?? [];
  const ids = [sender?.tab?.cookieStoreId, ...stores.map((st) => st.id)].filter((id, i, all) => id && all.indexOf(id) === i);
  const found = [];
  const look = async (storeId) => {
    const base = { name: 'ui', domain: 'febbox.com', ...(storeId ? { storeId } : {}) };
    // Firefox with first-party isolation wants firstPartyDomain (null = any); other browsers refuse the key.
    // (Chrome refuses an unknown key by throwing at once, not by rejecting: hence attempt().)
    const list = (await attempt(() => chrome.cookies.getAll({ ...base, firstPartyDomain: null }))) ?? (await attempt(() => chrome.cookies.getAll(base))) ?? [];
    // Partitioned copies too, where the browser has them (Firefox's Total Cookie Protection, Chrome's CHIPS).
    const parted = (await attempt(() => chrome.cookies.getAll({ ...base, partitionKey: {} }))) ?? [];
    for (const c of [...list, ...parted]) if (c?.value && c.value !== 'deleted') found.push(c);
  };
  if (ids.length) for (const id of ids) await look(id);
  else await look(undefined);
  // The longest-lived first: the current sign-in rather than one left behind.
  const tokens = [...new Set(found.sort((a, b) => (b.expirationDate ?? 0) - (a.expirationDate ?? 0)).map((c) => c.value))].slice(0, 4);
  return { token: tokens[0] ?? null, tokens, reason: tokens.length ? undefined : 'signed-out' };
}

const HANDLERS = { hello, status, request, allowStream, releaseStreams, febboxToken };

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
    sendResponse({ ok: false, error: 'Not allowed', code: 'NOT_ALLOWED' });
    return false;
  }
  Promise.resolve()
    .then(() => fn(msg.payload ?? {}, sender))
    .then((result) => sendResponse({ ok: true, result }), (e) => sendResponse({ ok: false, error: String(e?.message ?? e), code: e?.code ?? 'UNKNOWN' }));
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
