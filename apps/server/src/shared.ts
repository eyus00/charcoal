/**
 * Providers from packages/providers (shared with the website) wrapped as OMSS providers, so the
 * framework treats them like the ones in src/providers/.
 */
import { BaseProvider } from '@omss/framework';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult, Source, Subtitle } from '@omss/framework';
import { loadFallbackProviders, nativeFetcher, NotFoundError, providers, type Media, type Provider } from '@charcoal/providers';

/** Settings for providers that need them, from this server's own environment. */
const SERVER_SETTINGS = {
    febboxToken: process.env.FEBBOX_TOKEN?.trim().replace(/^ui=/, '') || undefined,
    febboxMaxHeight: Number(process.env.FEBBOX_MAX_HEIGHT) || undefined,
};

const TMDB_KEY = process.env.TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d';
const showNames = new Map<string, Promise<string | null>>();

/** For TV the framework passes the EPISODE name as `title`; providers need the show's. */
function showName(tmdbId: string): Promise<string | null> {
    if (!showNames.has(tmdbId)) {
        const p = fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`)
            .then((r) => (r.ok ? (r.json() as Promise<{ name?: string }>) : null))
            .then((j) => j?.name ?? null)
            .catch(() => null);
        showNames.set(tmdbId, p);
        if (showNames.size > 2000) showNames.clear();
    }
    return showNames.get(tmdbId)!;
}

async function toMedia(m: ProviderMediaObject): Promise<Media | null> {
    const title = m.type === 'tv' ? await showName(m.tmdbId) : m.title;
    if (!title) return null;
    return {
        type: m.type,
        tmdbId: m.tmdbId,
        imdbId: m.imdbId || undefined,
        title,
        year: Number(m.releaseYear) || undefined,
        season: m.type === 'tv' ? Number(m.s) : undefined,
        episode: m.type === 'tv' ? Number(m.e) : undefined,
    };
}

function adapt(p: Provider): BaseProvider {
    class Shared extends BaseProvider {
        readonly id = p.id;
        readonly name = p.name;
        readonly enabled = true;
        readonly BASE_URL = '';
        readonly HEADERS = {};
        readonly capabilities: ProviderCapabilities = {
            supportedContentTypes: p.supports.map((t) => (t === 'movie' ? 'movies' : 'tv')),
        };
        getMovieSources(media: ProviderMediaObject) {
            return this.run(media);
        }
        getTVSources(media: ProviderMediaObject) {
            return this.run(media);
        }
        private async run(m: ProviderMediaObject): Promise<ProviderResult> {
            const media = await toMedia(m);
            if (!media) return this.empty('Couldn’t look up the title');
            try {
                const r = await p.scrape(media, { fetch: nativeFetcher, settings: SERVER_SETTINGS });
                const sources: Source[] = r.streams.map((s) => ({
                    url: s.url.startsWith('data:') ? this.proxyDataPlaylist(s.url, s.headers) : this.createProxyUrl(s.url, s.headers),
                    type: s.type,
                    quality: s.quality,
                    audioTracks: [{ language: s.languageCode ?? 'und', label: s.language ?? 'Original' }],
                    provider: { id: p.id, name: p.name },
                }));
                const subtitles: Subtitle[] = r.captions.map((c) => ({
                    url: c.headers ? this.createProxyUrl(c.url, c.headers) : c.url,
                    label: c.label,
                    format: c.format,
                }));
                return { sources, subtitles, diagnostics: [] };
            } catch (e) {
                // "Not on this source" is a normal empty answer; anything else is a failure (and counts
                // against the provider's health).
                if (e instanceof NotFoundError) return this.empty(e.message);
                throw e;
            }
        }
        /** A playlist built in memory (Febbox's adaptive list): its variant URLs go through the proxy. */
        private proxyDataPlaylist(dataUrl: string, headers: Record<string, string>): string {
            const text = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString('utf8');
            const out = text
                .split('\n')
                .map((l) =>
                    l.startsWith('#EXT-X-MEDIA:')
                        ? l.replace(/URI="([^"]+)"/, (_m, u: string) => `URI="${this.createProxyUrl(u, headers)}"`)
                        : l.trim() && !l.startsWith('#')
                          ? this.createProxyUrl(l.trim(), headers)
                          : l,
                )
                .join('\n');
            return `data:application/vnd.apple.mpegurl;base64,${Buffer.from(out).toString('base64')}`;
        }
        private empty(message: string): ProviderResult {
            return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${p.name}: ${message}`, field: '', severity: 'error' }] };
        }
    }
    return new Shared();
}

/**
 * Our shared providers, plus the StreamViva fallback ones (set STREAMVIVA=false to leave those out).
 * Providers that need a viewer's own login (Febbox) only run in the viewer's browser; the server
 * never gets those tokens. On a data-centre host the fallback ones mostly fail and provider health
 * benches them; on a server at home they can work.
 */
export async function sharedProviders(): Promise<BaseProvider[]> {
    const fallback = process.env.STREAMVIVA === 'false' ? [] : await loadFallbackProviders();
    // A provider that needs a setting runs only when the server has it (e.g. FEBBOX_TOKEN on a server
    // at home): the website never sends a viewer's token to a server.
    return [...providers, ...fallback].filter((p) => !p.requires || SERVER_SETTINGS[p.requires]).map(adapt);
}
