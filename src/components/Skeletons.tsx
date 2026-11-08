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


/** Home hero while trending loads: the same layout as a slide, in placeholders. */
export function HeroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx('skeleton', className)}>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-32 px-4 md:bottom-36 md:px-8 lg:px-10">
        <Bone className="h-6 w-20 rounded-full!" />
        <Bone className="mt-3 h-4 w-52" />
        <Bone className="mt-4 h-12 w-3/4 max-w-xl bg-raised md:h-16" />
        <Bone className="mt-4 h-4 w-full max-w-lg" />
        <Bone className="mt-2 h-4 w-2/3 max-w-sm" />
        <div className="mt-6 flex gap-3">
          <Bone className="h-12 w-36 rounded-full!" />
          <Bone className="size-12 rounded-full!" />
        </div>
      </div>
    </div>
  );
}

/** Title page while details load: the info card's shape over the art area. */
export function DetailsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx('skeleton relative flex items-end', className)}>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
      <div className="relative w-full px-4 pb-6 md:px-8 md:pb-10 lg:px-10">
        <div className="max-w-xl rounded-3xl bg-black/25 p-5 ring-1 ring-white/10 md:p-7">
          <Bone className="h-9 w-2/3" />
          <Bone className="mt-3 h-4 w-40" />
          <Bone className="mt-2.5 h-4 w-48" />
          <Bone className="mt-5 h-4 w-full" />
          <Bone className="mt-2.5 h-4 w-full" />
          <Bone className="mt-2.5 h-4 w-3/4" />
          <div className="mt-6 flex gap-2.5">
            <Bone className="h-12 w-40 rounded-full!" />
            <Bone className="size-12 rounded-full!" />
            <Bone className="size-12 rounded-full!" />
          </div>
        </div>
      </div>
    </div>
  );
}
