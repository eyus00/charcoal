import { flags } from '@/entrypoint/utils/targets';
import { makeSourcerer } from '@/providers/base';
async function consumetScraper(ctx) {
    // Search
    const searchQuery = ctx.media.title;
    const page = 1;
    const searchUrl = `https://api.1anime.app/anime/zoro/${encodeURIComponent(searchQuery)}?page=${page}`;
    const searchResponse = await ctx.fetcher(searchUrl);
    if (!searchResponse?.results?.length) {
        throw new Error('No results found');
    }
    const bestMatch = searchResponse.results.find((result) => result.title.toLowerCase() === ctx.media.title.toLowerCase()) ||
        searchResponse.results[0];
    // Get episode list
    const infoUrl = `https://api.1anime.app/anime/zoro/info?id=${bestMatch.id}`;
    const infoResponse = await ctx.fetcher(infoUrl);
    if (!infoResponse?.episodes?.length) {
        throw new Error('No episodes found');
    }
    const targetEpisode = infoResponse.episodes.find((ep) => ep.number === ctx.media.episode.number);
    if (!targetEpisode) {
        throw new Error('Episode not found');
    }
    // Parse embeds
    const query = {
        episodeId: `${bestMatch.id}$${ctx.media.season.number}$${targetEpisode.id}$both`,
    };
    const embeds = [
        {
            embedId: 'consumet-vidcloud',
            url: JSON.stringify({ ...query, server: 'vidcloud' }),
        },
        {
            embedId: 'consumet-streamsb',
            url: JSON.stringify({ ...query, server: 'streamsb' }),
        },
        {
            embedId: 'consumet-vidstreaming',
            url: JSON.stringify({ ...query, server: 'vidstreaming' }),
        },
        {
            embedId: 'consumet-streamtape',
            url: JSON.stringify({ ...query, server: 'streamtape' }),
        },
    ];
    return {
        embeds,
    };
}
export const ConsumetScraper = makeSourcerer({
    id: 'consumet',
    name: 'Consumet (Anime) 🔥',
    rank: 5,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeShow: consumetScraper,
});
