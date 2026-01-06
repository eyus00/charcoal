import * as cheerio from 'cheerio';
import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed, makeSourcerer } from '@/providers/base';
import { fetchTMDBName } from '@/utils/tmdb';
import { scrapeDoodstreamEmbed } from './doodstream';
import { EMBED_URL, ORIGIN_HOST, getMoviePageURL, throwOnResponse } from './utils';
export const LOG_PREFIX = '[FSOnline]';
async function getMovieID(ctx, url) {
    // console.log(LOG_PREFIX, 'Scraping movie ID from', url);
    let $;
    try {
        const response = await ctx.proxiedFetcher.full(url, {
            headers: {
                Origin: ORIGIN_HOST,
                Referer: ORIGIN_HOST,
            },
        });
        throwOnResponse(response);
        $ = cheerio.load(await response.body);
    }
    catch (error) {
        console.error(LOG_PREFIX, 'Failed to fetch movie page', url, error);
        return undefined;
    }
    const movieID = $('#show_player_lazy').attr('movie-id');
    if (!movieID) {
        console.error(LOG_PREFIX, 'Could not find movie ID', url);
        return undefined;
    }
    // console.log(LOG_PREFIX, 'Movie ID', movieID);
    return movieID;
}
async function getMovieSources(ctx, id, refererHeader) {
    // console.log(LOG_PREFIX, 'Scraping movie sources for', id);
    const sources = new Map();
    let $;
    try {
        const response = await ctx.proxiedFetcher.full(EMBED_URL, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Referer: refererHeader,
                Origin: ORIGIN_HOST,
            },
            body: `action=lazy_player&movieID=${id}`,
        });
        throwOnResponse(response);
        $ = cheerio.load(await response.body);
    }
    catch (error) {
        console.error(LOG_PREFIX, 'Could not fetch source index', error);
        return sources;
    }
    $('li.dooplay_player_option').each((_, element) => {
        const name = $(element).find('span').text().trim();
        const url = $(element).attr('data-vs');
        if (!url) {
            console.warn(LOG_PREFIX, 'Skipping invalid source', name);
            return;
        }
        // console.log(LOG_PREFIX, 'Found movie source for', id, name, url);
        sources.set(name, url);
    });
    return sources;
}
function addEmbedFromSources(name, sources, embeds) {
    const url = sources.get(name);
    if (!url) {
        return;
    }
    embeds.push({
        embedId: `fsonline-${name.toLowerCase()}`,
        url,
    });
}
async function comboScraper(ctx) {
    const movieName = await fetchTMDBName(ctx);
    const moviePageURL = getMoviePageURL(ctx.media.type === 'movie' ? `${movieName} ${ctx.media.releaseYear}` : movieName, ctx.media.type === 'show' ? ctx.media.season.number : undefined, ctx.media.type === 'show' ? ctx.media.episode.number : undefined);
    // console.log(LOG_PREFIX, 'Movie page URL', moviePageURL);
    const movieID = await getMovieID(ctx, moviePageURL);
    if (!movieID) {
        return {
            embeds: [],
            stream: [],
        };
    }
    const embeds = [];
    const sources = await getMovieSources(ctx, movieID, moviePageURL);
    addEmbedFromSources('Filemoon', sources, embeds);
    addEmbedFromSources('Doodstream', sources, embeds);
    if (embeds.length < 1) {
        throw new Error('No valid sources were found');
    }
    return {
        embeds,
    };
}
export const fsOnlineScraper = makeSourcerer({
    id: 'fsonline',
    name: 'FSOnline',
    rank: 140,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
});
export const fsOnlineEmbeds = [
    makeEmbed({
        id: 'fsonline-doodstream',
        name: 'Doodstream',
        rank: 140,
        scrape: scrapeDoodstreamEmbed,
        flags: [flags.CORS_ALLOWED],
    }),
    // makeEmbed({
    //   id: 'fsonline-filemoon',
    //   name: 'Filemoon',
    //   rank: 140,
    //   scrape: scrapeFilemoonEmbed,
    //   flags: [flags.CORS_ALLOWED],
    // }),
];
