import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../lib/util';

/**
 * Text cut to `lines` lines at a word, with "… more" right after the last letter (like the
 * details page overview). Measured on a hidden copy and redone when the width changes.
 * `className` sets the type (size, line height, colour).
 */
export default function ClampedText({ text, lines, className, onMore, moreLabel = 'Read all of it' }: { text: string; lines: number; className?: string; onMore: () => void; moreLabel?: string }) {
  const [shown, setShown] = useState<string | null>(null); // null = it all fits
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const wrap = box.current;
    const p = probe.current;
    if (!wrap || !p || !text) return;
    const measure = () => {
      const max = lines * parseFloat(getComputedStyle(p).lineHeight) + 1;
      const fits = (t: string, suffix: boolean) => {
        p.textContent = t;
        if (suffix) {
          const more = document.createElement('span');
          more.className = 'font-medium';
          more.textContent = '… more';
          p.append(more);
        }
        return p.offsetHeight <= max;
      };
      if (fits(text, false)) return setShown(null);
      const cuts: number[] = [];
      for (let i = 1; i < text.length; i++) if (/\s/.test(text[i]) && !/\s/.test(text[i - 1])) cuts.push(i);
      const clean = (n: number) => text.slice(0, n).replace(/[\s.,;:!?…\-–—(\[{"'“‘]+$/u, '');
      let lo = 0;
      let hi = cuts.length - 1;
      let best = '';
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = clean(cuts[mid]);
        if (fits(t, true)) {
          best = t;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      setShown(best || clean(cuts[0] ?? text.length));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [text, lines]);

  return (
    <div ref={box} className="relative">
      <p ref={probe} aria-hidden className={cx(className, 'pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-line')} />
      <p className={cx(className, 'whitespace-pre-line')}>
        {shown === null ? (
          text
        ) : (
          <>
            {shown}
            <span aria-hidden className="text-white/60">
              …{' '}
            </span>
            <button type="button" onClick={onMore} aria-haspopup="dialog" aria-label={moreLabel} className="font-medium text-white transition-colors hover:text-white/75">
              more
            </button>
          </>
        )}
      </p>
    </div>
  );
}
