/**
 * The browser contract: what a provider can ask of a real browser, and what a browser worker must
 * offer the engine. The SDK only describes it; `@charcoal/browser-runtime` implements it with
 * Playwright, and a runtime without a worker simply has no `js-render` feature.
 *
 * A browser is for pages whose content exists only after their JavaScript ran. It is not a way
 * past a site's bot check: an interstitial is reported as CHALLENGE and nothing tries to solve it.
 */
import type { DomainResolver } from './domains.js';
import type { RequestTrace } from './errors.js';
import type { PolicyGuard } from './policy.js';
import type { ProviderAuth, StreamType } from './types.js';

/** A playlist, manifest, media file or caption file a page asked for. */
export interface CapturedMedia {
  url: string;
  type: StreamType | 'captions';
  /** The Referer and Origin the page sent with it: what a player elsewhere would have to send too. */
  headers: Record<string, string>;
  /** The frame that asked (an embedded player is usually not the top page). */
  frameUrl?: string;
}

export type BrowserWait = 'domcontentloaded' | 'load' | 'networkidle' | { selector: string } | { media: true } | { ms: number };

export interface BrowserOpenOptions {
  /** When the page counts as ready. Default 'load'. */
  waitFor?: BrowserWait;
  timeoutMs?: number;
  referer?: string;
}

export interface BrowserPage {
  /** Address of the document after redirects, and its HTTP status. */
  readonly url: string;
  readonly status: number;
  /** The document as it is now, after its scripts ran. */
  html(): Promise<string>;
  /** Text (or an attribute) of the elements matching a CSS selector, read inside the page. */
  select(selector: string, options?: { attr?: string; frames?: boolean }): Promise<string[]>;
  /** Evaluates a JavaScript expression in the page and returns its JSON value (size-capped). */
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** What the page and its frames have asked for so far that a player could use. */
  media(): CapturedMedia[];
  frames(): { url: string; name: string }[];
  click(selector: string, options?: { timeoutMs?: number; frames?: boolean }): Promise<void>;
  waitFor(what: Exclude<BrowserWait, string>, timeoutMs?: number): Promise<void>;
  goto(url: string, options?: BrowserOpenOptions): Promise<void>;
  close(): Promise<void>;
}

/** One provider run's browser: its own cookie jar, its own limits, gone when the run ends. */
export interface BrowserSession {
  open(url: string, options?: BrowserOpenOptions): Promise<BrowserPage>;
}

/** What the engine hands a worker for one provider run. */
export interface BrowserRun {
  providerId: string;
  /** The run's network policy: page navigations are checked against it like any request. */
  guard: PolicyGuard;
  domains: DomainResolver;
  signal: AbortSignal;
  /** Navigations are added here so a browser run is diagnosed like a fetch run. */
  trace: RequestTrace[];
  /** Per-device settings of this runtime (a viewer's own session for a service, if they supplied one). */
  settings: Record<string, unknown>;
  auth?: ProviderAuth;
  budgetMs: number;
  log(event: string, data?: Record<string, unknown>): void;
}

export interface BrowserWorkerHealth {
  state: 'stopped' | 'ready' | 'busy' | 'down';
  browserVersion?: string;
  launches: number;
  crashes: number;
  sessionsOpen: number;
  sessionsServed: number;
  queued: number;
  challenges: number;
  policyBlocks: number;
  lastError?: string;
  lastLaunchAt?: number;
}

export interface BrowserWorkerLike {
  /** Cheap: nothing is launched until the session opens a page. */
  session(run: BrowserRun): BrowserSession & { dispose(): Promise<void> };
  health(): BrowserWorkerHealth;
}

const MEDIA_EXT: [RegExp, CapturedMedia['type']][] = [
  [/\.m3u8(\?|#|$)/i, 'hls'],
  [/\.mpd(\?|#|$)/i, 'dash'],
  [/\.mp4(\?|#|$)/i, 'mp4'],
  [/\.mkv(\?|#|$)/i, 'mkv'],
  [/\.webm(\?|#|$)/i, 'webm'],
  [/\.(vtt|srt|ass)(\?|#|$)/i, 'captions'],
];

/** What kind of media a request is, from its address and (when known) its content type. */
export function classifyMediaRequest(url: string, contentType = ''): CapturedMedia['type'] | undefined {
  const path = url.split('?')[0];
  for (const [re, type] of MEDIA_EXT) if (re.test(path) || re.test(url)) return type;
  const ct = contentType.toLowerCase();
  if (/mpegurl/.test(ct)) return 'hls';
  if (/dash\+xml/.test(ct)) return 'dash';
  if (/^video\/mp4/.test(ct)) return 'mp4';
  if (/^video\/webm/.test(ct)) return 'webm';
  if (/^text\/vtt/.test(ct)) return 'captions';
  return undefined;
}

/** Media segments: never worth pulling through a worker. */
export const isSegmentRequest = (url: string) => /\.(ts|m4s|m4v|m4a|aac|mp3|cmfv|cmfa)(\?|#|$)/i.test(url.split('?')[0]);
