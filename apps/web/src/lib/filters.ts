import type { MediaItem, MediaType } from './tmdb';
import { typeOf, dateOf } from './tmdb';

// TMDB genre IDs differ between movies and TV (e.g. Action = 28 vs 10759).
// Filters use type-agnostic slugs in the URL and map to IDs per media type.
// Static list: saves two requests on every page that shows filters.
export interface GenreDef { slug: string; name: string; movie: number[]; tv: number[] }

export const GENRES: GenreDef[] = [
  { slug: 'action', name: 'Action', movie: [28], tv: [10759] },
  { slug: 'adventure', name: 'Adventure', movie: [12], tv: [10759] },
  { slug: 'animation', name: 'Animation', movie: [16], tv: [16] },
  { slug: 'comedy', name: 'Comedy', movie: [35], tv: [35] },
  { slug: 'crime', name: 'Crime', movie: [80], tv: [80] },
  { slug: 'documentary', name: 'Documentary', movie: [99], tv: [99] },
  { slug: 'drama', name: 'Drama', movie: [18], tv: [18] },
  { slug: 'family', name: 'Family', movie: [10751], tv: [10751] },
  { slug: 'fantasy', name: 'Fantasy', movie: [14], tv: [10765] },
  { slug: 'history', name: 'History', movie: [36], tv: [] },
  { slug: 'horror', name: 'Horror', movie: [27], tv: [] },
  { slug: 'kids', name: 'Kids', movie: [], tv: [10762] },
  { slug: 'music', name: 'Music', movie: [10402], tv: [] },
  { slug: 'mystery', name: 'Mystery', movie: [9648], tv: [9648] },
  { slug: 'news', name: 'News', movie: [], tv: [10763] },
  { slug: 'reality', name: 'Reality', movie: [], tv: [10764] },
  { slug: 'romance', name: 'Romance', movie: [10749], tv: [] },
  { slug: 'scifi', name: 'Sci-Fi', movie: [878], tv: [10765] },
  { slug: 'soap', name: 'Soap', movie: [], tv: [10766] },
  { slug: 'talk', name: 'Talk', movie: [], tv: [10767] },
  { slug: 'thriller', name: 'Thriller', movie: [53], tv: [] },
  { slug: 'tvmovie', name: 'TV Movie', movie: [10770], tv: [] },
  { slug: 'war', name: 'War', movie: [10752], tv: [10768] },
  { slug: 'western', name: 'Western', movie: [37], tv: [37] },
];

const BY_ID: Record<MediaType, Map<number, string>> = { movie: new Map(), tv: new Map() };
for (const g of GENRES) {
  for (const id of g.movie) if (!BY_ID.movie.has(id)) BY_ID.movie.set(id, g.name);
  for (const id of g.tv) if (!BY_ID.tv.has(id)) BY_ID.tv.set(id, g.name);
}
BY_ID.tv.set(10759, 'Action & Adventure');
BY_ID.tv.set(10765, 'Sci-Fi & Fantasy');
BY_ID.tv.set(10768, 'War & Politics');

export const genreName = (type: MediaType, id: number) => BY_ID[type].get(id);
export const genresFor = (type: MediaType | 'all') =>
  type === 'all' ? GENRES : GENRES.filter((g) => g[type].length > 0);

export type SortKey = 'popular' | 'rating' | 'newest';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'rating', label: 'Top rated' },
  { key: 'newest', label: 'Newest' },
];

/** Where a title is from, as far as its original language says. */
export type Region = 'all' | 'western' | 'bollywood' | 'asian' | 'anime';
const ANIMATION = 16;
const LANGUAGES: Record<Exclude<Region, 'all' | 'anime'>, string[]> = {
  western: ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'no'],
  bollywood: ['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa'],
  // Japanese live action is here; Japanese animation is Anime.
  asian: ['ko', 'zh', 'cn', 'th', 'ja'],
};
export const REGIONS: { key: Region; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'western', label: 'Western' },
  { key: 'bollywood', label: 'Bollywood' },
  { key: 'asian', label: 'Asian' },
  { key: 'anime', label: 'Anime' },
];
/** Whether a title belongs to a region (text-search results are filtered with this). */
export function inRegion(m: { original_language?: string; genre_ids?: number[] }, region: Region): boolean {
  if (region === 'all') return true;
  const animated = !!m.genre_ids?.includes(ANIMATION);
  if (region === 'anime') return m.original_language === 'ja' && animated;
  if (!LANGUAGES[region].includes(m.original_language ?? '')) return false;
  return !(region === 'asian' && m.original_language === 'ja' && animated);
}

export interface Filters {
  type: MediaType | 'all';
  /** Absent means everywhere. */
  region?: Region;
  genres: string[];
  from?: number;
  to?: number;
  rating: number;
  sort: SortKey;
}

const THIS_YEAR = new Date().getFullYear();
export const YEAR_PRESETS: { label: string; from: number; to: number }[] = [
  { label: String(THIS_YEAR), from: THIS_YEAR, to: THIS_YEAR },
  { label: String(THIS_YEAR - 1), from: THIS_YEAR - 1, to: THIS_YEAR - 1 },
  { label: String(THIS_YEAR - 2), from: THIS_YEAR - 2, to: THIS_YEAR - 2 },
  { label: '2020s', from: 2020, to: 2029 },
  { label: '2010s', from: 2010, to: 2019 },
  { label: '2000s', from: 2000, to: 2009 },
  { label: '1990s', from: 1990, to: 1999 },
  { label: '1980s', from: 1980, to: 1989 },
];
export const RATINGS = [5, 6, 7, 8, 9];

const num = (v: string | null) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export function parseFilters(sp: URLSearchParams, fixedType?: MediaType): Filters {
  const t = sp.get('type');
  const sort = sp.get('sort') as SortKey | null;
  return {
    type: fixedType ?? (t === 'movie' || t === 'tv' ? t : 'all'),
    ...(REGIONS.some((r) => r.key === sp.get('region') && r.key !== 'all') ? { region: sp.get('region') as Region } : {}),
    genres: (sp.get('genres') ?? '').split(',').filter((s) => GENRES.some((g) => g.slug === s)),
    from: num(sp.get('from')),
    to: num(sp.get('to')),
    rating: num(sp.get('rating')) ?? 0,
    sort: sort && SORTS.some((s) => s.key === sort) ? sort : 'popular',
  };
}

/** Writes filters into search params, keeping unrelated params (like q). */
export function writeFilters(sp: URLSearchParams, f: Partial<Filters>): URLSearchParams {
  const next = new URLSearchParams(sp);
  const set = (k: string, v: string | number | undefined | null, isDefault: boolean) =>
    isDefault || v === undefined || v === null || v === '' ? next.delete(k) : next.set(k, String(v));
  if ('type' in f) set('type', f.type, f.type === 'all');
  if ('region' in f) set('region', f.region, !f.region || f.region === 'all');
  if ('genres' in f) set('genres', f.genres?.join(','), !f.genres?.length);
  if ('from' in f) set('from', f.from, false);
  if ('to' in f) set('to', f.to, false);
  if ('rating' in f) set('rating', f.rating, !f.rating);
  if ('sort' in f) set('sort', f.sort, f.sort === 'popular');
  return next;
}

export const hasActiveFilters = (f: Filters) => (!!f.region && f.region !== 'all') || f.genres.length > 0 || !!f.from || !!f.to || f.rating > 0;
export const activeFilterCount = (f: Filters, withType = false) =>
  (f.region && f.region !== 'all' ? 1 : 0) + f.genres.length + (f.from || f.to ? 1 : 0) + (f.rating ? 1 : 0) + (withType && f.type !== 'all' ? 1 : 0);
export const EMPTY_FILTERS: Filters = { type: 'all', genres: [], rating: 0, sort: 'popular' };

function genreIds(type: MediaType, slugs: string[]): number[] {
  return [...new Set(GENRES.filter((g) => slugs.includes(g.slug)).flatMap((g) => g[type]))];
}

/** TMDB /discover params, or null if the filters can't match this type (e.g. Horror on TV). */
export function discoverParams(type: MediaType, f: Filters, page: number): Record<string, string | number> | null {
  const p: Record<string, string | number> = { page, include_adult: 'false' };
  if (f.genres.length) {
    const ids = genreIds(type, f.genres);
    if (!ids.length) return null;
    p.with_genres = ids.join('|'); // OR, matching the old app's behaviour
  }
  const region = f.region ?? 'all';
  if (region === 'anime') {
    p.with_original_language = 'ja';
    // Animation AND whatever genres were picked.
    p.with_genres = p.with_genres ? `${ANIMATION},${p.with_genres}` : ANIMATION;
  } else if (region !== 'all') {
    p.with_original_language = LANGUAGES[region].join('|');
    if (region === 'asian') p.without_genres = ANIMATION;
  }
  const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (f.from) p[`${dateKey}.gte`] = `${f.from}-01-01`;
  if (f.to) p[`${dateKey}.lte`] = `${f.to}-12-31`;
  if (f.rating) {
    p['vote_average.gte'] = f.rating;
    p['vote_count.gte'] = type === 'movie' ? 150 : 60;
  }
  if (f.sort === 'popular') p.sort_by = 'popularity.desc';
  if (f.sort === 'rating') {
    p.sort_by = 'vote_average.desc';
    p['vote_count.gte'] = Math.max(Number(p['vote_count.gte'] ?? 0), type === 'movie' ? 500 : 200);
  }
  if (f.sort === 'newest') {
    p.sort_by = `${dateKey}.desc`;
    const today = new Date().toISOString().slice(0, 10);
    if (!f.to || `${f.to}-12-31` > today) p[`${dateKey}.lte`] = today;
    p['vote_count.gte'] = Math.max(Number(p['vote_count.gte'] ?? 0), 10);
  }
  return p;
}

/** Client-side filtering for text-search results (TMDB search has no genre/rating filters). */
export function matchesFilters(m: MediaItem, f: Filters): boolean {
  const type = typeOf(m);
  if (f.type !== 'all' && type !== f.type) return false;
  if (!inRegion(m, f.region ?? 'all')) return false;
  if (f.genres.length) {
    const ids = genreIds(type, f.genres);
    if (!m.genre_ids?.some((id) => ids.includes(id))) return false;
  }
  const year = parseInt(dateOf(m).slice(0, 4), 10);
  if (f.from && !(year >= f.from)) return false;
  if (f.to && !(year <= f.to)) return false;
  if (f.rating && !(m.vote_average >= f.rating)) return false;
  return true;
}
