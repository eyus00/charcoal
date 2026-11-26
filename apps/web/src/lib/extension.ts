/**
 * Talks to the bridge: the Charcoal Helper extension (apps/extension) through window.postMessage,
 * or an installed app's shell through `window.__charcoalBridge` when the page runs inside one.
 * Both speak the same messages; version and capabilities are negotiated in `hello`
 * (see @charcoal/client).
 */
import { BridgeError, connectBridge, type Bridge, type BridgeCall } from '@charcoal/client';
import type { Fetcher } from '@charcoal/provider-sdk';

const PAGE = 'charcoal-page';
const EXT = 'charcoal-extension';

type Reply = { ok: true; result: unknown } | { ok: false; error: string; code?: string };
const pending = new Map<number, (r: Reply) => void>();
let seq = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== EXT || typeof e.data.id !== 'number') return;
    pending.get(e.data.id)?.(e.data as Reply);
  });
}

/** An app shell injects this; it answers the same messages the extension does. */
interface AppBridge {
  call(type: string, payload: unknown): Promise<Reply>;
}
const appBridge = (): AppBridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { __charcoalBridge?: AppBridge }).__charcoalBridge);

const CODES = ['TIMEOUT', 'NETWORK', 'NOT_ALLOWED', 'TOO_LARGE', 'BAD_REQUEST'] as const;
const fail = (r: { error: string; code?: string }) =>
  new BridgeError(r.error, (CODES as readonly string[]).includes(r.code ?? '') ? (r.code as (typeof CODES)[number]) : /too long/i.test(r.error) ? 'TIMEOUT' : 'UNKNOWN');

const call: BridgeCall = <T>(type: string, payload: unknown, timeoutMs: number): Promise<T> => {
  const app = appBridge();
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    // No answer at all means the bridge is gone (not installed, disabled, or its worker died).
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new BridgeError('Charcoal Helper didn’t answer', 'DISCONNECTED'));
    }, timeoutMs);
    const settle = (r: Reply) => {
      clearTimeout(timer);
      pending.delete(id);
      if (r.ok) resolve(r.result as T);
      else reject(fail(r));
    };
    if (app) {
      app.call(type, payload).then(settle, (e) => settle({ ok: false, error: String(e?.message ?? e) }));
    } else {
      pending.set(id, settle);
      window.postMessage({ source: PAGE, id, type, payload }, location.origin);
    }
  });
};

let connected: Promise<Bridge | null> | null = null;
/** A full detection that is still running in the background (for helpers too old to answer a ping). */
let late: Promise<Bridge | null> | null = null;

/**
 * The bridge, or null (not installed, or not on a Charcoal address it serves).
 *
 * Viewers without it must not wait for it: the page first asks "are you there?", which a current
 * helper's content script answers within milliseconds. No answer means "no bridge" for this search;
 * the slower handshake (an older helper only answers that one, and its worker can take seconds to
 * wake) still runs in the background, so if one turns up it is used from the next search on.
 * `fresh` waits for the full handshake (the settings page wants a definite answer).
 */
export function getBridge(fresh = false): Promise<Bridge | null> {
  if (connected && !fresh) return connected;
  const full = () => {
    const attempt = connectBridge(call).then((b) => {
      if (!b && connected === attempt) connected = null; // never remember a "not found"
      return b;
    });
    return attempt;
  };
  if (fresh || appBridge()) return (connected = full());
  if (late) return Promise.resolve(null);
  const quick = call<unknown>('ping', {}, 250).then(
    () => true,
    () => false,
  );
  return quick.then((present) => {
    if (present) return (connected ??= full());
    late = full().then((b) => {
      late = null;
      if (b) connected = Promise.resolve(b);
      return b;
    });
    return null;
  });
}

export interface ExtensionInfo {
  version: string;
  /** Firefox makes site access a separate step; without it the extension can't fetch. */
  hasPermission: boolean;
  kind: 'extension' | 'app';
  protocol: number;
  capabilities: string[];
}

/** The installed bridge's details, or null. */
export async function detectExtension(fresh = false): Promise<ExtensionInfo | null> {
  const b = await getBridge(fresh);
  return b ? { version: b.info.version, hasPermission: b.info.hasPermission, kind: b.info.kind, protocol: b.info.protocol, capabilities: b.info.capabilities } : null;
}

/** Fetcher for one-off requests through the bridge (the settings page's token check, subtitles). */
export const extensionFetcher: Fetcher = async (url, o) => {
  const b = await getBridge();
  if (!b) throw new BridgeError('Charcoal Helper isn’t installed', 'DISCONNECTED');
  return b.fetcher(url, o);
};

/** Lets the video player load from this host (adds the headers it expects, and CORS for this tab). */
export async function allowStream(host: string, headers: Record<string, string> = {}): Promise<void> {
  const b = await getBridge();
  if (!b) throw new BridgeError('Charcoal Helper isn’t installed', 'DISCONNECTED');
  return b.allowStream(host, headers);
}

/** Removes this tab's stream rules (when the player closes). */
export function releaseStreams() {
  connected?.then((b) => b?.releaseStreams()).catch(() => {});
}

/**
 * The viewer's Febbox sign-in token, read by Charcoal Helper (0.3+) from febbox.com's own cookie
 * when they are signed in to Febbox in this browser. Null when they aren't; throws when the helper
 * is missing or too old to do it.
 */
export async function febboxTokenFromHelper(): Promise<string | null> {
  // (The helper is asked directly: a page built before this ability existed would not list it.)
  const b = await getBridge(true);
  if (!b) throw new BridgeError('Charcoal Helper isn’t installed', 'DISCONNECTED');
  if (!b.info.capabilities.includes('febboxToken')) throw new BridgeError('Update Charcoal Helper (0.3 or newer) to get the token by itself', 'NOT_ALLOWED');
  const r = await call<{ token: string | null }>('febboxToken', {}, 8000);
  return r.token || null;
}

let triedFebbox = false;
/**
 * Once per visit, quietly: when the helper is there and no Febbox token is saved, take the viewer's
 * own Febbox sign-in if they are signed in to febbox.com in this browser (checked with Febbox first).
 * Resolves true when a token was saved.
 */
export async function adoptFebboxToken(check: (token: string) => Promise<'ok' | 'invalid' | 'unknown'>, save: (token: string) => void): Promise<boolean> {
  if (triedFebbox) return false;
  triedFebbox = true;
  try {
    const token = await febboxTokenFromHelper();
    if (!token || (await check(token)) === 'invalid') return false;
    save(token);
    return true;
  } catch {
    return false;
  }
}
