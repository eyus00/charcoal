import { useRef } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import Img from './Img';
import { q, titleOf, typeOf, yearOf, type MediaItem, type MediaType } from '../lib/tmdb';
import { cx } from '../lib/util';

/** Prefetch details after a short hover so opening a title feels instant. */
export function usePrefetch(type: MediaType, id: number) {
  const qc = useQueryClient();
  const timer = useRef<number>(undefined);
  return {
    onPointerEnter: () => {
      timer.current = window.setTimeout(() => qc.prefetchQuery(q.details(type, id)), 180);
    },
    onPointerLeave: () => window.clearTimeout(timer.current),
    onFocus: () => qc.prefetchQuery(q.details(type, id)),
  };
}

interface Props {
  item: MediaItem;
  type?: MediaType;
  sizes: string;
  className?: string;
  showType?: boolean;
}

export default function MediaCard({ item, type, sizes, className, showType = true }: Props) {
  const t = typeOf(item, type);
  const title = titleOf(item);
  const prefetch = usePrefetch(t, item.id);
  return (
    <Link to={`/${t}/${item.id}`} className={cx('group block', className)} {...prefetch}>
      <Img
        path={item.poster_path}
        kind="poster"
        sizes={sizes}
        alt={title}
        className="aspect-[2/3] rounded-lg ring-1 ring-white/5 transition group-hover:ring-white/30"
      />
      <div className="mt-2 truncate text-sm font-medium text-white/90 group-hover:text-white">{title}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
        {yearOf(item) && <span>{yearOf(item)}</span>}
        {showType && <span>· {t === 'movie' ? 'Movie' : 'TV'}</span>}
        {item.vote_average > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <Star className="size-3 fill-current text-amber-400" aria-hidden />
            {item.vote_average.toFixed(1)}
          </span>
        )}
      </div>
    </Link>
  );
}
