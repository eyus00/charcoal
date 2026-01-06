// Helpers for Stremio addon API Formats
export async function getAddonStreams(addonUrl, ctx) {
    if (!ctx.media.imdbId) {
        throw new Error('Error: ctx.media.imdbId is required.');
    }
    let addonResponse;
    if (ctx.media.type === 'show') {
        addonResponse = await ctx.proxiedFetcher(`${addonUrl}/stream/series/${ctx.media.imdbId}:${ctx.media.season.number}:${ctx.media.episode.number}.json`);
    }
    else {
        addonResponse = await ctx.proxiedFetcher(`${addonUrl}/stream/movie/${ctx.media.imdbId}.json`);
    }
    if (!addonResponse) {
        throw new Error('Error: addon did not respond');
    }
    return addonResponse;
}
export async function parseStreamData(streams, ctx) {
    return ctx.proxiedFetcher('https://torrent-parse.pstream.mov', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(streams),
    });
}
