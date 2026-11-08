import { useQuery } from '@tanstack/react-query';
import type { MediaType } from './tmdb';

/**
 * Intro / recap / credits / preview timestamps from TheIntroDB (a free, community-built database
 * that P-Stream also uses). Times are in seconds; `end` null means "until the end".
 */
export type SegmentType = 'intro' | 'recap' | 'credits' | 'preview';
export interface Segment {
  type: SegmentType;
  start: number;
  end: number | null;
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

export function useSegments(type: MediaType, id: number, season?: number, episode?: number) {
  return useQuery({
    queryKey: ['segments', type, id, season, episode],
    queryFn: ({ signal }) => fetchSegments(type, id, season, episode, signal),
    staleTime: 1000 * 60 * 60 * 6,
    retry: false,
  }).data ?? [];
}

export const SEGMENT_LABEL: Record<SegmentType, string> = {
  intro: 'Skip intro',
  recap: 'Skip recap',
  credits: 'Skip credits',
  preview: 'Skip preview',
};

/** The segment playing at `t` (end null → until `duration`). */
export const segmentAt = (list: Segment[], t: number, duration: number) =>
  list.find((s) => t >= s.start && t < (s.end ?? duration) - 0.5);
