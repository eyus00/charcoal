/**
 * Anime identity: which AniList / MyAnimeList entry a TMDB (show, season, episode) belongs to, and back.
 *
 * TMDB files a long anime as one show with seasons; AniList and MAL file every cour, sequel and
 * special as its own entry, numbered from 1. The bridge is the Fribb/anime-lists file
 * (anime-list-full.json). What its rows look like, checked against the file on 2026-11-24
 * (39 779 rows):
 *
 *   { "type": "TV" | "MOVIE" | "OVA" | "ONA" | "SPECIAL" | "UNKNOWN",    // missing on 3 % of rows
 *     "anilist_id": 131681, "mal_id": 48583, "kitsu_id": 44240, "anidb_id": 16177,   // numbers, each optional
 *     "tvdb_id": 267440,                          // not "thetvdb_id"
 *     "imdb_id": ["tt2560140"],                   // an array
 *     "themoviedb_id": { "tv": 1429 }             // a show: one number
 *                    | { "movie": [129] },        // a film: an array (30 rows list several); never both
 *     "season": { "tvdb": 4, "tmdb": 4 },         // either key may be missing; 0 = specials
 *     "episode_offset": { "tvdb": 16, "tmdb": 16 } }   // on 694 rows only; missing = 0
 *
 * How the fields are read:
 *  - tmdbSeason is season.tmdb. When only season.tvdb is given (46 rows) that is used instead: the
 *    two agree on 99 % of the rows that have both. episodeOffset comes from the same numbering as
 *    the season.
 *  - A show row with no season at all (72 rows: One Piece, Fairy Tail, …) is numbered absolutely:
 *    the entry's episode N is the show's N-th episode counted across seasons. Turning that into a
 *    TMDB season needs the seasons' episode counts, which the list doesn't have, so callers pass
 *    them in (`seasonEpisodeCounts`).
 *  - 18 % of rows have neither an AniList nor a MAL id; they are skipped.
 *  - A bare number in themoviedb_id (older versions of the list) is read as a show, or as a film
 *    when the row is a MOVIE with no season and no TVDB id.
 *
 * Limits of the data: it has no episode counts, so the last entry of a season claims every later
 * episode number; and specials (season 0) are mostly listed without offsets, which leaves several
 * entries claiming the same episode (tmdbToAnime answers undefined for those).
 */

import type { AnimeMedia, EpisodeMedia, MediaIds, MovieMedia } from '@charcoal/provider-sdk';
import { integer, isRecord, positiveInteger, text, unique } from '../internal/json.js';

export interface AnimeEntry {
  anilist?: number;
  mal?: number;
  kitsu?: number;
  anidb?: number;
  tmdbShow?: number;
  tmdbMovie?: number;
  /** Missing on an entry with a tmdbShow means the entry is numbered absolutely (see above). */
  tmdbSeason?: number;
  /** episodes of the TMDB season that come BEFORE this entry's episode 1 */
  episodeOffset: number;
  format?: string;
}

export interface AnimeIndex {
  /** A show's entries, ordered by season then offset; absolutely-numbered entries come last. */
  byTmdbShow: Map<number, AnimeEntry[]>;
  byAnilist: Map<number, AnimeEntry>;
  byMal: Map<number, AnimeEntry>;
  byTmdbMovie: Map<number, AnimeEntry>;
}

export interface SeasonOptions {
  /**
   * Episode count of each regular TMDB season, keyed by season number (TMDB show details:
   * seasons[].season_number → episode_count). Only used for absolutely-numbered entries.
   */
  seasonEpisodeCounts?: Readonly<Record<number, number>>;
}

/** What one row of the list (or one tuple of the published form) says. */
interface EntryFields {
  anilist: number | undefined;
  mal: number | undefined;
  format: string | undefined;
  kitsu: number | undefined;
  anidb: number | undefined;
  tmdbShow: number | undefined;
  tmdbSeason: number | undefined;
  episodeOffset: number;
  /** Every TMDB movie id the entry is known by; the first becomes entry.tmdbMovie. */
  movies: number[];
}

/** Properties are only set when known, so entries compare cleanly with deepEqual. */
function toEntry(fields: EntryFields): AnimeEntry {
  const entry: AnimeEntry = { episodeOffset: fields.episodeOffset };
  if (fields.anilist !== undefined) entry.anilist = fields.anilist;
  if (fields.mal !== undefined) entry.mal = fields.mal;
  if (fields.kitsu !== undefined) entry.kitsu = fields.kitsu;
  if (fields.anidb !== undefined) entry.anidb = fields.anidb;
  if (fields.tmdbShow !== undefined) entry.tmdbShow = fields.tmdbShow;
  if (fields.tmdbShow !== undefined && fields.tmdbSeason !== undefined) entry.tmdbSeason = fields.tmdbSeason;
  if (fields.movies.length > 0) entry.tmdbMovie = fields.movies[0];
  if (fields.format !== undefined) entry.format = fields.format;
  return entry;
}

const ORDER_KEYS = ['anilist', 'mal', 'anidb', 'kitsu', 'tmdbShow', 'tmdbSeason', 'episodeOffset', 'tmdbMovie'] as const;

/** A fixed order for entries: by AniList id, then MAL id, …; entries without an id sort after those with one. */
function compareEntries(a: AnimeEntry, b: AnimeEntry): number {
  for (const key of ORDER_KEYS) {
    const left = a[key] ?? Number.POSITIVE_INFINITY;
    const right = b[key] ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left < right ? -1 : 1;
  }
  const left = a.format ?? '';
  const right = b.format ?? '';
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * Builds the four maps. Entries are indexed in a fixed order (not the order they arrive in), so
 * the index built from the list and the one read back from its published form are the same, and
 * so that the few conflicts in the data always resolve the same way.
 */
function indexEntries(all: EntryFields[]): AnimeIndex {
  const index: AnimeIndex = { byTmdbShow: new Map(), byAnilist: new Map(), byMal: new Map(), byTmdbMovie: new Map() };
  const ordered = all.map((fields) => ({ entry: toEntry(fields), movies: fields.movies })).sort((a, b) => compareEntries(a.entry, b.entry));

  for (const { entry, movies } of ordered) {
    // The real list has no duplicate AniList or MAL ids; if one ever appears, the first in order keeps it.
    if (entry.anilist !== undefined && !index.byAnilist.has(entry.anilist)) index.byAnilist.set(entry.anilist, entry);
    if (entry.mal !== undefined && !index.byMal.has(entry.mal)) index.byMal.set(entry.mal, entry);
    if (entry.tmdbShow !== undefined) {
      const siblings = index.byTmdbShow.get(entry.tmdbShow);
      if (siblings) siblings.push(entry);
      else index.byTmdbShow.set(entry.tmdbShow, [entry]);
    }
    for (const movie of movies) {
      // Two rows claim the same TMDB film in a couple of places: the row that is itself a film wins.
      const holder = index.byTmdbMovie.get(movie);
      if (!holder || (holder.format !== 'MOVIE' && entry.format === 'MOVIE')) index.byTmdbMovie.set(movie, entry);
    }
  }

  const seasonRank = (entry: AnimeEntry) => entry.tmdbSeason ?? Number.POSITIVE_INFINITY;
  for (const entries of index.byTmdbShow.values()) {
    // Stable: entries of the same season and offset stay in the fixed order above.
    entries.sort((a, b) => {
      const seasonA = seasonRank(a);
      const seasonB = seasonRank(b);
      if (seasonA !== seasonB) return seasonA < seasonB ? -1 : 1;
      return a.episodeOffset - b.episodeOffset;
    });
  }
  return index;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function idList(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [value];
  return unique(list.map(positiveInteger).filter((id): id is number => id !== undefined));
}

function readRow(row: unknown): EntryFields | undefined {
  if (!isRecord(row)) return undefined;
  const anilist = positiveInteger(row.anilist_id);
  const mal = positiveInteger(row.mal_id);
  if (anilist === undefined && mal === undefined) return undefined;

  const fields: EntryFields = {
    anilist,
    mal,
    format: text(row.type)?.toUpperCase(),
    kitsu: positiveInteger(row.kitsu_id),
    anidb: positiveInteger(row.anidb_id),
    tmdbShow: undefined,
    tmdbSeason: undefined,
    episodeOffset: 0,
    movies: [],
  };

  const season = isRecord(row.season) ? row.season : undefined;
  const tmdb = row.themoviedb_id;
  if (isRecord(tmdb)) {
    fields.tmdbShow = positiveInteger(tmdb.tv);
    fields.movies = idList(tmdb.movie);
  } else {
    const bare = positiveInteger(tmdb);
    const isFilm = fields.format === 'MOVIE' && !season && positiveInteger(row.tvdb_id ?? row.thetvdb_id) === undefined;
    if (bare !== undefined && isFilm) fields.movies = [bare];
    else fields.tmdbShow = bare;
  }

  if (fields.tmdbShow !== undefined) {
    const offset = isRecord(row.episode_offset) ? row.episode_offset : undefined;
    const tmdbSeason = nonNegativeInteger(season?.tmdb);
    const tvdbSeason = nonNegativeInteger(season?.tvdb);
    if (tmdbSeason !== undefined) {
      fields.tmdbSeason = tmdbSeason;
      fields.episodeOffset = integer(offset?.tmdb) ?? 0;
    } else if (tvdbSeason !== undefined) {
      fields.tmdbSeason = tvdbSeason;
      fields.episodeOffset = integer(offset?.tvdb) ?? 0;
    } else {
      // Absolute numbering is the same on both sites.
      fields.episodeOffset = integer(offset?.tmdb) ?? integer(offset?.tvdb) ?? 0;
    }
  }
  return fields;
}

/** Builds a compact index from raw rows, skipping rows with neither AniList nor MAL id. */
export function buildAnimeIndex(rows: unknown[]): AnimeIndex {
  return indexEntries(rows.map(readRow).filter((fields): fields is EntryFields => fields !== undefined));
}

// ---------- the published form ----------

const SERIAL_VERSION = 1;

/**
 * One entry as a tuple, trailing nulls dropped:
 * [anilist, mal, format, kitsu, anidb, tmdbShow, tmdbSeason, episodeOffset (null = 0), tmdbMovie ids]
 */
type SerialEntry = (number | string | number[] | null)[];

/**
 * Compact, JSON-serialisable form for publishing as a static map: `{ v: 1, entries: [tuple, …] }`.
 * The whole real list comes to just under 1 MB of JSON this way (the source file is 7.5 MB).
 */
export function serializeAnimeIndex(index: AnimeIndex): unknown {
  const all = new Set<AnimeEntry>(index.byAnilist.values());
  for (const entry of index.byMal.values()) all.add(entry);
  for (const entries of index.byTmdbShow.values()) for (const entry of entries) all.add(entry);
  for (const entry of index.byTmdbMovie.values()) all.add(entry);

  const movieIds = new Map<AnimeEntry, number[]>();
  for (const [movie, entry] of index.byTmdbMovie) {
    const ids = movieIds.get(entry);
    if (ids) ids.push(movie);
    else movieIds.set(entry, [movie]);
  }

  const entries = [...all].sort(compareEntries).map((entry): SerialEntry => {
    const extra = (movieIds.get(entry) ?? []).sort((a, b) => a - b);
    const movies = unique([...(entry.tmdbMovie !== undefined ? [entry.tmdbMovie] : []), ...extra]);
    const tuple: SerialEntry = [
      entry.anilist ?? null,
      entry.mal ?? null,
      entry.format ?? null,
      entry.kitsu ?? null,
      entry.anidb ?? null,
      entry.tmdbShow ?? null,
      entry.tmdbSeason ?? null,
      entry.episodeOffset === 0 ? null : entry.episodeOffset,
      movies.length > 0 ? movies : null,
    ];
    while (tuple.length > 0 && tuple[tuple.length - 1] === null) tuple.pop();
    return tuple;
  });
  return { v: SERIAL_VERSION, entries };
}

/** The inverse of serializeAnimeIndex. Throws on anything that isn't a version-1 index. */
export function deserializeAnimeIndex(data: unknown): AnimeIndex {
  if (!isRecord(data) || data.v !== SERIAL_VERSION || !Array.isArray(data.entries)) {
    throw new Error('Anime index: not a version 1 index');
  }
  const strictInteger = (value: unknown) => (typeof value === 'number' ? integer(value) : undefined);
  const strictId = (value: unknown) => (typeof value === 'number' ? positiveInteger(value) : undefined);

  const all = data.entries.map((tuple: unknown, position: number): EntryFields => {
    const bad = () => new Error(`Anime index: entry ${position} is malformed`);
    if (!Array.isArray(tuple)) throw bad();
    const optional = <T>(slot: number, read: (value: unknown) => T | undefined): T | undefined => {
      const value: unknown = tuple[slot];
      if (value === null || value === undefined) return undefined;
      const parsed = read(value);
      if (parsed === undefined) throw bad();
      return parsed;
    };
    const fields: EntryFields = {
      anilist: optional(0, strictId),
      mal: optional(1, strictId),
      format: optional(2, (value) => (typeof value === 'string' ? value : undefined)),
      kitsu: optional(3, strictId),
      anidb: optional(4, strictId),
      tmdbShow: optional(5, strictId),
      tmdbSeason: optional(6, (value) => (typeof value === 'number' ? nonNegativeInteger(value) : undefined)),
      episodeOffset: optional(7, strictInteger) ?? 0,
      movies: optional(8, (value) => (Array.isArray(value) && value.every((id) => strictId(id) !== undefined) ? (value as number[]) : undefined)) ?? [],
    };
    if (fields.anilist === undefined && fields.mal === undefined) throw bad();
    return fields;
  });
  return indexEntries(all);
}

// ---------- translating episodes ----------

function isEpisodeNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/**
 * Among entries that share a numbering, the one with the largest offset below the episode. When
 * several entries share that offset, a lone TV series (else a lone ONA series) wins over the
 * specials filed next to it; any other tie is ambiguous and gives undefined.
 */
function pickEntry(candidates: AnimeEntry[], episode: number): { entry: AnimeEntry; episode: number } | undefined {
  let best: AnimeEntry[] = [];
  for (const candidate of candidates) {
    if (candidate.episodeOffset >= episode) continue;
    const lead = best[0];
    if (!lead || candidate.episodeOffset > lead.episodeOffset) best = [candidate];
    else if (candidate.episodeOffset === lead.episodeOffset) best.push(candidate);
  }
  const entry = breakTie(best);
  return entry ? { entry, episode: episode - entry.episodeOffset } : undefined;
}

function breakTie(tied: AnimeEntry[]): AnimeEntry | undefined {
  if (tied.length === 1) return tied[0];
  for (const format of ['TV', 'ONA']) {
    const ofFormat = tied.filter((candidate) => candidate.format === format);
    if (ofFormat.length > 0) return ofFormat.length === 1 ? ofFormat[0] : undefined;
  }
  return undefined;
}

/** (season, episode) → the show-wide episode number. Season 1 needs no counts. */
function toAbsolute(season: number, episode: number, counts: SeasonOptions['seasonEpisodeCounts']): number | undefined {
  let before = 0;
  for (let earlier = 1; earlier < season; earlier++) {
    const count = counts?.[earlier];
    if (count === undefined || !Number.isInteger(count) || count < 0) return undefined;
    before += count;
  }
  return before + episode;
}

/** The show-wide episode number → (season, episode); undefined when the counts don't reach that far. */
function fromAbsolute(absolute: number, counts: SeasonOptions['seasonEpisodeCounts']): { season: number; episode: number } | undefined {
  let remaining = absolute;
  for (let season = 1; ; season++) {
    const count = counts?.[season];
    if (count === undefined || !Number.isInteger(count) || count < 0) return undefined;
    if (remaining <= count) return { season, episode: remaining };
    remaining -= count;
  }
}

/**
 * TMDB season+episode → the entry and the episode number inside it. Picks, among entries of that
 * season, the one with the largest episodeOffset that is < episode. Returns undefined when the
 * show isn't anime or the season has no entry.
 *
 * Also undefined when the list is ambiguous (several entries at the same offset that can't be told
 * apart, which is common for season 0). A season with no entry of its own falls back to the show's
 * absolutely-numbered entry if it has one: that works unaided for season 1 and needs
 * `seasonEpisodeCounts` for later seasons.
 */
export function tmdbToAnime(
  index: AnimeIndex,
  tmdbShow: number,
  season: number,
  episode: number,
  options: SeasonOptions = {},
): { entry: AnimeEntry; episode: number } | undefined {
  if (!isEpisodeNumber(episode) || !Number.isInteger(season) || season < 0) return undefined;
  const entries = index.byTmdbShow.get(tmdbShow);
  if (!entries) return undefined;

  const ofSeason = entries.filter((entry) => entry.tmdbSeason === season);
  if (ofSeason.length > 0) return pickEntry(ofSeason, episode);

  const absolute = entries.filter((entry) => entry.tmdbSeason === undefined);
  if (season < 1 || absolute.length === 0) return undefined;
  const number = toAbsolute(season, episode, options.seasonEpisodeCounts);
  return number === undefined ? undefined : pickEntry(absolute, number);
}

/**
 * The inverse. AniList id wins when both ids are given. Only answers with coordinates that
 * tmdbToAnime maps straight back: an episode number past the entry's own run (it belongs to the
 * next entry of the season) or an entry the list leaves ambiguous gives undefined, and so does an
 * absolutely-numbered entry without `seasonEpisodeCounts`.
 */
export function animeToTmdb(
  index: AnimeIndex,
  id: { anilist?: number; mal?: number },
  episode: number,
  options: SeasonOptions = {},
): { tmdbShow: number; season: number; episode: number } | undefined {
  const entry =
    (id.anilist !== undefined ? index.byAnilist.get(id.anilist) : undefined) ?? (id.mal !== undefined ? index.byMal.get(id.mal) : undefined);
  if (!entry || entry.tmdbShow === undefined || !isEpisodeNumber(episode)) return undefined;

  const number = entry.episodeOffset + episode;
  const target = entry.tmdbSeason !== undefined ? { season: entry.tmdbSeason, episode: number } : fromAbsolute(number, options.seasonEpisodeCounts);
  if (!target || target.episode < 1) return undefined;

  const back = tmdbToAnime(index, entry.tmdbShow, target.season, target.episode, options);
  if (!back || back.entry !== entry || back.episode !== episode) return undefined;
  return { tmdbShow: entry.tmdbShow, season: target.season, episode: target.episode };
}

/**
 * Builds an AnimeMedia (SDK type) from an EpisodeMedia when the show maps; otherwise returns
 * undefined. Copies title/altTitles/year (and language, runtime, the other ids) and fills
 * ids.anilist / ids.mal / ids.kitsu, `season` and `seasonEpisode`. `extraTitles` (for example
 * AniList's titles for the entry) are appended to altTitles.
 *
 * A MovieMedia is accepted too: a film the list knows becomes episode 1 of its entry.
 */
export function toAnimeMedia(
  index: AnimeIndex,
  media: EpisodeMedia | MovieMedia,
  extraTitles: string[] = [],
  options: SeasonOptions = {},
): AnimeMedia | undefined {
  const tmdb = positiveInteger(media.ids.tmdb);
  if (tmdb === undefined) return undefined;

  let entry: AnimeEntry | undefined;
  let episode = 1;
  if (media.kind === 'movie') {
    entry = index.byTmdbMovie.get(tmdb);
  } else {
    const hit = tmdbToAnime(index, tmdb, media.season, media.episode, options);
    entry = hit?.entry;
    episode = hit?.episode ?? episode;
  }
  if (!entry) return undefined;

  // The entry decides the anime ids: an id carried over from another season would be wrong.
  const { anilist: _anilist, mal: _mal, kitsu: _kitsu, ...otherIds } = media.ids;
  const ids: MediaIds = otherIds;
  if (entry.anilist !== undefined) ids.anilist = String(entry.anilist);
  if (entry.mal !== undefined) ids.mal = String(entry.mal);
  if (entry.kitsu !== undefined) ids.kitsu = String(entry.kitsu);

  const anime: AnimeMedia = { kind: 'anime', ids, title: media.title, episode };
  const altTitles = unique([...(media.altTitles ?? []), ...extraTitles].map((title) => title.trim())).filter(
    (title) => title !== '' && title !== media.title,
  );
  if (altTitles.length > 0) anime.altTitles = altTitles;
  if (media.year !== undefined) anime.year = media.year;
  if (media.originalLanguage !== undefined) anime.originalLanguage = media.originalLanguage;
  if (media.runtime !== undefined) anime.runtime = media.runtime;
  if (media.kind === 'tv') {
    anime.season = media.season;
    anime.seasonEpisode = media.episode;
  }
  return anime;
}
