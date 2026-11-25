import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SkipTime } from '@charcoal/content';
import { useAnimeSkipTimes } from './anime';
import type { MediaType } from './tmdb';

/**
 * Intro / recap / credits / preview timestamps from TheIntroDB (a free, community-built database
 * that P-Stream also uses). Times are in seconds; `end` null means "until the end".
 *
 * Anime that TheIntroDB has nothing for falls back to AniSkip (see lib/anime), whose times are
 * keyed by MyAnimeList entry and say how long the video they were measured on was.
 */
export type SegmentType = 'intro' | 'recap' | 'credits' | 'preview';
export interface Segment {
  type: SegmentType;
  start: number;
  end: number | null;
  /**
   * Length in seconds of the video the times were measured on, when the source says. A stream of
   * another length is another cut (a longer pre-roll, no recap), where the times would be wrong.
   */
  length?: number;
}

const API = 'https://api.theintrodb.org/v2/media';
const TYPES: SegmentType[] = ['intro', 'recap', 'credits', 'preview'];

async function fetchSegments(type: MediaType, id: number, season?: number, episode?: number, signal?: AbortSignal): Promise<Segment[]> {
  const qs = new URLSearchParams({ tmdb_id: String(id) });
  if (type === 'tv' && season !== undefined && episode !== undefined) {
    qs.set('season', String(season));
    qs.set('episode', String(episode));
  }
  const res = await fetch(`${API}?${qs}`, { signal });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`TheIntroDB returned ${res.status}`);
  const data = (await res.json()) as Partial<Record<SegmentType, { start_ms: number | null; end_ms: number | null }[]>>;
  const out: Segment[] = [];
  for (const t of TYPES) {
    for (const s of data[t] ?? []) {
      const start = (s.start_ms ?? 0) / 1000;
      const end = s.end_ms === null ? null : s.end_ms / 1000;
      if (end !== null && end - start < 3) continue; // too short to be worth a button
      out.push({ type: t, start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * AniSkip's times as segments. Only a plain opening, ending and recap: its "mixed" kinds play over
 * episode content, which a skip would lose.
 */
export function animeSegments(times: SkipTime[]): Segment[] {
  const kinds: [SkipTime['type'], SegmentType][] = [
    ['recap', 'recap'],
    ['intro', 'intro'],
    ['credits', 'credits'],
  ];
  const out: Segment[] = [];
  for (const [from, type] of kinds) {
    const t = times.find((x) => x.type === from);
    if (!t || t.end - t.start < 3) continue;
    out.push({ type, start: t.start, end: t.end, ...(t.episodeLength > 0 ? { length: t.episodeLength } : {}) });
  }
  return out.sort((a, b) => a.start - b.start);
}

const NONE: Segment[] = [];

export function useSegments(type: MediaType, id: number, season?: number, episode?: number): Segment[] {
  // id 0: something with no TMDB identity is playing (a live channel).
  const own = useQuery({
    queryKey: ['segments', type, id, season, episode],
    queryFn: ({ signal }) => fetchSegments(type, id, season, episode, signal),
    staleTime: 1000 * 60 * 60 * 6,
    retry: false,
    enabled: id > 0,
  });
  // Only once TheIntroDB has answered with nothing (or couldn't be reached).
  const missing = id > 0 && !own.isPending && !own.data?.length;
  const skip = useAnimeSkipTimes(type, id, season, episode, missing);
  return useMemo(() => (own.data?.length ? own.data : skip.length ? animeSegments(skip) : NONE), [own.data, skip]);
}

export const SEGMENT_LABEL: Record<SegmentType, string> = {
  intro: 'Skip intro',
  recap: 'Skip recap',
  credits: 'Skip credits',
  preview: 'Skip preview',
};

/** Whether times measured on a video `length` seconds long apply to one `duration` seconds long. */
const sameCut = (length: number | undefined, duration: number) => !length || Math.abs(length - duration) <= Math.max(20, duration * 0.03);

/** The segment playing at `t` (end null → until `duration`), among those measured on this cut. */
export const segmentAt = (list: Segment[], t: number, duration: number) =>
  list.find((s) => sameCut(s.length, duration) && t >= s.start && t < (s.end ?? duration) - 0.5);
