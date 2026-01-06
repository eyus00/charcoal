import { load } from 'cheerio';
import { flags } from '@/entrypoint/utils/targets';
import { makeSourcerer } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';
import { fetchTMDBName } from '@/utils/tmdb';
const baseUrl = 'https://www.cuevana3.eu';
function normalizeTitle(title) {
    return title
        .normalize('NFD') // Remove accents
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/gi, '') // Remove non-alphanumeric characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-'); // Remove multiple hyphens
}
async function getStreamUrl(ctx, embedUrl) {
    try {
        const html = await ctx.proxiedFetcher(embedUrl);
        const match = html.match(/var url = '([^']+)'/);
        if (match) {
            return match[1];
        }
    }
    catch {
        // Ignore errors from dead embeds
    }
    return null;
}
function validateStream(url) {
    return (url.startsWith('https://') && (url.includes('streamwish') || url.includes('filemoon') || url.includes('vidhide')));
}
async function extractVideos(ctx, videos) {
    const videoList = [];
    for (const [lang, videoArray] of Object.entries(videos)) {
        if (!videoArray)
            continue;
        for (const video of videoArray) {
            if (!video.result)
                continue;
            const realUrl = await getStreamUrl(ctx, video.result);
            if (!realUrl || !validateStream(realUrl))
                continue;
            let embedId = '';
            if (realUrl.includes('filemoon'))
                embedId = 'filemoon';
            else if (realUrl.includes('streamwish')) {
                if (lang === 'latino')
                    embedId = 'streamwish-latino';
                else if (lang === 'spanish')
                    embedId = 'streamwish-spanish';
                else if (lang === 'english')
                    embedId = 'streamwish-english';
                else
                    embedId = 'streamwish-latino';
            }
            else if (realUrl.includes('vidhide'))
                embedId = 'vidhide';
            else if (realUrl.includes('voe'))
                embedId = 'voe';
            else
                continue;
            videoList.push({
                embedId,
                url: realUrl,
            });
        }
    }
    return videoList;
}
async function fetchTitleSubstitutes() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/moonpic/fixed-titles/refs/heads/main/main.json');
        if (!response.ok)
            throw new Error('Failed to fetch fallback titles');
        return await response.json();
    }
    catch {
        return {};
    }
}
async function comboScraper(ctx) {
    const mediaType = ctx.media.type;
    const tmdbId = ctx.media.tmdbId;
    if (!tmdbId) {
        throw new NotFoundError('TMDB ID is required to fetch the title in Spanish');
    }
    const translatedTitle = await fetchTMDBName(ctx, 'es-ES');
    let normalizedTitle = normalizeTitle(translatedTitle);
    let pageUrl = mediaType === 'movie'
        ? `${baseUrl}/ver-pelicula/${normalizedTitle}`
        : `${baseUrl}/episodio/${normalizedTitle}-temporada-${ctx.media.season?.number}-episodio-${ctx.media.episode?.number}`;
    ctx.progress(60);
    let pageContent = await ctx.proxiedFetcher(pageUrl);
    let $ = load(pageContent);
    let script = $('script')
        .toArray()
        .find((scriptEl) => {
        const content = scriptEl.children[0]?.data || '';
        return content.includes('{"props":{"pageProps":');
    });
    let embeds = [];
    if (script) {
        let jsonData;
        try {
            const jsonString = script.children[0].data;
            const start = jsonString.indexOf('{"props":{"pageProps":');
            if (start === -1)
                throw new Error('No valid JSON start found');
            const partialJson = jsonString.slice(start);
            jsonData = JSON.parse(partialJson);
        }
        catch (error) {
            throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
        }
        if (mediaType === 'movie') {
            const movieData = jsonData.props.pageProps.thisMovie;
            if (movieData?.videos) {
                embeds = (await extractVideos(ctx, movieData.videos)) ?? [];
            }
        }
        else {
            const episodeData = jsonData.props.pageProps.episode;
            if (episodeData?.videos) {
                embeds = (await extractVideos(ctx, episodeData.videos)) ?? [];
            }
        }
    }
    if (embeds.length === 0) {
        const fallbacks = await fetchTitleSubstitutes();
        const fallbackTitle = fallbacks[tmdbId.toString()];
        if (!fallbackTitle) {
            throw new NotFoundError('No embed data found and no fallback title available');
        }
        normalizedTitle = normalizeTitle(fallbackTitle);
        pageUrl =
            mediaType === 'movie'
                ? `${baseUrl}/ver-pelicula/${normalizedTitle}`
                : `${baseUrl}/episodio/${normalizedTitle}-temporada-${ctx.media.season?.number}-episodio-${ctx.media.episode?.number}`;
        pageContent = await ctx.proxiedFetcher(pageUrl);
        $ = load(pageContent);
        script = $('script')
            .toArray()
            .find((scriptEl) => {
            const content = scriptEl.children[0]?.data || '';
            return content.includes('{"props":{"pageProps":');
        });
        if (script) {
            let jsonData;
            try {
                const jsonString = script.children[0].data;
                const start = jsonString.indexOf('{"props":{"pageProps":');
                if (start === -1)
                    throw new Error('No valid JSON start found');
                const partialJson = jsonString.slice(start);
                jsonData = JSON.parse(partialJson);
            }
            catch (error) {
                throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
            }
            if (mediaType === 'movie') {
                const movieData = jsonData.props.pageProps.thisMovie;
                if (movieData?.videos) {
                    embeds = (await extractVideos(ctx, movieData.videos)) ?? [];
                }
            }
            else {
                const episodeData = jsonData.props.pageProps.episode;
                if (episodeData?.videos) {
                    embeds = (await extractVideos(ctx, episodeData.videos)) ?? [];
                }
            }
        }
    }
    if (embeds.length === 0) {
        throw new NotFoundError('No valid streams found');
    }
    return { embeds };
}
export const cuevana3Scraper = makeSourcerer({
    id: 'cuevana3',
    name: 'Cuevana3',
    rank: 80,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
});
// made by @moonpic
