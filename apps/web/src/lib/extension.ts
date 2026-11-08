/**
 * Talks to the Charcoal Helper extension (apps/extension) through window.postMessage; its content
 * script runs on Charcoal's pages and relays to the extension.
 */
import type { Fetcher } from '@charcoal/providers';

const PAGE = 'charcoal-page';
const EXT = 'charcoal-extension';

type Reply = { ok: true; result: unknown } | { ok: false; error: string };
const pending = new Map<number, (r: Reply) => void>();
let seq = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== EXT || typeof e.data.id !== 'number') return;
    pending.get(e.data.id)?.(e.data as Reply);
  });
}

function call<T>(type: string, payload: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Charcoal Helper didn’t answer'));
    }, timeoutMs);
    pending.set(id, (r) => {
      clearTimeout(timer);
      pending.delete(id);
      if (r.ok) resolve(r.result as T);
      else reject(new Error(r.error));
    });
    window.postMessage({ source: PAGE, id, type, payload }, location.origin);
  });
}

export interface ExtensionInfo {
  version: string;
  /** Firefox makes site access a separate step; without it the extension can't fetch. */
  hasPermission: boolean;
}

let detected: Promise<ExtensionInfo | null> | null = null;
/** The installed extension, or null (not installed, or not on a Charcoal address it serves). */
export function detectExtension(fresh = false): Promise<ExtensionInfo | null> {
  if (!detected || fresh) detected = call<ExtensionInfo>('hello', {}, 800).catch(() => null);
  return detected;
}

/** Fetcher for @charcoal/providers: requests leave from this browser, with the headers sites expect. */
export const extensionFetcher: Fetcher = (url, o = {}) => call('request', { url, method: o.method, headers: o.headers, body: o.body }, 25_000);

const allowed = new Map<string, Promise<void>>();
/** Lets the video player load from this host (adds the headers it expects, and CORS for this tab). */
export function allowStream(host: string, headers: Record<string, string> = {}): Promise<void> {
  if (!allowed.has(host)) {
    allowed.set(
      host,
      call('allowStream', { host, headers }, 5000).then(
        () => undefined,
        (e) => {
          allowed.delete(host);
          throw e;
        },
      ),
    );
  }
  return allowed.get(host)!;
}

/** Removes this tab's stream rules (when the player closes). */
export function releaseStreams() {
  allowed.clear();
  call('releaseStreams', {}, 5000).catch(() => {});
}
