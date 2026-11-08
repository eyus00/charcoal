import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Native modal dialog: the browser moves focus in, keeps Tab inside, makes the page behind it
 * inert and maps Escape to `onClose`. Focus returns to whatever opened it. Children draw the
 * overlay themselves (a full-screen layer whose own click closes it), so each dialog keeps its look.
 */
export default function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      // Return focus, unless the dialog led somewhere new (e.g. it navigated to the player).
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-white backdrop:bg-transparent"
    >
      {children}
    </dialog>
  );
}
