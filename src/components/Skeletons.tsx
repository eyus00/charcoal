import { cx } from '../lib/util';
import { ROW_BLEED } from './Row';

export const GRID_SIZES = '(min-width: 1536px) 12vw, (min-width: 1280px) 14vw, (min-width: 1024px) 17vw, (min-width: 640px) 30vw, 46vw';
export const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

export const Bone = ({ className }: { className?: string }) => <div className={cx('skeleton rounded-md', className)} />;

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Bone className="aspect-[2/3] w-full rounded-b-none rounded-t-2xl" />
      <div className="rounded-b-2xl border border-t-0 border-white/[0.08] px-3 pt-3 pb-3">
        <Bone className="h-3.5 w-3/4" />
        <Bone className="mt-2 h-3 w-1/3" />
      </div>
    </div>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={cx('flex gap-4 overflow-hidden', ROW_BLEED)}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} className="w-[156px] shrink-0 sm:w-[190px] lg:w-[216px]" />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div>
      <Bone className="mb-6 h-9 w-48" />
      <GridSkeleton count={12} />
    </div>
  );
}

export function EpisodeSkeleton() {
  return (
    <div className="flex gap-4 p-2">
      <Bone className="aspect-video w-36 shrink-0 rounded-md sm:w-44" />
      <div className="flex-1 space-y-2 py-1">
        <Bone className="h-4 w-3/5" />
        <Bone className="h-3 w-1/4" />
        <Bone className="h-3 w-full" />
      </div>
    </div>
  );
}
