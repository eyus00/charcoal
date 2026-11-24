/**
 * The egress guard: a small forward proxy inside the worker process that every byte the browser
 * sends has to pass through.
 *
 * Request interception in the browser is not enough to bound where a page can reach: redirects are
 * followed by the browser's network stack without the interceptor being asked, and a public name
 * can resolve to a private address. The guard decides at connection time, for every connection,
 * whatever caused it:
 *
 *   - the name is resolved here and EVERY address it has must be public (a name that resolves to
 *     both a public and a private address is refused, which is what DNS rebinding relies on);
 *   - the connection is then made to the address that was checked, not to the name again;
 *   - only web ports are allowed.
 *
 * It also remembers why a connection failed (no such name, refused, timed out), which the browser
 * itself only reports as "the proxy tunnel failed".
 */
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { isPublicHost, type FailureCode } from '@charcoal/provider-sdk';

export interface EgressGuardOptions {
  /** A proxy this machine's traffic has to leave through (http://host:port). Names are then resolved by it. */
  upstream?: string;
  /** Name resolution (injected in tests). */
  lookup?: (host: string) => Promise<string[]>;
  /** Whether a connection to this address, reached under this name, is allowed. Default: public addresses only. */
  allowAddress?: (address: string, host: string) => boolean;
  connectTimeoutMs?: number;
}

export interface EgressGuard {
  /** http://127.0.0.1:port, to give the browser as its proxy. */
  url: string;
  blocked(): number;
  /** Why the last connection to a host failed, if it did recently. */
  lastFailure(host: string): FailureCode | undefined;
  close(): Promise<void>;
}

const ALLOWED_PORT = (port: number) => port === 80 || port === 443 || (port >= 1024 && port <= 65535);

const failureOf = (e: unknown): FailureCode => {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return 'DNS';
  if (code === 'ETIMEDOUT') return 'TIMEOUT';
  return 'CONNECT';
};

export async function startEgressGuard(o: EgressGuardOptions = {}): Promise<EgressGuard> {
  const lookup = o.lookup ?? (async (host: string) => (await dns.lookup(host, { all: true })).map((a) => a.address));
  const allowAddress = o.allowAddress ?? ((address: string) => isPublicHost(address));
  const timeoutMs = o.connectTimeoutMs ?? 10_000;
  const upstream = o.upstream ? new URL(o.upstream) : undefined;
  const failures = new Map<string, { code: FailureCode; at: number }>();
  let blocked = 0;

  const fail = (host: string, code: FailureCode) => {
    if (failures.size > 500) failures.clear();
    failures.set(host.toLowerCase(), { code, at: Date.now() });
  };

  /** The address to connect to for a host, or the reason it is refused. */
  async function decide(host: string, port: number): Promise<{ address: string } | { refuse: FailureCode }> {
    if (!ALLOWED_PORT(port)) return { refuse: 'POLICY' };
    if (net.isIP(host)) return allowAddress(host, host) ? { address: host } : { refuse: 'POLICY' };
    if (!isPublicHost(host)) return { refuse: 'POLICY' };
    let addresses: string[] | undefined;
    try {
      addresses = await lookup(host);
    } catch (e) {
      // Behind an upstream proxy this machine may not be able to resolve names at all; the proxy will.
      if (!upstream) return { refuse: failureOf(e) };
    }
    if (addresses) {
      if (!addresses.length) return { refuse: 'DNS' };
      if (!addresses.every((a) => allowAddress(a, host))) return { refuse: 'POLICY' };
    }
    return { address: upstream || !addresses ? host : addresses[0] };
  }

  const refuse = (socket: Duplex, host: string, code: FailureCode) => {
    if (code === 'POLICY') blocked++;
    fail(host, code);
    socket.end(`HTTP/1.1 ${code === 'POLICY' ? '403 Forbidden' : '502 Bad Gateway'}\r\nx-egress-error: ${code}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`);
  };

  /** A TCP connection to host:port, directly or through the upstream proxy's CONNECT. */
  function open(address: string, port: number, host: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = upstream ? net.connect(Number(upstream.port) || 80, upstream.hostname) : net.connect(port, address);
      const timer = setTimeout(() => socket.destroy(Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' })), timeoutMs);
      socket.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      socket.once('connect', () => {
        if (!upstream) {
          clearTimeout(timer);
          return resolve(socket);
        }
        socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
        let buffered = '';
        const onData = (chunk: Buffer) => {
          buffered += chunk.toString('latin1');
          const end = buffered.indexOf('\r\n\r\n');
          if (end < 0) return;
          socket.off('data', onData);
          clearTimeout(timer);
          if (/^HTTP\/1\.[01] 2\d\d/.test(buffered)) {
            const rest = Buffer.from(buffered.slice(end + 4), 'latin1');
            if (rest.length) socket.unshift(rest);
            resolve(socket);
          } else {
            socket.destroy();
            // 502/504 from a proxy: it could not resolve or reach the host.
            reject(Object.assign(new Error(`upstream proxy answered ${buffered.slice(9, 12)}`), { code: /^HTTP\/1\.[01] 504/.test(buffered) ? 'ETIMEDOUT' : 'ECONNREFUSED' }));
          }
        };
        socket.on('data', onData);
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    // Plain http:// requests arrive with an absolute address.
    let target: URL;
    try {
      target = new URL(req.url ?? '');
      if (target.protocol !== 'http:') throw new Error('not http');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(target.port) || 80;
    const d = await decide(target.hostname, port);
    if ('refuse' in d) {
      if (d.refuse === 'POLICY') blocked++;
      fail(target.hostname, d.refuse);
      res.writeHead(d.refuse === 'POLICY' ? 403 : 502, { 'x-egress-error': d.refuse, 'content-length': 0 }).end();
      return;
    }
    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    const out = http.request(
      upstream ? { host: upstream.hostname, port: Number(upstream.port) || 80, path: target.href, method: req.method, headers } : { host: d.address, port, path: target.pathname + target.search, method: req.method, headers: { ...headers, host: target.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    out.setTimeout(timeoutMs * 3, () => out.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    out.on('error', (e) => {
      const code = failureOf(e);
      fail(target.hostname, code);
      if (!res.headersSent) res.writeHead(502, { 'x-egress-error': code, 'content-length': 0 });
      res.end();
    });
    res.on('close', () => out.destroy());
    req.pipe(out);
  });

  server.on('connect', async (req, client: Duplex, head: Buffer) => {
    const [host, portText] = (req.url ?? '').split(/:(?=\d+$)/);
    const port = Number(portText) || 443;
    const name = host.replace(/^\[|\]$/g, '');
    client.on('error', () => undefined);
    const d = await decide(name, port);
    if ('refuse' in d) return refuse(client, name, d.refuse);
    try {
      const upstreamSocket = await open(d.address, port, name);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(client);
      client.pipe(upstreamSocket);
      upstreamSocket.on('error', () => client.destroy());
      client.on('close', () => upstreamSocket.destroy());
    } catch (e) {
      refuse(client, name, failureOf(e));
    }
  });
  server.on('clientError', (_e, socket) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    blocked: () => blocked,
    lastFailure(host) {
      const f = failures.get(host.toLowerCase());
      return f && Date.now() - f.at < 30_000 ? f.code : undefined;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
