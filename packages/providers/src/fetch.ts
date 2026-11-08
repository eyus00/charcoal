import type { Fetcher } from './types.js';

/** Plain fetch(), for Node (the server) or anywhere headers and CORS aren't restricted. */
export const nativeFetcher: Fetcher = async (url, o = {}) => {
  const res = await fetch(url, { method: o.method ?? 'GET', headers: o.headers, body: o.body, signal: o.signal });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { status: res.status, ok: res.ok, url: res.url, headers, body: await res.text() };
};

/** fetch + JSON.parse, throwing on HTTP errors. */
export async function getJson<T>(fetcher: Fetcher, url: string, options?: Parameters<Fetcher>[1]): Promise<T> {
  const res = await fetcher(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return JSON.parse(res.body) as T;
}
