/**
 * The details "peek": a quick pop-up of a title's details, opened from any card or banner with a
 * right-click or Shift-click (and from the player's title block). One is open at a time; the
 * host (PeekHost, in the layout) renders it.
 */
import { useSyncExternalStore } from 'react';
import type { MediaType } from './tmdb';

/** `anchor`: where it was opened from (the card), so the compact peek can sit beside it. */
export type PeekTarget = { type: MediaType; id: number; anchor?: DOMRect } | null;

let current: PeekTarget = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const peek = {
  open(type: MediaType, id: number, anchor?: DOMRect) {
    current = { type, id, anchor };
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
  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    peek.open(type, id, anchorFor(e));
  };
  return {
    onContextMenu: open,
    onClickCapture: (e: React.MouseEvent) => {
      if (!e.shiftKey) return;
      e.stopPropagation();
      open(e);
    },
  };
}

/** The card's box; for something very wide (the Home banner), a point at the pointer instead. */
function anchorFor(e: React.MouseEvent): DOMRect {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return r.width > window.innerWidth * 0.5 ? new DOMRect(e.clientX, e.clientY, 0, 0) : r;
}
