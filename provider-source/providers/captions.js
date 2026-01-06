import ISO6391 from 'iso-639-1';
export const captionTypes = {
    srt: 'srt',
    vtt: 'vtt',
};
export function getCaptionTypeFromUrl(url) {
    const extensions = Object.keys(captionTypes);
    const type = extensions.find((v) => url.endsWith(`.${v}`));
    if (!type)
        return null;
    return type;
}
export function labelToLanguageCode(label) {
    // extra language codes
    const languageMap = {
        'chinese - hong kong': 'zh',
        'chinese - traditional': 'zh',
        czech: 'cs',
        danish: 'da',
        dutch: 'nl',
        english: 'en',
        'english - sdh': 'en',
        finnish: 'fi',
        french: 'fr',
        german: 'de',
        greek: 'el',
        hungarian: 'hu',
        italian: 'it',
        korean: 'ko',
        norwegian: 'no',
        polish: 'pl',
        portuguese: 'pt',
        'portuguese - brazilian': 'pt',
        romanian: 'ro',
        'spanish - european': 'es',
        'spanish - latin american': 'es',
        spanish: 'es',
        swedish: 'sv',
        turkish: 'tr',
        اَلْعَرَبِيَّةُ: 'ar',
        বাংলা: 'bn',
        filipino: 'tl',
        indonesia: 'id',
        اردو: 'ur',
        English: 'en',
        Arabic: 'ar',
        Bosnian: 'bs',
        Bulgarian: 'bg',
        Croatian: 'hr',
        Czech: 'cs',
        Danish: 'da',
        Dutch: 'nl',
        Estonian: 'et',
        Finnish: 'fi',
        French: 'fr',
        German: 'de',
        Greek: 'el',
        Hebrew: 'he',
        Hungarian: 'hu',
        Indonesian: 'id',
        Italian: 'it',
        Norwegian: 'no',
        Persian: 'fa',
        Polish: 'pl',
        Portuguese: 'pt',
        'Protuguese (BR)': 'pt-br',
        Romanian: 'ro',
        Russian: 'ru',
        russian: 'ru',
        Serbian: 'sr',
        Slovenian: 'sl',
        Spanish: 'es',
        Swedish: 'sv',
        Thai: 'th',
        Turkish: 'tr',
        // Simple language codes
        ng: 'en',
        re: 'fr',
        pa: 'es',
    };
    // First try our mapping
    const mappedCode = languageMap[label.toLowerCase()];
    if (mappedCode)
        return mappedCode;
    // Fallback to ISO6391 library
    const code = ISO6391.getCode(label);
    if (code.length === 0)
        return null;
    return code;
}
export function isValidLanguageCode(code) {
    if (!code)
        return false;
    return ISO6391.validate(code);
}
export function removeDuplicatedLanguages(list) {
    const beenSeen = {};
    return list.filter((sub) => {
        if (beenSeen[sub.language])
            return false;
        beenSeen[sub.language] = true;
        return true;
    });
}
