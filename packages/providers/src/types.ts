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
  /** Audio language name, when the source says. */
  language?: string;
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

export interface ScrapeContext {
  fetch: Fetcher;
  signal?: AbortSignal;
}

export interface Provider {
  id: string;
  name: string;
  /** Higher runs first when results are ordered. */
  rank: number;
  supports: ('movie' | 'tv')[];
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
