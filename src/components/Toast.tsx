import { useEffect, useSyncExternalStore } from 'react';
import { WifiOff, X } from 'lucide-react';
import { cx } from '../lib/util';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

// Tiny module-level store: one toast at a time (a new one replaces the old).
let current: ToastItem | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a short message at the bottom of the screen, optionally with an action (e.g. Undo). */
export function toast(message: string, action?: ToastItem['action']) {
  current = { id: ++seq, message, action };
  emit();
}
const dismiss = (id: number) => {
  if (current?.id === id) {
    current = null;
    emit();
  }
};

export function Toaster() {
  const t = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => dismiss(t.id), t.action ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [t]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[110] flex justify-center px-4 lg:bottom-6">
      {t && (
        <div key={t.id} role="status" className={cx('toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-raised py-2 pr-2 pl-5 text-sm text-white shadow-2xl ring-1 shadow-black/60 ring-white/10')}>
          <span className="min-w-0 truncate">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const onlineSub = (l: () => void) => {
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
};

/** Small persistent pill while the browser is offline. */
export function OfflineNotice() {
  const online = useSyncExternalStore(onlineSub, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="toast-in fixed top-3 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full bg-raised px-4 py-2 text-sm shadow-2xl ring-1 shadow-black/50 ring-white/10">
      <WifiOff className="size-4 text-muted" />
      You’re offline. Some things may not load.
    </div>
  );
}
