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

/** "2025 · ★ 7.2" */
export function Meta({ year, rating, extra, className }: { year?: string; rating?: number; extra?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5 text-[13px] text-muted', className)}>
      {year && <span>{year}</span>}
      {year && rating ? <span className="text-faint">·</span> : null}
      {rating ? (
        <span className="flex items-center gap-1 font-medium text-star">
          <Star className="size-3.5 fill-current" strokeWidth={0} />
          {rating.toFixed(1)}
        </span>
      ) : null}
      {extra}
    </div>
  );
}

interface Props {
  item: MediaItem;
  type?: MediaType;
  sizes: string;
  className?: string;
  /** Small label over the poster's top-left corner (e.g. bookmark status). */
  badge?: ReactNode;
  /** Extra controls over the card (e.g. remove button). */
  overlay?: ReactNode;
}

/** Poster card: rounded poster, title, year · rating. */
export default function MediaCard({ item, type, sizes, className, badge, overlay }: Props) {
  const t = typeOf(item, type);
  const title = titleOf(item);
  const href = `/${t}/${item.id}`;
  return (
    <div className={cx('group relative', className)}>
      <Link to={href} className="block rounded-[20px] bg-surface/60 p-1.5 pb-2.5 ring-1 ring-white/[0.06] transition group-hover:bg-surface group-hover:ring-white/15" {...usePrefetch(t, item.id)}>
        <div className="relative overflow-hidden rounded-[14px]">
          <Img path={item.poster_path} kind="poster" sizes={sizes} alt={title} className="aspect-[2/3]" imgClassName="transition-transform duration-300 group-hover:scale-[1.03]" />
          {badge && <div className="absolute top-2 left-2">{badge}</div>}
        </div>
        <div className="mt-2.5 truncate px-1.5 text-[15px] font-medium text-white/95">{title}</div>
        <Meta
          year={yearOf(item)}
          rating={item.vote_average}
          className="mt-0.5 px-1.5"
          extra={t === 'tv' ? <Tv className="ml-auto size-3.5 text-faint" aria-label="TV show" /> : <Film className="ml-auto size-3.5 text-faint" aria-label="Movie" />}
        />
      </Link>
      {overlay}
    </div>
  );
}
