import { cx } from '../lib/util';

export const GRID_SIZES = '(min-width: 1536px) 12vw, (min-width: 1280px) 14vw, (min-width: 1024px) 17vw, (min-width: 640px) 30vw, 46vw';
export const GRID = 'grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

export const Bone = ({ className }: { className?: string }) => <div className={cx('skeleton rounded-md', className)} />;

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Bone className="aspect-[2/3] w-full rounded-2xl" />
      <Bone className="mt-3 h-3.5 w-3/4" />
      <Bone className="mt-2 h-3 w-1/3" />
    </div>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} className="w-[140px] shrink-0 sm:w-[170px] lg:w-[190px]" />
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
