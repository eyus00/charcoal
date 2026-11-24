import { Heart } from 'lucide-react';
import { btn } from './Button';
import { Tip } from './Tip';
import { LIBRARY_LABEL, toggleLibrary, useLibraryEntry, type LibraryItem } from '../lib/library';
import { cx, useKeys } from '../lib/util';

/**
 * ♥ Library: the one button for keeping a title. Filled when it's in your library (which also means
 * you'll hear about its new episodes / streaming day). Replaces the old bookmark and follow buttons.
 * - `round` (default): a circle like the other title actions.
 * - `card`: the small one over a card's image.
 * `hotkey`: L toggles it (one per page: the details page).
 */
export default function LibraryButton({
  item,
  variant = 'round',
  size = 'lg',
  hotkey,
  className,
}: {
  item: LibraryItem;
  variant?: 'round' | 'card';
  size?: 'md' | 'lg';
  hotkey?: boolean;
  className?: string;
}) {
  const entry = useLibraryEntry(item.mediaType, item.id);
  const on = !!entry;
  const click = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    toggleLibrary(item);
  };
  useKeys({ l: () => click() }, !!hotkey);
  const tip = on ? `In your library · ${LIBRARY_LABEL[entry.status]} · click to remove` : 'Add to your library';
  const label = on ? `Remove ${item.title} from your library` : `Add ${item.title} to your library`;
  if (variant === 'card')
    return (
      <button
        type="button"
        onClick={click}
        aria-pressed={on}
        aria-label={label}
        className={cx(
          'group/tip relative grid size-9 place-items-center rounded-full backdrop-blur-sm transition-colors',
          on ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80',
          className,
        )}
      >
        <Heart className={cx('size-4', on && 'fill-current')} strokeWidth={2} />
        <Tip label={tip} side="bottom" align="end" />
      </button>
    );
  return (
    <button type="button" onClick={click} aria-pressed={on} aria-label={label} className={cx(btn({ variant: on ? 'primary' : 'secondary', size, icon: true }), 'group/tip relative', className)}>
      <Heart className={cx(size === 'lg' ? 'size-5' : 'size-4', on && 'fill-current')} strokeWidth={2} />
      <Tip label={tip} keys={hotkey ? 'L' : undefined} side="bottom" />
    </button>
  );
}
