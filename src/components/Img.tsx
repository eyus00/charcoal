import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { imageSrcSet, imageUrl, type ImageKind } from '../lib/images';
import { cx } from '../lib/util';

interface Props {
  path: string | null | undefined;
  kind: ImageKind;
  /** Rendered width hint for the browser, e.g. "(min-width: 768px) 180px, 33vw" */
  sizes: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}

/**
 * Responsive TMDB image. The wrapper owns the box (give it an aspect ratio or
 * size), so nothing shifts while loading; the image fades in over a placeholder.
 */
export default function Img({ path, kind, sizes, alt, className, imgClassName, priority }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = imageUrl(path, kind, kind === 'backdrop' ? 780 : kind === 'poster' ? 342 : undefined);

  return (
    <div className={cx('relative overflow-hidden bg-surface', className)}>
      {src && !failed ? (
        <img
          src={src}
          srcSet={imageSrcSet(path, kind)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx(
            'absolute inset-0 size-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-faint">
          <ImageOff className="size-6" aria-hidden />
        </div>
      )}
    </div>
  );
}
