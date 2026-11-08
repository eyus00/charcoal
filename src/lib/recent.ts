/** Recent searches, kept per browser (a convenience; failures are ignored). */
const KEY = 'charcoal:recent-searches';
const MAX = 6;

export function getRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function addRecent(q: string) {
  const v = q.trim();
  if (v.length < 2) return;
  save([v, ...getRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, MAX));
}

export const removeRecent = (q: string) => save(getRecent().filter((x) => x !== q));
export const clearRecent = () => save([]);
/** Put a previous list back (Undo). */
export const restoreRecent = (list: string[]) => save(list.slice(0, MAX));
