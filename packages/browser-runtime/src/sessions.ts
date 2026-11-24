/**
 * Cookie lifecycle for browser sessions.
 *
 * A provider's browser context starts empty. Cookies its own sites set are kept between runs (so a
 * site's ordinary visitor session is not rebuilt on every lookup), expire when the site says they
 * do, and are never shared between providers. A viewer's own signed-in session, when they supply
 * one for a service they have an account with, is loaded on top and never written back.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { hostMatches } from '@charcoal/provider-sdk';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** Seconds since the epoch; -1 for a cookie the site gave no expiry (a "session cookie"). */
  expires: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface SessionStore {
  load(providerId: string): StoredCookie[];
  save(providerId: string, cookies: StoredCookie[]): void;
  clear(providerId: string): void;
}

export interface SessionLimits {
  /** How long a cookie without an expiry is kept. */
  sessionCookieTtlMs: number;
  /** Longest any cookie is kept, whatever the site asked for. */
  maxAgeMs: number;
  maxCookies: number;
  maxBytes: number;
}

export const DEFAULT_SESSION_LIMITS: SessionLimits = { sessionCookieTtlMs: 2 * 3600_000, maxAgeMs: 7 * 86_400_000, maxCookies: 60, maxBytes: 32_768 };

const cookieHost = (c: StoredCookie) => c.domain.replace(/^\./, '').toLowerCase();

/**
 * What may be kept from a context when a run ends: cookies of the provider's own hosts only, with
 * a bounded lifetime and size. `savedAt` stamps session cookies so they can expire too.
 */
export function cookiesToKeep(cookies: StoredCookie[], allowedHosts: string[], now: number, limits: SessionLimits = DEFAULT_SESSION_LIMITS): StoredCookie[] {
  const out: StoredCookie[] = [];
  let bytes = 0;
  for (const c of cookies) {
    const host = cookieHost(c);
    if (!allowedHosts.some((pattern) => hostMatches(host, pattern) || hostMatches(pattern.replace(/^\*\./, ''), `*.${host}`) || pattern.replace(/^\*\./, '') === host)) continue;
    const cap = Math.floor((now + limits.maxAgeMs) / 1000);
    const expires = c.expires === -1 || !Number.isFinite(c.expires) ? Math.floor((now + limits.sessionCookieTtlMs) / 1000) : Math.min(c.expires, cap);
    if (expires * 1000 <= now) continue;
    const size = c.name.length + c.value.length;
    if (out.length >= limits.maxCookies || bytes + size > limits.maxBytes) break;
    bytes += size;
    out.push({ ...c, expires });
  }
  return out;
}

/** Drops what has expired since it was stored. */
export const liveCookies = (cookies: StoredCookie[], now: number) => cookies.filter((c) => c.expires === -1 || c.expires * 1000 > now);

/**
 * A viewer-supplied session, in either of the shapes a browser exports: a list of cookies, or a
 * Playwright "storage state" object. Returns the cookies, and whether every one has already expired.
 */
export function readSuppliedSession(value: unknown, now: number): { cookies: StoredCookie[]; expired: boolean } | undefined {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { cookies?: unknown })?.cookies) ? (parsed as { cookies: unknown[] }).cookies : undefined;
  if (!list) return undefined;
  const cookies: StoredCookie[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    if (!raw || typeof raw.name !== 'string' || typeof raw.value !== 'string' || typeof raw.domain !== 'string') continue;
    const expires = typeof raw.expires === 'number' ? raw.expires : typeof raw.expirationDate === 'number' ? raw.expirationDate : -1;
    cookies.push({ name: raw.name, value: raw.value, domain: raw.domain, path: typeof raw.path === 'string' ? raw.path : '/', expires, httpOnly: raw.httpOnly === true, secure: raw.secure === true, sameSite: raw.sameSite === 'Strict' || raw.sameSite === 'None' ? raw.sameSite : 'Lax' });
  }
  if (!cookies.length) return undefined;
  const dated = cookies.filter((c) => c.expires !== -1);
  return { cookies: liveCookies(cookies, now), expired: dated.length > 0 && dated.every((c) => c.expires * 1000 <= now) };
}

export function memorySessionStore(): SessionStore {
  const data = new Map<string, StoredCookie[]>();
  return { load: (id) => data.get(id) ?? [], save: (id, cookies) => void data.set(id, cookies), clear: (id) => void data.delete(id) };
}

/** One small JSON file per provider under `dir` (a server's DATA_DIR). */
export function fileSessionStore(dir: string): SessionStore {
  const file = (id: string) => path.join(dir, `${id.replace(/[^a-z0-9-]/gi, '_')}.cookies.json`);
  return {
    load(id) {
      try {
        return JSON.parse(readFileSync(file(id), 'utf8')) as StoredCookie[];
      } catch {
        return [];
      }
    },
    save(id, cookies) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file(id), JSON.stringify(cookies), { mode: 0o600 });
    },
    clear(id) {
      try {
        writeFileSync(file(id), '[]', { mode: 0o600 });
      } catch {
        /* nothing stored */
      }
    },
  };
}
