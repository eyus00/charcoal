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

/** Every card zooms in a touch on hover, image and text together. */
export const CARD_LIFT = 'transition-transform duration-300 ease-out group-hover:scale-[1.02]';

/** A thin arc around the card's bottom-right corner that fades out: a quiet separator. */
export const CornerArc = () => (
  <span
    aria-hidden
    className="pointer-events-none absolute right-0 bottom-0 h-8 w-12 rounded-br-2xl border-r border-b border-white/[0.14] transition-colors [mask-image:linear-gradient(to_top_left,black_35%,transparent_80%)] group-hover:border-white/25"
  />
);

/** A card image that floats: rounded, with a soft shadow on hover. */
export const CARD_IMAGE = 'relative overflow-hidden rounded-2xl transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/40';

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
