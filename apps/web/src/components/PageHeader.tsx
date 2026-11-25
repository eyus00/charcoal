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

export function Empty({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface px-6 py-20 text-center">
      <Icon className="size-8 text-faint" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-pretty text-muted">{body}</p>
    </div>
  );
}
