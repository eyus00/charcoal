/**
 * Legacy (OMSS-format) providers as platform modules.
 *
 * The classes in src/providers/ predate the provider SDK: they call the global fetch themselves,
 * use Node built-ins, and carry their address in the class. They keep working unchanged; this
 * adapter gives each one a manifest so the registry, the engine, health and ranking treat it like
 * any other provider. What can't be retrofitted is stated in the manifest: `network: 'unmanaged'`
 * (no policy, no request trace) and `runtimes: ['server']`.
 *
 * Porting one to the SDK (see docs/platform/SDK.md) removes those limits and lets it run on a
 * viewer's own connection.
 */
import type { BaseProvider, ProviderMediaObject, ProviderResult } from '@omss/framework';
import { CONTRACT_VERSION, NotFoundError, ProviderError, type FailureCode, type Media, type ProviderManifest, type ProviderModule, type RawStream, type StreamType } from '@charcoal/provider-sdk';
import { decodeRelayUrl } from './relay.js';

/** OMSS ids are free-form ("CineSu", "fsharetv"); platform ids are lowercase with dashes. */
export const platformId = (omssId: string) => omssId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';

const STREAM_TYPES = new Set<StreamType>(['hls', 'dash', 'mp4', 'mkv', 'webm']);

export function toOmssMedia(media: Media): ProviderMediaObject | null {
  if ((media.kind !== 'movie' && media.kind !== 'tv') || !media.ids.tmdb) return null;
  return {
    type: media.kind,
    tmdbId: media.ids.tmdb,
    imdbId: media.ids.imdb ?? '',
    title: media.title,
    releaseYear: media.year ? String(media.year) : '',
    ...(media.kind === 'tv' ? { s: media.season, e: media.episode } : {}),
  };
}

/** Legacy providers report failures as a message inside an empty result; recover what we can. */
function codeFromMessage(message: string): FailureCode | null {
  if (!message) return null;
  if (/timed? ?out|took too long/i.test(message)) return 'TIMEOUT';
  if (/\b(401|403|451)\b|forbidden|blocked|denied/i.test(message)) return 'ACCESS_DENIED';
  if (/\b429\b|rate.?limit/i.test(message)) return 'RATE_LIMITED';
  if (/just a moment|captcha|turnstile|challenge/i.test(message)) return 'CHALLENGE';
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network/i.test(message)) return 'NETWORK';
  if (/\b5\d\d\b/.test(message)) return 'HTTP';
  if (/decrypt|parse|unexpected|invalid|token/i.test(message)) return 'STRUCTURE_CHANGED';
  return null;
}

export interface LegacyCalls {
  getMovieSources(media: ProviderMediaObject): Promise<ProviderResult>;
  getTVSources(media: ProviderMediaObject): Promise<ProviderResult>;
}

/**
 * `calls` are the provider's ORIGINAL methods, captured before the /v1 wrapper replaces them, so
 * the engine's own timeout and health bookkeeping aren't doubled.
 */
export function legacyModule(provider: BaseProvider, calls: LegacyCalls): ProviderModule {
  const kinds = [
    ...(provider.capabilities.supportedContentTypes.includes('movies') ? (['movie'] as const) : []),
    ...(provider.capabilities.supportedContentTypes.includes('tv') ? (['tv'] as const) : []),
  ];
  let origin: string | undefined;
  try {
    origin = provider.BASE_URL ? new URL(provider.BASE_URL).hostname : undefined;
  } catch {
    origin = undefined;
  }
  const manifest: ProviderManifest = {
    id: platformId(provider.id),
    name: provider.name,
    version: '1.0.0',
    description: `Legacy server-only provider${origin ? ` (${origin})` : ''}. Not yet ported to the provider SDK.`,
    contract: CONTRACT_VERSION,
    kinds,
    lookup: ['tmdb'],
    runtimes: ['server'],
    requires: { features: ['node'] },
    domainRoles: [],
    network: 'unmanaged',
    output: { types: ['hls', 'mp4', 'mkv'] },
    rank: 100,
    origin: 'apps/server/src/providers (OMSS format)',
  };
  return {
    manifest,
    async getSources(media) {
      const m = toOmssMedia(media);
      if (!m) throw new NotFoundError(`${provider.name}: needs a TMDB movie or episode`);
      const result = await (m.type === 'movie' ? calls.getMovieSources(m) : calls.getTVSources(m));
      const streams: RawStream[] = [];
      for (const s of result.sources ?? []) {
        const target = decodeRelayUrl(s.url) ?? { url: s.url, headers: undefined };
        const type = STREAM_TYPES.has(s.type as StreamType) ? (s.type as StreamType) : undefined;
        if (!type) continue;
        const a = s.audioTracks?.[0];
        streams.push({ url: target.url, type, quality: s.quality, headers: target.headers, language: a?.label, languageCode: a?.language });
      }
      if (!streams.length) {
        const message = (result.diagnostics ?? []).map((d) => d.message).join('; ');
        const code = codeFromMessage(message);
        if (code) throw new ProviderError(code, message.slice(0, 200));
        throw new NotFoundError(message.slice(0, 200) || undefined);
      }
      return {
        streams,
        captions: (result.subtitles ?? []).map((c) => {
          const target = decodeRelayUrl(c.url);
          return { url: target?.url ?? c.url, headers: target?.headers, label: c.label, format: c.format };
        }),
      };
    },
  };
}
