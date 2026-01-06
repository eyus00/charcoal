import { getAllEmbedMetaSorted, getAllSourceMetaSorted, getSpecificId } from '@/entrypoint/utils/meta';
import { makeFetcher } from '@/fetchers/common';
import { scrapeIndividualEmbed, scrapeInvidualSource } from '@/runners/individualRunner';
import { runAllProviders } from '@/runners/runner';
export function makeControls(ops) {
    const list = {
        embeds: ops.embeds,
        sources: ops.sources,
    };
    const providerRunnerOps = {
        features: ops.features,
        fetcher: makeFetcher(ops.fetcher),
        proxiedFetcher: makeFetcher(ops.proxiedFetcher ?? ops.fetcher),
        proxyStreams: ops.proxyStreams,
    };
    return {
        runAll(runnerOps) {
            return runAllProviders(list, {
                ...providerRunnerOps,
                ...runnerOps,
            });
        },
        runSourceScraper(runnerOps) {
            return scrapeInvidualSource(list, {
                ...providerRunnerOps,
                ...runnerOps,
            });
        },
        runEmbedScraper(runnerOps) {
            return scrapeIndividualEmbed(list, {
                ...providerRunnerOps,
                ...runnerOps,
            });
        },
        getMetadata(id) {
            return getSpecificId(list, id);
        },
        listSources() {
            return getAllSourceMetaSorted(list);
        },
        listEmbeds() {
            return getAllEmbedMetaSorted(list);
        },
    };
}
