/**
 * Your own 1–10 ratings, kept in this browser (no account needed). When Trakt is connected they're
 * sent there too (Community), and Trakt's value wins when it has one.
 */
import { useSyncExternalStore } from 'react';
import type { MediaType } from './tmdb';

const KEY = 'charcoal:ratings';
const read = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
};
let map = typeof window !== 'undefined' ? read() : {};
const subs = new Set<() => void>();
const k = (type: MediaType, id: number) => `${type}-${id}`;

export function setLocalRating(type: MediaType, id: number, n: number | null) {
  map = { ...map };
  if (n) map[k(type, id)] = n;
  else delete map[k(type, id)];
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage blocked: in memory only */
  }
  subs.forEach((f) => f());
}

export const useLocalRating = (type: MediaType, id: number) =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => map[k(type, id)] ?? 0,
  );
