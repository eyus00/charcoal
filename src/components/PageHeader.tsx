import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

/** Page title with result count, plus a clear-filters action. */
export function PageHeader({ label, title, count, onClear }: { icon?: LucideIcon; label?: string; title: ReactNode; count?: number; onClear?: () => void }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {label && <div className="mb-1 text-sm text-muted">{label}</div>}
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {count !== undefined && <span className="shrink-0 text-sm text-muted">{count.toLocaleString()} titles</span>}
        </div>
      </div>
      {onClear && (
        <button onClick={onClear} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm text-muted transition hover:bg-surface hover:text-white">
          <X className="size-4" /> Clear filters
        </button>
      )}
    </div>
  );
}

export function Empty({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface px-6 py-20 text-center">
      <Icon className="size-8 text-faint" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{body}</p>
    </div>
  );
}
