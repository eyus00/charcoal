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

/** The text under a card's image: no box, just aligned with the image's left edge. */
export const CARD_INFO = 'pt-2.5';

/** A card image that floats: rounded, lifts a little on hover. */
export const CARD_IMAGE = 'relative overflow-hidden rounded-2xl transition duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/40';

/** Movie / TV mark, faint in the image's top-right corner like a watermark (hidden on hover). */
export function TypeIcon({ type, className }: { type: MediaType; className?: string }) {
  const Icon = type === 'tv' ? Tv : Film;
  return (
    <Icon
      strokeWidth={1.75}
      className={cx('pointer-events-none absolute top-2.5 right-2.5 size-4 text-white/50 drop-shadow-[0_1px_3px_rgb(0_0_0/0.6)] transition-opacity group-hover:opacity-0', className)}
      aria-label={type === 'tv' ? 'TV show' : 'Movie'}
    />
  );
}

/** "2025 · ★ 7.2" */
export function Meta({ year, rating, extra, className }: { year?: string; rating?: number; extra?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5 text-caption text-muted', className)}>
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
        <div className={CARD_IMAGE}>
          <Img path={item.poster_path} kind="poster" sizes={sizes} alt="" className="aspect-[2/3]" />
          {badge && <div className="absolute top-2 left-2">{badge}</div>}
          <TypeIcon type={t} />
        </div>
        <div className={CARD_INFO}>
          <div className="truncate text-body-sm font-medium text-white/95" title={title}>{title}</div>
          <Meta year={yearOf(item)} rating={item.vote_average} className="mt-0.5" />
        </div>
      </Link>
      {overlay}
    </div>
  );
}
