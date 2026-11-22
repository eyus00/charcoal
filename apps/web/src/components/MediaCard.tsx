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

/** The text under a card's image: close under it, aligned with its left edge; room for the arc. */
export const CARD_INFO = 'relative pt-2 pr-2.5 pb-2';

/** Cards don't move on hover (kept as a hook so every card can share one hover style). */
export const CARD_LIFT = '';

/**
 * A thin arc around the bottom-right corner of the card's text: the right edge fades out as it
 * rises and the bottom edge as it runs left, so the lines melt into the card. A quiet separator.
 */
const ARC_MASK = {
  maskImage: 'linear-gradient(to left, black 15%, transparent 95%), linear-gradient(to top, black 10%, transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to left, black 15%, transparent 95%), linear-gradient(to top, black 10%, transparent 100%)',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
} as const;
export const CornerArc = () => (
  <span
    aria-hidden
    style={ARC_MASK}
    className="pointer-events-none absolute -top-3 right-0 bottom-0 w-28 rounded-br-2xl border-r border-b border-white/20 transition-colors group-hover:border-white/35"
  />
);

/** A card image: rounded, a touch brighter on hover (like our buttons). */
export const CARD_IMAGE = 'relative overflow-hidden rounded-2xl transition duration-200 group-hover:brightness-110';

/** A card title: brightens with the card on hover. */
export const CARD_TITLE = 'truncate text-body-sm font-medium text-white/90 transition-colors group-hover:text-white';

/** Small movie / TV icon, pushed to the right edge of a meta row. */
export function TypeIcon({ type, className }: { type: MediaType; className?: string }) {
  const Icon = type === 'tv' ? Tv : Film;
  return <Icon strokeWidth={1.5} className={cx('ml-auto size-3.5 shrink-0 text-faint', className)} aria-label={type === 'tv' ? 'TV show' : 'Movie'} />;
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
      <Link to={href} className={cx('block', CARD_LIFT)} {...usePrefetch(t, item.id)}>
        <div className={CARD_IMAGE}>
          <Img path={item.poster_path} kind="poster" sizes={sizes} alt="" className="aspect-[2/3]" />
          {badge && <div className="absolute top-2 left-2">{badge}</div>}
        </div>
        <div className={CARD_INFO}>
          <div className={CARD_TITLE} title={title}>{title}</div>
          <Meta year={yearOf(item)} rating={item.vote_average} className="mt-0.5" extra={<TypeIcon type={t} />} />
          <CornerArc />
        </div>
      </Link>
      {overlay}
    </div>
  );
}
