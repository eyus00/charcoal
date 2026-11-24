/**
 * Language-aware discovery: finding regional cinema on TMDB by original language, matching
 * titles across scripts and transliterations, and reading audio languages out of release names.
 */

export const INDIAN_LANGUAGES: { code: string; name: string; industry: string }[] = [
  { code: 'hi', name: 'Hindi', industry: 'Bollywood' },
  { code: 'ta', name: 'Tamil', industry: 'Kollywood' },
  { code: 'te', name: 'Telugu', industry: 'Tollywood' },
  { code: 'ml', name: 'Malayalam', industry: 'Mollywood' },
  { code: 'kn', name: 'Kannada', industry: 'Sandalwood' },
  { code: 'bn', name: 'Bengali', industry: 'Bengali cinema' },
  { code: 'mr', name: 'Marathi', industry: 'Marathi cinema' },
  { code: 'pa', name: 'Punjabi', industry: 'Punjabi cinema' },
  { code: 'gu', name: 'Gujarati', industry: 'Gujarati cinema' },
  { code: 'or', name: 'Odia', industry: 'Odia cinema' },
  { code: 'as', name: 'Assamese', industry: 'Assamese cinema' },
  { code: 'ur', name: 'Urdu', industry: 'Urdu cinema' },
];

/**
 * TMDB /discover query params for a language (and optionally region/sort/year), e.g.
 * { with_original_language: 'ta', region: 'IN', sort_by: 'popularity.desc' }.
 *
 * The two endpoints name things differently. /discover/movie takes `region` (which country's
 * release dates count) and `primary_release_year`; /discover/tv has no `region`, so there the
 * region becomes `with_origin_country` and the year `first_air_date_year`.
 */
export function discoverParams(opts: {
  language: string;
  type: 'movie' | 'tv';
  region?: string;
  sortBy?: string;
  year?: number;
  page?: number;
}): Record<string, string> {
  const language = opts.language.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(language)) throw new RangeError(`Language must be an ISO 639-1 code, got "${opts.language}"`);
  const params: Record<string, string> = { with_original_language: language };

  if (opts.region !== undefined) {
    const region = opts.region.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) throw new RangeError(`Region must be an ISO 3166-1 alpha-2 code, got "${opts.region}"`);
    params[opts.type === 'movie' ? 'region' : 'with_origin_country'] = region;
  }
  params.sort_by = opts.sortBy ?? 'popularity.desc';
  if (opts.year !== undefined) {
    if (!Number.isInteger(opts.year) || opts.year < 1870) throw new RangeError(`Year must be a four-digit year, got ${opts.year}`);
    params[opts.type === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = String(opts.year);
  }
  if (opts.page !== undefined) {
    // TMDB serves pages 1 to 500.
    if (!Number.isInteger(opts.page) || opts.page < 1 || opts.page > 500) throw new RangeError(`Page must be between 1 and 500, got ${opts.page}`);
    params.page = String(opts.page);
  }
  return params;
}

// ---------- language names ----------

/** Names as they appear in release names and site labels → ISO 639-1. */
const LANGUAGE_NAMES = new Map<string, string>([
  ['hindi', 'hi'],
  ['tamil', 'ta'],
  ['telugu', 'te'],
  ['malayalam', 'ml'],
  ['kannada', 'kn'],
  ['bengali', 'bn'],
  ['bangla', 'bn'],
  ['marathi', 'mr'],
  ['punjabi', 'pa'],
  ['gujarati', 'gu'],
  ['odia', 'or'],
  ['oriya', 'or'],
  ['assamese', 'as'],
  ['urdu', 'ur'],
  ['english', 'en'],
  ['japanese', 'ja'],
  ['korean', 'ko'],
  ['chinese', 'zh'],
  ['mandarin', 'zh'],
  ['cantonese', 'zh'],
  ['spanish', 'es'],
  ['french', 'fr'],
  ['german', 'de'],
  ['italian', 'it'],
  ['russian', 'ru'],
  ['portuguese', 'pt'],
  ['arabic', 'ar'],
  ['turkish', 'tr'],
  ['thai', 'th'],
  ['vietnamese', 'vi'],
  ['indonesian', 'id'],
  ['malay', 'ms'],
  ['nepali', 'ne'],
  ['sinhala', 'si'],
  ['persian', 'fa'],
]);

/**
 * Three-letter forms ("Tam+Tel+Hin"). Most are also ordinary words or names (Ben, Mar, Tel, Chi),
 * so detectAudioLanguages only believes them next to another language or inside a language tag.
 */
const LANGUAGE_ABBREVIATIONS = new Map<string, string>([
  ['hin', 'hi'],
  ['tam', 'ta'],
  ['tel', 'te'],
  ['mal', 'ml'],
  ['kan', 'kn'],
  ['ben', 'bn'],
  ['mar', 'mr'],
  ['pun', 'pa'],
  ['pan', 'pa'],
  ['guj', 'gu'],
  ['ori', 'or'],
  ['odi', 'or'],
  ['asm', 'as'],
  ['urd', 'ur'],
  ['eng', 'en'],
  ['jpn', 'ja'],
  ['jap', 'ja'],
  ['kor', 'ko'],
  ['chi', 'zh'],
  ['zho', 'zh'],
  ['spa', 'es'],
  ['fre', 'fr'],
  ['fra', 'fr'],
  ['ger', 'de'],
  ['deu', 'de'],
  ['ita', 'it'],
  ['rus', 'ru'],
  ['por', 'pt'],
  ['ara', 'ar'],
  ['tur', 'tr'],
  ['tha', 'th'],
  ['vie', 'vi'],
]);

// ---------- titles ----------

/**
 * Marks that are optional decoration: the accents used on Latin, Greek and Cyrillic letters, and
 * Arabic and Hebrew vowel points. Marks that are part of how a script spells a word are NOT in
 * here: Indic vowel signs (बाहुबली without them is बहबल) and the kana voicing marks (が / か).
 */
const OPTIONAL_MARKS =
  /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-֑︯-ׇֽֿׁׂׅׄـً-ٰٟ]/g;

/** Latin letters that have no decomposition but are routinely typed without their stroke or ligature. */
const LETTER_FOLDS = new Map<string, string>([
  ['ø', 'o'],
  ['đ', 'd'],
  ['ð', 'd'],
  ['ł', 'l'],
  ['ħ', 'h'],
  ['ı', 'i'],
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['þ', 'th'],
]);
const FOLDABLE = new RegExp(`[${[...LETTER_FOLDS.keys()].join('')}]`, 'g');

const APOSTROPHES = /['’‘ʼ`´]/g;

/**
 * Titles and release names come from scraped pages. Nothing real is longer than this, and the cap
 * keeps the pattern matching below cheap whatever a page sends.
 */
const MAX_INPUT = 400;

const LANGUAGE_PATTERN = [...LANGUAGE_NAMES.keys()].join('|');
/** Words that, alone or together inside a trailing bracket, say nothing about which title it is. */
const TAG_WORD = new RegExp(
  `^(?:(?:19|20)\\d{2}|${LANGUAGE_PATTERN}|dub|dubbed|dual|multi|audio|version|sub|subs|subbed|uncut|unrated|extended|cut|edition|original|org)$`,
);
/** "… - Hindi Dubbed", "… Tamil + Telugu Dub": the same tag written without brackets. (Whitespace is single spaces by now.) */
const DUB_SUFFIX = new RegExp(
  `(?: in)? (?:${LANGUAGE_PATTERN})(?: ?[-+&/,] ?(?:${LANGUAGE_PATTERN}))* (?:dubbed|dub)(?: (?:movie|version))?$`,
);
const TRAILING_BRACKET = / ?[([{]([^()[\]{}]*)[)\]}]$/;
const TRAILING_SEPARATORS = /[ \-–—:|]+$/;

function isTag(bracketContent: string): boolean {
  const words = bracketContent.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');
  return words.length > 0 && words.every((word) => TAG_WORD.test(word));
}

/** Removes "(2019)", "[Hindi Dubbed]", "- Tamil Dubbed" and the like from the end, as often as they repeat. */
function stripTrailingTags(lowerCased: string): string {
  let title = lowerCased.replace(/\s+/g, ' ').trim();
  for (;;) {
    const bracket = TRAILING_BRACKET.exec(title);
    const dub = bracket ? null : DUB_SUFFIX.exec(title);
    const cutAt = bracket && isTag(bracket[1] ?? '') ? bracket.index : dub ? dub.index : -1;
    const rest = cutAt < 0 ? '' : title.slice(0, cutAt).replace(TRAILING_SEPARATORS, '');
    // Nothing to cut, or a title that is nothing but a tag ("(2019)"): done.
    if (rest === '') return title;
    title = rest;
  }
}

/**
 * Normalises a title for matching across scripts and transliterations: NFKD, strip combining
 * marks, lower-case, drop punctuation, collapse whitespace, strip a trailing "(2019)" year and
 * common suffixes like "(Hindi Dubbed)".
 *
 * Details: only optional marks are stripped (see OPTIONAL_MARKS); "&" reads as "and"; apostrophes
 * vanish instead of splitting a word ("Don't" → "dont"); ø, ł, ß, æ … fold to plain letters.
 */
export function normalizeTitle(title: string): string {
  const folded = title
    .slice(0, MAX_INPUT)
    .normalize('NFKD')
    .replace(OPTIONAL_MARKS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(FOLDABLE, (letter) => LETTER_FOLDS.get(letter) ?? letter);
  return stripTrailingTags(folded)
    .replace(APOSTROPHES, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

const ROMAN_NUMERAL = /^(?:i{1,3}|iv|vi{0,3}|ix|x)$/;

/** Words of `longer` that `shorter` doesn't account for (each word of `shorter` cancels one). */
function extraWords(longer: string, shorter: string): string[] {
  const unmatched = shorter.split(' ');
  return longer.split(' ').filter((word) => {
    const at = unmatched.indexOf(word);
    if (at < 0) return true;
    unmatched.splice(at, 1);
    return false;
  });
}

function sameTitle(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length / longer.length < 0.8 || !longer.includes(shorter)) return false;
  // "Drishyam" is not "Drishyam 2", and "Ponniyin Selvan I" is not "Ponniyin Selvan II".
  return !extraWords(longer, shorter).some((word) => /\p{N}/u.test(word) || ROMAN_NUMERAL.test(word));
}

/**
 * True when any of `candidates` matches any of `wanted` after normalisation (exact, or one
 * contains the other with length ratio ≥ 0.8). A containment match is refused when what the longer
 * title adds is a number, so a sequel never matches the original.
 */
export function titlesMatch(wanted: string[], candidates: string[]): boolean {
  const normalised = (titles: string[]) => [...new Set(titles.map(normalizeTitle))].filter((title) => title !== '');
  const have = normalised(candidates);
  return normalised(wanted).some((want) => have.some((candidate) => sameTitle(want, candidate)));
}

// ---------- audio languages in release names ----------

/** A language followed by one of these names subtitles, not audio ("English Subs"). */
const SUBTITLE_WORDS = new Set(['sub', 'subs', 'subbed', 'subtitle', 'subtitles']);
/** A language followed by one of these is audio wherever it stands ("Hindi Dubbed"). */
const AUDIO_WORDS = new Set(['dub', 'dubbed', 'audio']);
/** Words that may sit next to languages inside an audio tag: "[Hindi DD5.1 + English AAC]". */
const AUDIO_NOISE = /^(?:audios?|dub(?:bed)?|dual|multi|org|original|line|clean|aac|ac3|eac3|dts|atmos|ddp?\d*|ch|[em]?subs?|subbed|subtitles?)$/;
/** A year or an episode marker: in a release name the title is before it and the tags are after. */
const YEAR = /^(?:19|20)\d{2}$/;
const EPISODE_MARKER = /^s\d{1,2}(?:e\d{1,3})?$/;

/**
 * Audio languages named in a release/file name: "Hindi-Tamil-Telugu", "[Hin+Eng]", "Dual Audio",
 * "Multi Audio" → ISO 639-1 codes (and 'multi' when only "multi/dual audio" is stated), in the
 * order they appear.
 *
 * A language word in the title itself must not count ("The.English.Patient.1996.1080p" has no
 * language tag), so a word is believed only where tags go:
 *  - after the last year or SxxEyy marker (anywhere, if the name has no such marker);
 *  - in a chain joined by + - / & , | ("Hindi-English");
 *  - right before "dubbed" / "dub" / "audio";
 *  - inside brackets that hold nothing but languages and audio words (a name that is nothing
 *    but that, such as the label "Eng", counts as one).
 * Three-letter forms ("Tam", "Eng") are ordinary words and names too. Outside the last three
 * places they count only next to another language or after a year ("Movie.2019.Tam.720p"), and
 * not after an episode marker, where an episode title may follow ("S01E05.Ben.Returns").
 * A language followed by "sub(s)" is a subtitle language and is ignored.
 *
 * Known gaps: a language word in an episode title ("S01E05.The.French.Connection") or in a name
 * with no year or episode marker ("The English Patient") is taken for a tag.
 */
export function detectAudioLanguages(name: string): string[] {
  const text = name.slice(0, MAX_INPUT).normalize('NFKC').toLowerCase().replace(/_/g, ' ');
  const tokens = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({ word: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));

  const codes = tokens.map((token, i) => {
    const next = tokens[i + 1];
    if (next && SUBTITLE_WORDS.has(next.word)) return undefined;
    return LANGUAGE_NAMES.get(token.word) ?? LANGUAGE_ABBREVIATIONS.get(token.word);
  });

  let tagStart = 0;
  let marker: 'year' | 'episode' | undefined;
  for (const token of tokens) {
    const kind = YEAR.test(token.word) ? 'year' : EPISODE_MARKER.test(token.word) ? 'episode' : undefined;
    if (kind === undefined) continue;
    tagStart = token.end;
    marker = kind;
  }
  const accepted = new Set<number>();

  // Runs of neighbouring language words.
  for (let first = 0; first < tokens.length; first++) {
    if (codes[first] === undefined) continue;
    let last = first;
    while (codes[last + 1] !== undefined) last++;
    const run = tokens.slice(first, last + 1);
    const inTags = tokens[first].start >= tagStart;
    const chained = run.length > 1 && run.slice(1).every((token, i) => /[+\-/&,|]/.test(text.slice(run[i].end, token.start)));
    const after: { word: string } | undefined = tokens[last + 1];
    const named = after !== undefined && AUDIO_WORDS.has(after.word);
    for (let i = first; i <= last; i++) {
      const isFullName = LANGUAGE_NAMES.has(tokens[i].word);
      if (named || chained || (inTags && (run.length > 1 || isFullName || marker === 'year'))) accepted.add(i);
    }
    first = last;
  }

  // Brackets (and a name that is itself just a tag) holding only languages and audio words.
  const groups: { from: number; to: number; digitsAllowed: boolean }[] = [{ from: 0, to: text.length, digitsAllowed: false }];
  for (const match of text.matchAll(/[[({]([^[\](){}]*)[\])}]/g)) {
    const from = match.index ?? 0;
    groups.push({ from, to: from + match[0].length, digitsAllowed: true });
  }
  for (const group of groups) {
    const inside = tokens.map((token, i) => ({ token, i })).filter(({ token }) => token.start >= group.from && token.end <= group.to);
    const languages = inside.filter(({ i }) => codes[i] !== undefined);
    const onlyAudio = inside.every(
      ({ token, i }) => codes[i] !== undefined || AUDIO_NOISE.test(token.word) || (group.digitsAllowed && /^\d+$/.test(token.word)),
    );
    if (onlyAudio) for (const { i } of languages) accepted.add(i);
  }

  const found = [...new Set([...accepted].sort((a, b) => a - b).map((i) => codes[i]!))];
  if (found.length > 0) return found;

  const multi =
    /(?:dual|multi)[\s.-]*(?:audio|lang)/.test(text) ||
    (marker !== undefined && tokens.some((token) => (token.word === 'dual' || token.word === 'multi') && token.start >= tagStart));
  return multi ? ['multi'] : [];
}
