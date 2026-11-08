/**
 * Jelly's stream proxy (GET /v1/proxy?data=<url-encoded JSON {url, headers}>).
 *
 * Replaces the framework's proxy service. Ideas taken from P-Stream's proxy (re-implemented, not
 * copied):
 *  - HLS playlists are rewritten completely: segment lines plus the URI of EXT-X-KEY, EXT-X-MAP,
 *    EXT-X-MEDIA and friends (quoted or not), resolved against the FINAL url after redirects.
 *  - Playlists are recognised by their content (#EXTM3U), not only by type or extension.
 *  - Everything else is streamed, never buffered, and its type is sniffed when the host lies
 *    (Castle serves TS segments as image/jpeg).
 *  - A web page where media was expected (a block page) becomes a 403, so the player skips the
 *    host at once instead of choking on HTML.
 *  - Upstream 5xx and network errors become 503 with the real status in X-Upstream-Status (hosts
 *    and CDNs replace 502/504 with pages without CORS headers, which hls.js can't read).
 *  - The timeout only covers waiting for headers; long downloads aren't cut off. One retry on a
 *    network error or 5xx.
 *  - Range requests pass through (206, Content-Range); the Range of one request never leaks into
 *    the URLs written into a playlist.
 *  - Private and internal addresses are refused, at every redirect, so nobody can use Jelly to
 *    reach Railway's private network.
 */
import { Readable } from 'node:stream';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

type Target = { url: string; headers?: Record<string, string> };
type Base = { contentType: string; statusCode: number; headers: Record<string, string> };
export type ProxyResult = (Base & { data: Buffer }) | (Base & { stream: Readable });

const HEADER_TIMEOUT_MS = Number(process.env.PROXY_HEADER_TIMEOUT_MS ?? 15_000);
const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const ALLOW_PRIVATE = process.env.PROXY_ALLOW_PRIVATE === 'true'; // local testing only
const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Request headers that never go upstream (hop-by-hop, or describing our own client).
const DROP_REQUEST = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'range', 'cookie']);

// ---------- address guard ----------

export function isPrivateAddress(ip: string): boolean {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        );
    }
    if (net.isIPv6(ip)) {
        const s = ip.toLowerCase();
        const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff');
    }
    return true;
}

const hostCache = new Map<string, { ok: boolean; until: number }>();

class BlockedError extends Error {}

async function assertPublic(u: URL) {
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BlockedError('Unsupported protocol');
    if (ALLOW_PRIVATE) return;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
        throw new BlockedError('Internal address');
    }
    if (net.isIP(host)) {
        if (isPrivateAddress(host)) throw new BlockedError('Private address');
        return;
    }
    const cached = hostCache.get(host);
    if (cached && cached.until > Date.now()) {
        if (!cached.ok) throw new BlockedError('Private address');
        return;
    }
    const addrs = await lookup(host, { all: true });
    const ok = addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
    hostCache.set(host, { ok, until: Date.now() + 60_000 });
    if (hostCache.size > 5000) hostCache.clear();
    if (!ok) throw new BlockedError('Private address');
}

// ---------- upstream fetch ----------

async function fetchOnce(url: string, headers: Headers): Promise<{ res: Response; finalUrl: string }> {
    let current = new URL(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertPublic(current);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(new Error('Upstream took too long to answer')), HEADER_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(current, { headers, redirect: 'manual', signal: ctrl.signal });
        } finally {
            clearTimeout(timer); // only the wait for headers is timed
        }
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
            res.body?.cancel().catch(() => {});
            current = new URL(loc, current);
            continue;
        }
        return { res, finalUrl: current.toString() };
    }
    throw new Error('Too many redirects');
}

async function fetchUpstream(t: Target, range?: string) {
    const headers = new Headers();
    for (const [k, v] of Object.entries(t.headers ?? {})) {
        if (typeof v === 'string' && v && !DROP_REQUEST.has(k.toLowerCase())) headers.set(k, v);
    }
    if (!headers.has('user-agent')) headers.set('user-agent', DEFAULT_UA);
    if (range) headers.set('range', range);
    try {
        const r = await fetchOnce(t.url, headers);
        if (r.res.status < 500) return r;
        r.res.body?.cancel().catch(() => {});
    } catch (e) {
        if (e instanceof BlockedError) throw e;
    }
    return fetchOnce(t.url, headers); // one retry
}

// ---------- sniffing ----------

const startsWithText = (buf: Uint8Array, text: string) => {
    let i = 0;
    while (i < buf.length && (buf[i] === 0xef || buf[i] === 0xbb || buf[i] === 0xbf || buf[i] <= 0x20)) i++; // BOM, whitespace
    return Buffer.from(buf.subarray(i, i + text.length)).toString('latin1') === text;
};

function sniff(buf: Uint8Array): string | null {
    if (buf.length >= 1 && buf[0] === 0x47 && (buf.length < 189 || buf[188] === 0x47)) return 'video/mp2t';
    const box = Buffer.from(buf.subarray(4, 8)).toString('latin1');
    if (['ftyp', 'styp', 'moof', 'moov', 'sidx'].includes(box)) return 'video/mp4';
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
    if (startsWithText(buf, 'WEBVTT')) return 'text/vtt';
    if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return 'audio/aac';
    return null;
}

const looksLikeHtml = (buf: Uint8Array) => {
    const head = Buffer.from(buf.subarray(0, 512)).toString('latin1').trimStart().toLowerCase();
    return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<head>');
};

// ---------- playlist rewriting ----------

/** Relative proxy URL (resolves against whichever proxy served the playlist). */
export const proxyPath = (url: string, headers?: Record<string, string>) =>
    `/v1/proxy?data=${encodeURIComponent(JSON.stringify(headers && Object.keys(headers).length ? { url, headers } : { url }))}`;

const URI_ATTR = /URI=(?:"([^"]*)"|'([^']*)'|([^,\s"']+))/gi;

export function rewritePlaylist(text: string, base: string, headers?: Record<string, string>): string {
    const wrap = (u: string) => {
        if (/^(data|skd|blob):/i.test(u)) return u; // inline keys and DRM ids stay as they are
        try {
            return proxyPath(new URL(u, base).toString(), headers);
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
                return line.replace(URI_ATTR, (_m, dq, sq, bare) => {
                    const u = dq ?? sq ?? bare;
                    return `URI="${wrap(u)}"`;
                });
            }
            return wrap(t);
        })
        .join('\n');
}

// ---------- main ----------

const textResult = (statusCode: number, message: string, upstream?: string): ProxyResult => ({
    data: Buffer.from(JSON.stringify({ error: { code: 'PROXY_ERROR', message } })),
    contentType: 'application/json',
    statusCode,
    headers: { 'Cache-Control': 'no-store', ...(upstream ? { 'X-Upstream-Status': upstream } : {}) },
});

async function readAll(first: Uint8Array, reader: ReadableStreamDefaultReader<Uint8Array>, ended: boolean) {
    const parts = [Buffer.from(first)];
    let size = first.length;
    while (!ended) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_PLAYLIST_BYTES) throw new Error('Playlist too large');
        parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts).toString('utf-8');
}

export async function proxyRequest(t: Target): Promise<ProxyResult> {
    let target: Target;
    try {
        if (!t?.url) throw new Error();
        new URL(t.url);
        target = t;
    } catch {
        return textResult(400, 'Invalid data parameter');
    }
    const headers = { ...(target.headers ?? {}) };
    const range = headers.range ?? headers.Range;
    delete headers.range;
    delete headers.Range;

    let res: Response;
    let finalUrl: string;
    try {
        ({ res, finalUrl } = await fetchUpstream({ url: target.url, headers }, range));
    } catch (e) {
        if (e instanceof BlockedError) return textResult(403, e.message);
        return textResult(503, `Upstream unreachable: ${(e as Error).message}`, 'network');
    }

    const status = res.status;
    if (status >= 500) {
        res.body?.cancel().catch(() => {});
        return textResult(503, `Upstream returned ${status}`, String(status));
    }

    const upstreamType = (res.headers.get('content-type') ?? '').toLowerCase();
    const common: Record<string, string> = { 'X-Upstream-Status': String(status) };

    if (!res.body) {
        return { data: Buffer.alloc(0), contentType: upstreamType || 'application/octet-stream', statusCode: status, headers: common };
    }

    const reader = res.body.getReader();
    let first: Uint8Array = new Uint8Array();
    let ended = false;
    try {
        const r = await reader.read();
        first = r.value ?? new Uint8Array();
        ended = r.done;
    } catch (e) {
        return textResult(503, `Upstream broke off: ${(e as Error).message}`, 'network');
    }

    // Playlist: buffer, rewrite, never cache (signed URLs expire).
    if (status < 400 && startsWithText(first, '#EXTM3U')) {
        try {
            const text = await readAll(first, reader, ended);
            const body = rewritePlaylist(text, finalUrl, headers);
            return {
                data: Buffer.from(body, 'utf-8'),
                contentType: 'application/vnd.apple.mpegurl',
                statusCode: 200,
                headers: { ...common, 'Cache-Control': 'no-store' },
            };
        } catch (e) {
            return textResult(503, `Couldn't read the playlist: ${(e as Error).message}`, 'network');
        }
    }

    // A web page where media was expected: almost always a block or captcha page.
    const sniffed = sniff(first);
    if (status < 400 && !sniffed && (upstreamType.includes('text/html') || looksLikeHtml(first))) {
        reader.cancel().catch(() => {});
        return textResult(403, 'The host answered with a web page instead of media (probably blocked)', `${status}-html`);
    }

    // Everything else streams through, with the first chunk put back in front.
    const misleading = !upstreamType || /^(image\/|text\/html|text\/plain|application\/octet-stream|binary\/)/.test(upstreamType);
    const contentType = sniffed && misleading ? sniffed : upstreamType || sniffed || 'application/octet-stream';
    const out: Record<string, string> = {
        ...common,
        'Cache-Control': status < 400 ? 'public, max-age=3600' : 'no-store',
        'Content-Disposition': 'inline',
    };
    // fetch() already decompressed the body, so the upstream length is only right if it wasn't encoded.
    const encoded = !!res.headers.get('content-encoding');
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
        const v = res.headers.get(h);
        if (v && !(encoded && h === 'content-length')) out[h.replace(/(^|-)\w/g, (c) => c.toUpperCase())] = v;
    }
    if (range && !out['Accept-Ranges']) out['Accept-Ranges'] = 'bytes';

    async function* body() {
        try {
            if (first.length) yield first;
            while (!ended) {
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
            }
        } finally {
            // Viewer went away (stream destroyed) or upstream ended: stop downloading.
            reader.cancel().catch(() => {});
        }
    }
    return { stream: Readable.from(body(), { objectMode: false }), contentType, statusCode: status, headers: out };
}

/** Drop-in replacement for the framework's ProxyService (same proxyRequest(encodedData) shape). */
export const jellyProxyService = {
    async proxyRequest(encodedData: string): Promise<ProxyResult> {
        let data: Target;
        try {
            data = JSON.parse(decodeURIComponent(encodedData));
        } catch {
            return textResult(400, 'Invalid data parameter');
        }
        return proxyRequest(data);
    },
};
