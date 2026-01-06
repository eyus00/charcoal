export function normalizeTitle(title) {
    let titleTrimmed = title.trim().toLowerCase();
    if (titleTrimmed !== 'the movie' && titleTrimmed.endsWith('the movie')) {
        titleTrimmed = titleTrimmed.replace('the movie', '');
    }
    if (titleTrimmed !== 'the series' && titleTrimmed.endsWith('the series')) {
        titleTrimmed = titleTrimmed.replace('the series', '');
    }
    return titleTrimmed.replace(/['":]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
}
export function compareTitle(a, b) {
    return normalizeTitle(a) === normalizeTitle(b);
}
export function compareMedia(media, title, releaseYear) {
    // if no year is provided, count as if its the correct year
    const isSameYear = releaseYear === undefined ? true : media.releaseYear === releaseYear;
    return compareTitle(media.title, title) && isSameYear;
}
