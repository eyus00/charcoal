/**
 * The browser side of @charcoal/content: the one Fetcher its adapters use here, and a small
 * key-value cache for the large public lists they read (kept in this browser, nothing is uploaded).
 *
 * Every host these adapters call sends `Access-Control-Allow-Origin: *` (AniList, AniSkip, the
 * Fribb list on raw.githubusercontent.com, TheSportsDB, iptv-org; checked on 2026-11-24), so they
 * are fetched straight from the page: no server of ours sees what a viewer looks up.
 */
import type { Fetcher } from '@charcoal/provider-sdk';

/** A browser may not set these itself; an adapter that asks for them is simply sent without. */
const FORBIDDEN = new Set(['user-agent', 'referer', 'origin', 'cookie', 'host']);

export const webFetcher: Fetcher = async (url, options = {}) => {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(options.headers ?? {})) if (!FORBIDDEN.has(k.toLowerCase())) headers[k] = v;
  const res = await fetch(url, { method: options.method ?? 'GET', headers, body: options.body, signal: options.signal });
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k] = v));
  return { status: res.status, ok: res.ok, url: res.url || url, headers: out, body: await res.text() };
};

/** Gives up on `work` after `ms` (the work itself carries on; only the wait ends). */
export function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
    work.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

// ---------- a tiny IndexedDB key-value store ----------

const DB_NAME = 'charcoal-content';
const STORE = 'kv';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

/** A value kept earlier and when; undefined when there is none (or storage is unavailable). */
export async function cacheGet<T>(key: string): Promise<{ value: T; at: number } | undefined> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as { value: T; at: number } | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

/** Best effort: private windows and full disks simply don't keep it. */
export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ value, at: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* fine */
  }
}
