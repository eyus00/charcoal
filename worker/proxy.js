/**
 * Charcoal stream proxy — a Cloudflare Worker that speaks Jelly's proxy format:
 *
 *   GET /v1/proxy?data=<url-encoded JSON {"url": "...", "headers": {...}}>
 *
 * It fetches the upstream URL with the given headers, adds CORS headers, and
 * rewrites HLS playlists so every child playlist/segment/key also goes through
 * this Worker. Jelly keeps doing the scraping; only video traffic moves here.
 *
 * Optional env var ALLOWED_ORIGINS="https://charcoal.example.com,http://localhost:5173"
 * stops other sites from using your proxy.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
};

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' || url.pathname === '/health') return json({ service: 'charcoal-proxy', ok: true });
    if (url.pathname !== '/v1/proxy') return json({ error: 'Not found' }, 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);

    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    if (allowed.length && origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);

    let target;
    let headers = {};
    try {
      const data = JSON.parse(url.searchParams.get('data') || '');
      target = new URL(data.url);
      headers = data.headers && typeof data.headers === 'object' ? data.headers : {};
    } catch {
      return json({ error: 'Invalid data parameter' }, 400);
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return json({ error: 'Unsupported URL' }, 400);

    const out = new Headers();
    for (const [k, v] of Object.entries(headers)) if (typeof v === 'string' && v) out.set(k, v);
    const range = request.headers.get('Range');
    if (range) out.set('Range', range);

    let upstream;
    try {
      upstream = await fetch(target.toString(), { method: request.method, headers: out, redirect: 'follow' });
    } catch (e) {
      return json({ error: `Upstream fetch failed: ${e.message}` }, 502);
    }

    const type = upstream.headers.get('content-type') || '';
    const isPlaylist = /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(target.pathname);
    if (isPlaylist && upstream.ok && request.method === 'GET') {
      const text = await upstream.text();
      const base = upstream.url || target.toString();
      const wrap = (u) => `${url.origin}/v1/proxy?data=${encodeURIComponent(JSON.stringify({ url: new URL(u, base).toString(), headers }))}`;
      const body = text
        .split('\n')
        .map((line) => {
          const t = line.trim();
          if (!t) return line;
          if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${wrap(u)}"`);
          return wrap(t);
        })
        .join('\n');
      return new Response(body, {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
      });
    }

    const resHeaders = new Headers(CORS);
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) resHeaders.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};
