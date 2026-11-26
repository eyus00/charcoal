import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** A browse page's heading: its name and one line on what is in it. */
export function PageTitle({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {body && <p className="mt-1.5 max-w-2xl text-sm text-pretty text-muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Nothing to show: the one empty state used everywhere. An icon, a title, a line on why (and what
 * to do), and an optional action. `compact` inside a section, full size for a page or tab.
 */
export function Empty({ icon: Icon, title, body, action, compact, className }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-white/[0.03] px-6 text-center ring-1 ring-white/[0.06]',
        compact ? 'min-h-36 py-7' : 'min-h-64 py-14',
        className ?? '',
      ].join(' ')}
    >
      {Icon && <Icon className={compact ? 'mb-1 size-6 text-faint' : 'mb-1.5 size-7 text-faint'} strokeWidth={1.5} />}
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-pretty text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
