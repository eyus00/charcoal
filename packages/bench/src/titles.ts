/**
 * The benchmark title set. Fixed, so two runs can be compared; diverse, so one lucky title cannot
 * carry a result. Every TMDB and IMDb id was checked against Wikidata (P4947 / P4983 / P345) on
 * 2026-11-24. Episodes are the first of a season, which every source that has the show has.
 */
import type { Media } from '@charcoal/provider-sdk';

export type Category = 'western-movie' | 'western-tv' | 'anime' | 'indian' | 'international';

export interface BenchTitle {
  key: string;
  category: Category;
  /** Original audio language (ISO 639-1). */
  language: string;
  year: number;
  /** What to ask for. More than one when a title has two identities (a TMDB show and an anime entry). */
  queries: Media[];
}

const movie = (tmdb: string, imdb: string, title: string, year: number, olang: string, altTitles?: string[]): Media => ({ kind: 'movie', ids: { tmdb, imdb }, title, year, originalLanguage: olang, altTitles });
const episode = (tmdb: string, imdb: string, title: string, year: number, olang: string, season = 1, ep = 1, altTitles?: string[]): Media => ({ kind: 'tv', ids: { tmdb, imdb }, title, year, originalLanguage: olang, season, episode: ep, altTitles });
const anime = (anilist: string, mal: string, tmdb: string, title: string, year: number, ep = 1, altTitles?: string[]): Media => ({ kind: 'anime', ids: { anilist, mal, tmdb }, title, year, originalLanguage: 'ja', episode: ep, season: 1, seasonEpisode: ep, audio: 'sub', altTitles });

const t = (key: string, category: Category, language: string, year: number, ...queries: Media[]): BenchTitle => ({ key, category, language, year, queries });

export const TITLES: BenchTitle[] = [
  // Western films, 1942 to 2024
  t('casablanca', 'western-movie', 'en', 1942, movie('289', 'tt0034583', 'Casablanca', 1942, 'en')),
  t('the-godfather', 'western-movie', 'en', 1972, movie('238', 'tt0068646', 'The Godfather', 1972, 'en')),
  t('the-matrix', 'western-movie', 'en', 1999, movie('603', 'tt0133093', 'The Matrix', 1999, 'en')),
  t('inception', 'western-movie', 'en', 2010, movie('27205', 'tt1375666', 'Inception', 2010, 'en')),
  t('interstellar', 'western-movie', 'en', 2014, movie('157336', 'tt0816692', 'Interstellar', 2014, 'en')),
  t('oppenheimer', 'western-movie', 'en', 2023, movie('872585', 'tt15398776', 'Oppenheimer', 2023, 'en')),
  t('dune-part-two', 'western-movie', 'en', 2024, movie('693134', 'tt15239678', 'Dune: Part Two', 2024, 'en')),

  // Western television
  t('breaking-bad', 'western-tv', 'en', 2008, episode('1396', 'tt0903747', 'Breaking Bad', 2008, 'en')),
  t('game-of-thrones', 'western-tv', 'en', 2011, episode('1399', 'tt0944947', 'Game of Thrones', 2011, 'en')),
  t('the-office', 'western-tv', 'en', 2005, episode('2316', 'tt0386676', 'The Office', 2005, 'en', 2, 1)),
  t('stranger-things', 'western-tv', 'en', 2016, episode('66732', 'tt4574334', 'Stranger Things', 2016, 'en')),
  t('the-last-of-us', 'western-tv', 'en', 2023, episode('100088', 'tt3581920', 'The Last of Us', 2023, 'en')),
  t('severance', 'western-tv', 'en', 2022, episode('95396', 'tt11280740', 'Severance', 2022, 'en')),

  // Anime: films and series; series are asked for both as a TMDB show and as an anime entry
  t('spirited-away', 'anime', 'ja', 2001, movie('129', 'tt0245429', 'Spirited Away', 2001, 'ja', ['Sen to Chihiro no Kamikakushi', '千と千尋の神隠し']), anime('199', '199', '129', 'Spirited Away', 2001, 1, ['Sen to Chihiro no Kamikakushi'])),
  t('your-name', 'anime', 'ja', 2016, movie('372058', 'tt5311514', 'Your Name.', 2016, 'ja', ['Kimi no Na wa.', '君の名は。']), anime('21519', '32281', '372058', 'Your Name.', 2016, 1, ['Kimi no Na wa.'])),
  t('attack-on-titan', 'anime', 'ja', 2013, episode('1429', 'tt2560140', 'Attack on Titan', 2013, 'ja', 1, 1, ['Shingeki no Kyojin']), anime('16498', '16498', '1429', 'Attack on Titan', 2013, 1, ['Shingeki no Kyojin'])),
  t('demon-slayer', 'anime', 'ja', 2019, episode('85937', 'tt9335498', 'Demon Slayer: Kimetsu no Yaiba', 2019, 'ja', 1, 1, ['Kimetsu no Yaiba']), anime('101922', '38000', '85937', 'Demon Slayer: Kimetsu no Yaiba', 2019, 1, ['Kimetsu no Yaiba'])),
  t('one-piece', 'anime', 'ja', 1999, episode('37854', 'tt0388629', 'One Piece', 1999, 'ja'), anime('21', '21', '37854', 'One Piece', 1999, 1, ['ONE PIECE'])),
  t('jujutsu-kaisen', 'anime', 'ja', 2020, episode('95479', 'tt12343534', 'Jujutsu Kaisen', 2020, 'ja'), anime('113415', '40748', '95479', 'Jujutsu Kaisen', 2020, 1, ['JUJUTSU KAISEN'])),

  // Indian cinema and television: Hindi, Telugu, Tamil, Malayalam, Kannada
  t('3-idiots', 'indian', 'hi', 2009, movie('20453', 'tt1187043', '3 Idiots', 2009, 'hi')),
  t('dangal', 'indian', 'hi', 2016, movie('360814', 'tt5074352', 'Dangal', 2016, 'hi')),
  t('lagaan', 'indian', 'hi', 2001, movie('19666', 'tt0169102', 'Lagaan: Once Upon a Time in India', 2001, 'hi', ['Lagaan'])),
  t('rrr', 'indian', 'te', 2022, movie('579974', 'tt8178634', 'RRR', 2022, 'te')),
  t('baahubali-2', 'indian', 'te', 2017, movie('350312', 'tt4849438', 'Bāhubali 2: The Conclusion', 2017, 'te', ['Baahubali 2: The Conclusion', 'Bahubali 2'])),
  t('vikram', 'indian', 'ta', 2022, movie('743563', 'tt9179430', 'Vikram', 2022, 'ta')),
  t('drishyam', 'indian', 'ml', 2013, movie('244049', 'tt3417422', 'Drishyam', 2013, 'ml')),
  t('kgf-chapter-2', 'indian', 'kn', 2022, movie('587412', 'tt10698680', 'K.G.F: Chapter 2', 2022, 'kn', ['KGF Chapter 2'])),
  t('sacred-games', 'indian', 'hi', 2018, episode('79352', 'tt6077448', 'Sacred Games', 2018, 'hi')),

  // Other languages: Korean, Spanish, French, German, Portuguese
  t('parasite', 'international', 'ko', 2019, movie('496243', 'tt6751668', 'Parasite', 2019, 'ko', ['Gisaengchung', '기생충'])),
  t('squid-game', 'international', 'ko', 2021, episode('93405', 'tt10919420', 'Squid Game', 2021, 'ko', 1, 1, ['Ojing-eo Geim'])),
  t('money-heist', 'international', 'es', 2017, episode('71446', 'tt6468322', 'Money Heist', 2017, 'es', 1, 1, ['La Casa de Papel'])),
  t('amelie', 'international', 'fr', 2001, movie('194', 'tt0211915', 'Amélie', 2001, 'fr', ["Le Fabuleux Destin d'Amélie Poulain"])),
  t('dark', 'international', 'de', 2017, episode('70523', 'tt5753856', 'Dark', 2017, 'de')),
  t('city-of-god', 'international', 'pt', 2002, movie('598', 'tt0317248', 'City of God', 2002, 'pt', ['Cidade de Deus'])),
];

export const CATEGORIES: Category[] = ['western-movie', 'western-tv', 'anime', 'indian', 'international'];

/** A small spread (one or two per category) for quick runs. */
export const QUICK = ['inception', 'the-godfather', 'breaking-bad', 'attack-on-titan', 'spirited-away', '3-idiots', 'rrr', 'parasite', 'money-heist'];
