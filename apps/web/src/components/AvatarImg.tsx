import { useState } from 'react';
import { cx } from '../lib/util';

/** A round profile picture that shimmers until it has loaded (then fades in); initials if it fails. */
export default function AvatarImg({ src, name, className }: { src: string; name: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  if (state === 'failed') return <span className={cx('grid shrink-0 place-items-center rounded-full bg-white/10 font-medium uppercase', className)}>{name.slice(0, 1)}</span>;
  return (
    <span className={cx('relative block shrink-0 overflow-hidden rounded-full', state === 'loading' ? 'skeleton' : 'bg-white/10', className)}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setState('ok')}
        onError={() => setState('failed')}
        className={cx('absolute inset-0 size-full object-cover transition-opacity duration-300', state === 'ok' ? 'opacity-100' : 'opacity-0')}
      />
    </span>
  );
}
