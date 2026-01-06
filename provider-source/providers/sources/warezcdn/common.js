export const warezcdnBase = 'https://embed.warezcdn.link';
export const warezcdnApiBase = 'https://warezcdn.link/embed';
export const warezcdnPlayerBase = 'https://warezcdn.link/player';
export const warezcdnWorkerProxy = 'https://workerproxy.warezcdn.workers.dev';
export async function getExternalPlayerUrl(ctx, embedId, embedUrl) {
    const params = {
        id: embedUrl,
        sv: embedId,
    };
    const realUrl = await ctx.proxiedFetcher(`/getPlay.php`, {
        baseUrl: warezcdnApiBase,
        headers: {
            Referer: `${warezcdnApiBase}/getEmbed.php?${new URLSearchParams(params)}`,
        },
        query: params,
    });
    const realEmbedUrl = realUrl.match(/window\.location\.href="([^"]*)";/);
    if (!realEmbedUrl)
        throw new Error('Could not find embed url');
    return realEmbedUrl[1];
}
