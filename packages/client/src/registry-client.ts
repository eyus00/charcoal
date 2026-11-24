/**
 * How a client learns which providers exist: it fetches the registry from the resolver (or a
 * mirror), verifies it, and keeps the last good copy. A registry that fails verification, or that
 * is older than the one in hand, changes nothing. No registry at all is fine too: the client then
 * runs the providers it was built with, as shipped.
 */
import { acceptRegistry, SDK_VERSION, validateRegistry, type RegistryDocument, type SignedRegistry } from '@charcoal/provider-sdk';

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface RegistryClientOptions {
  /** Where to fetch from, in order (resolver `/v2/registry` endpoints, static mirrors). */
  urls: () => string[];
  /** GET a URL and parse JSON; throw on any failure. */
  fetchJson(url: string, signal?: AbortSignal): Promise<unknown>;
  /**
   * Public keys this client trusts, by key id. With keys, only signed registries are accepted.
   * Without keys, an unsigned registry from the resolver is taken at its word (the client already
   * trusts that resolver for its results).
   */
  trustedKeys?: Record<string, string>;
  /** Where the last good copy is kept between sessions. */
  storage?: KeyValue;
  /** Don't refetch more often than this. */
  minIntervalMs?: number;
  now?: () => number;
}

const STORAGE_KEY = 'charcoal:registry';

export class RegistryClient {
  private doc: RegistryDocument | undefined;
  private fetchedAt = 0;
  private inflight: Promise<{ accepted: boolean; reason?: string }> | null = null;
  private readonly now: () => number;

  constructor(private readonly opts: RegistryClientOptions) {
    this.now = opts.now ?? Date.now;
    try {
      const saved = opts.storage?.get(STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as RegistryDocument) : undefined;
      // A stored copy was verified when it was stored; it still has to be well-formed.
      if (parsed && !validateRegistry(parsed).length) this.doc = parsed;
    } catch {
      /* no usable copy */
    }
  }

  /** The registry in use (possibly from an earlier session), or undefined. */
  current(): RegistryDocument | undefined {
    return this.doc;
  }

  /** Fetches a newer registry if it is time to. Never throws; concurrent calls share one fetch. */
  refresh(signal?: AbortSignal, force = false): Promise<{ accepted: boolean; reason?: string }> {
    if (!force && this.fetchedAt && this.now() - this.fetchedAt < (this.opts.minIntervalMs ?? 5 * 60_000)) return Promise.resolve({ accepted: false, reason: 'fresh' });
    this.inflight ??= this.fetchOnce(signal).finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async fetchOnce(signal?: AbortSignal): Promise<{ accepted: boolean; reason?: string }> {
    const keys = this.opts.trustedKeys && Object.keys(this.opts.trustedKeys).length ? this.opts.trustedKeys : undefined;
    let last = 'no registry address configured';
    for (const url of this.opts.urls()) {
      let body: { signed?: SignedRegistry; document?: RegistryDocument } | SignedRegistry;
      try {
        body = (await this.opts.fetchJson(url, signal)) as typeof body;
      } catch (e) {
        last = `${url}: ${(e as Error).message}`;
        continue;
      }
      const signed = body && 'payload' in body ? body : body?.signed;
      if (signed && keys) {
        const r = await acceptRegistry(this.doc, signed, keys, { sdk: SDK_VERSION });
        if (!r.accepted) {
          last = `${url}: ${r.reason}`;
          continue;
        }
        return this.adopt(r.doc!);
      }
      if (keys) {
        last = `${url}: not signed, and this client only accepts signed registries`;
        continue;
      }
      const doc = signed ? safeParse(signed.payload) : body && 'document' in body ? body.document : undefined;
      const errors = doc ? validateRegistry(doc) : ['not a registry'];
      if (!doc || errors.length) {
        last = `${url}: ${errors[0]}`;
        continue;
      }
      if (this.doc && doc.version < this.doc.version) {
        last = `${url}: older (${doc.version}) than the one in use (${this.doc.version})`;
        continue;
      }
      return this.adopt(doc);
    }
    this.fetchedAt = this.now(); // don't hammer a registry that isn't there
    return { accepted: false, reason: last };
  }

  private adopt(doc: RegistryDocument) {
    this.doc = doc;
    this.fetchedAt = this.now();
    try {
      this.opts.storage?.set(STORAGE_KEY, JSON.stringify({ ...doc, providers: doc.providers.map(({ health: _h, ...p }) => p) }));
    } catch {
      /* storage full or unavailable: the copy in memory still works */
    }
    return { accepted: true };
  }
}

function safeParse(text: string): RegistryDocument | undefined {
  try {
    return JSON.parse(text) as RegistryDocument;
  } catch {
    return undefined;
  }
}
