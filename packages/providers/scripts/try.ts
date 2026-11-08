/** Quick check from the command line: npm run try --workspace packages/providers -- movie 27205 "Inception" 2010 */
import { nativeFetcher, scrapeAll, type Media } from '../src/index.js';

const [type = 'movie', tmdbId = '27205', title = 'Inception', year, season, episode] = process.argv.slice(2);
const media: Media = { type: type as Media['type'], tmdbId, title, year: year ? Number(year) : undefined, season: season ? Number(season) : undefined, episode: episode ? Number(episode) : undefined };
for (const o of await scrapeAll(media, { fetch: nativeFetcher })) {
  console.log(`${o.provider.name.padEnd(8)} ${o.status.padEnd(9)} ${String(o.ms).padStart(5)}ms  ${o.error ?? `${o.result!.streams.length} streams, ${o.result!.captions.length} captions`}`);
  for (const s of o.result?.streams.slice(0, 2) ?? []) console.log(`           ${s.type} ${s.quality} ${s.url.slice(0, 90)}`);
}
