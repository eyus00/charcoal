/**
 * Finding sources in the browser, through Charcoal Helper: the shared providers run right here and
 * every request leaves from the viewer's own connection. No server is involved.
 */
import { loadFallbackProviders, scrapeAll, type Media, type Provider, type ProviderOutcome } from '@charcoal/providers';
import { extensionFetcher } from './extension';
import { getState } from './store';
import { sortSources, type JellyResult, type JellySource, type JellySubtitle, type ProviderReport, type Target } from './servers';
import type { Details } from './tmdb';

function mediaOf(t: Target, d: Details, episodeTmdbId?: number): Media {
  const date = d.release_date || d.first_air_date || '';
  return {
    type: t.type,
    tmdbId: String(t.id),
    imdbId: d.imdb_id || d.external_ids?.imdb_id || undefined,
    title: d.title || d.name || '',
    year: Number(date.slice(0, 4)) || undefined,
    season: t.season,
    episode: t.episode,
    episodeTmdbId: episodeTmdbId ? String(episodeTmdbId) : undefined,
  };
}

/** Our providers' outcomes → sources, subtitles and a report. */
function collect(outcomes: ProviderOutcome[]) {
  const sources: JellySource[] = [];
  const subtitles: JellySubtitle[] = [];
  const report: ProviderReport[] = outcomes.map((o) => ({
    name: o.provider.name,
    ok: o.status === 'ok',
    reason: o.status === 'notfound' ? o.error || 'Doesn’t have this title' : o.error,
  }));
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
        note: s.note,
        provider: { id: o.provider.id, name: o.provider.name },
        audioTracks: s.language ? [{ language: s.languageCode ?? 'und', label: s.language }] : undefined,
      });
    }
    for (const c of o.result!.captions) if (!subtitles.some((x) => x.url === c.url)) subtitles.push({ url: c.url, label: c.label, format: c.format, headers: c.headers });
  }
  return { sources, subtitles, report };
}

export async function fetchViaExtension(t: Target, d: Details, signal: AbortSignal, episodeTmdbId?: number): Promise<JellyResult> {
  const outcomes = await scrapeAll(mediaOf(t, d, episodeTmdbId), { fetch: extensionFetcher, signal, settings: { febboxToken: getState().settings.febboxToken || undefined } });
  const { sources, subtitles, report } = collect(outcomes);
  if (!sources.length) throw new Error(`Charcoal Helper found no sources (${report.map((r) => `${r.name}: ${r.reason}`).join('; ')})`);
  return { responseId: 'helper', expiresAt: '', sources: sortSources(sources), subtitles, via: 'extension', report };
}

let fallbackList: Promise<Provider[]> | null = null;

/**
 * The fallback (StreamViva's sources and PrimeSrc), through the extension. StreamViva's engine is
 * only downloaded when this first runs. Runs after our own
 * providers; its sources are added to the end of the list. Failures are summed up in one report
 * line, since there are many of them.
 */
export async function fetchFallbackViaExtension(t: Target, d: Details, signal: AbortSignal, episodeTmdbId?: number) {
  fallbackList ??= loadFallbackProviders();
  const outcomes = await scrapeAll(mediaOf(t, d, episodeTmdbId), { fetch: extensionFetcher, signal }, { list: await fallbackList, timeoutMs: 30_000 });
  const { sources, subtitles, report } = collect(outcomes);
  const failed = report.filter((r) => !r.ok);
  const summary: ProviderReport[] = failed.length
    ? [
        {
          name: 'StreamViva',
          ok: false,
          reason: `${failed.length} of ${report.length} fallback sources had nothing (${failed
            .slice(0, 4)
            .map((r) => r.name)
            .join(', ')}${failed.length > 4 ? '…' : ''})`,
        },
      ]
    : [];
  return { sources: sortSources(sources), subtitles, report: [...report.filter((r) => r.ok), ...summary] };
}
