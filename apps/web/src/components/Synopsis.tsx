import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Modal';

const FILLER = [
  'The story for this episode has not been shared yet.',
  'Details about this episode will be added closer to its air date, once the network shares them.',
  'A new chapter is on the way. More soon.',
  'Plot details for this one are still under wraps, check back after the next episode airs for more on what happens.',
];

/** An episode's synopsis, clamped to three lines; "more" opens the whole of it in a pop-up. */
export function Synopsis({ text, title }: { text: string; title: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  return (
    <div className="mt-1.5">
      <p ref={ref} className="line-clamp-3 text-caption leading-[1.4] text-pretty text-muted">
        {text}
      </p>
      {clipped && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="mt-0.5 text-caption font-medium text-white/80 transition-colors hover:text-white"
        >
          more
        </button>
      )}
      {open && (
        // The card around this is a link: clicks inside the popup must not reach it.
        // (capture: cancel the link's own navigation before anything inside handles the click)
        <span onClickCapture={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
          <Dialog title={title} onClose={() => setOpen(false)}>
            <p className="text-body-sm leading-6 text-pretty whitespace-pre-line text-white/85">{text}</p>
          </Dialog>
        </span>
      )}
    </div>
  );
}

/** No synopsis yet: blurred stand-in text with a short note (reads as "on its way", not "loading"). */
export function NoSynopsis({ n }: { n: number; upcoming?: boolean }) {
  return (
    <div className="relative mt-1.5">
      <p aria-hidden className="text-caption leading-[1.4] text-muted blur-[3px] select-none">
        {FILLER[n % FILLER.length]}
      </p>
      <span className="absolute inset-0 grid place-items-center text-caption text-white/70">Synopsis coming soon</span>
    </div>
  );
}
