/**
 * Signed relay URLs. The stream relay (/v1/proxy, /v2/relay) only serves URLs this server itself
 * handed out: each carries an expiry and an HMAC over the target and its headers. Without that,
 * anyone could use the relay as a free proxy for any public address.
 *
 * RELAY_SECRET   shared secret (set it when running more than one instance); random per process otherwise
 * RELAY_TTL_SECONDS   how long a handed-out URL keeps working (default 12 h: a film plus long pauses)
 * RELAY_REQUIRE_SIGNATURE=false   accept unsigned URLs too (only for a transition period)
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.RELAY_SECRET || randomBytes(32).toString('hex');
const TTL_SECONDS = Number(process.env.RELAY_TTL_SECONDS ?? 12 * 60 * 60);
export const REQUIRE_SIGNATURE = process.env.RELAY_REQUIRE_SIGNATURE !== 'false';

const mac = (data: string, exp: number, secret: string) => createHmac('sha256', secret).update(`${exp}\n${data}`).digest('hex');

/** `data` is the JSON text {url, headers} exactly as it will arrive after URL-decoding. */
export function signRelayData(data: string, now = Date.now(), secret = SECRET): { exp: number; sig: string } {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return { exp, sig: mac(data, exp, secret) };
}

export function verifyRelayData(data: string, exp: unknown, sig: unknown, now = Date.now(), secret = SECRET): 'ok' | 'missing' | 'expired' | 'invalid' {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !exp || !sig) return 'missing';
  const e = Number(exp);
  if (!Number.isFinite(e)) return 'invalid';
  const want = Buffer.from(mac(data, e, secret), 'hex');
  const got = Buffer.from(sig, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return 'invalid';
  return e * 1000 < now ? 'expired' : 'ok';
}

/** The relay query string for a target: `data=…&exp=…&sig=…`. */
export function relayQuery(url: string, headers?: Record<string, string>, now = Date.now()): string {
  const data = JSON.stringify(headers && Object.keys(headers).length ? { url, headers } : { url });
  const { exp, sig } = signRelayData(data, now);
  return `data=${encodeURIComponent(data)}&exp=${exp}&sig=${sig}`;
}

/**
 * Adds a signature to a relay URL built elsewhere (the framework's createProxyUrl). URLs that
 * aren't relay URLs, or already signed, are returned unchanged.
 */
export function signRelayUrl(proxyUrl: string, now = Date.now()): string {
  if (!/\/v[12]\/(proxy|relay)\?/.test(proxyUrl) || /[?&]sig=/.test(proxyUrl)) return proxyUrl;
  try {
    const u = new URL(proxyUrl, 'http://relative.invalid');
    const data = u.searchParams.get('data');
    if (!data) return proxyUrl;
    const { exp, sig } = signRelayData(data, now);
    return `${proxyUrl}&exp=${exp}&sig=${sig}`;
  } catch {
    return proxyUrl;
  }
}

/** The upstream target inside a relay URL, or null. */
export function decodeRelayUrl(proxyUrl: string): { url: string; headers?: Record<string, string> } | null {
  try {
    const data = new URL(proxyUrl, 'http://relative.invalid').searchParams.get('data');
    const parsed = data ? (JSON.parse(data) as { url?: string; headers?: Record<string, string> }) : null;
    return parsed?.url ? { url: parsed.url, headers: parsed.headers } : null;
  } catch {
    return null;
  }
}
