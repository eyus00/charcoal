/**
 * Charcoal stream proxy — a Cloudflare Worker that speaks Jelly's proxy format:
 *
 *   GET /v1/proxy?data=<url-encoded JSON {"url": "...", "headers": {...}}>
 *
 * Same behaviour as Jelly's own proxy (src/proxy.ts):
 *  - playlists (recognised by "#EXTM3U") are rewritten: segment lines and every URI= attribute
 *    (keys, init segments, audio/subtitle renditions), resolved against the final URL
 *  - everything else streams through; the type is sniffed when the host lies (TS as image/jpeg)
 *  - a web page where media was expected (a block page) becomes a 403
 *  - upstream 5xx / network errors become 503 with X-Upstream-Status (CORS-safe)
 *  - Range passes through; one retry on 5xx or network error; private addresses refused
 *
 * Optional env var ALLOWED_ORIGINS="https://charcoal.example.com,http://localhost:5173"
 * stops other sites from using your proxy.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Upstream-Status',
};

const PASS_HEADERS = ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
const DROP_REQUEST = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'range', 'cookie']);
const HEADER_TIMEOUT_MS = 15000;
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

function privateHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return h.includes(':') && (h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h));
}

async function fetchOnce(url, headers, method) {
  let current = new URL(url);
  for (let hop = 0; hop <= 5; hop++) {
    if ((current.protocol !== 'https:' && current.protocol !== 'http:') || privateHost(current.hostname)) throw new Error('blocked');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEADER_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current.toString(), { method, headers, redirect: 'manual', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current);
      continue;
    }
    return { res, finalUrl: current.toString() };
  }
  throw new Error('Too many redirects');
}

async function fetchUpstream(url, headers, method) {
  try {
    const r = await fetchOnce(url, headers, method);
    if (r.res.status < 500) return r;
  } catch (e) {
    if (e.message === 'blocked') throw e;
  }
  return fetchOnce(url, headers, method);
}

const skipWs = (b) => {
  let i = 0;
  while (i < b.length && (b[i] <= 0x20 || b[i] === 0xef || b[i] === 0xbb || b[i] === 0xbf)) i++;
  return i;
};
const startsWith = (b, text) => {
  const i = skipWs(b);
  return new TextDecoder('latin1').decode(b.subarray(i, i + text.length)) === text;
};
function sniff(b) {
  if (b.length && b[0] === 0x47 && (b.length < 189 || b[188] === 0x47)) return 'video/mp2t';
  const box = new TextDecoder('latin1').decode(b.subarray(4, 8));
  if (['ftyp', 'styp', 'moof', 'moov', 'sidx'].includes(box)) return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  if (startsWith(b, 'WEBVTT')) return 'text/vtt';
  return null;
}
const looksLikeHtml = (b) => {
  const head = new TextDecoder('latin1').decode(b.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<head>');
};

function rewritePlaylist(text, base, origin, headers) {
  const data = (u) => (headers && Object.keys(headers).length ? { url: u, headers } : { url: u });
  const wrap = (u) => {
    if (/^(data|skd|blob):/i.test(u)) return u;
    try {
      return `${origin}/v1/proxy?data=${encodeURIComponent(JSON.stringify(data(new URL(u, base).toString())))}`;
    } catch {
      return u;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        if (!/URI=/i.test(t)) return line;
        return line.replace(/URI=(?:"([^"]*)"|'([^']*)'|([^,\s"']+))/gi, (_m, dq, sq, bare) => `URI="${wrap(dq ?? sq ?? bare)}"`);
      }
      return wrap(t);
    })
    .join('\n');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' || url.pathname === '/health') return json({ service: 'charcoal-proxy', ok: true, version: 2 });
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

    const out = new Headers();
    for (const [k, v] of Object.entries(headers)) if (typeof v === 'string' && v && !DROP_REQUEST.has(k.toLowerCase())) out.set(k, v);
    if (!out.has('user-agent')) out.set('user-agent', DEFAULT_UA);
    const range = request.headers.get('Range');
    if (range) out.set('Range', range);
    const childHeaders = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'range'));

    let upstream;
    let finalUrl;
    try {
      ({ res: upstream, finalUrl } = await fetchUpstream(target.toString(), out, request.method));
    } catch (e) {
      if (e.message === 'blocked') return json({ error: 'Address not allowed' }, 403);
      return json({ error: `Upstream unreachable: ${e.message}` }, 503, { 'X-Upstream-Status': 'network' });
    }
    if (upstream.status >= 500) return json({ error: `Upstream returned ${upstream.status}` }, 503, { 'X-Upstream-Status': String(upstream.status) });

    const type = (upstream.headers.get('content-type') || '').toLowerCase();
    const resHeaders = new Headers(CORS);
    resHeaders.set('X-Upstream-Status', String(upstream.status));
    if (request.method === 'HEAD' || !upstream.body) {
      for (const h of PASS_HEADERS) upstream.headers.get(h) && resHeaders.set(h, upstream.headers.get(h));
      if (type) resHeaders.set('Content-Type', type);
      return new Response(null, { status: upstream.status, headers: resHeaders });
    }

    const reader = upstream.body.getReader();
    const firstRead = await reader.read();
    const first = firstRead.value || new Uint8Array();

    if (upstream.status < 400 && startsWith(first, '#EXTM3U')) {
      const parts = [first];
      if (!firstRead.done) for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }
      const text = await new Response(new Blob(parts)).text();
      return new Response(rewritePlaylist(text, finalUrl, url.origin, childHeaders), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store', 'X-Upstream-Status': String(upstream.status) },
      });
    }

    const sniffed = sniff(first);
    if (upstream.status < 400 && !sniffed && (type.includes('text/html') || looksLikeHtml(first))) {
      reader.cancel().catch(() => {});
      return json({ error: 'The host answered with a web page instead of media (probably blocked)' }, 403, { 'X-Upstream-Status': `${upstream.status}-html` });
    }

    const misleading = !type || /^(image\/|text\/html|text\/plain|application\/octet-stream|binary\/)/.test(type);
    resHeaders.set('Content-Type', sniffed && misleading ? sniffed : type || sniffed || 'application/octet-stream');
    resHeaders.set('Cache-Control', upstream.status < 400 ? 'public, max-age=3600' : 'no-store');
    const encoded = !!upstream.headers.get('content-encoding');
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v && !(encoded && h === 'content-length')) resHeaders.set(h, v);
    }

    const done = firstRead.done;
    const body = new ReadableStream({
      start(c) {
        if (first.length) c.enqueue(first);
        if (done) c.close();
      },
      async pull(c) {
        const { done: d, value } = await reader.read();
        if (d) c.close();
        else c.enqueue(value);
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });
    return new Response(body, { status: upstream.status, headers: resHeaders });
  },
};
