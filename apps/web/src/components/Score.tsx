import { Star } from 'lucide-react';

/** A score, styled like the big one: ★ 8 /10. */
export default function Score({ n }: { n: number }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1" aria-label={`${n} out of 10`}>
      <Star className="size-3.5 self-center fill-current text-star" strokeWidth={0} />
      <span className="text-lg leading-none font-semibold tabular-nums">{n}</span>
      <span className="text-xs text-muted">/ 10</span>
    </span>
  );
}
