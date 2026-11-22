/**
 * The details "peek": a quick pop-up of a title's details, opened from any card or banner with a
 * right-click or Shift-click (and from the player's title block). One is open at a time; the
 * host (PeekHost, in the layout) renders it.
 */
import { useSyncExternalStore } from 'react';
import type { MediaType } from './tmdb';

export type PeekTarget = { type: MediaType; id: number } | null;

let current: PeekTarget = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const peek = {
  open(type: MediaType, id: number) {
    current = { type, id };
    emit();
  },
  close() {
    current = null;
    emit();
  },
};

export const usePeek = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => current,
  );

/**
 * Props for a card's link: right-click or Shift-click opens the peek instead of the browser's
 * menu / a new window. A plain click still follows the link.
 */
export function peekProps(type: MediaType, id: number) {
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      peek.open(type, id);
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      peek.open(type, id);
    },
  };
}
