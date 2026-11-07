import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Film, Star, Tv } from 'lucide-react';
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
  /** Extra badge on the poster (e.g. bookmark status), bottom-left. */
  badge?: ReactNode;
  /** Extra controls over the card (e.g. remove button). */
  overlay?: ReactNode;
}

/** The original Charcoal card: glass frame, year + rating badges, title with type icon. */
export default function MediaCard({ item, type, sizes, className, badge, overlay }: Props) {
  const t = typeOf(item, type);
  const title = titleOf(item);
  const year = yearOf(item);
  const href = `/${t}/${item.id}`;
  const prefetch = usePrefetch(t, item.id);
  return (
    <div
      className={cx(
        'group relative flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-1.5 transition duration-300 hover:scale-[1.02] hover:border-white/10 hover:bg-white/[0.08] md:gap-3 md:rounded-2xl md:p-2',
        className,
      )}
    >
      <Link to={href} className="relative block overflow-hidden rounded-lg shadow-lg md:rounded-xl" {...prefetch}>
        <Img path={item.poster_path} kind="poster" sizes={sizes} alt={title} className="aspect-[2/3]" />
        <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/45" />
        {year && (
          <span className="absolute top-2 left-2 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wider text-white">
            {year}
          </span>
        )}
        {item.vote_average > 0 && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
            <Star className="size-3 fill-yellow-400 text-yellow-400" />
            {item.vote_average.toFixed(1)}
          </span>
        )}
        {badge && <div className="absolute bottom-2 left-2">{badge}</div>}
      </Link>
      <div className="flex min-w-0 items-center justify-between gap-2 px-1 pb-0.5">
        <Link to={href} className="line-clamp-1 text-sm leading-tight font-bold text-white hover:text-accent">
          {title}
        </Link>
        <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1">
          {t === 'tv' ? <Tv className="size-3 text-white/60" /> : <Film className="size-3 text-white/60" />}
        </span>
      </div>
      {overlay}
    </div>
  );
}
