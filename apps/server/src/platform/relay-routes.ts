/**
 * The relay's front door: signature checking for /v1/proxy and /v2/relay, and the /v2/relay route
 * itself. Kept apart from server.ts so it can be tested against a bare Fastify instance.
 */
import type { OMSSServer } from '@omss/framework';
import type { ProxyResult } from '../proxy.js';
import { REQUIRE_SIGNATURE, verifyRelayData } from './relay.js';

type App = ReturnType<OMSSServer['getInstance']>;

export interface RelayOptions {
  proxy(target: { url: string; headers?: Record<string, string> }): Promise<ProxyResult>;
  /** Defaults to the RELAY_REQUIRE_SIGNATURE setting. */
  requireSignature?: boolean;
  now?: () => number;
}

export function registerRelay(app: App, opts: RelayOptions) {
  const require = opts.requireSignature ?? REQUIRE_SIGNATURE;

  app.addHook('onRequest', async (request, reply) => {
    const isV1 = request.url.startsWith('/v1/proxy');
    if (!isV1 && !request.url.startsWith('/v2/relay')) return;
    const q = request.query as Record<string, string> | undefined;
    if (typeof q?.data !== 'string') return;
    // The relay only serves addresses this server handed out itself.
    const verdict = verifyRelayData(q.data, q.exp, q.sig, opts.now?.());
    if (verdict !== 'ok' && (require || verdict !== 'missing')) {
      return reply
        .code(verdict === 'expired' ? 410 : 403)
        .send({ error: { code: 'PROXY_ERROR', message: verdict === 'expired' ? 'This link has expired; search for sources again' : 'This relay only serves links it issued' } });
    }
    // The framework's /v1 controller decodes `data` a second time after Fastify already did, which
    // breaks URLs containing "%"; encoding it once more first makes that second decode harmless.
    if (isV1) q.data = encodeURIComponent(q.data);
  });

  app.get('/v2/relay', async (request, reply) => {
    const q = request.query as Record<string, string>;
    let target: { url: string; headers?: Record<string, string> };
    try {
      target = JSON.parse(q.data);
      if (!target || typeof target.url !== 'string') throw new Error('no url');
    } catch {
      return reply.code(400).send({ error: { code: 'INVALID_PARAMETER', message: 'Invalid data parameter' } });
    }
    const range = request.headers.range;
    const result = await opts.proxy({ url: target.url, headers: { ...(target.headers ?? {}), ...(range ? { range } : {}) } });
    reply.code(result.statusCode).headers(result.headers).type(result.contentType);
    return reply.send('stream' in result ? result.stream : result.data);
  });
}
