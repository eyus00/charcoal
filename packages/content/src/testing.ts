/**
 * Test helper: a Fetcher that answers from a table instead of the network. A request with no
 * matching route throws, so a test can never reach a real host by accident.
 */

import type { Fetcher, FetchOptions, FetchResponse } from '@charcoal/provider-sdk';

export interface MockResponse {
  /** Default 200. */
  status?: number;
  /** A string is sent as is; anything else is sent as JSON. Default ''. */
  body?: unknown;
  headers?: Record<string, string>;
}

/** What a route answers with: a response, or a function of the request that returns one (or throws). */
export type MockRoute = MockResponse | ((url: string, options: FetchOptions) => MockResponse);

export interface MockCall {
  url: string;
  method: 'GET' | 'POST' | 'HEAD';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface MockFetcher extends Fetcher {
  /** Every request made, in order. */
  calls: MockCall[];
}

/**
 * Routes are keyed by exact URL ("https://host/path?query") or by method and URL
 * ("POST https://host/path"); the method-specific key wins.
 */
export function mockFetcher(routes: Record<string, MockRoute>): MockFetcher {
  const calls: MockCall[] = [];
  const fetcher: Fetcher = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const call: MockCall = { url, method, headers: { ...options.headers } };
    if (options.body !== undefined) call.body = options.body;
    if (options.signal !== undefined) call.signal = options.signal;
    calls.push(call);

    if (options.signal?.aborted) throw new Error(`mockFetcher: ${method} ${url} was aborted`);
    const route = routes[`${method} ${url}`] ?? routes[url];
    if (route === undefined) throw new Error(`mockFetcher: no route for ${method} ${url}`);

    const answer = typeof route === 'function' ? route(url, options) : route;
    const status = answer.status ?? 200;
    const body = answer.body === undefined ? '' : typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
    const response: FetchResponse = { status, ok: status >= 200 && status < 300, url, headers: { ...answer.headers }, body };
    return response;
  };
  return Object.assign(fetcher, { calls });
}
