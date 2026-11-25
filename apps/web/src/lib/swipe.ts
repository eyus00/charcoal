import { useEffect, useRef, type RefObject } from 'react';

/**
 * Phones: a bottom sheet follows a downward swipe and closes when pulled far or fast enough;
 * otherwise it springs back. A swipe that starts in a scrolled list only scrolls the list, until
 * the list is back at its top. Sideways swipes (season pills, rows) are left alone.
 */
export function useSwipeToClose(ref: RefObject<HTMLElement | null>, onClose: () => void, maxWidth = 639) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia(`(max-width: ${maxWidth}px)`).matches) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let dy = 0;
    let state: 'idle' | 'maybe' | 'drag' | 'off' = 'idle';
    let scroller: HTMLElement | null = null;
    const scrollerOf = (t: EventTarget | null) => {
      for (let n = t as HTMLElement | null; n && n !== el; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n;
      }
      return null;
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return void (state = 'off');
      scroller = scrollerOf(e.target);
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dy = 0;
      state = 'maybe';
    };
    const move = (e: TouchEvent) => {
      if (state === 'off' || state === 'idle') return;
      const t = e.touches[0];
      if (state === 'maybe') {
        const ddx = Math.abs(t.clientX - x0);
        const ddy = t.clientY - y0;
        if (ddx > 8 && ddx > Math.abs(ddy)) return void (state = 'off');
        if (ddy < -4 || (scroller && scroller.scrollTop > 0)) return void (state = 'off');
        if (ddy < 8) return;
        state = 'drag';
        y0 = t.clientY;
        t0 = e.timeStamp;
        el.style.transition = 'none';
      }
      dy = Math.max(0, t.clientY - y0);
      if (e.cancelable) e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const end = (e: TouchEvent) => {
      if (state !== 'drag') return void (state = 'idle');
      state = 'idle';
      const fast = dy / Math.max(1, e.timeStamp - t0) > 0.6;
      el.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      if (dy > 120 || (fast && dy > 40)) {
        el.style.transform = 'translateY(100%)';
        window.setTimeout(() => close.current(), 200);
      } else el.style.transform = '';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, maxWidth]);
}
