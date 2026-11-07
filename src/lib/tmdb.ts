export type MediaType = 'movie' | 'tv';

const API = 'https://api.themoviedb.org/3';
const KEY = import.meta.env.VITE_TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d';

export interface MediaItem {
  id: number;
  media_type?: MediaType | 'person';
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
}

export interface Page<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface Video { key: string; name: string; site: string; type: string; official?: boolean }
export interface CastMember { id: number; name: string; character?: string; profile_path: string | null }
export interface ImageAsset { file_path: string; iso_639_1: string | null; vote_average: number }
export interface SeasonSummary {
  season_number: number;
  episode_count: number;
  name: string;
  air_date: string | null;
  poster_path: string | null;
}
export interface EpisodeRef {
  season_number: number;
  episode_number: number;
  air_date?: string;
  name?: string;
  still_path?: string | null;
  runtime?: number | null;
}

export interface Details extends MediaItem {
  genres: { id: number; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  tagline?: string;
  status?: string;
  original_language?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: SeasonSummary[];
  last_episode_to_air?: EpisodeRef | null;
  next_episode_to_air?: EpisodeRef | null;
  networks?: { id: number; name: string }[];
  production_companies?: { id: number; name: string }[];
  videos?: { results: Video[] };
  credits?: { cast: CastMember[] };
  recommendations?: Page<MediaItem>;
  similar?: Page<MediaItem>;
  images?: { logos: ImageAsset[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  runtime: number | null;
  air_date: string | null;
  vote_average: number;
}

export interface Season {
  season_number: number;
  name: string;
  overview: string;
  episodes: Episode[];
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Params = Record<string, string | number | undefined | null>;

export async function tmdb<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(API + path);
  url.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, res.status === 404 ? 'Not found' : `TMDB error ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------- query option factories (shared by pages so caches are reused) ----------

export const q = {
  trending: (type: MediaType | 'all', window: 'day' | 'week') => ({
    queryKey: ['trending', type, window],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      tmdb<Page<MediaItem>>(`/trending/${type}/${window}`, {}, signal),
  }),

  list: (type: MediaType, list: 'popular' | 'top_rated' | 'now_playing' | 'on_the_air' | 'upcoming') => ({
    queryKey: ['list', type, list],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      tmdb<Page<MediaItem>>(`/${type}/${list}`, {}, signal),
  }),

  /** Popular movies releasing in the next ~2 months (TMDB's /upcoming list mixes in past dates). */
  upcoming: () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    return {
      queryKey: ['upcoming', day(1)],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        tmdb<Page<MediaItem>>(
          '/discover/movie',
          { 'primary_release_date.gte': day(1), 'primary_release_date.lte': day(60), sort_by: 'popularity.desc', with_release_type: '2|3', 'vote_count.gte': 0 },
          signal,
        ),
      staleTime: 1000 * 60 * 60,
    };
  },

  // One request per title: everything the details page AND player need.
  details: (type: MediaType, id: number) => ({
    queryKey: ['details', type, id],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      tmdb<Details>(
        `/${type}/${id}`,
        {
          append_to_response: [
            'videos',
            'credits',
            'recommendations',
            'similar',
            'images',
            type === 'movie' ? 'release_dates' : 'content_ratings',
          ].join(','),
          include_image_language: 'en,null',
        },
        signal,
      ),
    staleTime: 1000 * 60 * 30,
  }),

  season: (id: number, season: number) => ({
    queryKey: ['season', id, season],
    queryFn: ({ signal }: { signal: AbortSignal }) => tmdb<Season>(`/tv/${id}/season/${season}`, {}, signal),
    staleTime: 1000 * 60 * 30,
  }),
};

// ---------- helpers ----------

export const titleOf = (m: Pick<MediaItem, 'title' | 'name'>) => m.title || m.name || 'Untitled';
export const dateOf = (m: Pick<MediaItem, 'release_date' | 'first_air_date'>) => m.release_date || m.first_air_date || '';
export const yearOf = (m: Pick<MediaItem, 'release_date' | 'first_air_date'>) => dateOf(m).slice(0, 4);

/** media_type is missing on /movie/* and /discover/movie results, so infer it. */
export function typeOf(m: MediaItem, fallback?: MediaType): MediaType {
  if (m.media_type === 'movie' || m.media_type === 'tv') return m.media_type;
  if (fallback) return fallback;
  return m.title !== undefined || m.release_date !== undefined ? 'movie' : 'tv';
}

export function certificationOf(d: Details): string | null {
  if (d.release_dates) {
    const us = d.release_dates.results.find((r) => r.iso_3166_1 === 'US');
    return us?.release_dates.find((r) => r.certification)?.certification || null;
  }
  if (d.content_ratings) {
    return d.content_ratings.results.find((r) => r.iso_3166_1 === 'US')?.rating || null;
  }
  return null;
}

export function logoOf(d: Details | undefined): string | null {
  const logos = d?.images?.logos ?? [];
  const best = logos.find((l) => l.iso_639_1 === 'en') ?? logos.find((l) => !l.iso_639_1);
  return best?.file_path ?? null;
}

export function trailersOf(d: Details): Video[] {
  const order = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes'];
  return (d.videos?.results ?? [])
    .filter((v) => v.site === 'YouTube' && order.includes(v.type))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || Number(!!b.official) - Number(!!a.official))
    .slice(0, 10);
}

/** Drop people, items without art, and duplicates. */
export function cleanList(items: MediaItem[], fallback?: MediaType): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const m of items) {
    if (m.media_type === 'person' || !m.poster_path) continue;
    const key = typeOf(m, fallback) + m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
