/**
 * Finding sources in the browser, through Charcoal Helper: the shared providers run right here and
 * every request leaves from the viewer's own connection. No server is involved.
 */
import { scrapeAll, type Media } from '@charcoal/providers';
import { extensionFetcher } from './extension';
import { sortSources, type JellyResult, type JellySource, type JellySubtitle, type Target } from './servers';
import type { Details } from './tmdb';

export async function fetchViaExtension(t: Target, d: Details, signal: AbortSignal): Promise<JellyResult> {
  const date = d.release_date || d.first_air_date || '';
  const media: Media = {
    type: t.type,
    tmdbId: String(t.id),
    title: d.title || d.name || '',
    year: Number(date.slice(0, 4)) || undefined,
    season: t.season,
    episode: t.episode,
  };
  const outcomes = await scrapeAll(media, { fetch: extensionFetcher, signal });
  const sources: JellySource[] = [];
  const subtitles: JellySubtitle[] = [];
  for (const o of outcomes) {
    if (o.status !== 'ok') {
      console.info(`[helper] ${o.provider.name}: ${o.status}${o.error ? ` (${o.error})` : ''}`);
      continue;
    }
    for (const s of o.result!.streams) {
      sources.push({
        url: s.url,
        type: s.type,
        quality: s.quality,
        headers: s.headers,
        provider: { id: o.provider.id, name: o.provider.name },
        audioTracks: s.language ? [{ language: s.language.slice(0, 3).toLowerCase(), label: s.language }] : undefined,
      });
    }
    for (const c of o.result!.captions) if (!subtitles.some((x) => x.url === c.url)) subtitles.push({ url: c.url, label: c.label, format: c.format, headers: c.headers });
  }
  if (!sources.length) throw new Error('Charcoal Helper found no sources');
  return { responseId: 'helper', expiresAt: '', sources: sortSources(sources), subtitles, via: 'extension' };
}
