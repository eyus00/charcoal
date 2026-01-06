import { makeControls } from '@/entrypoint/controls';
import { getBuiltinEmbeds, getBuiltinExternalSources, getBuiltinSources } from '@/entrypoint/providers';
import { getTargetFeatures } from '@/entrypoint/utils/targets';
import { getProviders } from '@/providers/get';
export function buildProviders() {
    let consistentIpForRequests = false;
    let target = null;
    let fetcher = null;
    let proxiedFetcher = null;
    const embeds = [];
    const sources = [];
    const builtinSources = getBuiltinSources();
    const builtinExternalSources = getBuiltinExternalSources();
    const builtinEmbeds = getBuiltinEmbeds();
    return {
        enableConsistentIpForRequests() {
            consistentIpForRequests = true;
            return this;
        },
        setFetcher(f) {
            fetcher = f;
            return this;
        },
        setProxiedFetcher(f) {
            proxiedFetcher = f;
            return this;
        },
        setTarget(t) {
            target = t;
            return this;
        },
        addSource(input) {
            if (typeof input !== 'string') {
                sources.push(input);
                return this;
            }
            const matchingSource = [...builtinSources, ...builtinExternalSources].find((v) => v.id === input);
            if (!matchingSource)
                throw new Error('Source not found');
            sources.push(matchingSource);
            return this;
        },
        addEmbed(input) {
            if (typeof input !== 'string') {
                embeds.push(input);
                return this;
            }
            const matchingEmbed = builtinEmbeds.find((v) => v.id === input);
            if (!matchingEmbed)
                throw new Error('Embed not found');
            embeds.push(matchingEmbed);
            return this;
        },
        addBuiltinProviders() {
            sources.push(...builtinSources);
            embeds.push(...builtinEmbeds);
            return this;
        },
        build() {
            if (!target)
                throw new Error('Target not set');
            if (!fetcher)
                throw new Error('Fetcher not set');
            const features = getTargetFeatures(target, consistentIpForRequests);
            const list = getProviders(features, {
                embeds,
                sources,
            });
            return makeControls({
                fetcher,
                proxiedFetcher: proxiedFetcher ?? undefined,
                embeds: list.embeds,
                sources: list.sources,
                features,
            });
        },
    };
}
