import { flagsAllowedInFeatures } from '@/entrypoint/utils/targets';
import { NotFoundError } from '@/utils/errors';
import { reorderOnIdList } from '@/utils/list';
import { requiresProxy, setupProxy } from '@/utils/proxy';
import { isValidStream, validatePlayableStream } from '@/utils/valid';
export async function runAllProviders(list, ops) {
    const sources = reorderOnIdList(ops.sourceOrder ?? [], list.sources).filter((source) => {
        if (ops.media.type === 'movie')
            return !!source.scrapeMovie;
        if (ops.media.type === 'show')
            return !!source.scrapeShow;
        return false;
    });
    const embeds = reorderOnIdList(ops.embedOrder ?? [], list.embeds);
    const embedIds = embeds.map((embed) => embed.id);
    let lastId = '';
    const contextBase = {
        fetcher: ops.fetcher,
        proxiedFetcher: ops.proxiedFetcher,
        features: ops.features,
        progress(val) {
            ops.events?.update?.({
                id: lastId,
                percentage: val,
                status: 'pending',
            });
        },
    };
    ops.events?.init?.({
        sourceIds: sources.map((v) => v.id),
    });
    for (const source of sources) {
        ops.events?.start?.(source.id);
        lastId = source.id;
        // run source scrapers
        let output = null;
        try {
            if (ops.media.type === 'movie' && source.scrapeMovie)
                output = await source.scrapeMovie({
                    ...contextBase,
                    media: ops.media,
                });
            else if (ops.media.type === 'show' && source.scrapeShow)
                output = await source.scrapeShow({
                    ...contextBase,
                    media: ops.media,
                });
            if (output) {
                output.stream = (output.stream ?? [])
                    .filter(isValidStream)
                    .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
                output.stream = output.stream.map((stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream);
            }
            if (!output || (!output.stream?.length && !output.embeds.length)) {
                throw new NotFoundError('No streams found');
            }
        }
        catch (error) {
            const updateParams = {
                id: source.id,
                percentage: 100,
                status: error instanceof NotFoundError ? 'notfound' : 'failure',
                reason: error instanceof NotFoundError ? error.message : undefined,
                error: error instanceof NotFoundError ? undefined : error,
            };
            ops.events?.update?.(updateParams);
            continue;
        }
        if (!output)
            throw new Error('Invalid media type');
        // return stream is there are any
        if (output.stream?.[0]) {
            const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
            if (!playableStream)
                throw new NotFoundError('No streams found');
            return {
                sourceId: source.id,
                stream: playableStream,
            };
        }
        // filter disabled and run embed scrapers on listed embeds
        const sortedEmbeds = output.embeds
            .filter((embed) => {
            const e = list.embeds.find((v) => v.id === embed.embedId);
            return e && !e.disabled;
        })
            .sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));
        if (sortedEmbeds.length > 0) {
            ops.events?.discoverEmbeds?.({
                embeds: sortedEmbeds.map((embed, i) => ({
                    id: [source.id, i].join('-'),
                    embedScraperId: embed.embedId,
                })),
                sourceId: source.id,
            });
        }
        for (const [ind, embed] of sortedEmbeds.entries()) {
            const scraper = embeds.find((v) => v.id === embed.embedId);
            if (!scraper)
                throw new Error('Invalid embed returned');
            // run embed scraper
            const id = [source.id, ind].join('-');
            ops.events?.start?.(id);
            lastId = id;
            let embedOutput;
            try {
                embedOutput = await scraper.scrape({
                    ...contextBase,
                    url: embed.url,
                });
                embedOutput.stream = embedOutput.stream
                    .filter(isValidStream)
                    .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
                embedOutput.stream = embedOutput.stream.map((stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream);
                if (embedOutput.stream.length === 0) {
                    throw new NotFoundError('No streams found');
                }
                const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed.embedId);
                if (!playableStream)
                    throw new NotFoundError('No streams found');
                embedOutput.stream = [playableStream];
            }
            catch (error) {
                const updateParams = {
                    id,
                    percentage: 100,
                    status: error instanceof NotFoundError ? 'notfound' : 'failure',
                    reason: error instanceof NotFoundError ? error.message : undefined,
                    error: error instanceof NotFoundError ? undefined : error,
                };
                ops.events?.update?.(updateParams);
                continue;
            }
            return {
                sourceId: source.id,
                embedId: scraper.id,
                stream: embedOutput.stream[0],
            };
        }
    }
    // no providers or embeds returns streams
    return null;
}
