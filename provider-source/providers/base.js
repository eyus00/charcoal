export function makeSourcerer(state) {
    const mediaTypes = [];
    if (state.scrapeMovie)
        mediaTypes.push('movie');
    if (state.scrapeShow)
        mediaTypes.push('show');
    return {
        ...state,
        type: 'source',
        disabled: state.disabled ?? false,
        externalSource: state.externalSource ?? false,
        mediaTypes,
    };
}
export function makeEmbed(state) {
    return {
        ...state,
        type: 'embed',
        disabled: state.disabled ?? false,
        mediaTypes: undefined,
    };
}
