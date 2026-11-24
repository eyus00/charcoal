/**
 * The provider contract now lives in @charcoal/provider-sdk; this file re-exports it for the pack
 * and adds the per-device settings this pack's providers understand.
 */
export type { Caption, Fetcher, FetchOptions, FetchResponse, Media, ProviderContext, ProviderManifest, ProviderModule, RawStream, SourceResult, Stream } from '@charcoal/provider-sdk';
export { NotFoundError, ProviderError } from '@charcoal/provider-sdk';

/** Per-viewer settings some providers need. They stay with the viewer (never sent to a shared server). */
export interface ProviderSettings {
  /** The viewer's own Febbox login ("ui" cookie value), for the Febbox provider. */
  febboxToken?: string;
  /** Highest Febbox quality to use (height, e.g. 1080), to save the account's monthly traffic. */
  febboxMaxHeight?: number;
}
