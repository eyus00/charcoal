import { cx } from '../lib/util';

export const POSTER_SIZES = '(min-width: 768px) 210px, 140px';
export const GRID_SIZES = '(min-width: 1280px) 15vw, (min-width: 1024px) 18vw, (min-width: 768px) 23vw, (min-width: 640px) 31vw, 46vw';
export const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 md:gap-y-8 lg:grid-cols-5 xl:grid-cols-6';

export const Bone = ({ className }: { className?: string }) => <div className={cx('skeleton rounded-md', className)} />;

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx('rounded-xl border border-white/5 bg-white/[0.03] p-1.5 md:rounded-2xl md:p-2', className)}>
      <Bone className="aspect-[2/3] w-full rounded-lg md:rounded-xl" />
      <Bone className="mx-1 mt-3 mb-1 h-3.5 w-3/4" />
    </div>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden px-1 py-2 md:gap-6 md:py-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} className="w-[150px] shrink-0 md:w-[220px]" />
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
    <div className="mx-auto max-w-7xl">
      <Bone className="mb-8 h-10 w-56" />
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
