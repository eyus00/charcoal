import * as cheerio from 'cheerio';
import { BASE_URL, EPISODES_URL, MOVIE_SERVERS_URL, SEARCH_URL, SEASONS_URL, SHOW_SERVERS_URL } from './utils';
export async function searchMedia(ctx, query) {
    const response = await ctx.proxiedFetcher.full(`${SEARCH_URL}${query}`, {
        headers: {
            Origin: BASE_URL,
            Referer: `${BASE_URL}/`,
        },
    });
    const $ = cheerio.load(response.body);
    const results = [];
    $('.flw-item').each((_, film) => {
        const detail = $(film).find('.film-detail').first();
        const nameURL = detail?.find('.film-name').first()?.find('a').first();
        if (!detail || !nameURL) {
            return;
        }
        const pathname = nameURL.attr('href')?.trim();
        const title = nameURL.attr('title')?.trim();
        const info = detail
            .find('.fd-infor')
            .first()
            ?.find('span')
            .map((__, span) => $(span).text().trim())
            .toArray();
        if (!pathname || !title || !info || info.length === 0) {
            return;
        }
        const url = URL.parse(pathname, BASE_URL);
        const id = url?.pathname.split('-').pop();
        if (!url || !id) {
            console.error('Could not parse media URL', pathname);
            return;
        }
        results.push({
            url,
            id,
            title,
            info,
        });
    });
    return results;
}
export async function getSeasons(ctx, media) {
    const response = await ctx.proxiedFetcher.full(`${SEASONS_URL}${media.id}`, {
        headers: {
            Origin: BASE_URL,
            Referer: `${BASE_URL}/`,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    });
    const $ = cheerio.load(response.body);
    const seasons = [];
    $('.ss-item').each((_, s) => {
        const id = $(s).attr('data-id')?.trim();
        const number = /(\d+)/.exec($(s).text().trim())?.[1].trim();
        if (!id || !number) {
            return;
        }
        seasons.push({
            id,
            number: parseInt(number, 10),
        });
    });
    return seasons;
}
export async function getEpisodes(ctx, season) {
    const response = await ctx.proxiedFetcher.full(`${EPISODES_URL}${season.id}`, {
        headers: {
            Origin: BASE_URL,
            Referer: `${BASE_URL}/`,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    });
    const $ = cheerio.load(response.body);
    const episodes = [];
    $('.eps-item').each((_, ep) => {
        const id = $(ep).attr('data-id')?.trim();
        const number = /(\d+)/.exec($(ep).find('.episode-number').first().text())?.[1].trim();
        const title = $(ep).find('.film-name').first()?.find('a').first()?.attr('title')?.trim();
        if (!id || !number) {
            return;
        }
        episodes.push({
            id,
            number: parseInt(number, 10),
            title,
        });
    });
    return episodes;
}
async function getPlayers(ctx, media, url) {
    const response = await ctx.proxiedFetcher.full(url, {
        headers: {
            Origin: BASE_URL,
            Referer: `${BASE_URL}/`,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    });
    const $ = cheerio.load(response.body);
    const players = [];
    $('.link-item').each((_, p) => {
        const id = $(p).attr('data-id')?.trim();
        const name = $(p).find('span').first()?.text().trim();
        if (!id || !name) {
            return;
        }
        players.push({
            id,
            url: `${media.url.href.replace(/\/tv\//, '/watch-tv/').replace(/\/movie\//, '/watch-movie/')}.${id}`,
            name,
        });
    });
    return players;
}
export async function getEpisodePlayers(ctx, media, episode) {
    return getPlayers(ctx, media, `${SHOW_SERVERS_URL}${episode.id}`);
}
export async function getMoviePlayers(ctx, media) {
    return getPlayers(ctx, media, `${MOVIE_SERVERS_URL}${media.id}`);
}
