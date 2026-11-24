import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDIAN_LANGUAGES, detectAudioLanguages, discoverParams, normalizeTitle, titlesMatch } from './languages.js';

// ---------- languages ----------

test('lists the Indian languages with their ISO 639-1 codes', () => {
  assert.deepEqual(
    INDIAN_LANGUAGES.map((language) => language.code),
    ['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'or', 'as', 'ur'],
  );
  const byCode = new Map(INDIAN_LANGUAGES.map((language) => [language.code, language]));
  assert.deepEqual(byCode.get('hi'), { code: 'hi', name: 'Hindi', industry: 'Bollywood' });
  assert.deepEqual(byCode.get('ta'), { code: 'ta', name: 'Tamil', industry: 'Kollywood' });
  assert.deepEqual(byCode.get('te'), { code: 'te', name: 'Telugu', industry: 'Tollywood' });
  assert.deepEqual(byCode.get('ml'), { code: 'ml', name: 'Malayalam', industry: 'Mollywood' });
  assert.deepEqual(byCode.get('kn'), { code: 'kn', name: 'Kannada', industry: 'Sandalwood' });
  assert.equal(byCode.get('or')?.name, 'Odia');
  for (const language of INDIAN_LANGUAGES) assert.ok(language.name && language.industry, language.code);
  assert.equal(byCode.size, INDIAN_LANGUAGES.length, 'codes are unique');
});

test('every listed language is recognised in a release name', () => {
  for (const { code, name } of INDIAN_LANGUAGES) assert.deepEqual(detectAudioLanguages(`Movie.2024.${name}.1080p`), [code], name);
});

// ---------- discover ----------

test('discoverParams builds /discover/movie params', () => {
  assert.deepEqual(discoverParams({ language: 'ta', type: 'movie', region: 'IN' }), {
    with_original_language: 'ta',
    region: 'IN',
    sort_by: 'popularity.desc',
  });
  assert.deepEqual(discoverParams({ language: 'hi', type: 'movie' }), { with_original_language: 'hi', sort_by: 'popularity.desc' });
  assert.deepEqual(discoverParams({ language: 'ml', type: 'movie', region: 'in', sortBy: 'primary_release_date.desc', year: 2024, page: 3 }), {
    with_original_language: 'ml',
    region: 'IN',
    sort_by: 'primary_release_date.desc',
    primary_release_year: '2024',
    page: '3',
  });
});

test('discoverParams uses the TV names for region and year', () => {
  assert.deepEqual(discoverParams({ language: 'ko', type: 'tv', region: 'KR', year: 2021 }), {
    with_original_language: 'ko',
    with_origin_country: 'KR',
    sort_by: 'popularity.desc',
    first_air_date_year: '2021',
  });
  assert.deepEqual(discoverParams({ language: ' TE ', type: 'tv', sortBy: 'vote_average.desc' }), { with_original_language: 'te', sort_by: 'vote_average.desc' });
});

test('discoverParams output goes straight into a query string', () => {
  const query = new URLSearchParams(discoverParams({ language: 'ta', type: 'movie', region: 'IN', year: 2023 })).toString();
  assert.equal(query, 'with_original_language=ta&region=IN&sort_by=popularity.desc&primary_release_year=2023');
});

test('discoverParams rejects values TMDB would not understand', () => {
  assert.throws(() => discoverParams({ language: 'tamil', type: 'movie' }), RangeError);
  assert.throws(() => discoverParams({ language: '', type: 'movie' }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta&x=1', type: 'movie' }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta', type: 'movie', region: 'India' }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta', type: 'movie', year: 23.5 }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta', type: 'movie', year: 99 }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta', type: 'movie', page: 0 }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta', type: 'movie', page: 501 }), RangeError);
  assert.throws(() => discoverParams({ language: 'ta', type: 'movie', page: 1.5 }), RangeError);
});

// ---------- normalizeTitle ----------

test('normalizeTitle folds case, diacritics and width', () => {
  assert.equal(normalizeTitle('Pokémon: The First Movie'), 'pokemon the first movie');
  assert.equal(normalizeTitle('Amélie'), 'amelie');
  assert.equal(normalizeTitle('Nausicaä of the Valley of the Wind'), 'nausicaa of the valley of the wind');
  assert.equal(normalizeTitle('Shōgun'), 'shogun');
  assert.equal(normalizeTitle('Đại Chiến Titan'), 'dai chien titan');
  assert.equal(normalizeTitle('İstanbul Kırmızısı'), 'istanbul kirmizisi');
  assert.equal(normalizeTitle('Bodø/Glimt'), 'bodo glimt');
  assert.equal(normalizeTitle('Straße'), 'strasse');
  assert.equal(normalizeTitle('Ｆｕｌｌ　Ｗｉｄｔｈ'), 'full width');
  assert.equal(normalizeTitle('Ελληνικά Τίτλος'), 'ελληνικα τιτλος');
  // Decomposed and precomposed input give the same result.
  assert.equal(normalizeTitle('Pokémon'), normalizeTitle('Pokémon'));
  assert.equal(normalizeTitle('Pokémon'), 'pokemon');
});

test('normalizeTitle keeps the marks a script needs to spell a word', () => {
  // Devanagari vowel signs are combining marks; without them the word is a different word.
  assert.equal(normalizeTitle('बाहुबली: द बिगनिंग'), 'बाहुबली द बिगनिंग');
  assert.equal(normalizeTitle('பொன்னியின் செல்வன்'), 'பொன்னியின் செல்வன்');
  assert.equal(normalizeTitle('ബാഹുബലി'), 'ബാഹുബലി');
  assert.notEqual(normalizeTitle('की'), normalizeTitle('का'));
  // Kana voicing marks: が is not か.
  assert.equal(normalizeTitle('ドラゴンボール'), 'ドラゴンボール');
  assert.notEqual(normalizeTitle('がき'), normalizeTitle('かき'));
  assert.equal(normalizeTitle('ｶﾞｷ'), 'ガキ', 'half-width kana are composed');
  // Hangul and CJK pass through.
  assert.equal(normalizeTitle('진격의 거인'), '진격의 거인');
  assert.equal(normalizeTitle('進撃の巨人'), '進撃の巨人');
  // Arabic and Hebrew vowel points are optional and are dropped.
  assert.equal(normalizeTitle('مُحَمَّد'), 'محمد');
  assert.equal(normalizeTitle('שָׁלוֹם'), 'שלום');
});

test('normalizeTitle drops punctuation and collapses whitespace', () => {
  assert.equal(normalizeTitle('  Spider-Man:   No Way Home  '), 'spider man no way home');
  assert.equal(normalizeTitle('K.G.F: Chapter 2'), 'k g f chapter 2');
  assert.equal(normalizeTitle('Fast & Furious'), 'fast and furious');
  assert.equal(normalizeTitle('Tom&Jerry'), 'tom and jerry');
  assert.equal(normalizeTitle('What If...?'), 'what if');
  assert.equal(normalizeTitle('Mission: Impossible – Dead Reckoning'), 'mission impossible dead reckoning');
  assert.equal(normalizeTitle('Movie\t(Part 2)\n'), 'movie part 2');
  assert.equal(normalizeTitle(''), '');
  assert.equal(normalizeTitle('?!…'), '');
});

test('normalizeTitle treats every kind of apostrophe alike', () => {
  const variants = ["L'Attaque des Titans", 'L’Attaque des Titans', 'L`attaque des Titans', 'LʼAttaque des Titans'];
  for (const variant of variants) assert.equal(normalizeTitle(variant), 'lattaque des titans', variant);
  assert.equal(normalizeTitle("Don't Breathe"), 'dont breathe');
});

test('normalizeTitle strips a trailing year and language / dub tags', () => {
  assert.equal(normalizeTitle('Amélie (2001)'), 'amelie');
  assert.equal(normalizeTitle('Dangal [2016]'), 'dangal');
  assert.equal(normalizeTitle('Baahubali 2: The Conclusion (Hindi Dubbed)'), 'baahubali 2 the conclusion');
  assert.equal(normalizeTitle('Drishyam (Hindi) (2015)'), 'drishyam');
  assert.equal(normalizeTitle('RRR [Tamil + Telugu] (2022)'), 'rrr');
  assert.equal(normalizeTitle('Vikram (Tamil Version)'), 'vikram');
  assert.equal(normalizeTitle('Kantara (Dual Audio)'), 'kantara');
  assert.equal(normalizeTitle('Jawan   (2023)   [Hindi  Dubbed]'), 'jawan');
  assert.equal(normalizeTitle('KGF Chapter 2 Hindi Dubbed'), 'kgf chapter 2');
  assert.equal(normalizeTitle('Pushpa: The Rise - Hindi Dubbed'), 'pushpa the rise');
  assert.equal(normalizeTitle('Leo (2023) Tamil-Telugu Dub'), 'leo');
  assert.equal(normalizeTitle('Salaar（２０２３）'), 'salaar', 'full-width brackets and digits');
});

test('normalizeTitle leaves alone what is part of the title', () => {
  assert.equal(normalizeTitle('2012'), '2012');
  assert.equal(normalizeTitle('Blade Runner 2049'), 'blade runner 2049');
  assert.equal(normalizeTitle('(500) Days of Summer'), '500 days of summer');
  assert.equal(normalizeTitle('Dangal (दंगल)'), 'dangal दंगल');
  assert.equal(normalizeTitle('Movie (Part 2)'), 'movie part 2');
  assert.equal(normalizeTitle('Hindi Medium'), 'hindi medium');
  assert.equal(normalizeTitle('English Vinglish'), 'english vinglish');
  assert.equal(normalizeTitle('The Dubbed'), 'the dubbed');
  // A title that is only a tag is not emptied.
  assert.equal(normalizeTitle('(2019)'), '2019');
  assert.equal(normalizeTitle('[Hindi]'), 'hindi');
});

test('normalizeTitle copes with hostile input quickly', () => {
  const started = Date.now();
  for (const input of [' '.repeat(200_000) + 'x', '('.repeat(200_000), '-'.repeat(200_000) + 'a', 'hindi '.repeat(50_000) + 'dubbed', 'a'.repeat(1_000_000)]) {
    assert.ok(normalizeTitle(input).length <= 400);
    assert.ok(detectAudioLanguages(input).length <= 1);
  }
  assert.ok(Date.now() - started < 2000);
});

// ---------- titlesMatch ----------

test('titlesMatch: equal after normalisation', () => {
  assert.ok(titlesMatch(['Pokémon'], ['POKEMON (1997)']));
  assert.ok(titlesMatch(['Spider-Man: No Way Home'], ['Spider Man No Way Home [Hindi]']));
  assert.ok(titlesMatch(['Baahubali 2: The Conclusion'], ['Baahubali 2 - The Conclusion (Hindi Dubbed) (2017)']));
  assert.ok(titlesMatch(['बाहुबली'], ['बाहुबली (2015)']));
  assert.ok(!titlesMatch(['बाहुबली'], ['बहुबल']));
});

test('titlesMatch: any wanted title against any candidate', () => {
  const wanted = ['Attack on Titan', 'Shingeki no Kyojin', '進撃の巨人'];
  assert.ok(titlesMatch(wanted, ['Some Other Show', 'shingeki no kyojin']));
  assert.ok(titlesMatch(wanted, ['進撃の巨人 (2013)']));
  assert.ok(!titlesMatch(wanted, ['Attack on Tomorrow', 'Titan']));
  assert.ok(!titlesMatch([], ['Attack on Titan']));
  assert.ok(!titlesMatch(wanted, []));
  assert.ok(!titlesMatch(['…'], ['!!!']), 'titles that normalise to nothing never match');
});

test('titlesMatch: containment needs a length ratio of at least 0.8', () => {
  assert.ok(titlesMatch(['Attack on Titan'], ['Attack on Titans']), '15 of 16 characters');
  assert.ok(titlesMatch(['The Kashmir Files'], ['Kashmir Files Movie']) === false, 'neither contains the other');
  assert.ok(titlesMatch(['Vikram Vedha'], ['Vikram Vedha HD']), '12 of 15');
  assert.ok(!titlesMatch(['Vikram'], ['Vikram Vedha']), '6 of 12');
  assert.ok(!titlesMatch(['Titan'], ['Attack on Titan']));
  assert.ok(!titlesMatch(['The Family Man'], ['Family Man']), '10 of 14');
});

test('titlesMatch: a sequel is not the original', () => {
  assert.ok(!titlesMatch(['Drishyam'], ['Drishyam 2']), 'ratio is exactly 0.8, but the extra word is a number');
  assert.ok(!titlesMatch(['Baahubali'], ['Baahubali 2']));
  assert.ok(!titlesMatch(['Ponniyin Selvan I'], ['Ponniyin Selvan II']));
  assert.ok(!titlesMatch(['Ponniyin Selvan'], ['Ponniyin Selvan II']));
  assert.ok(!titlesMatch(['Apollo 1'], ['Apollo 13']));
  assert.ok(!titlesMatch(['進撃の巨人'], ['進撃の巨人2']));
  assert.ok(titlesMatch(['Drishyam 2'], ['Drishyam 2 (Hindi)']));
});

// ---------- detectAudioLanguages ----------

test('detectAudioLanguages: the forms release names use', () => {
  assert.deepEqual(detectAudioLanguages('Hindi-Tamil-Telugu'), ['hi', 'ta', 'te']);
  assert.deepEqual(detectAudioLanguages('[Hin+Eng]'), ['hi', 'en']);
  assert.deepEqual(detectAudioLanguages('Dual Audio'), ['multi']);
  assert.deepEqual(detectAudioLanguages('Multi Audio'), ['multi']);
  assert.deepEqual(detectAudioLanguages('Movie.Name.2019.1080p.WEB-DL.Hindi-English.x264'), ['hi', 'en']);
  assert.deepEqual(detectAudioLanguages('RRR (2022) [Tam + Tel + Hin + Mal + Kan] 1080p'), ['ta', 'te', 'hi', 'ml', 'kn']);
  assert.deepEqual(detectAudioLanguages('Movie 2019 [Hindi DD5.1 + English DD5.1] 1080p'), ['hi', 'en']);
  assert.deepEqual(detectAudioLanguages('Show.S02E05.Tamil.Telugu.720p.ESub'), ['ta', 'te']);
  assert.deepEqual(detectAudioLanguages('Movie_2019_Bangla_Marathi_HDRip'), ['bn', 'mr']);
  assert.deepEqual(detectAudioLanguages('Movie.2019.Tam.Tel.720p'), ['ta', 'te']);
  assert.deepEqual(detectAudioLanguages('Movie.2019.Tam.720p'), ['ta']);
  assert.deepEqual(detectAudioLanguages('Movie.2019.iTA.ENG.1080p.BluRay'), ['it', 'en']);
});

test('detectAudioLanguages: "multi" only when no language is named', () => {
  assert.deepEqual(detectAudioLanguages('Movie Name (2021) Dual Audio [Hindi-English] 720p'), ['hi', 'en']);
  assert.deepEqual(detectAudioLanguages('Movie (2021) 1080p Multi-Audio'), ['multi']);
  assert.deepEqual(detectAudioLanguages('Movie.2021.DualAudio.720p'), ['multi']);
  assert.deepEqual(detectAudioLanguages('Movie.2019.MULTi.1080p.BluRay'), ['multi']);
  assert.deepEqual(detectAudioLanguages('Multi Audio Hindi Tamil'), ['hi', 'ta']);
  // The word alone, with nothing that marks a release name, is a title.
  assert.deepEqual(detectAudioLanguages('Dual'), []);
  assert.deepEqual(detectAudioLanguages('Multi'), []);
});

test('detectAudioLanguages: dubbed / audio markers work anywhere', () => {
  assert.deepEqual(detectAudioLanguages('KGF Hindi Dubbed 2018'), ['hi']);
  assert.deepEqual(detectAudioLanguages('Kantara (Telugu Dub) 2022 1080p'), ['te']);
  assert.deepEqual(detectAudioLanguages('Movie 2019 720p HEVC Kannada HQ Dub'), ['kn']);
  assert.deepEqual(detectAudioLanguages('Jawan 2023 Hindi ORG 1080p'), ['hi']);
  assert.deepEqual(detectAudioLanguages('Leo Tamil Audio 2023'), ['ta']);
});

test('detectAudioLanguages: a language word in the title is not a language tag', () => {
  assert.deepEqual(detectAudioLanguages('The.English.Patient.1996.1080p.BluRay.x264'), []);
  assert.deepEqual(detectAudioLanguages('English.Vinglish.2012.Hindi.1080p'), ['hi']);
  assert.deepEqual(detectAudioLanguages('Hindi.Medium.2017.1080p.BluRay'), []);
  assert.deepEqual(detectAudioLanguages('The.French.Dispatch.2021.French.English.2160p'), ['fr', 'en']);
  assert.deepEqual(detectAudioLanguages('Tel Aviv on Fire 2018 1080p'), []);
  assert.deepEqual(detectAudioLanguages('Ben-Hur.1959.1080p'), []);
  assert.deepEqual(detectAudioLanguages('Ben 10 S01E01 720p'), []);
  // After an episode marker a three-letter form may be part of the episode title.
  assert.deepEqual(detectAudioLanguages('Show.S01E05.Ben.Returns.720p'), []);
  assert.deepEqual(detectAudioLanguages('Show.S01E05.Hin.Eng.720p'), ['hi', 'en']);
});

test('detectAudioLanguages: subtitle languages are not audio languages', () => {
  assert.deepEqual(detectAudioLanguages('Movie 2020 Japanese [English Sub]'), ['ja']);
  assert.deepEqual(detectAudioLanguages('Movie.2019.Hindi.English.Subs.1080p'), ['hi']);
  assert.deepEqual(detectAudioLanguages('Movie.2019.Korean.ESub.1080p'), ['ko']);
  assert.deepEqual(detectAudioLanguages('Movie 2021 [Eng Sub]'), []);
});

test('detectAudioLanguages: bare labels, order, repeats and junk', () => {
  assert.deepEqual(detectAudioLanguages('Hindi'), ['hi']);
  assert.deepEqual(detectAudioLanguages('ENG'), ['en']);
  assert.deepEqual(detectAudioLanguages('Tamil + Telugu'), ['ta', 'te']);
  assert.deepEqual(detectAudioLanguages('Movie 2020 English Hindi English'), ['en', 'hi'], 'first appearance, once');
  assert.deepEqual(detectAudioLanguages('Movie.2020.Oriya.Odia'), ['or']);
  assert.deepEqual(detectAudioLanguages('ＨＩＮＤＩ'), ['hi'], 'full-width letters');
  assert.deepEqual(detectAudioLanguages(''), []);
  assert.deepEqual(detectAudioLanguages('Movie.2019.1080p.BluRay.x264'), []);
  assert.deepEqual(detectAudioLanguages('constructor.2019.toString.valueOf'), []);
});
