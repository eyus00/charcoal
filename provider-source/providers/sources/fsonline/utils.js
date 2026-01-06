export const ORIGIN_HOST = 'https://www3.fsonline.app';
export const MOVIE_PAGE_URL = 'https://www3.fsonline.app/film/';
export const SHOW_PAGE_URL = 'https://www3.fsonline.app/episoade/{{MOVIE}}-sezonul-{{SEASON}}-episodul-{{EPISODE}}/';
export const EMBED_URL = 'https://www3.fsonline.app/wp-admin/admin-ajax.php';
export function throwOnResponse(response) {
    if (response.statusCode >= 400) {
        throw new Error(`Response does not indicate success: ${response.statusCode}`);
    }
}
export function getMoviePageURL(name, season, episode) {
    const n = name
        .trim()
        .normalize('NFD')
        .toLowerCase()
        .replace(/[^a-zA-Z0-9. ]+/g, '')
        .replace('.', ' ')
        .split(' ')
        .join('-');
    if (season && episode) {
        return SHOW_PAGE_URL.replace('{{MOVIE}}', n)
            .replace('{{SEASON}}', `${season}`)
            .replace('{{EPISODE}}', `${episode}`);
    }
    return `${MOVIE_PAGE_URL}${n}/`;
}
export async function fetchIFrame(ctx, url) {
    const response = await ctx.proxiedFetcher.full(url, {
        headers: {
            Referer: ORIGIN_HOST,
            Origin: ORIGIN_HOST,
            'sec-fetch-dest': 'iframe',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'cross-site',
        },
    });
    throwOnResponse(response);
    return response;
}
