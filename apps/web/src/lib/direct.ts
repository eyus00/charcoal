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
    runtime: d.runtime || d.episode_run_time?.[0] || undefined,
  };
}

/**
 * "Auto" HLS streams hold several qualities; read the playlist (through the extension) to show the
 * real top one, e.g. LookMovie's 1080p. Quick, and skipped on any error.
 */
async function probeQualities(sources: JellySource[]) {
  await Promise.all(
    sources
      .filter((s) => s.type === 'hls' && /^(auto|unknown)$/i.test(s.quality) && /^https?:/.test(s.url))
      .map(async (s) => {
        try {
          const r = await Promise.race([extensionFetcher(s.url, { headers: s.headers }), new Promise<never>((_, x) => setTimeout(() => x(new Error('slow')), 4000))]);
          const heights = [...r.body.matchAll(/RESOLUTION=(\d+)x(\d+)/g)].map((m) => Math.max(Number(m[2]), Math.round((Number(m[1]) * 9) / 16)));
          if (heights.length) {
            const h = Math.max(...heights);
            s.quality = String(h >= 2000 ? 2160 : h >= 1400 ? 1440 : h >= 1000 ? 1080 : h >= 700 ? 720 : h >= 460 ? 480 : 360);
          }
        } catch {
          /* keep "auto" */
        }
      }),
  );
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
        size: s.size,
        levels: s.levels,
        provider: { id: o.provider.id, name: o.provider.name },
        audioTracks: s.language ? [{ language: s.languageCode ?? 'und', label: s.language }] : undefined,
      });
    }
    for (const c of o.result!.captions) if (!subtitles.some((x) => x.url === c.url)) subtitles.push({ url: c.url, label: c.label, format: c.format, headers: c.headers });
  }
  return { sources, subtitles, report };
}

export async function fetchViaExtension(t: Target, d: Details, signal: AbortSignal, episodeTmdbId?: number): Promise<JellyResult> {
  const outcomes = await scrapeAll(mediaOf(t, d, episodeTmdbId), { fetch: extensionFetcher, signal, settings: { febboxToken: getState().settings.febboxToken || undefined, febboxMaxHeight: getState().settings.febboxMaxHeight || undefined } });
  const { sources, subtitles, report } = collect(outcomes);
  await probeQualities(sources);
  if (!sources.length) throw new Error(`Charcoal Helper found no sources (${report.map((r) => `${r.name}: ${r.reason}`).join('; ')})`);
  return { responseId: 'helper', expiresAt: '', sources: sortSources(sources), subtitles, via: 'extension', report };
}

let fallbackList: Promise<Provider[]> | null = null;

/**
 * The fallback (StreamViva's sources and PrimeSrc), through the extension. StreamViva's engine is
 * only downloaded when this first runs. Runs after our own
 * providers; its sources are added to the end of the list. Its report entries are grouped, so the
 * Source menu can fold them into one row.
 */
export async function fetchFallbackViaExtension(t: Target, d: Details, signal: AbortSignal, episodeTmdbId?: number) {
  fallbackList ??= loadFallbackProviders();
  const outcomes = await scrapeAll(mediaOf(t, d, episodeTmdbId), { fetch: extensionFetcher, signal }, { list: await fallbackList, timeoutMs: 30_000 });
  const { sources, subtitles, report } = collect(outcomes);
  await probeQualities(sources);
  return { sources: sortSources(sources), subtitles, report: report.map((r) => ({ ...r, group: 'StreamViva' })) };
}
