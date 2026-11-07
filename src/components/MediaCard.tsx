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

/** The bordered info area under a card's image (the image itself has no border). */
export const CARD_INFO = 'rounded-b-2xl border border-t-0 border-white/[0.08] transition group-hover:border-white/20';

/** Small movie / TV icon, pushed to the right edge of a meta row. */
export function TypeIcon({ type, className }: { type: MediaType; className?: string }) {
  const Icon = type === 'tv' ? Tv : Film;
  return <Icon className={cx('ml-auto size-3.5 shrink-0 text-faint', className)} aria-label={type === 'tv' ? 'TV show' : 'Movie'} />;
}

/** "2025 · ★ 7.2" */
export function Meta({ year, rating, extra, className }: { year?: string; rating?: number; extra?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5 text-[13px] text-muted', className)}>
      {year && <span>{year}</span>}
      {year && rating ? <span className="text-faint">·</span> : null}
      {rating ? (
        <span className="flex items-center gap-1 font-medium text-white/80">
          <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
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
      <Link to={href} className="block" {...usePrefetch(t, item.id)}>
        <div className="relative overflow-hidden rounded-t-2xl">
          <Img path={item.poster_path} kind="poster" sizes={sizes} alt={title} className="aspect-[2/3]" />
          {badge && <div className="absolute top-2 left-2">{badge}</div>}
        </div>
        <div className={cx(CARD_INFO, 'px-3 pt-2 pb-2.5')}>
          <div className="truncate text-[15px] font-medium text-white/95">{title}</div>
          <Meta year={yearOf(item)} rating={item.vote_average} className="mt-0.5" extra={<TypeIcon type={t} />} />
        </div>
      </Link>
      {overlay}
    </div>
  );
}
