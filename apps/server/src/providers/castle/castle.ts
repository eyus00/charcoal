/**
 * Castle: ported from nuvio-providers (GPL-3.0, see vendor/nuvio-providers/LICENSE).
 *
 * Talks to the Castle app's film API (api.hlowb.com): fetch a per-session key, search by title,
 * read the movie / season details, then ask for the video. Responses are AES-128-CBC encrypted
 * with that key (plus a fixed suffix), so they are decrypted locally with Node's crypto.
 *
 * Tested from a cloud server (Nov 2026): HLS playlists and segments load, unlike VidApi.
 */
import { createDecipheriv } from 'node:crypto';
import { BaseProvider } from '@omss/framework';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult, Source, Subtitle } from '@omss/framework';

const API = 'https://api.hlowb.com';
const PKG = 'com.external.castle';
const QUERY = 'channel=IndiaA&clientType=1&lang=en-US';
const KEY_SUFFIX = 'T!BgJB';

const API_HEADERS = {
    'User-Agent': 'okhttp/4.9.3',
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: API
};
const PLAYBACK_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    Accept: '*/*'
};
const VIDEO_BODY = {
    mode: '1',
    appMarket: 'GuanWang',
    clientType: '1',
    woolUser: 'false',
    apkSignKey: 'ED0955EB04E67A1D9F3305B95454FED485261475',
    androidVersion: '13',
    isNewUser: 'true',
    resolution: '2',
    packageName: PKG
};

type Row = { id?: number | string; redirectId?: number | string; title?: string; name?: string };
type Episode = { id: number | string; number: number; tracks?: { languageId?: number | string; languageName?: string; existIndividualVideo?: boolean }[] };
type Details = { seasons?: { number: number; movieId?: number | string }[]; episodes?: Episode[] };
type Video = {
    videoUrl?: string;
    videos?: { url?: string; resolutionDescription?: string; resolution?: string | number }[];
    subtitles?: { url?: string; title?: string; abbreviate?: string }[];
};

const dataOf = <T,>(o: unknown): T => ((o as { data?: unknown })?.data && typeof (o as { data: unknown }).data === 'object' ? (o as { data: T }).data : (o as T));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export class CastleProvider extends BaseProvider {
    readonly id = 'castle';
    readonly name = 'Castle';
    readonly enabled = true;
    readonly BASE_URL = API;
    readonly HEADERS = API_HEADERS;
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: ['movies', 'tv'] };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            const key = await this.securityKey();
            let movieId = await this.findId(key, media);
            if (!movieId) return this.empty('No match');

            let details = dataOf<Details>(await this.call(key, `/film-api/v1.9.9/movie?${QUERY}&movieId=${movieId}&packageName=${PKG}`));
            if (media.type === 'tv') {
                const season = details.seasons?.find((s) => s.number === Number(media.s));
                if (season?.movieId && String(season.movieId) !== movieId) {
                    movieId = String(season.movieId);
                    details = dataOf<Details>(await this.call(key, `/film-api/v1.9.9/movie?${QUERY}&movieId=${movieId}&packageName=${PKG}`));
                }
            }
            const episodes = details.episodes ?? [];
            const episode = media.type === 'tv' ? episodes.find((e) => e.number === Number(media.e)) : episodes[0];
            if (!episode) return this.empty('Episode not found');

            const sources: Source[] = [];
            const subtitles: Subtitle[] = [];
            const add = (video: Video, language: string) => {
                for (const entry of video.videos?.length ? video.videos : [{}]) {
                    // Each quality may carry its own URL; otherwise they share the top-level one.
                    const v = { ...entry, url: entry.url || video.videoUrl };
                    if (!v.url) continue;
                    const quality = String(v.resolutionDescription ?? v.resolution ?? '720').replace(/^(SD|HD|FHD|UHD)\s+/i, '').replace(/p$/i, '');
                    sources.push({
                        url: this.createProxyUrl(v.url, PLAYBACK_HEADERS),
                        type: v.url.includes('.mp4') ? 'mp4' : 'hls',
                        quality,
                        audioTracks: [{ language: language.slice(0, 3).toLowerCase() || 'und', label: language }],
                        provider: { id: this.id, name: this.name }
                    });
                }
                for (const s of video.subtitles ?? []) {
                    if (!s.url || subtitles.some((x) => x.url.includes(encodeURIComponent(s.url!)))) continue;
                    subtitles.push({
                        url: this.createProxyUrl(s.url, PLAYBACK_HEADERS),
                        label: s.title || s.abbreviate || 'Unknown',
                        format: /\.srt(\?|$)/i.test(s.url) ? 'srt' : 'vtt'
                    });
                }
            };

            // One stream per audio language where available, else the shared stream.
            for (const t of episode.tracks ?? []) {
                if (!t.existIndividualVideo || !t.languageId) continue;
                try {
                    add(await this.video(key, movieId, episode.id, t.languageId), t.languageName || 'Unknown');
                } catch {
                    /* try the next language */
                }
            }
            if (!sources.length) add(await this.video(key, movieId, episode.id), 'Original');

            sources.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
            return { sources, subtitles, diagnostics: [] };
        } catch (error) {
            return this.empty(error instanceof Error ? error.message : 'Unknown provider error');
        }
    }

    private async securityKey(): Promise<string> {
        const res = await fetch(`${API}/v0.1/system/getSecurityKey/1?${QUERY}`, { headers: API_HEADERS });
        const json = (await res.json()) as { code?: number; data?: string };
        if (json.code !== 200 || !json.data) throw new Error('No security key');
        return json.data;
    }

    /** Match on title (and year when the result has one); never fall back to an unrelated first result. */
    private async findId(key: string, media: ProviderMediaObject): Promise<string | null> {
        // For TV the framework passes the episode name as `title`, so look up the show's name.
        const title = media.type === 'tv' ? await this.showName(media.tmdbId) : media.title;
        if (!title) return null;
        const keyword = media.releaseYear ? `${title} ${media.releaseYear}` : title;
        const params = new URLSearchParams({ channel: 'IndiaA', clientType: '1', keyword, lang: 'en-US', mode: '1', packageName: PKG, page: '1', size: '30' });
        const rows = dataOf<{ rows?: Row[] }>(await this.call(key, `/film-api/v1.1.0/movie/searchByKeyword?${params}`)).rows ?? [];
        const want = norm(title);
        const hit = rows.find((r) => norm(r.title || r.name || '') === want) ?? rows.find((r) => {
            const t = norm(r.title || r.name || '');
            return t && (t.includes(want) || want.includes(t));
        });
        const id = hit?.id ?? hit?.redirectId;
        return id ? String(id) : null;
    }

    private async showName(tmdbId: string): Promise<string | null> {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${process.env.TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d'}`);
            return res.ok ? ((await res.json()) as { name?: string }).name ?? null : null;
        } catch {
            return null;
        }
    }

    private async video(key: string, movieId: string, episodeId: number | string, languageId?: number | string): Promise<Video> {
        const body = { ...VIDEO_BODY, movieId, episodeId: String(episodeId), ...(languageId ? { languageId: String(languageId) } : {}) };
        return dataOf<Video>(
            await this.call(key, `/film-api/v2.0.1/movie/getVideo2?clientType=1&packageName=${PKG}&channel=IndiaA&lang=en-US`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
        );
    }

    /** Fetch an encrypted endpoint and return the decrypted JSON. */
    private async call(key: string, path: string, init: RequestInit = {}): Promise<unknown> {
        const res = await fetch(API + path, { ...init, headers: { ...API_HEADERS, ...(init.headers as Record<string, string>) } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.text()).trim();
        let cipher = text;
        try {
            const json = JSON.parse(text) as { data?: unknown };
            if (typeof json.data === 'string') cipher = json.data.trim();
        } catch {
            /* raw cipher text */
        }
        return JSON.parse(this.decrypt(cipher, key));
    }

    /** AES-128-CBC; key = base64(securityKey) + suffix, padded / cut to 16 bytes; IV = key. */
    private decrypt(cipherB64: string, keyB64: string): string {
        const material = Buffer.concat([Buffer.from(keyB64, 'base64'), Buffer.from(KEY_SUFFIX, 'utf8')]);
        const key = Buffer.alloc(16);
        material.copy(key, 0, 0, Math.min(16, material.length));
        const decipher = createDecipheriv('aes-128-cbc', key, key);
        return Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]).toString('utf8');
    }

    private empty(message: string): ProviderResult {
        return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }] };
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.securityKey();
            return true;
        } catch {
            return false;
        }
    }
}
