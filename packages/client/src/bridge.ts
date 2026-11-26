/**
 * The bridge: an optional capability module that lets a page make requests from the viewer's own
 * connection and play streams straight from their origin. Today it is the browser extension;
 * an installed app's shell speaks the same protocol.
 *
 * Protocol 2 adds negotiation to the original four messages (hello, request, allowStream,
 * releaseStreams): `hello` now says which protocol version and which capabilities the bridge has,
 * and failures carry a code. A protocol-1 bridge (no `protocol` in its hello) keeps working with
 * the original capabilities.
 */
import { describeRuntime, ProviderError, type Feature, type Fetcher, type RuntimeDescriptor } from '@charcoal/provider-sdk';

export const BRIDGE_PROTOCOL = 2;

export type BridgeCapability =
  /** Fetch a URL with headers a page can't set. */
  | 'request'
  /** Add headers and CORS for media requests to a host. */
  | 'allowStream'
  | 'releaseStreams'
  /** Send a Cookie header to an allow-listed host (the viewer's own pasted token). */
  | 'cookies'
  /** Report its own health and counters. */
  | 'status'
  /** Read the viewer's own Febbox sign-in token from febbox.com's cookie (on request, during setup). */
  | 'febboxToken';

/** What a bridge answers to `hello`. */
export interface BridgeHello {
  version: string;
  /** Absent on protocol-1 bridges. */
  protocol?: number;
  kind?: 'extension' | 'app';
  capabilities?: string[];
  /** False when the browser hasn't granted site access yet (Firefox asks separately). */
  hasPermission: boolean;
}

export interface BridgeInfo {
  kind: 'extension' | 'app';
  version: string;
  protocol: number;
  capabilities: BridgeCapability[];
  hasPermission: boolean;
  /** Everything needed to run providers and play their streams locally. */
  usable: boolean;
}

/** A failed bridge call. `code` is set by protocol-2 bridges. */
export class BridgeError extends Error {
  constructor(
    message: string,
    readonly code: 'TIMEOUT' | 'NETWORK' | 'NOT_ALLOWED' | 'TOO_LARGE' | 'BAD_REQUEST' | 'DISCONNECTED' | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message);
    this.name = code === 'TIMEOUT' ? 'TimeoutError' : 'BridgeError';
  }
}

/** Sends one message to the bridge and resolves with its result, or rejects with a BridgeError. */
export type BridgeCall = <T>(type: string, payload: unknown, timeoutMs: number) => Promise<T>;

const V1_CAPABILITIES: BridgeCapability[] = ['request', 'allowStream', 'releaseStreams', 'cookies'];
const KNOWN = new Set<string>(['request', 'allowStream', 'releaseStreams', 'cookies', 'status']);

/** Version and capability negotiation: what this page and that bridge can do together. */
export function negotiate(hello: BridgeHello | null | undefined): BridgeInfo | null {
  if (!hello || typeof hello.version !== 'string') return null;
  // Speak the highest protocol both sides know.
  const protocol = Math.min(BRIDGE_PROTOCOL, typeof hello.protocol === 'number' && hello.protocol >= 1 ? Math.floor(hello.protocol) : 1);
  const capabilities = (protocol >= 2 && Array.isArray(hello.capabilities) ? hello.capabilities.filter((c) => KNOWN.has(c)) : V1_CAPABILITIES) as BridgeCapability[];
  const hasPermission = hello.hasPermission !== false;
  return {
    kind: hello.kind === 'app' ? 'app' : 'extension',
    version: hello.version,
    protocol,
    capabilities,
    hasPermission,
    usable: hasPermission && capabilities.includes('request') && capabilities.includes('allowStream'),
  };
}

/** The runtime a bridge provides, described by what it can actually do. */
export function bridgeRuntime(info: BridgeInfo): RuntimeDescriptor {
  const features: Feature[] = ['forbidden-headers', 'session', 'user-settings'];
  if (info.capabilities.includes('cookies')) features.push('cookies');
  return describeRuntime(info.kind, { features, label: info.kind === 'app' ? 'this device (app)' : 'this browser (helper extension)' });
}

/**
 * A provider transport over the bridge's `request` message. When the bridge itself stops answering
 * (disabled, updated or crashed mid-run), that is reported as a cancelled run, not as a failure of
 * whatever site the provider was talking to, and `onLost` is told.
 */
export function bridgeFetcher(call: BridgeCall, timeoutMs = 25_000, onLost?: () => void): Fetcher {
  return async (url, o = {}) => {
    if (o.signal?.aborted) throw new BridgeError('Cancelled', 'TIMEOUT');
    const pending = call<{ status: number; ok: boolean; url: string; headers: Record<string, string>; body: string }>('request', { url, method: o.method, headers: o.headers, body: o.body }, timeoutMs).catch((e) => {
      if (e instanceof BridgeError && e.code === 'DISCONNECTED') {
        onLost?.();
        throw new ProviderError('CANCELLED', 'The helper stopped answering');
      }
      throw e;
    });
    if (!o.signal) return pending;
    // The bridge can't cancel a request already sent; stop waiting for it.
    return Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => o.signal!.addEventListener('abort', () => reject(new BridgeError('Cancelled', 'TIMEOUT')), { once: true })),
    ]);
  };
}

export interface Bridge {
  info: BridgeInfo;
  fetcher: Fetcher;
  /** True once the bridge has stopped answering during this session. */
  readonly lost: boolean;
  /** Lets the player load from this host (adds the headers it expects, and CORS for this tab). */
  allowStream(host: string, headers?: Record<string, string>): Promise<void>;
  releaseStreams(): void;
}

/**
 * Detects a bridge and wraps it. `hello` is tried twice (a sleeping extension worker can be slow
 * to wake); a "not found" is never remembered, so a bridge installed later is picked up.
 */
export async function connectBridge(call: BridgeCall): Promise<Bridge | null> {
  const ask = (ms: number) => call<BridgeHello>('hello', { protocol: BRIDGE_PROTOCOL }, ms);
  let hello: BridgeHello | null = null;
  try {
    hello = await ask(1200);
  } catch {
    try {
      hello = await ask(2500);
    } catch {
      return null;
    }
  }
  const info = negotiate(hello);
  if (!info) return null;
  const allowed = new Map<string, Promise<void>>();
  let lost = false;
  return {
    info,
    fetcher: bridgeFetcher(call, undefined, () => (lost = true)),
    get lost() {
      return lost;
    },
    allowStream(host, headers = {}) {
      if (!allowed.has(host)) {
        allowed.set(
          host,
          call<unknown>('allowStream', { host, headers }, 5000).then(
            () => undefined,
            (e) => {
              allowed.delete(host);
              throw e;
            },
          ),
        );
      }
      return allowed.get(host)!;
    },
    releaseStreams() {
      allowed.clear();
      call('releaseStreams', {}, 5000).catch(() => {});
    },
  };
}
