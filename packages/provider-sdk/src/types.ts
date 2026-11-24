/**
 * The provider contract (version 2). Everything a provider, a runtime, the engine and a client
 * agree on lives here. It is plain data and interfaces: no runtime code, no Node or DOM types.
 */

export const CONTRACT_VERSION = 2;
export const SDK_VERSION = '0.1.0';

// ---------- what to find ----------

export type MediaKind = 'movie' | 'tv' | 'anime' | 'live';

/** Ids a title can be known by. A provider's manifest says which of them it can look up. */
export interface MediaIds {
  tmdb?: string;
  imdb?: string;
  anilist?: string;
  mal?: string;
  kitsu?: string;
  tvdb?: string;
  /** A live event's id in the schedule source it came from (e.g. "thesportsdb:1234"). */
  event?: string;
  /** A channel id (e.g. an iptv-org channel id). */
  channel?: string;
}
export type IdKind = keyof MediaIds | 'title';

interface MediaCommon {
  ids: MediaIds;
  /** The movie's, the show's or the event's title (never an episode name). */
  title: string;
  /** Other names it goes by: translations, romanisations, transliterations. */
  altTitles?: string[];
  year?: number;
  /** ISO 639-1 code of the original audio. */
  originalLanguage?: string;
  /** Running time in minutes, when known. */
  runtime?: number;
}
export interface MovieMedia extends MediaCommon {
  kind: 'movie';
}
export interface EpisodeMedia extends MediaCommon {
  kind: 'tv';
  season: number;
  episode: number;
  seasonTmdbId?: string;
  episodeTmdbId?: string;
}
export interface AnimeMedia extends MediaCommon {
  kind: 'anime';
  /** Episode number inside the entry named by ids.anilist / ids.mal (not the TMDB season number). */
  episode: number;
  /** The TMDB season and episode this maps to, when known. */
  season?: number;
  seasonEpisode?: number;
  audio?: 'sub' | 'dub';
}
export interface LiveMedia extends MediaCommon {
  kind: 'live';
  /** Scheduled start, epoch ms. */
  startsAt?: number;
  channel?: string;
}
export type Media = MovieMedia | EpisodeMedia | AnimeMedia | LiveMedia;

// ---------- what comes back ----------

/** 'frame' is another site's player to show in an iframe: playable, but not a stream we control. */
export type StreamType = 'hls' | 'dash' | 'mp4' | 'mkv' | 'webm' | 'frame';

export interface AudioInfo {
  /** ISO 639-1 code, or 'und' when the source doesn't say. */
  lang: string;
  label?: string;
  codec?: string;
  channels?: number;
  /** True when this is a dub rather than the original audio. */
  dub?: boolean;
}

export interface VideoInfo {
  height?: number;
  codec?: string;
  hdr?: string;
  /** Bits per second. */
  bitrate?: number;
}

/** What a provider returns for one stream. Only `url` and `type` are required. */
export interface RawStream {
  url: string;
  type: StreamType;
  /** "2160" | "1080" | "720" | … | "auto" | "original". Detected from the URL or note when missing. */
  quality?: string;
  /** Headers every request for it needs (playlist, segments, keys). */
  headers?: Record<string, string>;
  audio?: AudioInfo[];
  /** Shorthand for a single audio language (name and ISO 639-1 code). */
  language?: string;
  languageCode?: string;
  video?: VideoInfo;
  /** Language burned into the picture, if any. */
  hardsub?: string;
  /** Size in bytes at this quality. */
  size?: number;
  /** Short file description, e.g. "BluRay · x265 10bit". */
  note?: string;
  /** For an adaptive stream built from several qualities. */
  levels?: { quality: string; size?: number }[];
  /** Epoch ms after which the URL must be resolved again. Detected from the URL when missing. */
  expiresAt?: number;
  /** True when the URL only works from the address that resolved it. */
  ipBound?: boolean;
  /** Present for live streams. */
  live?: { dvrSeconds?: number };
}

export type CaptionFormat = 'vtt' | 'srt' | 'ass' | 'ssa' | 'ttml';
export interface Caption {
  url: string;
  label: string;
  /** ISO 639-1 code, when known. */
  lang?: string;
  format: CaptionFormat;
  headers?: Record<string, string>;
}

/** A file-host page a shared resolver can turn into streams. */
export interface HostLink {
  host: string;
  url: string;
  headers?: Record<string, string>;
}

export interface SourceResult {
  streams: RawStream[];
  captions?: Caption[];
  links?: HostLink[];
}

/** How a stream can reach a player. Decided by the client for its own capabilities. */
export type Delivery = 'direct' | 'headers' | 'relay' | 'frame' | 'unplayable';

/** A stream after normalisation: every field filled, tagged with where it came from. */
export interface Stream extends Omit<RawStream, 'quality' | 'audio' | 'headers' | 'language' | 'languageCode'> {
  /** Stable across re-resolves: provider + upstream host + path, without tokens. */
  id: string;
  /** Same for the same upstream file from any provider (duplicate detection). */
  dedupKey: string;
  quality: string;
  headers: Record<string, string>;
  audio: AudioInfo[];
  provider: { id: string; name: string; version: string };
  runtime: RuntimeKind;
  /** Ranking score and why (filled by the ranker). */
  score?: number;
  reasons?: string[];
}

// ---------- the network ----------

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface FetchResponse {
  status: number;
  ok: boolean;
  /** Final URL after redirects. */
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * The only way a provider reaches the network. A runtime supplies the transport (Node fetch, the
 * extension bridge, an app's native HTTP); the SDK wraps it with policy, timeouts and tracing.
 */
export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResponse>;

// ---------- where code runs ----------

/**
 * server    a long-running process (container, VM, a viewer's own machine)
 * edge      a serverless or edge function: fetch + WebCrypto only, no state between requests
 * extension the website through the browser-extension bridge
 * app       the installed app through its native bridge
 * browser   an automated browser (JavaScript rendering); a contract only, nothing is bundled
 * frame     another site's player in an iframe, in the viewer's own browser
 * remote    behind someone else's HTTP API (the hosted resolver, a Stremio-style addon)
 */
export type RuntimeKind = 'server' | 'edge' | 'extension' | 'app' | 'browser' | 'frame' | 'remote';

export type Feature =
  /** Can set Referer / Origin / User-Agent on requests. */
  | 'forbidden-headers'
  /** Can send a Cookie header. */
  | 'cookies'
  /** Node built-ins are available (legacy server-only providers). */
  | 'node'
  /** State survives between requests of one run and across runs (ctx.store is durable). */
  | 'session'
  /** Holds per-device settings such as a personal account token. */
  | 'user-settings'
  /** Runs page JavaScript. */
  | 'js-render';

export interface RuntimeDescriptor {
  kind: RuntimeKind;
  /** Whose network the requests leave from. */
  egress: 'datacenter' | 'user';
  features: Feature[];
  sdk: string;
  contract: number;
  /** Shown in diagnostics ("Charcoal's server", "this browser"). */
  label?: string;
}

// ---------- a provider ----------

export interface ProviderRequirements {
  /** Features the runtime must have. */
  features?: Feature[];
  /** 'user' = only worth running on the viewer's own connection. */
  egress?: 'any' | 'user';
  /** A per-device setting it cannot run without (e.g. "febboxToken"). Never sent to a remote runtime. */
  setting?: string;
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean';
  description?: string;
  default?: string | number | boolean;
  /** Secret values are never logged or reported. */
  secret?: boolean;
  enum?: (string | number)[];
}

/** A provider's identity and capabilities. Data only: the registry can answer questions from it without running code. */
export interface ProviderManifest {
  /** Stable, lowercase, [a-z0-9-]. */
  id: string;
  name: string;
  /** Semver of this provider's extraction logic. */
  version: string;
  description?: string;
  contract: typeof CONTRACT_VERSION;
  kinds: MediaKind[];
  /** Audio languages it usually carries (ISO 639-1). Omitted = original audio. */
  languages?: string[];
  /** Ids it can look a title up by, best first. */
  lookup: IdKind[];
  /** Runtimes its code is written for. Which of them work right now is measured, not declared. */
  runtimes: RuntimeKind[];
  requires?: ProviderRequirements;
  /** Domain roles it uses ("site", "api"); the addresses live in a DomainConfig, not here. */
  domainRoles: string[];
  /** Other hosts it may call, as patterns ("api.example.com", "*.example.net"). */
  extraHosts?: string[];
  /** Whether it may fetch URLs that appeared in a response from one of its own hosts (e.g. a playlist on a CDN). */
  followDiscovered?: boolean;
  /**
   * How far the network policy reaches for this provider:
   * - declared  (default) only its domain roles, extraHosts and discovered hosts
   * - open      any public host, still through ctx.fetch (traced, capped, private addresses refused);
   *             for vendored packs whose hosts aren't declared individually
   * - unmanaged legacy code that calls the global fetch itself; nothing is enforced or traced
   * A runtime may refuse anything but 'declared'.
   */
  network?: 'declared' | 'open' | 'unmanaged';
  output: { types: StreamType[] };
  limits?: { timeoutMs?: number; maxRequests?: number };
  /** Author's default priority (higher first). The registry may override; health adjusts it. */
  rank?: number;
  config?: Record<string, ConfigField>;
  dependencies?: { sdk?: string; providers?: string[] };
  license?: string;
  /** Where the logic was adapted from, if anywhere. */
  origin?: string;
}

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface ProviderContext {
  /** Policy-enforced, traced fetch. The only way out. */
  fetch: Fetcher;
  signal: AbortSignal;
  runtime: RuntimeDescriptor;
  /** Provider configuration plus the per-device settings this runtime holds. */
  settings: Record<string, unknown>;
  /** Origin ("https://host") currently in use for a domain role. */
  domain(role: string): string;
  /** An absolute URL on a domain role. */
  url(role: string, path: string): string;
  /** Scratch space scoped to this provider (session keys, looked-up ids). */
  store: KeyValueStore;
  log(event: string, data?: Record<string, unknown>): void;
}

export interface ProviderModule {
  manifest: ProviderManifest;
  /** Find streams for a title. Throw ProviderError('NOT_FOUND') when the title isn't there. */
  getSources(media: Media, ctx: ProviderContext): Promise<SourceResult>;
  /** Optional: fresh URLs for a stream found earlier (expired token), or streams from a host link. */
  resolve?(ref: { streamId?: string; link?: HostLink; media: Media }, ctx: ProviderContext): Promise<RawStream[]>;
  /** Optional cheap probe. Real health is measured from runs. */
  health?(ctx: ProviderContext): Promise<{ ok: boolean; detail?: string }>;
}
