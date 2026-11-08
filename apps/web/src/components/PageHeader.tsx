import type { LucideIcon } from 'lucide-react';

export function Empty({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-surface px-6 py-20 text-center">
      <Icon className="size-8 text-faint" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-pretty text-muted">{body}</p>
    </div>
  );
}
