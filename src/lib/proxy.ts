import type { JellyResponse } from './servers';

/**
 * Optional user-supplied stream proxy (the Cloudflare Worker in jelly/worker).
 * It speaks the same `/v1/proxy?data=…` format as Jelly, so we only swap the origin.
 */

export function normalizeProxy(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return '';
    return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/v1\/proxy$/, '');
  } catch {
    return '';
  }
}

export async function checkProxy(base: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout?.(8000) });
    if (!res.ok) return { ok: false, error: `it answered ${res.status}` };
    const body = await res.json().catch(() => null);
    return body?.service === 'charcoal-proxy' ? { ok: true } : { ok: false, error: 'that URL isn’t a Charcoal stream proxy' };
  } catch {
    return { ok: false, error: 'couldn’t reach it (check the URL, and that the Worker is deployed)' };
  }
}

const swap = (url: string, base: string) => {
  const i = url.indexOf('/v1/proxy?');
  return i === -1 ? url : base + url.slice(i);
};

export function viaProxy(data: JellyResponse, base: string): JellyResponse {
  if (!base) return data;
  return {
    ...data,
    sources: data.sources.map((s) => ({ ...s, url: swap(s.url, base) })),
    subtitles: data.subtitles.map((s) => ({ ...s, url: swap(s.url, base) })),
  };
}
