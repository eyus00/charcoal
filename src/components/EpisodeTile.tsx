import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Play } from 'lucide-react';
import Img from './Img';
import { CARD_INFO, TypeIcon } from './MediaCard';
import { Bone } from './Skeletons';
import type { ImageKind } from '../lib/images';
import type { MediaType } from '../lib/tmdb';
import { cx } from '../lib/util';

/** Little pill used in the corners of a tile's image. */
export const Chip = ({ children, light }: { children: ReactNode; light?: boolean }) => (
  <span className={cx('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs', light ? 'bg-white font-medium text-black' : 'bg-black/60 backdrop-blur-sm')}>{children}</span>
);

export const TILE = 'w-[288px] shrink-0 snap-start sm:w-[344px]';
export const TILE_SIZES = '(min-width: 640px) 344px, 288px';

interface Props {
  to: string;
  type: MediaType;
  image: { path: string | null | undefined; kind: ImageKind };
  /** First line (e.g. "S2 · E5 Name" or a movie title). */
  primary: ReactNode;
  /** Second line (e.g. the show name); the type icon sits at its right edge. */
  secondary: ReactNode;
  topLeft?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  /** 0–100: thin progress bar along the image's bottom edge. */
  progress?: number;
  playable?: boolean;
  /** Darken the image's bottom-left corner (for a large label there, e.g. a rank). */
  shade?: boolean;
  title?: string;
  className?: string;
  /** Replaces the default tile width classes. */
  width?: string;
  linkProps?: Record<string, unknown>;
  /** Extra controls over the tile (e.g. a remove button). */
  children?: ReactNode;
}

/** Outlined landscape card: still image with corner chips, two text lines, type icon bottom-right. */
export default function EpisodeTile({ to, type, image, primary, secondary, topLeft, bottomLeft, bottomRight, progress = 0, playable = true, shade, title, className, width = TILE, linkProps, children }: Props) {
  return (
    <div className={cx('group relative', width, className)}>
      <Link to={to} title={title} className="block" {...linkProps}>
        <div className="relative overflow-hidden rounded-t-2xl">
          <Img path={image.path} kind={image.kind} sizes={TILE_SIZES} alt="" className="aspect-video" />
          {shade && <span className="absolute inset-0 bg-gradient-to-tr from-black/75 via-black/10 to-transparent" />}
          {playable && (
            <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
              <span className="grid size-11 place-items-center rounded-full bg-white text-black">
                <Play className="ml-0.5 size-4 fill-current" strokeWidth={0} />
              </span>
            </span>
          )}
          {topLeft && <span className="absolute top-2.5 left-2.5">{topLeft}</span>}
          {bottomLeft && <span className="absolute bottom-2.5 left-2.5">{bottomLeft}</span>}
          {bottomRight && <span className="absolute right-2.5 bottom-2.5">{bottomRight}</span>}
          {progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
              <span className="block h-full bg-white" style={{ width: `${progress}%` }} />
            </span>
          )}
        </div>
        <div className={cx(CARD_INFO, 'px-3 pt-2 pb-2.5')}>
          <div className="truncate text-body-sm font-medium text-white/95" title={typeof primary === 'string' ? primary : undefined}>{primary}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <span className="min-w-0 truncate">{secondary}</span>
            <TypeIcon type={type} />
          </div>
        </div>
      </Link>
      {children}
    </div>
  );
}

export const TileSkeleton = ({ className }: { className?: string }) => (
  <div className={className ?? TILE}>
    <Bone className="aspect-video w-full rounded-b-none rounded-t-2xl" />
    <div className="rounded-b-2xl border border-t-0 border-white/[0.08] p-3">
      <Bone className="h-3.5 w-3/4" />
      <Bone className="mt-2 h-3 w-1/2" />
    </div>
  </div>
);
