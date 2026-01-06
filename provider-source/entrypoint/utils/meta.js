function formatSourceMeta(v) {
    const types = [];
    if (v.scrapeMovie)
        types.push('movie');
    if (v.scrapeShow)
        types.push('show');
    return {
        type: 'source',
        id: v.id,
        rank: v.rank,
        name: v.name,
        flags: v.flags,
        mediaTypes: types,
    };
}
function formatEmbedMeta(v) {
    return {
        type: 'embed',
        id: v.id,
        rank: v.rank,
        name: v.name,
        flags: v.flags,
    };
}
export function getAllSourceMetaSorted(list) {
    return list.sources.sort((a, b) => b.rank - a.rank).map(formatSourceMeta);
}
export function getAllEmbedMetaSorted(list) {
    return list.embeds.sort((a, b) => b.rank - a.rank).map(formatEmbedMeta);
}
export function getSpecificId(list, id) {
    const foundSource = list.sources.find((v) => v.id === id);
    if (foundSource) {
        return formatSourceMeta(foundSource);
    }
    const foundEmbed = list.embeds.find((v) => v.id === id);
    if (foundEmbed) {
        return formatEmbedMeta(foundEmbed);
    }
    return null;
}
