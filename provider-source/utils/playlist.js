import { parse, stringify } from 'hls-parser';
export async function convertPlaylistsToDataUrls(fetcher, playlistUrl, headers) {
    const playlistData = await fetcher(playlistUrl, { headers });
    const playlist = parse(playlistData);
    if (playlist.isMasterPlaylist) {
        // Extract base URL from the playlist URL for resolving relative variant URLs
        const baseUrl = new URL(playlistUrl).origin;
        await Promise.all(playlist.variants.map(async (variant) => {
            // Resolve relative URLs against the base URL
            let variantUrl = variant.uri;
            if (!variantUrl.startsWith('http')) {
                // Handle relative URLs - add leading slash if it doesn't exist
                if (!variantUrl.startsWith('/')) {
                    variantUrl = `/${variantUrl}`;
                }
                variantUrl = baseUrl + variantUrl;
            }
            const variantPlaylistData = await fetcher(variantUrl, { headers });
            const variantPlaylist = parse(variantPlaylistData);
            variant.uri = `data:application/vnd.apple.mpegurl;base64,${btoa(stringify(variantPlaylist))}`;
        }));
    }
    return `data:application/vnd.apple.mpegurl;base64,${btoa(stringify(playlist))}`;
}
