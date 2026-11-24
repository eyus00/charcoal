/**
 * @charcoal/client: the client side of the provider platform.
 *
 *   bridge           protocol negotiation with the optional extension / app bridge
 *   registry-client  fetching, verifying and remembering the provider registry
 *   resolver         one call that runs what can run here, asks the resolver API for the rest,
 *                    and merges both into a single ranked, growing list of playable sources
 */
export * from './bridge.js';
export * from './registry-client.js';
export * from './resolver.js';
