/**
 * Matching a title against what a site calls it. Sites that are searched by name (most anime and
 * regional catalogues) rarely use the name a metadata service does: romanised or native titles,
 * "Season 2" suffixes, a different transliteration, punctuation. One shared matcher, fed with every
 * name a title is known by, keeps each provider from inventing its own (usually stricter) one.
 */

const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8' };

/** Lower case, without accents, punctuation, a leading article or season/part decoration. */
export function normalizeTitle(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((w) => ROMAN[w] ?? w)
    .join(' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

const bigrams = (s: string): Map<string, number> => {
  const out = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
  return out;
};

/** 0…1: 1 for the same title after normalisation, otherwise how much of their letter pairs they share. */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let shared = 0;
  let total = 0;
  for (const [k, n] of A) {
    shared += Math.min(n, B.get(k) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return (2 * shared) / total;
}

export interface TitleCandidate {
  title: string;
  altTitles?: string[];
  year?: number;
}

export interface MatchOptions {
  /** Lowest score accepted. Default 0.84: "Demon Slayer" does not match "Demon Slayer Movie". */
  minScore?: number;
  /** How far a candidate's year may be from the title's and still be the same work. Default 1. */
  yearTolerance?: number;
}

/**
 * The candidate that is the wanted title, or undefined when none is close enough. Every name of the
 * title is compared with every name of the candidate; a year that is known on both sides and too
 * far apart rules a candidate out (remakes, sequels listed under the same name).
 */
export function bestTitleMatch<T extends TitleCandidate>(candidates: T[], wanted: { title: string; altTitles?: string[]; year?: number }, o: MatchOptions = {}): { item: T; score: number } | undefined {
  const names = [wanted.title, ...(wanted.altTitles ?? [])].filter(Boolean);
  let best: { item: T; score: number } | undefined;
  for (const item of candidates) {
    if (wanted.year && item.year && Math.abs(wanted.year - item.year) > (o.yearTolerance ?? 1)) continue;
    let score = 0;
    for (const theirs of [item.title, ...(item.altTitles ?? [])]) for (const ours of names) score = Math.max(score, titleSimilarity(ours, theirs));
    // The same year breaks a tie between equally named entries.
    if (wanted.year && item.year === wanted.year) score = Math.min(1, score + 0.02);
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= (o.minScore ?? 0.84) ? best : undefined;
}
