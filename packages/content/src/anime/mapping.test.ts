import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { EpisodeMedia, MovieMedia } from '@charcoal/provider-sdk';
import { ATTACK_ON_TITAN_ROWS, MOVIE_ROWS, ONE_PIECE_ROWS } from '../fixtures/anime-lists.js';
import { animeToTmdb, buildAnimeIndex, deserializeAnimeIndex, serializeAnimeIndex, tmdbToAnime, toAnimeMedia } from './mapping.js';

const AOT = 1429;
const ONE_PIECE = 37854;
const index = buildAnimeIndex([...ATTACK_ON_TITAN_ROWS, ...ONE_PIECE_ROWS, ...MOVIE_ROWS]);

/** "anilist id / episode" for a TMDB episode of Attack on Titan, or undefined. */
function aot(season: number, episode: number): string | undefined {
  const hit = tmdbToAnime(index, AOT, season, episode);
  return hit && `${hit.entry.anilist}/${hit.episode}`;
}

// ---------- building ----------

test('builds entries from real rows and skips rows with neither AniList nor MAL id', () => {
  // Attack on Titan has 10 rows; one of them (a film entry known to AniDB only) has no AniList or MAL id.
  assert.equal(ATTACK_ON_TITAN_ROWS.length, 10);
  const entries = index.byTmdbShow.get(AOT);
  assert.equal(entries?.length, 9);
  assert.equal(index.byAnilist.size, 9 + 1 + 2);
  assert.equal(index.byMal.size, 9 + 1 + 2);

  assert.deepEqual(index.byAnilist.get(131681), {
    anilist: 131681,
    mal: 48583,
    kitsu: 44240,
    anidb: 16177,
    tmdbShow: AOT,
    tmdbSeason: 4,
    episodeOffset: 16,
    format: 'TV',
  });
  // AniList and MAL ids differ from the second season on: both lead to the same entry.
  assert.equal(index.byMal.get(25777), index.byAnilist.get(20958));
});

test("orders a show's entries by season, then offset", () => {
  const order = index.byTmdbShow.get(AOT)?.map((entry) => `S${entry.tmdbSeason}+${entry.episodeOffset}:${entry.anilist}`);
  assert.deepEqual(order, [
    'S0+0:18397',
    'S0+0:100465',
    'S1+0:16498',
    'S2+0:20958',
    'S3+0:99147',
    'S3+12:104578',
    'S4+0:110277',
    'S4+16:131681',
    'S4+28:146984',
  ]);
});

test('ignores rows that are not objects or carry no usable ids', () => {
  const built = buildAnimeIndex([null, 'row', 42, [], {}, { anilist_id: 'abc' }, { anilist_id: 0, mal_id: -3 }, { anidb_id: 7 }]);
  assert.equal(built.byAnilist.size + built.byMal.size + built.byTmdbShow.size + built.byTmdbMovie.size, 0);
});

// ---------- TMDB → anime ----------

test('Attack on Titan: seasons 1 and 2 are one entry each', () => {
  assert.equal(aot(1, 1), '16498/1');
  assert.equal(aot(1, 25), '16498/25');
  assert.equal(aot(2, 1), '20958/1');
  assert.equal(aot(2, 12), '20958/12');
  assert.equal(tmdbToAnime(index, AOT, 2, 12)?.entry.mal, 25777);
});

test('Attack on Titan: season 3 is two cours with an offset of 12', () => {
  assert.equal(aot(3, 1), '99147/1');
  assert.equal(aot(3, 12), '99147/12');
  assert.equal(aot(3, 13), '104578/1');
  assert.equal(aot(3, 22), '104578/10');
});

test('Attack on Titan: season 4 spans three entries (offsets 0, 16, 28)', () => {
  // The Final Season
  assert.equal(aot(4, 1), '110277/1');
  assert.equal(aot(4, 16), '110277/16');
  // The Final Season Part 2
  assert.equal(aot(4, 17), '131681/1');
  assert.equal(aot(4, 28), '131681/12');
  // The Final Chapters (two specials)
  assert.equal(aot(4, 29), '146984/1');
  assert.equal(aot(4, 30), '146984/2');
  assert.equal(tmdbToAnime(index, AOT, 4, 29)?.entry.format, 'SPECIAL');
});

test('returns undefined for shows, seasons and episodes the list cannot place', () => {
  assert.equal(tmdbToAnime(index, 1396, 1, 1), undefined, 'Breaking Bad is not anime');
  assert.equal(aot(5, 1), undefined, 'no entry for season 5');
  assert.equal(aot(4, 0), undefined, 'episodes start at 1');
  assert.equal(aot(4, 1.5), undefined);
  assert.equal(aot(-1, 1), undefined);
  assert.equal(aot(Number.NaN, 1), undefined);
});

test('specials are ambiguous when several entries share an offset', () => {
  // Season 0 holds an OVA (18397) and a recap film (100465), both listed without an offset.
  assert.equal(aot(0, 1), undefined);
  assert.equal(aot(0, 3), undefined);
});

test('a tie between a TV series and its specials goes to the series; other ties stay undefined', () => {
  const tied = buildAnimeIndex([
    { type: 'OVA', anilist_id: 901, themoviedb_id: { tv: 50 }, season: { tmdb: 1 } },
    { type: 'TV', anilist_id: 902, themoviedb_id: { tv: 50 }, season: { tmdb: 1 } },
    { type: 'TV', anilist_id: 903, themoviedb_id: { tv: 50 }, season: { tmdb: 2 } },
    { type: 'TV', anilist_id: 904, themoviedb_id: { tv: 50 }, season: { tmdb: 2 } },
    { type: 'OVA', anilist_id: 905, themoviedb_id: { tv: 50 }, season: { tmdb: 3 } },
    { type: 'ONA', anilist_id: 906, themoviedb_id: { tv: 50 }, season: { tmdb: 3 } },
  ]);
  assert.equal(tmdbToAnime(tied, 50, 1, 4)?.entry.anilist, 902);
  assert.equal(tmdbToAnime(tied, 50, 2, 4), undefined);
  assert.equal(tmdbToAnime(tied, 50, 3, 4)?.entry.anilist, 906);
});

test('a season whose first cour is missing does not hand its early episodes to the second cour', () => {
  const partial = buildAnimeIndex([{ type: 'TV', anilist_id: 910, themoviedb_id: { tv: 51 }, season: { tmdb: 1 }, episode_offset: { tmdb: 12 } }]);
  assert.equal(tmdbToAnime(partial, 51, 1, 12), undefined);
  assert.deepEqual(tmdbToAnime(partial, 51, 1, 13)?.episode, 1);
});

// ---------- anime → TMDB ----------

test('Attack on Titan: AniList and MAL episodes translate back to TMDB', () => {
  assert.deepEqual(animeToTmdb(index, { anilist: 16498 }, 25), { tmdbShow: AOT, season: 1, episode: 25 });
  assert.deepEqual(animeToTmdb(index, { anilist: 104578 }, 10), { tmdbShow: AOT, season: 3, episode: 22 });
  assert.deepEqual(animeToTmdb(index, { anilist: 110277 }, 16), { tmdbShow: AOT, season: 4, episode: 16 });
  assert.deepEqual(animeToTmdb(index, { anilist: 131681 }, 1), { tmdbShow: AOT, season: 4, episode: 17 });
  assert.deepEqual(animeToTmdb(index, { mal: 48583 }, 12), { tmdbShow: AOT, season: 4, episode: 28 });
  assert.deepEqual(animeToTmdb(index, { anilist: 146984 }, 2), { tmdbShow: AOT, season: 4, episode: 30 });
  // The AniList id wins when the two ids disagree.
  assert.deepEqual(animeToTmdb(index, { anilist: 20958, mal: 48583 }, 1), { tmdbShow: AOT, season: 2, episode: 1 });
});

test('every mapped Attack on Titan episode round-trips', () => {
  const runs: [season: number, episodes: number][] = [
    [1, 25],
    [2, 12],
    [3, 22],
    [4, 30],
  ];
  for (const [season, episodes] of runs) {
    for (let episode = 1; episode <= episodes; episode++) {
      const hit = tmdbToAnime(index, AOT, season, episode);
      assert.ok(hit, `S${season}E${episode}`);
      assert.deepEqual(animeToTmdb(index, { anilist: hit.entry.anilist }, hit.episode), { tmdbShow: AOT, season, episode });
    }
  }
});

test('refuses an episode number past the entry (it belongs to the next entry of the season)', () => {
  // The Final Season has 16 episodes; "episode 17" is Part 2's first.
  assert.equal(animeToTmdb(index, { anilist: 110277 }, 17), undefined);
  assert.equal(animeToTmdb(index, { anilist: 99147 }, 13), undefined);
});

test('animeToTmdb returns undefined for unknown ids, ambiguous specials, films and bad episodes', () => {
  assert.equal(animeToTmdb(index, { anilist: 999999 }, 1), undefined);
  assert.equal(animeToTmdb(index, {}, 1), undefined);
  assert.equal(animeToTmdb(index, { anilist: 18397 }, 1), undefined, 'the OVA shares season 0 with a film');
  assert.equal(animeToTmdb(index, { anilist: 199 }, 1), undefined, 'Spirited Away is a film, not a show');
  assert.equal(animeToTmdb(index, { anilist: 16498 }, 0), undefined);
});

// ---------- absolute numbering ----------

test('One Piece has no season in the list: season 1 maps as is, later seasons need episode counts', () => {
  // The row is just { themoviedb_id: { tv: 37854 } }: one AniList entry for the whole show.
  const entry = index.byAnilist.get(21);
  assert.equal(entry?.tmdbShow, ONE_PIECE);
  assert.equal(entry?.tmdbSeason, undefined);

  assert.deepEqual(tmdbToAnime(index, ONE_PIECE, 1, 5), { entry, episode: 5 });
  assert.equal(tmdbToAnime(index, ONE_PIECE, 2, 1), undefined);
  assert.equal(tmdbToAnime(index, ONE_PIECE, 0, 1), undefined, 'specials are never absolute');

  // Season lengths come from the caller (TMDB show details). Illustrative values.
  const seasonEpisodeCounts = { 1: 61, 2: 16, 3: 14 };
  assert.deepEqual(tmdbToAnime(index, ONE_PIECE, 2, 1, { seasonEpisodeCounts }), { entry, episode: 62 });
  assert.deepEqual(tmdbToAnime(index, ONE_PIECE, 4, 9, { seasonEpisodeCounts }), { entry, episode: 100 });
  assert.equal(tmdbToAnime(index, ONE_PIECE, 6, 1, { seasonEpisodeCounts }), undefined, 'counts stop at season 3');

  assert.deepEqual(animeToTmdb(index, { anilist: 21 }, 61, { seasonEpisodeCounts }), { tmdbShow: ONE_PIECE, season: 1, episode: 61 });
  assert.deepEqual(animeToTmdb(index, { mal: 21 }, 62, { seasonEpisodeCounts }), { tmdbShow: ONE_PIECE, season: 2, episode: 1 });
  assert.equal(animeToTmdb(index, { anilist: 21 }, 92, { seasonEpisodeCounts }), undefined, 'past the seasons we have counts for');
  assert.equal(animeToTmdb(index, { anilist: 21 }, 1), undefined, 'no counts, no season');
});

test('absolute entries can carry an offset (a sequel series continuing the numbering)', () => {
  // Shaped like the real Fairy Tail rows: no season, offset under "tvdb" only.
  const show = buildAnimeIndex([
    { type: 'TV', anilist_id: 920, themoviedb_id: { tv: 52 } },
    { type: 'TV', anilist_id: 921, themoviedb_id: { tv: 52 }, episode_offset: { tvdb: 175 } },
  ]);
  const seasonEpisodeCounts = { 1: 48, 2: 48, 3: 54, 4: 25, 5: 51 };
  assert.equal(tmdbToAnime(show, 52, 4, 25, { seasonEpisodeCounts })?.entry.anilist, 920);
  assert.deepEqual(tmdbToAnime(show, 52, 5, 1, { seasonEpisodeCounts }), { entry: show.byAnilist.get(921), episode: 1 });
  assert.deepEqual(animeToTmdb(show, { anilist: 921 }, 3, { seasonEpisodeCounts }), { tmdbShow: 52, season: 5, episode: 3 });
  assert.equal(animeToTmdb(show, { anilist: 920 }, 176, { seasonEpisodeCounts }), undefined, 'episode 176 is the sequel');
});

// ---------- row variants ----------

test('falls back to TVDB numbering when the row has no TMDB season', () => {
  const built = buildAnimeIndex([
    { type: 'TV', anilist_id: 930, themoviedb_id: { tv: 53 }, season: { tvdb: 2 }, episode_offset: { tvdb: 13, tmdb: 99 } },
    // With a TMDB season the TMDB offset is used, and a TVDB-only offset does not apply.
    { type: 'TV', anilist_id: 931, themoviedb_id: { tv: 53 }, season: { tvdb: 2, tmdb: 1 }, episode_offset: { tvdb: 13, tmdb: 38 } },
    { type: 'TV', anilist_id: 932, themoviedb_id: { tv: 54 }, season: { tvdb: 0, tmdb: 0 }, episode_offset: { tvdb: 3 } },
  ]);
  assert.deepEqual([built.byAnilist.get(930)?.tmdbSeason, built.byAnilist.get(930)?.episodeOffset], [2, 13]);
  assert.deepEqual([built.byAnilist.get(931)?.tmdbSeason, built.byAnilist.get(931)?.episodeOffset], [1, 38]);
  assert.deepEqual([built.byAnilist.get(932)?.tmdbSeason, built.byAnilist.get(932)?.episodeOffset], [0, 0]);
});

test('reads a bare themoviedb_id number as a show, or as a film for a MOVIE row with no season', () => {
  const built = buildAnimeIndex([
    { type: 'TV', anilist_id: 940, themoviedb_id: 60, thetvdb_id: 1234, season: { tvdb: 1, tmdb: 1 } },
    { type: 'MOVIE', anilist_id: 941, themoviedb_id: 61 },
    { type: 'MOVIE', anilist_id: 942, themoviedb_id: 60, season: { tvdb: 0, tmdb: 0 } },
    { type: 'TV', anilist_id: 943, themoviedb_id: 'unknown' },
  ]);
  assert.equal(built.byAnilist.get(940)?.tmdbShow, 60);
  assert.equal(built.byAnilist.get(941)?.tmdbMovie, 61);
  assert.equal(built.byTmdbMovie.get(61)?.anilist, 941);
  assert.equal(built.byAnilist.get(942)?.tmdbShow, 60, 'a film filed as a special of a show');
  assert.equal(built.byAnilist.get(943)?.tmdbShow, undefined);
});

// ---------- films ----------

test('maps films by TMDB movie id', () => {
  const spiritedAway = index.byTmdbMovie.get(129);
  assert.deepEqual(spiritedAway, { anilist: 199, mal: 199, kitsu: 176, anidb: 112, tmdbMovie: 129, episodeOffset: 0, format: 'MOVIE' });
  assert.equal(index.byAnilist.get(199), spiritedAway);

  const yourName = index.byTmdbMovie.get(372058);
  assert.deepEqual([yourName?.anilist, yourName?.mal], [21519, 32281]);
  assert.equal(index.byTmdbMovie.get(550), undefined, 'Fight Club is not anime');
  assert.equal(index.byTmdbShow.get(129), undefined, 'movie ids and show ids are separate spaces');
});

test('a row with several TMDB movie ids is found under each; a MOVIE row wins a contested id', () => {
  const built = buildAnimeIndex([
    { type: 'MOVIE', anilist_id: 950, themoviedb_id: { movie: [70, 71, 72] } },
    { type: 'TV', anilist_id: 951, themoviedb_id: { movie: [80] } },
    { type: 'MOVIE', anilist_id: 952, themoviedb_id: { movie: [80] } },
    { type: 'MOVIE', anilist_id: 953, themoviedb_id: { movie: [72] } },
  ]);
  const trilogy = built.byAnilist.get(950);
  assert.equal(trilogy?.tmdbMovie, 70);
  assert.equal(built.byTmdbMovie.get(70), trilogy);
  assert.equal(built.byTmdbMovie.get(71), trilogy);
  assert.equal(built.byTmdbMovie.get(72), trilogy, 'two films claim 72: the lower AniList id keeps it');
  assert.equal(built.byTmdbMovie.get(80)?.anilist, 952);
});

test('conflicts resolve the same way whatever order the rows come in, and survive serialisation', () => {
  const rows = [
    { type: 'MOVIE', mal_id: 970, themoviedb_id: { movie: [90] } },
    { type: 'MOVIE', anilist_id: 971, themoviedb_id: { movie: [90, 91] } },
    { type: 'OVA', mal_id: 972, themoviedb_id: { tv: 55 }, season: { tmdb: 0 } },
    { type: 'OVA', anilist_id: 973, themoviedb_id: { tv: 55 }, season: { tmdb: 0 } },
    { type: 'TV', anilist_id: 974, mal_id: 975, themoviedb_id: { tv: 55 }, season: { tmdb: 1 } },
    { type: 'TV', anilist_id: 974, mal_id: 976, themoviedb_id: { tv: 55 }, season: { tmdb: 2 } },
  ];
  const forwards = buildAnimeIndex(rows);
  const backwards = buildAnimeIndex([...rows].reverse());
  assert.deepEqual(backwards, forwards);
  assert.deepEqual(deserializeAnimeIndex(JSON.parse(JSON.stringify(serializeAnimeIndex(forwards)))), forwards);

  // An entry with an AniList id comes before one that only has a MAL id.
  assert.equal(forwards.byTmdbMovie.get(90)?.anilist, 971);
  assert.deepEqual(forwards.byTmdbShow.get(55)?.map((entry) => entry.anilist ?? `mal ${entry.mal}`), [973, 'mal 972', 974, 974]);
  assert.equal(forwards.byAnilist.get(974)?.mal, 975, 'a duplicated AniList id goes to the lower MAL id');
  assert.equal(forwards.byMal.get(976)?.tmdbSeason, 2, 'the other row is still reachable by its MAL id');
});

// ---------- the published form ----------

test('serialises to compact JSON and back without loss', () => {
  const serialised = serializeAnimeIndex(index);
  const json = JSON.stringify(serialised);
  const restored = deserializeAnimeIndex(JSON.parse(json));

  assert.deepEqual(restored, index);
  assert.equal(restored.byAnilist.get(131681), restored.byTmdbShow.get(AOT)?.[7], 'maps share entry objects');
  assert.equal(restored.byMal.get(199), restored.byTmdbMovie.get(129));
  assert.deepEqual(tmdbToAnime(restored, AOT, 4, 17)?.episode, 1);

  const { v, entries } = serialised as { v: number; entries: unknown[] };
  assert.equal(v, 1);
  // Entries are written in AniList-id order, whatever order the rows came in.
  assert.deepEqual(entries[0], [21, 21, 'TV', 12, 69, ONE_PIECE], 'no season: numbered absolutely');
  assert.deepEqual(entries[1], [199, 199, 'MOVIE', 176, 112, null, null, null, [129]]);
  assert.deepEqual(entries[2], [16498, 16498, 'TV', 7442, 9541, AOT, 1], 'season 1, no offset: trailing nulls are dropped');
  assert.deepEqual(entries[3], [18397, 18397, 'OVA', 7694, 9826, AOT, 0], 'season 0 is kept');
  assert.deepEqual(entries[10], [131681, 48583, 'TV', 44240, 16177, AOT, 4, 16]);
  assert.equal(entries.length, 12);
  assert.ok(json.length < 700, `12 entries took ${json.length} bytes`);

  const shuffled = buildAnimeIndex([...MOVIE_ROWS, ...ONE_PIECE_ROWS, ...[...ATTACK_ON_TITAN_ROWS].reverse()]);
  assert.deepEqual(shuffled, index, 'row order does not matter');
  assert.equal(JSON.stringify(serializeAnimeIndex(shuffled)), json);
});

test('serialisation keeps extra movie ids, contested ids and absolute entries', () => {
  const built = buildAnimeIndex([
    { type: 'MOVIE', anilist_id: 950, themoviedb_id: { movie: [70, 71] } },
    { type: 'TV', anilist_id: 951, themoviedb_id: { movie: [80] } },
    { type: 'MOVIE', mal_id: 952, themoviedb_id: { movie: [80] } },
    { type: 'TV', anilist_id: 920, themoviedb_id: { tv: 52 } },
    { anilist_id: 921, themoviedb_id: { tv: 52 }, episode_offset: { tmdb: 175 } },
    { type: 'ONA', mal_id: 960 },
  ]);
  const restored = deserializeAnimeIndex(JSON.parse(JSON.stringify(serializeAnimeIndex(built))));
  assert.deepEqual(restored, built);
  assert.equal(restored.byTmdbMovie.get(71)?.anilist, 950);
  assert.equal(restored.byTmdbMovie.get(80)?.mal, 952);
  assert.equal(restored.byMal.get(960)?.format, 'ONA');
});

test('deserialising rejects anything that is not a version 1 index', () => {
  assert.throws(() => deserializeAnimeIndex(null), /version 1/);
  assert.throws(() => deserializeAnimeIndex([]), /version 1/);
  assert.throws(() => deserializeAnimeIndex({ v: 2, entries: [] }), /version 1/);
  assert.throws(() => deserializeAnimeIndex({ v: 1, entries: [[16498, 16498], 'nope'] }), /entry 1 is malformed/);
  assert.throws(() => deserializeAnimeIndex({ v: 1, entries: [['16498']] }), /entry 0 is malformed/);
  assert.throws(() => deserializeAnimeIndex({ v: 1, entries: [[null, null, 'TV']] }), /entry 0 is malformed/);
  assert.equal(deserializeAnimeIndex({ v: 1, entries: [] }).byAnilist.size, 0);
});

// ---------- media ----------

const finalSeasonPart2: EpisodeMedia = {
  kind: 'tv',
  ids: { tmdb: '1429', imdb: 'tt2560140', tvdb: '267440' },
  title: 'Attack on Titan',
  altTitles: ['Shingeki no Kyojin'],
  year: 2013,
  originalLanguage: 'ja',
  runtime: 24,
  season: 4,
  episode: 17,
};

test('toAnimeMedia turns a TMDB episode into the AniList entry and its own episode number', () => {
  const anime = toAnimeMedia(index, finalSeasonPart2, ['Shingeki no Kyojin: The Final Season Part 2', 'Shingeki no Kyojin', ' ']);
  assert.deepEqual(anime, {
    kind: 'anime',
    ids: { tmdb: '1429', imdb: 'tt2560140', tvdb: '267440', anilist: '131681', mal: '48583', kitsu: '44240' },
    title: 'Attack on Titan',
    altTitles: ['Shingeki no Kyojin', 'Shingeki no Kyojin: The Final Season Part 2'],
    year: 2013,
    originalLanguage: 'ja',
    runtime: 24,
    episode: 1,
    season: 4,
    seasonEpisode: 17,
  });
  assert.deepEqual(finalSeasonPart2.ids, { tmdb: '1429', imdb: 'tt2560140', tvdb: '267440' }, 'the input is not modified');
});

test('toAnimeMedia leaves out what it does not know and replaces stale anime ids', () => {
  const bare: EpisodeMedia = { kind: 'tv', ids: { tmdb: '1429', anilist: '16498', mal: '16498' }, title: 'Attack on Titan', season: 2, episode: 3 };
  assert.deepEqual(toAnimeMedia(index, bare), {
    kind: 'anime',
    ids: { tmdb: '1429', anilist: '20958', mal: '25777', kitsu: '8671' },
    title: 'Attack on Titan',
    episode: 3,
    season: 2,
    seasonEpisode: 3,
  });
});

test('toAnimeMedia returns undefined when the show does not map', () => {
  assert.equal(toAnimeMedia(index, { ...finalSeasonPart2, ids: { tmdb: '1396' } }), undefined);
  assert.equal(toAnimeMedia(index, { ...finalSeasonPart2, ids: {} }), undefined);
  assert.equal(toAnimeMedia(index, { ...finalSeasonPart2, ids: { tmdb: 'tt2560140' } }), undefined);
  assert.equal(toAnimeMedia(index, { ...finalSeasonPart2, season: 0, episode: 1 }), undefined, 'ambiguous special');
  assert.equal(toAnimeMedia(index, { ...finalSeasonPart2, season: 9 }), undefined);
});

test('toAnimeMedia passes season lengths through for absolutely-numbered shows', () => {
  const episode: EpisodeMedia = { kind: 'tv', ids: { tmdb: '37854' }, title: 'One Piece', season: 2, episode: 1 };
  assert.equal(toAnimeMedia(index, episode), undefined);
  const anime = toAnimeMedia(index, episode, [], { seasonEpisodeCounts: { 1: 61 } });
  assert.deepEqual([anime?.ids.anilist, anime?.episode, anime?.season, anime?.seasonEpisode], ['21', 62, 2, 1]);
});

test('toAnimeMedia maps a film to episode 1 of its entry', () => {
  const film: MovieMedia = { kind: 'movie', ids: { tmdb: '129', imdb: 'tt0245429' }, title: 'Spirited Away', year: 2001 };
  assert.deepEqual(toAnimeMedia(index, film, ['Sen to Chihiro no Kamikakushi']), {
    kind: 'anime',
    ids: { tmdb: '129', imdb: 'tt0245429', anilist: '199', mal: '199', kitsu: '176' },
    title: 'Spirited Away',
    altTitles: ['Sen to Chihiro no Kamikakushi'],
    year: 2001,
    episode: 1,
  });
  assert.equal(toAnimeMedia(index, { ...film, ids: { tmdb: '550' } }), undefined);
});
