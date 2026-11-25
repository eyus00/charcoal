/**
 * Category adapters on the shared provider platform. Everything here is pure or takes an injected
 * Fetcher, and runs unchanged in Node and in a browser bundle.
 *
 *   anime      TMDB (show, season, episode) ↔ AniList / MAL entries, titles, skip times
 *   sports     events and their status, channels and streams, official broadcaster links
 *   discovery  regional cinema on TMDB by language, title matching, audio languages in file names
 */

export * from './anime/mapping.js';
export * from './anime/anilist.js';
export * from './anime/aniskip.js';

export * from './sports/model.js';
export * from './sports/thesportsdb.js';
export * from './sports/channels.js';
export * from './sports/linkouts.js';
export * from './sports/directory.js';

export * from './discovery/languages.js';
