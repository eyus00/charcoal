/** What to find: a movie, or one episode of a show. */
export interface Media {
  type: 'movie' | 'tv';
  tmdbId: string;
  imdbId?: string;
  /** The movie's or the SHOW's title (never the episode name). */
  title: string;
  year?: number;
  season?: number;
  episode?: number;
}

/** A playable stream. `headers` must be sent with every request for it (playlist, segments, keys). */
export interface Stream {
  url: string;
  type: 'hls' | 'mp4' | 'mkv';
  /** e.g. "1080", "720", "auto" */
  quality: string;
  headers: Record<string, string>;
  /** Audio language name, when the source says ("English", "Hindi", "Original"). */
  language?: string;
  /** ISO 639-1 code of that language, when known ("en", "hi"). */
  languageCode?: string;
  /** Short description of the file, e.g. "BluRay · x265 10bit · 1.4 GB". */
  note?: string;
}

export interface Caption {
  url: string;
  label: string;
  format: 'vtt' | 'srt' | 'ass' | 'ssa' | 'ttml';
  headers?: Record<string, string>;
}

export interface ScrapeResult {
  streams: Stream[];
  captions: Caption[];
}

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
 * Every request a provider makes goes through this. On the server it is plain fetch(); in the
 * website it goes through the browser extension, which can send headers a web page can't
 * (User-Agent, Referer, Origin) and isn't limited by CORS.
 */
export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResponse>;

/** Per-viewer settings some providers need. They stay with the viewer (never sent to our server). */
export interface ProviderSettings {
  /** The viewer's own Febbox login ("ui" cookie value), for the Febbox provider. */
  febboxToken?: string;
}

export interface ScrapeContext {
  fetch: Fetcher;
  signal?: AbortSignal;
  settings?: ProviderSettings;
}

export interface Provider {
  id: string;
  name: string;
  /** Higher runs first when results are ordered. */
  rank: number;
  supports: ('movie' | 'tv')[];
  /** A setting this provider can't work without; it's skipped when the setting is missing. */
  requires?: keyof ProviderSettings;
  /** Resolves with streams, or throws (NotFoundError when the title simply isn't there). */
  scrape(media: Media, ctx: ScrapeContext): Promise<ScrapeResult>;
}

/** The title isn't on this source: not a failure of the source itself. */
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}
