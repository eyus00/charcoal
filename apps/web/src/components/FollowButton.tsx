import { Check, Plus } from 'lucide-react';
import { btn } from './Button';
import { Tip } from './Tip';
import { toggleFollow, useIsFollowing } from '../lib/follows';
import type { MediaType } from '../lib/tmdb';
import { cx } from '../lib/util';

/**
 * Follow (+) / Following (✓): adds a show or film to your library and keeps you posted (new
 * episodes; the day a film can be streamed). One switch everywhere it appears.
 * - `round` (default): a circle like the other title actions; white when following.
 * - `card`: the small one over a card's image.
 * - `wide`: a labelled button (episode list footer).
 */
export default function FollowButton({
  type,
  id,
  title,
  variant = 'round',
  size = 'lg',
  className,
}: {
  type: MediaType;
  id: number;
  title: string;
  variant?: 'round' | 'card' | 'wide';
  size?: 'md' | 'lg';
  className?: string;
}) {
  const on = useIsFollowing(type, id);
  const tip = on ? 'Following · click to unfollow' : type === 'tv' ? 'Follow: get new episodes in your Calendar' : 'Follow: get told when it can be streamed';
  const click = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFollow(type, id, title);
  };
  const Icon = on ? Check : Plus;
  if (variant === 'card')
    return (
      <button
        type="button"
        onClick={click}
        aria-pressed={on}
        aria-label={on ? `Following ${title}` : `Follow ${title}`}
        className={cx(
          'group/tip relative grid size-9 place-items-center rounded-full backdrop-blur-sm transition-colors',
          on ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80',
          className,
        )}
      >
        <Icon className="size-4" strokeWidth={2.5} />
        <Tip label={tip} side="bottom" align="end" />
      </button>
    );
  if (variant === 'wide')
    return (
      <button type="button" onClick={click} aria-pressed={on} className={cx(btn({ variant: on ? 'secondary' : 'primary', size }), 'group/tip relative', className)}>
        <Icon className="size-4" strokeWidth={2.5} />
        {on ? 'Following' : type === 'tv' ? 'Follow show' : 'Follow'}
        <Tip label={tip} side="top" align="end" />
      </button>
    );
  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={on}
      aria-label={on ? `Following ${title}` : `Follow ${title}`}
      className={cx(btn({ variant: on ? 'primary' : 'secondary', size, icon: true }), 'group/tip relative', className)}
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-4'} strokeWidth={2.5} />
      <Tip label={tip} side="bottom" />
    </button>
  );
}
