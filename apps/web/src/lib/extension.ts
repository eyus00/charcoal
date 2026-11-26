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

declare const __HELPER_VERSION__: string;
/** The newest Charcoal Helper (built from the same repository as this page). */
export const LATEST_HELPER = typeof __HELPER_VERSION__ === 'string' ? __HELPER_VERSION__ : '0.0.0';
/** Whether version `a` is older than `b` ("0.3.0" < "0.3.1"). */
export const olderThan = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};

/**
 * The viewer's Febbox sign-in, as Charcoal Helper (0.3+) reads it from febbox.com's own cookie.
 * `tokens` holds every distinct one it found (0.3.1+ searches every cookie store); `reason` says why
 * there are none. Throws when the helper is missing or too old to do it.
 */
export async function febboxTokenFromHelper(): Promise<{ tokens: string[]; reason?: 'no-access' | 'signed-out'; version: string }> {
  // (The helper is asked directly: a page built before this ability existed would not list it.)
  const b = await getBridge(true);
  if (!b) throw new BridgeError('Charcoal Helper isn’t installed', 'DISCONNECTED');
  if (!b.info.capabilities.includes('febboxToken')) throw new BridgeError(`Charcoal Helper ${b.info.version} can’t read the Febbox sign-in`, 'NOT_ALLOWED');
  const r = await call<{ token: string | null; tokens?: string[]; reason?: 'no-access' | 'signed-out' }>('febboxToken', {}, 8000);
  const tokens = r.tokens?.length ? r.tokens : r.token ? [r.token] : [];
  return { tokens, reason: tokens.length ? undefined : (r.reason ?? 'signed-out'), version: b.info.version };
}

export type FebboxFound =
  | { status: 'ok' | 'unchecked'; token: string; message: string }
  | { status: 'invalid' | 'signed-out' | 'no-access' | 'old-helper' | 'no-helper'; message: string };

/**
 * Finds the viewer's Febbox sign-in and checks it with Febbox: the first token Febbox accepts wins
 * (several can be found: an old sign-in and a new one, in different containers). Every outcome comes
 * with what to tell the viewer.
 */
export async function findFebboxToken(check: (token: string) => Promise<'ok' | 'invalid' | 'unknown'>): Promise<FebboxFound> {
  let got: Awaited<ReturnType<typeof febboxTokenFromHelper>>;
  try {
    got = await febboxTokenFromHelper();
  } catch (e) {
    const old = e instanceof BridgeError && e.code === 'NOT_ALLOWED';
    return old
      ? { status: 'old-helper', message: `${(e as Error).message}. Update it (Charcoal Helper ${LATEST_HELPER}), or paste the token below.` }
      : { status: 'no-helper', message: 'Charcoal Helper isn’t installed, so your sign-in can’t be read. Paste the token below instead.' };
  }
  if (got.reason === 'no-access')
    return { status: 'no-access', message: 'Charcoal Helper isn’t allowed on febbox.com. Click its toolbar icon and allow its site access, then Check again.' };
  if (!got.tokens.length) {
    const hint = olderThan(got.version, '0.3.1') ? ` If you are, update Charcoal Helper to ${LATEST_HELPER}: ${got.version} only looks outside containers and private windows.` : '';
    return { status: 'signed-out', message: `No Febbox sign-in found in this browser. Sign in at febbox.com, then come back.${hint}` };
  }
  let unchecked: string | undefined;
  for (const token of got.tokens) {
    const r = await check(token).catch(() => 'unknown' as const);
    if (r === 'ok') return { status: 'ok', token, message: 'Connected. Febbox accepted your sign-in.' };
    if (r === 'unknown') unchecked ??= token;
  }
  if (unchecked) return { status: 'unchecked', token: unchecked, message: 'Connected (Febbox couldn’t be checked right now).' };
  return { status: 'invalid', message: 'Found your Febbox sign-in, but Febbox says it has expired. Sign out and in again at febbox.com, then Check again.' };
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
    const found = await findFebboxToken(check);
    if (found.status !== 'ok' && found.status !== 'unchecked') return false;
    save(found.token);
    return true;
  } catch {
    return false;
  }
}
