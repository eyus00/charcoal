/**
 * Platform providers (the provider pack, rule packs, the fallback pack) presented to the OMSS
 * framework, so the /v1 endpoints keep serving them to older clients. Each one runs through the
 * platform engine: same network policy, budget, diagnostics and health as on /v2.
 */
import { BaseProvider } from '@omss/framework';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult, Source, Subtitle } from '@omss/framework';
import type { Engine, EpisodeMedia, LoadedProvider, Media, MovieMedia } from '@charcoal/provider-sdk';

const TMDB_KEY = process.env.TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d';
const titles = new Map<string, Promise<{ title: string; year?: number; imdb?: string } | null>>();

/** Title, year and IMDb id of a movie or show from TMDB (cached). */
export function lookupTitle(kind: 'movie' | 'tv', tmdbId: string): Promise<{ title: string; year?: number; imdb?: string } | null> {
  const key = `${kind}:${tmdbId}`;
  if (!titles.has(key)) {
    const p = fetch(`https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ title?: string; name?: string; release_date?: string; first_air_date?: string; imdb_id?: string; external_ids?: { imdb_id?: string } }>) : null))
      .then((j) => {
        const title = j?.title ?? j?.name;
        if (!j || !title) return null;
        return { title, year: Number((j.release_date ?? j.first_air_date ?? '').slice(0, 4)) || undefined, imdb: j.imdb_id ?? j.external_ids?.imdb_id ?? undefined };
      })
      .catch(() => null);
    titles.set(key, p);
    // A failed lookup isn't remembered.
    p.then((v) => v === null && titles.delete(key));
    if (titles.size > 2000) titles.clear();
  }
  return titles.get(key)!;
}

/** For TV the framework passes the EPISODE name as `title`; providers need the show's. */
async function toMedia(m: ProviderMediaObject): Promise<MovieMedia | EpisodeMedia | null> {
  const year = Number(m.releaseYear) || undefined;
  const ids = { tmdb: m.tmdbId, ...(m.imdbId ? { imdb: m.imdbId } : {}) };
  if (m.type === 'movie') return m.title ? { kind: 'movie', ids, title: m.title, year } : null;
  const show = await lookupTitle('tv', m.tmdbId);
  if (!show) return null;
  return { kind: 'tv', ids, title: show.title, year: show.year ?? year, season: Number(m.s), episode: Number(m.e) };
}

export class BenchedError extends Error {}

function adapt(id: string, find: (id: string) => LoadedProvider | undefined, engine: Engine): BaseProvider | null {
  const first = find(id);
  if (!first) return null;
  const manifest = first.module.manifest;
  class Platform extends BaseProvider {
    readonly id = manifest.id;
    readonly name = manifest.name;
    readonly enabled = true;
    readonly BASE_URL = '';
    readonly HEADERS = {};
    readonly capabilities: ProviderCapabilities = {
      supportedContentTypes: [...(manifest.kinds.includes('movie') ? (['movies'] as const) : []), ...(manifest.kinds.includes('tv') ? (['tv'] as const) : [])],
    };
    getMovieSources(media: ProviderMediaObject) {
      return this.run(media);
    }
    getTVSources(media: ProviderMediaObject) {
      return this.run(media);
    }
    private async run(m: ProviderMediaObject): Promise<ProviderResult> {
      // Looked up per request: stage, rank and domains can change while the server runs.
      const loaded = find(id);
      if (!loaded || loaded.stage !== 'stable') return this.empty(loaded ? `not enabled (${loaded.stage})` : 'removed');
      // The engine's own gate: runtime fit, network policy, and the provider's circuit breaker.
      const probe: Media = m.type === 'movie' ? { kind: 'movie', ids: { tmdb: m.tmdbId }, title: '-' } : { kind: 'tv', ids: { tmdb: m.tmdbId }, title: '-', season: 1, episode: 1 };
      const fit = engine.plan({ media: probe, only: [id] });
      if (!fit.run.length) {
        const why = fit.skipped[0]?.reason ?? 'can’t run on this server';
        if (/resting/.test(why)) throw new BenchedError(`${manifest.name} is ${why}`);
        return this.empty(why);
      }
      const media = await toMedia(m);
      if (!media) return this.empty('Couldn’t look up the title');
      const r = await engine.runProvider(loaded, media, undefined, ['hls', 'mp4', 'mkv', 'dash', 'webm']);
      if (r.outcome === 'error') throw new Error(r.message ?? r.code);
      if (r.outcome === 'empty') return this.empty(r.message ?? 'Doesn’t have this title');
      const sources: Source[] = r.streams.map((s) => ({
        url: s.url.startsWith('data:') ? this.proxyDataPlaylist(s.url, s.headers) : this.createProxyUrl(s.url, s.headers),
        type: s.type as Source['type'],
        quality: s.quality,
        audioTracks: s.audio.map((a) => ({ language: a.lang, label: a.label ?? (a.lang === 'und' ? 'Original' : a.lang) })),
        provider: { id: manifest.id, name: manifest.name },
      }));
      const subtitles: Subtitle[] = r.captions.map((c) => ({ url: c.headers ? this.createProxyUrl(c.url, c.headers) : c.url, label: c.label, format: c.format }));
      return { sources, subtitles, diagnostics: [] };
    }
    /** A playlist built in memory (Febbox's adaptive list): its variant URLs go through the proxy. */
    private proxyDataPlaylist(dataUrl: string, headers: Record<string, string>): string {
      const text = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString('utf8');
      const out = text
        .split('\n')
        .map((l) => (l.startsWith('#EXT-X-MEDIA:') ? l.replace(/URI="([^"]+)"/, (_m, u: string) => `URI="${this.createProxyUrl(u, headers)}"`) : l.trim() && !l.startsWith('#') ? this.createProxyUrl(l.trim(), headers) : l))
        .join('\n');
      return `data:application/vnd.apple.mpegurl;base64,${Buffer.from(out).toString('base64')}`;
    }
    private empty(message: string): ProviderResult {
      return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${manifest.name}: ${message}`, field: '', severity: 'error' }] };
    }
  }
  return new Platform();
}

/**
 * OMSS providers for every platform provider that isn't a legacy class (those are already in the
 * framework's registry). Canary-stage providers are registered too but answer "not enabled" until
 * they are promoted, so a promotion needs no restart.
 */
export function platformProviders(ids: string[], find: (id: string) => LoadedProvider | undefined, engine: Engine): BaseProvider[] {
  return ids.map((id) => adapt(id, find, engine)).filter((p): p is BaseProvider => !!p);
}
