/**
 * The details "peek": a quick look at a title without leaving the page. One is open at a time;
 * PeekHost (in the layout) renders it.
 *
 * - mini:   hovering a card for a moment (mouse only) opens a small card beside it; it stays
 *           while the pointer is on the card or on it, and closes shortly after it leaves both.
 * - medium: right-click or Shift-click a card / banner opens the larger pop-up with Play,
 *           watchlist and share. On touch screens a tap on a card opens it as a bottom sheet.
 * D (or the expand button) goes to the full details page from either.
 */
import { useSyncExternalStore } from 'react';
import type { MediaType } from './tmdb';

export type PeekMode = 'mini' | 'medium';
/** `anchor`: the card it came from, so the mini peek can sit beside it. */
export type PeekTarget = { type: MediaType; id: number; mode: PeekMode; anchor?: DOMRect } | null;

const HOVER_MS = 700;
/** Moving from one card to the next while a mini peek is open switches faster. */
const SWITCH_MS = 250;
const LEAVE_MS = 220;

let current: PeekTarget = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let hoverTimer = 0;
let leaveTimer = 0;

export const peek = {
  open(type: MediaType, id: number, mode: PeekMode = 'medium', anchor?: DOMRect) {
    window.clearTimeout(hoverTimer);
    window.clearTimeout(leaveTimer);
    current = { type, id, mode, anchor };
    emit();
  },
  close() {
    window.clearTimeout(hoverTimer);
    window.clearTimeout(leaveTimer);
    if (!current) return;
    current = null;
    emit();
  },
  /** The pointer is on the mini peek: keep it. */
  hold() {
    window.clearTimeout(leaveTimer);
  },
  /** The pointer left the mini peek (or its card): close soon, unless it comes back. */
  release() {
    window.clearTimeout(hoverTimer);
    if (current?.mode !== 'mini') return;
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => current?.mode === 'mini' && peek.close(), LEAVE_MS);
  },
  hover(type: MediaType, id: number, el: HTMLElement) {
    window.clearTimeout(leaveTimer);
    window.clearTimeout(hoverTimer);
    if (current?.mode === 'medium') return;
    if (current && current.type === type && current.id === id) return;
    hoverTimer = window.setTimeout(
      () => el.isConnected && peek.open(type, id, 'mini', el.getBoundingClientRect()),
      current?.mode === 'mini' ? SWITCH_MS : HOVER_MS,
    );
  },
  cancelHover() {
    window.clearTimeout(hoverTimer);
  },
};

export const usePeek = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => current,
  );

/** Touch screens without hover (phones, tablets): a tap on a card opens the peek sheet first. */
const touchOnly = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Event props for a card's link (merge them in; usePrefetch already does).
 * - `hover: false`: no mini peek on hover (the Home banner).
 * - `tap: false`: a tap still follows the link on touch screens (Continue watching resumes).
 */
export function peekProps(type: MediaType, id: number, opts: { hover?: boolean; tap?: boolean } = {}) {
  const { hover = true, tap = true } = opts;
  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    peek.open(type, id, 'medium');
  };
  return {
    onContextMenu: open,
    onClickCapture: (e: React.MouseEvent) => {
      if (!e.shiftKey && !(tap && touchOnly())) return;
      e.stopPropagation();
      open(e);
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (hover && e.pointerType === 'mouse' && canHover()) peek.hover(type, id, e.currentTarget as HTMLElement);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') peek.release();
    },
    // Pressing a card (to open it) shouldn't pop a peek up on the way.
    onPointerDown: () => peek.cancelHover(),
  };
}
