import { cx } from '../lib/util';

export const POSTER_SIZES = '(min-width: 1536px) 200px, (min-width: 1024px) 180px, (min-width: 640px) 160px, 34vw';
export const GRID_SIZES = '(min-width: 1536px) 12vw, (min-width: 1024px) 15vw, (min-width: 640px) 22vw, 45vw';

export const Bone = ({ className }: { className?: string }) => <div className={cx('skeleton rounded-md', className)} />;

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Bone className="aspect-[2/3] w-full rounded-lg" />
      <Bone className="mt-2 h-3.5 w-4/5" />
      <Bone className="mt-1.5 h-3 w-2/5" />
    </div>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden px-4 md:px-8">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} className="w-[34vw] shrink-0 sm:w-40 lg:w-[180px] 2xl:w-[200px]" />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-8">
      <Bone className="mb-6 h-8 w-48" />
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
