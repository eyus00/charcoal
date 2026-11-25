import { cx } from '../lib/util';

/**
 * A small either/or switch (Movies | TV shows, Sub | Dub): the same pill group as Discover's type
 * switch. `compact` is the 32px version for toolbars and menus.
 */
export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  compact,
  className,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
  /** What is being chosen, for screen readers. */
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex shrink-0 rounded-full p-1', compact ? 'bg-white/[0.08]' : 'bg-surface', className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => value !== o.key && onChange(o.key)}
          className={cx('rounded-full text-sm transition', compact ? 'h-8 px-3.5' : 'h-10 px-5', value === o.key ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
