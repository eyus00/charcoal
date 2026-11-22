/**
 * Letterboxd: its API isn't open, so Charcoal links to its pages (letterboxd.com/tmdb/<id> goes
 * to the film) and imports its data export: watchlist.csv → "To watch", watched.csv → "Watched".
 * Films are matched to TMDB by title and year.
 */
import { actions, getState, type WatchStatus } from './store';
import { tmdb, type MediaItem, type Page } from './tmdb';

export const letterboxdUrl = (tmdbId: number) => `https://letterboxd.com/tmdb/${tmdbId}/`;

/** A small CSV reader (quoted fields, commas and newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export interface ImportResult {
  added: number;
  skipped: number;
  notFound: string[];
}

/**
 * Import Letterboxd export files. Which list a file is comes from its name ("watchlist" →
 * To watch, anything else with films → Watched). Existing entries are left alone.
 */
export async function importLetterboxd(files: File[], onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const rows: { name: string; year: string; status: WatchStatus }[] = [];
  for (const f of files) {
    const status: WatchStatus = /watchlist/i.test(f.name) ? 'planned' : 'completed';
    for (const r of parseCsv(await f.text())) if (r.Name) rows.push({ name: r.Name, year: r.Year ?? '', status });
  }
  // A film in both lists counts as watched.
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = `${r.name.toLowerCase()}|${r.year}`;
    if (!byKey.has(k) || r.status === 'completed') byKey.set(k, r);
  }
  const list = [...byKey.values()];
  const result: ImportResult = { added: 0, skipped: 0, notFound: [] };
  let done = 0;
  onProgress(0, list.length);
  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(
      list.slice(i, i + 5).map(async (r) => {
        try {
          const page = await tmdb<Page<MediaItem>>('/search/movie', { query: r.name, year: r.year || undefined });
          const m = page.results[0];
          if (!m) return void result.notFound.push(r.name);
          if (getState().watchlist.some((w) => w.mediaType === 'movie' && w.id === m.id)) return void result.skipped++;
          actions.setBookmark({
            id: m.id,
            mediaType: 'movie',
            title: m.title ?? r.name,
            posterPath: m.poster_path,
            releaseDate: m.release_date,
            ratingScore: m.vote_average,
            status: r.status,
          });
          result.added++;
        } catch {
          result.notFound.push(r.name);
        } finally {
          onProgress(++done, list.length);
        }
      }),
    );
  }
  return result;
}
