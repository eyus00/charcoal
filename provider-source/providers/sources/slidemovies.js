import { load } from 'cheerio';
import { flags } from '@/entrypoint/utils/targets';
import { makeSourcerer } from '@/providers/base';
import { labelToLanguageCode } from '@/providers/captions';
import { NotFoundError } from '@/utils/errors';
const baseUrl = 'https://pupp.slidemovies-dev.workers.dev';
async function comboScraper(ctx) {
    const watchPageUrl = ctx.media.type === 'movie'
        ? `${baseUrl}/movie/${ctx.media.tmdbId}`
        : `${baseUrl}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/-${ctx.media.episode.number}`;
    const watchPage = await ctx.proxiedFetcher(watchPageUrl);
    const $ = load(watchPage);
    ctx.progress(50);
    const proxiedStreamUrl = $('media-player').attr('src');
    if (!proxiedStreamUrl) {
        throw new NotFoundError('Stream URL not found');
    }
    const proxyUrl = new URL(proxiedStreamUrl);
    const encodedUrl = proxyUrl.searchParams.get('url') || '';
    const playlist = decodeURIComponent(encodedUrl);
    const captions = $('media-provider track')
        .map((_, el) => {
        const url = $(el).attr('src') || '';
        const rawLang = $(el).attr('lang') || 'unknown';
        const languageCode = labelToLanguageCode(rawLang) || rawLang;
        const isVtt = url.endsWith('.vtt') ? 'vtt' : 'srt';
        return {
            type: isVtt,
            id: url,
            url,
            language: languageCode,
            hasCorsRestrictions: false,
        };
    })
        .get();
    ctx.progress(90);
    return {
        embeds: [],
        stream: [
            {
                id: 'primary',
                type: 'hls',
                flags: [],
                playlist,
                captions,
            },
        ],
    };
}
export const slidemoviesScraper = makeSourcerer({
    id: 'slidemovies',
    name: 'SlideMovies',
    rank: 135,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
});
