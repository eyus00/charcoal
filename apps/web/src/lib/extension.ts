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
const fail = (r: { error: string; code?: string }) => new BridgeError(r.error, (CODES as readonly string[]).includes(r.code ?? '') ? (r.code as (typeof CODES)[number]) : /too long/i.test(r.error) ? 'TIMEOUT' : 'UNKNOWN');

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
/**
 * The bridge, or null (not installed, or not on a Charcoal address it serves). A "not found" is
 * never remembered: the next call asks again, so installing it mid-session just works.
 */
export function getBridge(fresh = false): Promise<Bridge | null> {
  if (!connected || fresh) {
    const attempt = connectBridge(call).then((b) => {
      if (!b && connected === attempt) connected = null;
      return b;
    });
    connected = attempt;
  }
  return connected;
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
