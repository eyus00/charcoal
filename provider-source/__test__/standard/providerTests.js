// eslint-disable-next-line import/no-extraneous-dependencies
import { vi } from 'vitest';
import { makeEmbed, makeSourcerer } from '@/providers/base';
export function makeProviderMocks() {
    const embedsMock = vi.fn();
    const sourcesMock = vi.fn();
    return {
        gatherAllEmbeds: embedsMock,
        gatherAllSources: sourcesMock,
    };
}
const sourceA = makeSourcerer({
    id: 'a',
    name: 'A',
    rank: 1,
    disabled: false,
    flags: [],
});
const sourceB = makeSourcerer({
    id: 'b',
    name: 'B',
    rank: 2,
    disabled: false,
    flags: [],
});
const sourceCDisabled = makeSourcerer({
    id: 'c',
    name: 'C',
    rank: 3,
    disabled: true,
    flags: [],
});
const sourceAHigherRank = makeSourcerer({
    id: 'a',
    name: 'A',
    rank: 100,
    disabled: false,
    flags: [],
});
const sourceGSameRankAsA = makeSourcerer({
    id: 'g',
    name: 'G',
    rank: 1,
    disabled: false,
    flags: [],
});
const fullSourceYMovie = makeSourcerer({
    id: 'y',
    name: 'Y',
    rank: 105,
    scrapeMovie: vi.fn(),
    flags: [],
});
const fullSourceYShow = makeSourcerer({
    id: 'y',
    name: 'Y',
    rank: 105,
    scrapeShow: vi.fn(),
    flags: [],
});
const fullSourceZBoth = makeSourcerer({
    id: 'z',
    name: 'Z',
    rank: 106,
    scrapeMovie: vi.fn(),
    scrapeShow: vi.fn(),
    flags: [],
});
const embedD = makeEmbed({
    id: 'd',
    rank: 4,
    disabled: false,
});
const embedA = makeEmbed({
    id: 'a',
    rank: 5,
    disabled: false,
});
const embedEDisabled = makeEmbed({
    id: 'e',
    rank: 6,
    disabled: true,
});
const embedDHigherRank = makeEmbed({
    id: 'd',
    rank: 4000,
    disabled: false,
});
const embedFSameRankAsA = makeEmbed({
    id: 'f',
    rank: 5,
    disabled: false,
});
const embedHSameRankAsSourceA = makeEmbed({
    id: 'h',
    rank: 1,
    disabled: false,
});
const fullEmbedX = makeEmbed({
    id: 'x',
    name: 'X',
    rank: 104,
});
const fullEmbedZ = makeEmbed({
    id: 'z',
    name: 'Z',
    rank: 109,
});
export const mockSources = {
    sourceA,
    sourceB,
    sourceCDisabled,
    sourceAHigherRank,
    sourceGSameRankAsA,
    fullSourceYMovie,
    fullSourceYShow,
    fullSourceZBoth,
};
export const mockEmbeds = {
    embedA,
    embedD,
    embedDHigherRank,
    embedEDisabled,
    embedFSameRankAsA,
    embedHSameRankAsSourceA,
    fullEmbedX,
    fullEmbedZ,
};
