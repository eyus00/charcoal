/**
 * A small on-disk copy of the browsing queries (Home rows, lists, the calendar, light title data),
 * so a return visit paints from cache at once and refreshes in the background. Only these keys,
 * only successful results, capped in size; written when the tab is hidden or closed.
 */
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

const KEY = 'charcoal:query-cache';
const VERSION = 1;
const MAX_AGE = 24 * 60 * 60_000;
const MAX_BYTES = 1_500_000;
const KEEP = new Set(['hybrid', 'trending', 'trending-pages', 'list', 'lite', 'schedule', 'discover', 'discover-language', 'sports-directory', 'release-dates', 'season', 'details']);

export function persistQueries(client: QueryClient) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { v: number; at: number; state: DehydratedState };
      if (saved.v === VERSION && Date.now() - saved.at < MAX_AGE) hydrate(client, saved.state);
      else localStorage.removeItem(KEY);
    }
  } catch {
    localStorage.removeItem(KEY);
  }

  const save = () => {
    try {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (q) => q.state.status === 'success' && KEEP.has(String(q.queryKey[0])) && Date.now() - q.state.dataUpdatedAt < MAX_AGE,
      });
      // Newest first; drop the oldest until it fits.
      state.queries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
      let json = JSON.stringify({ v: VERSION, at: Date.now(), state });
      while (json.length > MAX_BYTES && state.queries.length) {
        state.queries.splice(Math.floor(state.queries.length * 0.75));
        json = JSON.stringify({ v: VERSION, at: Date.now(), state });
      }
      localStorage.setItem(KEY, json);
    } catch {
      /* storage full or blocked: skip */
    }
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  window.addEventListener('pagehide', save);
}
