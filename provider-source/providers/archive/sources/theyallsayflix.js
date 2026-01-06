import { flags } from '@/entrypoint/utils/targets';
import { makeSourcerer } from '@/providers/base';
import { labelToLanguageCode } from '@/providers/captions';
import { NotFoundError } from '@/utils/errors';
const baseUrl = 'https://theyallsayflix.su/';
async function comboScraper(ctx) {
    const apiRes = await ctx.proxiedFetcher.full('/api/v1/search', {
        query: {
            type: ctx.media.type,
            tmdb_id: ctx.media.tmdbId,
            ...(ctx.media.type === 'show' && {
                season: ctx.media.season.number.toString(),
                episode: ctx.media.episode.number.toString(),
            }),
        },
        baseUrl,
    });
    const data = apiRes.body;
    if (apiRes.statusCode !== 200 || !data.streams[0].play_url)
        throw new NotFoundError('No watchable item found');
    const captions = [];
    if (data.subtitles) {
        for (const caption of data.subtitles) {
            const language = labelToLanguageCode(caption.label);
            if (!language)
                continue;
            captions.push({
                id: caption.url,
                url: caption.url,
                type: 'vtt',
                hasCorsRestrictions: false,
                language,
            });
        }
    }
    return {
        embeds: [],
        stream: [
            {
                id: 'primary',
                playlist: data.streams[0].play_url,
                type: 'hls',
                flags: [flags.CORS_ALLOWED],
                captions,
            },
        ],
    };
}
export const TASFScraper = makeSourcerer({
    id: 'tasf',
    name: 'theyallsayflix.su',
    rank: 225,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
});
