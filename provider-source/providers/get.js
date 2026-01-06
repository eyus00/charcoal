import { flagsAllowedInFeatures } from '@/entrypoint/utils/targets';
function findDuplicates(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(item);
    }
    return Array.from(groups.entries())
        .filter(([_, groupItems]) => groupItems.length > 1)
        .map(([key, groupItems]) => ({ key, items: groupItems }));
}
function formatDuplicateError(type, duplicates, keyName) {
    const duplicateList = duplicates
        .map(({ key, items }) => {
        const itemNames = items.map((item) => item.name || item.id).join(', ');
        return `  ${keyName} ${key}: ${itemNames}`;
    })
        .join('\n');
    return `${type} have duplicate ${keyName}s:\n${duplicateList}`;
}
export function getProviders(features, list) {
    const sources = list.sources.filter((v) => !v?.disabled);
    const embeds = list.embeds.filter((v) => !v?.disabled);
    const combined = [...sources, ...embeds];
    // Check for duplicate IDs
    const duplicateIds = findDuplicates(combined, (v) => v.id);
    if (duplicateIds.length > 0) {
        throw new Error(formatDuplicateError('Sources/embeds', duplicateIds, 'ID'));
    }
    // Check for duplicate source ranks
    const duplicateSourceRanks = findDuplicates(sources, (v) => v.rank);
    if (duplicateSourceRanks.length > 0) {
        throw new Error(formatDuplicateError('Sources', duplicateSourceRanks, 'rank'));
    }
    // Check for duplicate embed ranks
    const duplicateEmbedRanks = findDuplicates(embeds, (v) => v.rank);
    if (duplicateEmbedRanks.length > 0) {
        throw new Error(formatDuplicateError('Embeds', duplicateEmbedRanks, 'rank'));
    }
    return {
        sources: sources.filter((s) => flagsAllowedInFeatures(features, s.flags)),
        embeds: embeds.filter((e) => flagsAllowedInFeatures(features, e.flags)),
    };
}
