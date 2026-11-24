import { fetchTransport, getJson } from '@charcoal/provider-sdk';

/** Plain fetch(), for Node (the server) or anywhere headers and CORS aren't restricted. */
export const nativeFetcher = fetchTransport;
export { getJson };
