/**
 * Opening / ending / recap timestamps from AniSkip (crowd-sourced, keyed by MyAnimeList id and the
 * episode number inside that MAL entry, which is what tmdbToAnime returns).
 */

import type { Fetcher } from '@charcoal/provider-sdk';
import { finite, isRecord, parseJson } from '../internal/json.js';

export const ANISKIP_BASE = 'https://api.aniskip.com/v2';

export type SkipType = 'intro' | 'credits' | 'recap' | 'mixed-intro' | 'mixed-credits';

export interface SkipTime {
  type: SkipType;
  /** Seconds from the start of the episode. */
  start: number;
  end: number;
  /**
   * Length in seconds of the video the times were measured on. Compare it with the stream being
   * played: a different cut (a longer pre-roll, a missing recap) shifts every timestamp.
   */
  episodeLength: number;
}

/** AniSkip's names → ours. "mixed" = the opening or ending plays over episode content. */
const SKIP_TYPES = new Map<string, SkipType>([
  ['op', 'intro'],
  ['ed', 'credits'],
  ['mixed-op', 'mixed-intro'],
  ['mixed-ed', 'mixed-credits'],
  ['recap', 'recap'],
]);

/**
 * Skip times for one episode, earliest first. A 404 or `found: false` means nobody has submitted
 * any yet and gives []. Any other failure throws an Error naming the status.
 */
export async function fetchSkipTimes(fetcher: Fetcher, malId: number, episode: number, signal?: AbortSignal): Promise<SkipTime[]> {
  if (!Number.isInteger(malId) || malId < 1) throw new RangeError(`MAL id must be a positive integer, got ${malId}`);
  if (!Number.isFinite(episode) || episode <= 0) throw new RangeError(`Episode must be a positive number, got ${episode}`);

  const types = [...SKIP_TYPES.keys()].map((type) => `types=${type}`).join('&');
  // episodeLength=0 turns off AniSkip's own filter on the video length; callers compare lengths themselves.
  const response = await fetcher(`${ANISKIP_BASE}/skip-times/${malId}/${episode}?${types}&episodeLength=0`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (response.status === 404) return [];
  if (response.status !== 200) throw new Error(`AniSkip request failed with status ${response.status}`);

  const payload = parseJson(response.body, 'AniSkip');
  if (!isRecord(payload) || payload.found !== true || !Array.isArray(payload.results)) return [];

  const times: SkipTime[] = [];
  for (const result of payload.results) {
    if (!isRecord(result) || !isRecord(result.interval)) continue;
    const type = typeof result.skipType === 'string' ? SKIP_TYPES.get(result.skipType) : undefined;
    const start = finite(result.interval.startTime);
    const end = finite(result.interval.endTime);
    if (type === undefined || start === undefined || end === undefined || start < 0 || end <= start) continue;
    times.push({ type, start, end, episodeLength: finite(result.episodeLength) ?? 0 });
  }
  return times.sort((a, b) => a.start - b.start);
}
