import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { btn } from './Button';
import { cx } from '../lib/util';
import { useSwipeToClose } from '../lib/swipe';

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
    if (dialog && !dialog.open) {
      dialog.showModal();
      // Focus the dialog itself, not its first button (which would pop that button's tooltip).
      dialog.focus({ preventScroll: true });
    }
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
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-white outline-none backdrop:bg-transparent"
    >
      {children}
    </dialog>
  );
}

/**
 * A standard dialog: a centered card on larger screens, a sheet from the bottom on phones. Title
 * and close button on top, a scrolling body, and an optional footer that stays put.
 */
export function Dialog({
  title,
  subtitle,
  action,
  onClose,
  footer,
  wide,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sits right after the title (e.g. a library button), as on a title's own page. */
  action?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useSwipeToClose(sheet, onClose);
  return (
    <Modal label={typeof title === 'string' ? title : 'Dialog'} onClose={onClose}>
      <div className="fixed inset-0 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div
          ref={sheet}
          className={cx(
            'toast-in relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl ring-1 ring-white/[0.06] sm:max-h-[85dvh] sm:rounded-3xl',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-xl',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Phones: a handle that says it swipes down. */}
          <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/25 sm:hidden" />
          <header className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
              </div>
              {action}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={btn({ icon: true })}>
              <X className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
          {footer && <footer className="shrink-0 border-t border-white/[0.06] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{footer}</footer>}
        </div>
      </div>
    </Modal>
  );
}
