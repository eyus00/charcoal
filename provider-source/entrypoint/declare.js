import { makeControls } from '@/entrypoint/controls';
import { getBuiltinEmbeds, getBuiltinExternalSources, getBuiltinSources } from '@/entrypoint/providers';
import { getTargetFeatures } from '@/entrypoint/utils/targets';
import { getProviders } from '@/providers/get';
export function makeProviders(ops) {
    const features = getTargetFeatures(ops.proxyStreams ? 'any' : ops.target, ops.consistentIpForRequests ?? false, ops.proxyStreams);
    const sources = [...getBuiltinSources()];
    if (ops.externalSources === 'all')
        sources.push(...getBuiltinExternalSources());
    else {
        ops.externalSources?.forEach((source) => {
            const matchingSource = getBuiltinExternalSources().find((v) => v.id === source);
            if (!matchingSource)
                return;
            sources.push(matchingSource);
        });
    }
    const list = getProviders(features, {
        embeds: getBuiltinEmbeds(),
        sources,
    });
    return makeControls({
        embeds: list.embeds,
        sources: list.sources,
        features,
        fetcher: ops.fetcher,
        proxiedFetcher: ops.proxiedFetcher,
        proxyStreams: ops.proxyStreams,
    });
}
